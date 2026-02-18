"""
╔══════════════════════════════════════════════════════════════╗
║                    THE BIG BANG                              ║
║         Sea of Nanos — Main Entry Point                      ║
║                                                              ║
║  "In the beginning, there was the AE scan.                   ║
║   From the hash came the seed.                               ║
║   From the seed, the sea was born."                          ║
║                                                              ║
║  Launch sequence:                                            ║
║   1. Detect hardware → compute grade + tier                  ║
║   2. AE scan → generate RBY seed (background)               ║
║   3. Spawn ALL ~230 nanos with seed-derived weights          ║
║   4. Wire ripple connections (nervous system)                ║
║   5. Start message bus + scheduler                           ║
║   6. Start mesh node (if enabled)                            ║
║   7. Start FastAPI server                                    ║
║   8. Start background training loop                          ║
║   9. The sea is alive.                                       ║
╚══════════════════════════════════════════════════════════════╝
"""
from __future__ import annotations
import asyncio, logging, os, sys, time, signal, argparse
from pathlib import Path
from typing import Dict, Any, Optional

# Ensure NANO_train is on path
ROOT_DIR = Path(__file__).parent
sys.path.insert(0, str(ROOT_DIR))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("nano-sea")


class NanoSea:
    """The living sea of nanos — manages all subsystems."""

    def __init__(self, config: dict | None = None):
        self._config = config or {}
        self._nanos: Dict[str, Any] = {}
        self._start_time = time.time()

        # Subsystems (initialized in boot())
        self._ripple = None
        self._bus = None
        self._scheduler = None
        self._pipeline = None
        self._balancer = None
        self._mesh_node = None
        self._discovery = None
        self._transport = None
        self._latency = None
        self._respect = None
        self._task_queue = None
        self._help_system = None
        self._trainer = None
        self._scanner = None
        self._server = None
        self._global_pool = None
        self._peer_discovery = None

    def __len__(self) -> int:
        return len(self._nanos)

    def __iter__(self):
        return iter(self._nanos.values())

    # ══════════════════════════════════════════════════════════
    # BOOT SEQUENCE
    # ══════════════════════════════════════════════════════════
    async def boot(self) -> None:
        """The Big Bang — bring the sea to life."""
        logger.info("=" * 60)
        logger.info("  THE BIG BANG — Sea of Nanos initializing...")
        logger.info("=" * 60)

        t0 = time.time()

        # Step 1: Hardware detection
        logger.info("[1/8] Detecting hardware...")
        await self._detect_hardware()

        # Step 2: AE scan (background — don't wait)
        logger.info("[2/8] Starting AE filesystem scan (background)...")
        await self._start_ae_scan()

        # Step 3: Spawn all nanos
        logger.info("[3/8] Spawning the sea...")
        await self._spawn_nanos()

        # Step 4: Wire connections
        logger.info("[4/8] Wiring ripple connections...")
        await self._wire_connections()

        # Step 5: Start orchestration
        logger.info("[5/8] Starting orchestration layer...")
        await self._start_orchestration()

        # Step 6: Start mesh (if enabled)
        mesh_enabled = self._config.get("mesh_enabled", False)
        if mesh_enabled:
            logger.info("[6/10] Starting mesh node...")
            await self._start_mesh()
        else:
            logger.info("[6/10] Mesh disabled (enable with --mesh)")

        # Step 6b: Global compute pool
        logger.info("[7/10] Starting global compute pool...")
        await self._start_global_pool()

        # Step 6c: Peer discovery
        logger.info("[8/10] Starting peer discovery...")
        await self._start_peer_discovery()

        # Step 7: Start server
        logger.info("[9/10] Starting API server...")
        await self._start_server()

        # Step 8: Start trainer
        logger.info("[10/10] Starting background trainer...")
        await self._start_trainer()

        elapsed = time.time() - t0
        logger.info("=" * 60)
        logger.info(f"  SEA IS ALIVE — {len(self._nanos)} nanos spawned in {elapsed:.1f}s")
        logger.info(f"  API: http://localhost:{self._config.get('port', 5100)}")
        logger.info(f"  Hardware tier: {self._mesh_node.info.tier if self._mesh_node else '?'}")
        logger.info("=" * 60)

    # ── Step 1: Hardware ───────────────────────────────────────
    async def _detect_hardware(self) -> None:
        from mesh.node import MeshNode
        self._mesh_node = MeshNode(data_dir=str(ROOT_DIR / "nano_data" / "mesh"))
        info = self._mesh_node.info
        logger.info(f"  CPU: {info.cpu_model} ({info.cpu_cores} cores)")
        logger.info(f"  RAM: {info.ram_gb} GB")
        logger.info(f"  GPU: {info.gpu_model} ({info.gpu_vram_gb} GB VRAM)")
        logger.info(f"  Grade: {info.compute_grade} → Tier {info.tier}")

    # ── Step 2: AE Scan ────────────────────────────────────────
    async def _start_ae_scan(self) -> None:
        from scanner.ae_scanner import AEScanner
        scan_paths = self._config.get("scan_paths", [os.path.expanduser("~")])
        self._scanner = AEScanner(
            root_paths=scan_paths,
            data_dir=str(ROOT_DIR / "nano_data" / "ae"),
            max_files_per_second=200,  # gentle for weak hardware
        )
        # Check for cached seed
        cached = self._scanner.seed
        if cached:
            logger.info(f"  Using cached AE seed: R={cached['rby']['r']:.4f} B={cached['rby']['b']:.4f} Y={cached['rby']['y']:.4f}")
        else:
            await self._scanner.start_scan()  # runs in background

    # ── Step 3: Spawn Nanos ────────────────────────────────────
    async def _spawn_nanos(self) -> None:
        import torch
        # Import triggers all @register_nano decorators
        from nanos import NANO_REGISTRY, create_nano

        logger.info(f"  Registry contains {len(NANO_REGISTRY)} nano types")

        # Get AE seed for initialization
        seed = self._scanner.seed if self._scanner else None
        seed_rby = seed["rby"] if seed else {"r": 0.354, "b": 0.250, "y": 0.396}

        # Determine device
        device = "cuda" if torch.cuda.is_available() else "cpu"
        if device == "cuda":
            vram_gb = torch.cuda.get_device_properties(0).total_mem / (1024**3)
            if vram_gb < 4:
                device = "cpu"  # not enough VRAM for meaningful GPU use
                logger.info("  GPU VRAM < 4GB, using CPU")

        # Spawn all nanos
        for nano_type in NANO_REGISTRY:
            try:
                nano = create_nano(nano_type)
                # Apply AE seed modulation to initial weights
                with torch.no_grad():
                    for param in nano.parameters():
                        # Subtle seed modulation — makes each installation unique
                        r, b, y = seed_rby["r"], seed_rby["b"], seed_rby["y"]
                        param.data *= (1.0 + (r - 0.333) * 0.1)

                nano = nano.to(device)
                nano.eval()  # start in inference mode
                self._nanos[nano_type] = nano
            except Exception as e:
                logger.warning(f"  Failed to spawn {nano_type}: {e}")

        logger.info(f"  Spawned {len(self._nanos)} nanos on {device}")

    # ── Step 4: Wire Connections ───────────────────────────────
    async def _wire_connections(self) -> None:
        from orchestrator.ripple import RippleEngine

        self._ripple = RippleEngine()

        # Register all nanos
        for nano in self._nanos.values():
            self._ripple.register_nano(nano)

        # Auto-wire: connect nanos within same category
        # (they share the module prefix before the Nano suffix)
        from nanos import NANO_REGISTRY
        categories: Dict[str, list] = {}
        for nano_type, nano_cls in NANO_REGISTRY.items():
            # Group by module
            module = nano_cls.__module__.split(".")[-1] if hasattr(nano_cls, "__module__") else "other"
            categories.setdefault(module, []).append(nano_type)

        for cat_name, cat_nanos in categories.items():
            nanos_in_cat = [self._nanos[nt] for nt in cat_nanos if nt in self._nanos]
            if len(nanos_in_cat) > 1:
                self._ripple.auto_wire_category(nanos_in_cat)

        logger.info(f"  {self._ripple.total_connections} ripple connections wired")

    # ── Step 5: Orchestration ──────────────────────────────────
    async def _start_orchestration(self) -> None:
        from orchestrator.message_bus import MessageBus
        from orchestrator.scheduler import PTAIEScheduler
        from orchestrator.pipeline import PipelineExecutor
        from orchestrator.load_balancer import LoadBalancer, WorkerProfile

        self._bus = MessageBus()
        self._scheduler = PTAIEScheduler(
            max_concurrent_cpu=max(1, (self._mesh_node.info.cpu_cores or 4) // 2),
            max_concurrent_gpu=1 if self._mesh_node.info.has_cuda else 0,
        )
        self._pipeline = PipelineExecutor()
        self._balancer = LoadBalancer()

        # Register nanos with scheduler + pipeline
        for nano_type, nano in self._nanos.items():
            self._scheduler.register_nano(nano)
            self._pipeline.register_nano(nano)

        # Register local worker
        info = self._mesh_node.info
        self._balancer.register_worker(WorkerProfile(
            worker_id=self._mesh_node.node_id,
            hostname=info.hostname,
            is_local=True,
            cpu_cores=info.cpu_cores,
            ram_gb=info.ram_gb,
            gpu_vram_gb=info.gpu_vram_gb,
            has_cuda=info.has_cuda,
            compute_grade=info.compute_grade,
        ))

        # Register predefined pipelines
        inf_pipeline = self._pipeline.create_inference_pipeline()
        errors = self._pipeline.register_pipeline(inf_pipeline)
        if errors:
            logger.warning(f"  Inference pipeline errors: {errors}")

        train_pipeline = self._pipeline.create_training_pipeline()
        errors = self._pipeline.register_pipeline(train_pipeline)
        if errors:
            logger.warning(f"  Training pipeline errors: {errors}")

        await self._bus.start()
        await self._scheduler.start()
        logger.info("  Message bus + scheduler + pipeline running")

    # ── Step 6: Mesh ───────────────────────────────────────────
    async def _start_mesh(self) -> None:
        from mesh.discovery import DiscoveryService, DiscoveryConfig, TrackerConfig
        from mesh.transport import MeshTransport
        from mesh.latency import LatencyCompensator
        from mesh.respect import RespectSystem
        from mesh.task_queue import MeshTaskQueue
        from mesh.help_request import HelpRequestSystem

        mesh_port = self._config.get("mesh_port", 5101)

        self._transport = MeshTransport(self._mesh_node.node_id, port=mesh_port)
        self._latency = LatencyCompensator()
        self._respect = RespectSystem(data_dir=str(ROOT_DIR / "nano_data" / "respect"))
        self._task_queue = MeshTaskQueue(self._mesh_node.node_id)
        self._help_system = HelpRequestSystem(
            self._mesh_node.node_id,
            auto_accept=self._config.get("auto_accept_help", False),
        )

        # Wire systems together
        self._task_queue.set_load_balancer(self._balancer)
        self._task_queue.set_latency_compensator(self._latency)
        self._help_system.set_respect_system(self._respect)

        # Discovery
        tracker_url = self._config.get("tracker_url", "")
        manual_peers = self._config.get("manual_peers", [])
        disc_config = DiscoveryConfig(
            tracker=TrackerConfig(url=tracker_url),
            manual_peers=manual_peers,
            subnet_scan=self._config.get("subnet_scan", False),
        )
        self._discovery = DiscoveryService(self._mesh_node, disc_config)

        # Start services
        await self._transport.start_server()
        await self._latency.start()
        await self._help_system.start()
        await self._discovery.start()
        self._mesh_node.go_online(port=mesh_port)

        logger.info(f"  Mesh node online at port {mesh_port}")

    # ── Step 6b: Global Compute Pool ──────────────────────────
    async def _start_global_pool(self) -> None:
        from mesh.global_pool import GlobalComputePool, PoolMember, PoolRole

        self._global_pool = GlobalComputePool(
            local_node_id=self._mesh_node.node_id,
            data_dir=str(ROOT_DIR / "nano_data" / "pool"),
        )

        # Register local node
        info = self._mesh_node.info
        donation_pct = int(os.environ.get("NANO_DONATION_PCT", "25"))
        is_permanent = os.environ.get("NANO_PERMANENT_NODE", "0") == "1"

        local_member = PoolMember(
            node_id=self._mesh_node.node_id,
            username=os.environ.get("NANO_USERNAME", info.hostname),
            hostname=info.hostname,
            role=PoolRole.PERMANENT if is_permanent else PoolRole.DONOR,
            compute_grade=info.compute_grade,
            tier=info.tier,
            has_cuda=info.has_cuda,
            gpu_vram_gb=info.gpu_vram_gb,
            ram_gb=info.ram_gb,
            cpu_cores=info.cpu_cores,
            donation_percent=donation_pct,
            max_concurrent_jobs=max(1, info.cpu_cores // 4),
            is_online=True,
        )
        local_member.last_heartbeat = time.time()
        self._global_pool.register_member(local_member)

        # Idle training setting
        idle_training = os.environ.get("NANO_IDLE_TRAINING", "1") == "1"
        self._global_pool._idle_training_enabled = idle_training

        await self._global_pool.start()
        logger.info(f"  Global pool active (donation={donation_pct}%, "
                     f"permanent={'yes' if is_permanent else 'no'}, "
                     f"idle_training={'on' if idle_training else 'off'})")

    # ── Step 6c: Peer Discovery ───────────────────────────────
    async def _start_peer_discovery(self) -> None:
        from mesh.peer_discovery import PeerDiscovery, SharingLevel

        username = os.environ.get("NANO_USERNAME", self._mesh_node.info.hostname)
        self._peer_discovery = PeerDiscovery(
            local_node_id=self._mesh_node.node_id,
            username=username,
            data_dir=str(ROOT_DIR / "nano_data" / "peers"),
        )

        # Set hardware info for announcements
        info = self._mesh_node.info
        self._peer_discovery.compute_grade = info.compute_grade
        self._peer_discovery.tier = info.tier
        self._peer_discovery.has_cuda = info.has_cuda
        self._peer_discovery.gpu_name = info.gpu_model

        # Opt-in from env (defaults to off — user must enable via UI)
        if os.environ.get("NANO_PEER_DISCOVERY", "0") == "1":
            level_str = os.environ.get("NANO_SHARING_LEVEL", "metadata")
            try:
                level = SharingLevel(level_str)
            except ValueError:
                level = SharingLevel.METADATA
            self._peer_discovery.set_opt_in(True, level)

        await self._peer_discovery.start(port=self._config.get("mesh_port", 5101))
        logger.info(f"  Peer discovery active (username={username}, "
                     f"discoverable={self._peer_discovery.is_discoverable})")

    # ── Step 7: Server ─────────────────────────────────────────
    async def _start_server(self) -> None:
        from server.main import create_server
        import uvicorn

        self._server = create_server()
        self._server.set_systems(
            sea=self._nanos,
            mesh_node=self._mesh_node,
            pipeline=self._pipeline,
            respect=self._respect,
            help_sys=self._help_system,
            scheduler=self._scheduler,
            global_pool=self._global_pool,
            peer_discovery=self._peer_discovery,
        )

        port = self._config.get("port", 5100)
        config = uvicorn.Config(
            self._server.app,
            host="0.0.0.0",
            port=port,
            log_level="warning",
        )
        server = uvicorn.Server(config)
        # Run in background
        asyncio.create_task(server.serve())
        logger.info(f"  API server running on http://0.0.0.0:{port}")

    # ── Step 8: Trainer ────────────────────────────────────────
    async def _start_trainer(self) -> None:
        from training.trainer import NanoTrainer

        self._trainer = NanoTrainer(
            data_dir=str(ROOT_DIR / "nano_data" / "training"),
            batch_size=4,  # small for weak hardware
            training_interval=120.0,  # train every 2 min
        )

        # Register nanos for training (start with key inference nanos)
        priority_nanos = [
            "TokenGeneratorNano", "EmbeddingNano", "QueryParserNano",
            "CodeCompletionNano", "TokenizationNano", "SearchNano",
        ]
        for nano_type in priority_nanos:
            if nano_type in self._nanos:
                self._trainer.register_nano(nano_type, self._nanos[nano_type])

        await self._trainer.start()
        logger.info(f"  Trainer running ({len(priority_nanos)} priority nanos)")

    # ══════════════════════════════════════════════════════════
    # SHUTDOWN
    # ══════════════════════════════════════════════════════════
    async def shutdown(self) -> None:
        logger.info("Shutting down Sea of Nanos...")
        if self._trainer:
            await self._trainer.stop()
        if self._peer_discovery:
            await self._peer_discovery.stop()
        if self._global_pool:
            await self._global_pool.stop()
        if self._help_system:
            await self._help_system.stop()
        if self._discovery:
            await self._discovery.stop()
        if self._transport:
            await self._transport.stop()
        if self._latency:
            await self._latency.stop()
        if self._scheduler:
            await self._scheduler.stop()
        if self._bus:
            await self._bus.stop()
        if self._scanner:
            await self._scanner.stop_scan()
        if self._mesh_node:
            self._mesh_node.go_offline()

        elapsed = time.time() - self._start_time
        logger.info(f"Sea of Nanos shut down after {elapsed:.0f}s. Goodbye.")


# ═══════════════════════════════════════════════════════════════
# CLI Entry Point
# ═══════════════════════════════════════════════════════════════

def parse_args():
    parser = argparse.ArgumentParser(description="Sea of Nanos — Big Bang Launcher")
    parser.add_argument("--port", type=int, default=5100, help="API server port")
    parser.add_argument("--mesh", action="store_true", help="Enable mesh networking")
    parser.add_argument("--mesh-port", type=int, default=5101, help="Mesh transport port")
    parser.add_argument("--tracker", type=str, default="", help="Tracker WebSocket URL")
    parser.add_argument("--peers", type=str, nargs="*", default=[], help="Manual peer addresses (host:port)")
    parser.add_argument("--subnet-scan", action="store_true", help="Scan local subnet for peers")
    parser.add_argument("--auto-accept-help", action="store_true", help="Auto-accept help requests")
    parser.add_argument("--scan-paths", type=str, nargs="*", help="Paths to scan for AE seed")
    return parser.parse_args()


async def main():
    args = parse_args()
    config = {
        "port": args.port,
        "mesh_enabled": args.mesh,
        "mesh_port": args.mesh_port,
        "tracker_url": args.tracker,
        "manual_peers": args.peers,
        "subnet_scan": args.subnet_scan,
        "auto_accept_help": args.auto_accept_help,
        "scan_paths": args.scan_paths,
    }

    sea = NanoSea(config)

    # Graceful shutdown on SIGINT/SIGTERM
    loop = asyncio.get_event_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, lambda: asyncio.create_task(sea.shutdown()))
        except NotImplementedError:
            # Windows doesn't support add_signal_handler
            pass

    try:
        await sea.boot()
        # Keep alive
        while True:
            await asyncio.sleep(3600)
    except KeyboardInterrupt:
        pass
    finally:
        await sea.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
