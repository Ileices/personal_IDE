"""
AE Scanner — Async filesystem walker for generating the AE seed.

The AE (Absolute Existence) is the read-only filesystem representation.
At launch, we scan the local filesystem to generate a deterministic
RBY seed that makes each installation unique.

Design for weak hardware:
- Async I/O to not block the event loop
- Configurable throttling (files/second)
- Incremental hashing (resume-able)
- Progressive seed refinement (usable within seconds)
- Skip binary blobs, node_modules, .git, __pycache__
"""
from __future__ import annotations
import asyncio, hashlib, os, time, logging, json
from dataclasses import dataclass, field
from typing import Optional, Set, List, Callable
from pathlib import Path

logger = logging.getLogger(__name__)

# Directories to always skip
SKIP_DIRS: Set[str] = {
    "node_modules", ".git", "__pycache__", ".venv", "venv",
    ".tox", ".eggs", "dist", "build", ".next", ".nuxt",
    "target", ".gradle", ".idea", ".vscode", ".vs",
    "$Recycle.Bin", "System Volume Information",
}

# Extensions to hash (text-like files contribute to identity)
TEXT_EXTENSIONS: Set[str] = {
    ".py", ".js", ".ts", ".tsx", ".jsx", ".json", ".yaml", ".yml",
    ".toml", ".cfg", ".ini", ".md", ".txt", ".rst", ".html", ".css",
    ".sql", ".sh", ".bat", ".ps1", ".c", ".cpp", ".h", ".hpp",
    ".java", ".go", ".rs", ".rb", ".php", ".swift", ".kt",
}


@dataclass
class ScanProgress:
    """Current scan state."""
    files_scanned: int = 0
    dirs_scanned: int = 0
    bytes_hashed: int = 0
    errors: int = 0
    started_at: float = field(default_factory=time.time)
    completed_at: Optional[float] = None
    current_path: str = ""
    # Progressive seed
    seed_hash: str = ""  # running SHA-256 hex

    @property
    def elapsed(self) -> float:
        end = self.completed_at or time.time()
        return end - self.started_at

    @property
    def files_per_second(self) -> float:
        elapsed = self.elapsed
        return self.files_scanned / max(elapsed, 0.001)


class AEScanner:
    """Async filesystem scanner for AE seed generation."""

    def __init__(
        self,
        root_paths: List[str] | None = None,
        data_dir: str = "nano_data/ae",
        max_files_per_second: int = 500,
        max_file_size: int = 1024 * 1024,  # 1MB max per file
        progress_callback: Optional[Callable] = None,
    ):
        self._root_paths = root_paths or [os.path.expanduser("~")]
        self._data_dir = Path(data_dir)
        self._data_dir.mkdir(parents=True, exist_ok=True)
        self._max_fps = max_files_per_second
        self._max_file_size = max_file_size
        self._progress_callback = progress_callback

        self._progress = ScanProgress()
        self._hasher = hashlib.sha256()
        self._running = False
        self._scan_task: Optional[asyncio.Task] = None

        # Cached result
        self._seed_file = self._data_dir / "ae_seed.json"
        self._cached_seed: Optional[dict] = None

    @property
    def progress(self) -> ScanProgress:
        return self._progress

    @property
    def seed(self) -> Optional[dict]:
        """Get the current or cached AE seed."""
        if self._cached_seed:
            return self._cached_seed
        if self._seed_file.exists():
            try:
                return json.loads(self._seed_file.read_text())
            except Exception:
                pass
        return None

    # ── Scanning ───────────────────────────────────────────────
    async def start_scan(self) -> None:
        """Start background filesystem scan."""
        self._running = True
        self._progress = ScanProgress()
        self._hasher = hashlib.sha256()
        self._scan_task = asyncio.create_task(self._scan())
        logger.info(f"AE scan started: {self._root_paths}")

    async def stop_scan(self) -> None:
        self._running = False
        if self._scan_task:
            self._scan_task.cancel()
            try:
                await self._scan_task
            except asyncio.CancelledError:
                pass

    async def _scan(self) -> None:
        """Main scan coroutine."""
        try:
            for root_path in self._root_paths:
                if not self._running:
                    break
                await self._scan_directory(root_path)

            # Finalize seed
            self._progress.completed_at = time.time()
            self._progress.seed_hash = self._hasher.hexdigest()
            self._finalize_seed()
            logger.info(
                f"AE scan complete: {self._progress.files_scanned} files, "
                f"{self._progress.bytes_hashed / 1024 / 1024:.1f} MB hashed, "
                f"{self._progress.elapsed:.1f}s"
            )
        except asyncio.CancelledError:
            # Save partial result
            self._progress.seed_hash = self._hasher.hexdigest()
            self._finalize_seed()
            logger.info("AE scan cancelled, partial seed saved")
        except Exception as e:
            logger.error(f"AE scan error: {e}")

    async def _scan_directory(self, dir_path: str) -> None:
        """Recursively scan a directory."""
        if not self._running:
            return

        try:
            entries = sorted(os.scandir(dir_path), key=lambda e: e.name)
        except PermissionError:
            self._progress.errors += 1
            return
        except OSError as e:
            self._progress.errors += 1
            return

        self._progress.dirs_scanned += 1

        for entry in entries:
            if not self._running:
                return

            try:
                name = entry.name

                if entry.is_dir(follow_symlinks=False):
                    if name in SKIP_DIRS or name.startswith("."):
                        continue
                    await self._scan_directory(entry.path)

                elif entry.is_file(follow_symlinks=False):
                    await self._hash_file(entry)

            except (PermissionError, OSError):
                self._progress.errors += 1
                continue

            # Throttle
            if self._progress.files_scanned % self._max_fps == 0:
                await asyncio.sleep(0.001)  # yield to event loop

            # Progress update every 1000 files
            if self._progress.files_scanned % 1000 == 0 and self._progress_callback:
                self._progress.seed_hash = self._hasher.hexdigest()
                await self._progress_callback(self._progress)

    async def _hash_file(self, entry: os.DirEntry) -> None:
        """Hash a single file's metadata + content (if text)."""
        self._progress.files_scanned += 1
        self._progress.current_path = entry.path

        # Always hash: name + size + mtime
        try:
            stat = entry.stat(follow_symlinks=False)
        except OSError:
            return

        meta = f"{entry.name}:{stat.st_size}:{int(stat.st_mtime)}"
        self._hasher.update(meta.encode("utf-8"))

        # Hash content for text files (up to max size)
        ext = os.path.splitext(entry.name)[1].lower()
        if ext in TEXT_EXTENSIONS and stat.st_size <= self._max_file_size:
            try:
                # Read in executor to not block event loop
                loop = asyncio.get_event_loop()
                content = await loop.run_in_executor(None, self._read_file_bytes, entry.path)
                if content:
                    self._hasher.update(content)
                    self._progress.bytes_hashed += len(content)
            except Exception:
                self._progress.errors += 1

    @staticmethod
    def _read_file_bytes(path: str) -> Optional[bytes]:
        try:
            with open(path, "rb") as f:
                return f.read()
        except Exception:
            return None

    # ── Seed Generation ────────────────────────────────────────
    def _finalize_seed(self) -> None:
        """Convert hash → RBY seed and save."""
        h = self._progress.seed_hash
        if not h:
            h = self._hasher.hexdigest()

        # Derive RBY from hash bytes
        hash_bytes = bytes.fromhex(h)
        r_raw = int.from_bytes(hash_bytes[0:8], "big") / (2**64)
        b_raw = int.from_bytes(hash_bytes[8:16], "big") / (2**64)
        y_raw = int.from_bytes(hash_bytes[16:24], "big") / (2**64)

        # Normalize to sum = 1.0
        total = r_raw + b_raw + y_raw
        r = r_raw / total
        b = b_raw / total
        y = y_raw / total

        seed = {
            "hash": h,
            "rby": {"r": round(r, 6), "b": round(b, 6), "y": round(y, 6)},
            "files_scanned": self._progress.files_scanned,
            "bytes_hashed": self._progress.bytes_hashed,
            "scan_time_s": round(self._progress.elapsed, 2),
            "root_paths": self._root_paths,
            "timestamp": time.time(),
        }

        self._cached_seed = seed
        try:
            self._seed_file.write_text(json.dumps(seed, indent=2))
            logger.info(f"AE seed: R={r:.4f} B={b:.4f} Y={y:.4f}")
        except Exception as e:
            logger.error(f"Failed to save AE seed: {e}")

    @property
    def stats(self) -> dict:
        return {
            "files_scanned": self._progress.files_scanned,
            "bytes_hashed": self._progress.bytes_hashed,
            "elapsed": round(self._progress.elapsed, 1),
            "fps": round(self._progress.files_per_second, 0),
            "errors": self._progress.errors,
            "seed": self._cached_seed.get("rby") if self._cached_seed else None,
            "running": self._running,
        }
