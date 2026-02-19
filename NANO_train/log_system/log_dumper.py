"""
IDE Log Dumping System — Machine-readable log files with rotation.

Captures ALL logs from every IDE feed (terminal, extensions, output channels,
nano training, mesh, server) and dumps them to structured log files.

Features:
  - Machine-readable JSON-lines format (.jsonl)
  - Automatic file rotation when size limit is reached
  - Configurable max file size and max files per channel
  - Real-time streaming to files
  - Query API for searching/filtering logs
  - Hooks into Python logging + custom feed collectors

File structure:
  logs/
    nano_train.jsonl     ← Training events, losses, checkpoints
    nano_server.jsonl    ← API requests, responses
    nano_mesh.jsonl      ← Mesh events, peer connections
    nano_system.jsonl    ← Hardware, lifecycle, errors
    ide_terminal.jsonl   ← Terminal output capture
    ide_output.jsonl     ← IDE output channel events
    all_combined.jsonl   ← Everything in one file
    archive/
      nano_train.1.jsonl ← Rotated old files
      nano_train.2.jsonl
"""
from __future__ import annotations
import json, time, logging, os, threading, gzip
from dataclasses import dataclass, field, asdict
from typing import Optional, Dict, List, Any, IO
from pathlib import Path
from datetime import datetime
from enum import Enum
from collections import deque


class LogChannel(Enum):
    """Log channels corresponding to different IDE feeds."""
    NANO_TRAIN = "nano_train"
    NANO_SERVER = "nano_server"
    NANO_MESH = "nano_mesh"
    NANO_SYSTEM = "nano_system"
    IDE_TERMINAL = "ide_terminal"
    IDE_OUTPUT = "ide_output"
    IDE_DEBUG = "ide_debug"
    COMPUTE = "compute"
    ALL = "all_combined"


class LogLevel(Enum):
    TRACE = "trace"
    DEBUG = "debug"
    INFO = "info"
    WARN = "warn"
    ERROR = "error"
    FATAL = "fatal"


@dataclass
class LogEntry:
    """A single machine-readable log entry."""
    timestamp: float
    iso_time: str
    channel: str
    level: str
    message: str
    source: str = ""          # Module/file that generated the log
    extra: Dict[str, Any] = field(default_factory=dict)
    session_id: str = ""      # Current session ID
    sequence: int = 0         # Monotonic sequence number

    def to_json(self) -> str:
        d = {
            "ts": self.timestamp,
            "t": self.iso_time,
            "ch": self.channel,
            "lv": self.level,
            "msg": self.message,
        }
        if self.source:
            d["src"] = self.source
        if self.extra:
            d["x"] = self.extra
        if self.session_id:
            d["sid"] = self.session_id
        d["seq"] = self.sequence
        return json.dumps(d, ensure_ascii=False, default=str)


class RotatingLogFile:
    """Manages a single log file with rotation."""

    def __init__(
        self,
        path: Path,
        max_bytes: int = 10 * 1024 * 1024,  # 10 MB default
        max_files: int = 5,
        compress_old: bool = True,
    ):
        self._path = path
        self._max_bytes = max_bytes
        self._max_files = max_files
        self._compress = compress_old
        self._lock = threading.Lock()
        self._fh: Optional[IO] = None
        self._current_size = 0
        self._line_count = 0

        path.parent.mkdir(parents=True, exist_ok=True)

        # Open or resume
        if path.exists():
            self._current_size = path.stat().st_size
        self._fh = open(path, "a", encoding="utf-8")

    def write(self, line: str) -> None:
        """Write a line to the log file, rotating if needed."""
        with self._lock:
            encoded = line + "\n"
            byte_size = len(encoded.encode("utf-8"))

            if self._current_size + byte_size > self._max_bytes:
                self._rotate()

            if self._fh:
                self._fh.write(encoded)
                self._fh.flush()
                self._current_size += byte_size
                self._line_count += 1

    def _rotate(self) -> None:
        """Rotate log files."""
        if self._fh:
            self._fh.close()
            self._fh = None

        archive_dir = self._path.parent / "archive"
        archive_dir.mkdir(exist_ok=True)

        # Shift existing archives
        for i in range(self._max_files - 1, 0, -1):
            old = archive_dir / f"{self._path.stem}.{i}{self._path.suffix}"
            old_gz = archive_dir / f"{self._path.stem}.{i}{self._path.suffix}.gz"
            new = archive_dir / f"{self._path.stem}.{i+1}{self._path.suffix}"
            new_gz = archive_dir / f"{self._path.stem}.{i+1}{self._path.suffix}.gz"

            # Delete if exceeds max
            if i + 1 >= self._max_files:
                if new.exists(): new.unlink()
                if new_gz.exists(): new_gz.unlink()
                continue

            if old_gz.exists():
                old_gz.rename(new_gz)
            elif old.exists():
                old.rename(new)

        # Move current to archive/name.1.jsonl
        dest = archive_dir / f"{self._path.stem}.1{self._path.suffix}"
        if self._path.exists():
            if self._compress:
                # Compress the rotated file
                gz_dest = archive_dir / f"{self._path.stem}.1{self._path.suffix}.gz"
                try:
                    with open(self._path, "rb") as f_in:
                        with gzip.open(gz_dest, "wb") as f_out:
                            f_out.writelines(f_in)
                    self._path.unlink()
                except Exception:
                    self._path.rename(dest)
            else:
                self._path.rename(dest)

        # Open fresh file
        self._fh = open(self._path, "w", encoding="utf-8")
        self._current_size = 0
        self._line_count = 0

    def close(self) -> None:
        with self._lock:
            if self._fh:
                self._fh.flush()
                self._fh.close()
                self._fh = None

    @property
    def stats(self) -> Dict[str, Any]:
        return {
            "path": str(self._path),
            "size_bytes": self._current_size,
            "line_count": self._line_count,
        }


class LogDumper:
    """
    Central log dumping system.
    
    Captures logs from all IDE feeds and writes them to
    machine-readable JSONL files with automatic rotation.
    """

    def __init__(
        self,
        log_dir: str = "logs",
        max_file_bytes: int = 10 * 1024 * 1024,  # 10 MB
        max_files_per_channel: int = 5,
        compress_rotated: bool = True,
    ):
        self._log_dir = Path(log_dir)
        self._log_dir.mkdir(parents=True, exist_ok=True)
        self._max_bytes = max_file_bytes
        self._max_files = max_files_per_channel
        self._compress = compress_rotated

        # Session tracking
        self._session_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        self._sequence = 0
        self._started_at = time.time()

        # Log files per channel
        self._files: Dict[str, RotatingLogFile] = {}
        for ch in LogChannel:
            self._files[ch.value] = RotatingLogFile(
                path=self._log_dir / f"{ch.value}.jsonl",
                max_bytes=max_file_bytes,
                max_files=max_files_per_channel,
                compress_old=compress_rotated,
            )

        # In-memory recent buffer for quick queries
        self._recent: deque[LogEntry] = deque(maxlen=1000)

        # Hook into Python logging
        self._install_logging_handler()

    def _install_logging_handler(self) -> None:
        """Install a Python logging handler that routes to our log files."""
        handler = _LogDumperHandler(self)
        handler.setLevel(logging.DEBUG)
        
        # Add to root logger
        root = logging.getLogger()
        root.addHandler(handler)

    def log(
        self,
        channel: LogChannel | str,
        level: LogLevel | str,
        message: str,
        source: str = "",
        extra: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Write a log entry to the appropriate channel file."""
        ch = channel.value if isinstance(channel, LogChannel) else channel
        lv = level.value if isinstance(level, LogLevel) else level

        self._sequence += 1
        entry = LogEntry(
            timestamp=time.time(),
            iso_time=datetime.now().isoformat(),
            channel=ch,
            level=lv,
            message=message,
            source=source,
            extra=extra or {},
            session_id=self._session_id,
            sequence=self._sequence,
        )

        line = entry.to_json()

        # Write to channel-specific file
        if ch in self._files:
            self._files[ch].write(line)

        # Always write to combined file
        if ch != LogChannel.ALL.value and LogChannel.ALL.value in self._files:
            self._files[LogChannel.ALL.value].write(line)

        # Keep in memory
        self._recent.append(entry)

    def log_training(self, message: str, **extra) -> None:
        self.log(LogChannel.NANO_TRAIN, LogLevel.INFO, message, "trainer", extra)

    def log_server(self, message: str, **extra) -> None:
        self.log(LogChannel.NANO_SERVER, LogLevel.INFO, message, "server", extra)

    def log_mesh(self, message: str, **extra) -> None:
        self.log(LogChannel.NANO_MESH, LogLevel.INFO, message, "mesh", extra)

    def log_system(self, message: str, level: str = "info", **extra) -> None:
        self.log(LogChannel.NANO_SYSTEM, level, message, "system", extra)

    def log_compute(self, message: str, **extra) -> None:
        self.log(LogChannel.COMPUTE, LogLevel.INFO, message, "compute", extra)

    def query(
        self,
        channel: Optional[str] = None,
        level: Optional[str] = None,
        since: Optional[float] = None,
        limit: int = 100,
        search: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Query recent logs with optional filters."""
        results = []
        for entry in reversed(self._recent):
            if channel and entry.channel != channel:
                continue
            if level and entry.level != level:
                continue
            if since and entry.timestamp < since:
                continue
            if search and search.lower() not in entry.message.lower():
                continue
            results.append({
                "timestamp": entry.timestamp,
                "iso_time": entry.iso_time,
                "channel": entry.channel,
                "level": entry.level,
                "message": entry.message,
                "source": entry.source,
                "extra": entry.extra,
            })
            if len(results) >= limit:
                break
        return results

    @property
    def stats(self) -> Dict[str, Any]:
        return {
            "session_id": self._session_id,
            "uptime_s": round(time.time() - self._started_at, 1),
            "total_entries": self._sequence,
            "log_dir": str(self._log_dir.resolve()),
            "channels": {
                name: f.stats for name, f in self._files.items()
            },
        }

    def close(self) -> None:
        for f in self._files.values():
            f.close()


class _LogDumperHandler(logging.Handler):
    """Routes Python logging messages to the LogDumper."""

    # Map logger name prefixes to channels
    CHANNEL_MAP = {
        "nano-sea": LogChannel.NANO_SYSTEM,
        "training": LogChannel.NANO_TRAIN,
        "trainer": LogChannel.NANO_TRAIN,
        "server": LogChannel.NANO_SERVER,
        "uvicorn": LogChannel.NANO_SERVER,
        "fastapi": LogChannel.NANO_SERVER,
        "mesh": LogChannel.NANO_MESH,
        "discovery": LogChannel.NANO_MESH,
        "transport": LogChannel.NANO_MESH,
        "compute": LogChannel.COMPUTE,
        "gpu": LogChannel.COMPUTE,
    }

    LEVEL_MAP = {
        logging.DEBUG: LogLevel.DEBUG,
        logging.INFO: LogLevel.INFO,
        logging.WARNING: LogLevel.WARN,
        logging.ERROR: LogLevel.ERROR,
        logging.CRITICAL: LogLevel.FATAL,
    }

    def __init__(self, dumper: LogDumper):
        super().__init__()
        self._dumper = dumper

    def emit(self, record: logging.LogRecord) -> None:
        try:
            channel = self._resolve_channel(record.name)
            level = self.LEVEL_MAP.get(record.levelno, LogLevel.INFO)

            self._dumper.log(
                channel=channel,
                level=level,
                message=self.format(record) if self.formatter else record.getMessage(),
                source=record.name,
                extra={
                    "module": record.module,
                    "funcName": record.funcName,
                    "lineno": record.lineno,
                } if record.levelno >= logging.WARNING else {},
            )
        except Exception:
            pass  # Never let logging errors crash the app

    def _resolve_channel(self, logger_name: str) -> LogChannel:
        name_lower = logger_name.lower()
        for prefix, channel in self.CHANNEL_MAP.items():
            if name_lower.startswith(prefix) or prefix in name_lower:
                return channel
        return LogChannel.NANO_SYSTEM


# ═══════════════════════════════════════════════════════════════
# Global singleton
# ═══════════════════════════════════════════════════════════════

_global_dumper: Optional[LogDumper] = None


def get_log_dumper(log_dir: str = "logs") -> LogDumper:
    """Get or create the global LogDumper."""
    global _global_dumper
    if _global_dumper is None:
        _global_dumper = LogDumper(log_dir=log_dir)
    return _global_dumper


def init_log_dumper(log_dir: str = "logs", **kwargs) -> LogDumper:
    """Initialize the global LogDumper with custom settings."""
    global _global_dumper
    if _global_dumper:
        _global_dumper.close()
    _global_dumper = LogDumper(log_dir=log_dir, **kwargs)
    return _global_dumper
