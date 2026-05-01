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

# Initialize structured log dumper (writes machine-readable JSONL files)
try:
    from log_system.log_dumper import init_log_dumper as _init_log_dumper
    _log_dumper = _init_log_dumper(
        log_dir=str(ROOT_DIR / "logs"),
        max_file_bytes=10 * 1024 * 1024,  # 10 MB per file
        max_files_per_channel=5,
        compress_rotated=True,
    )
    logger.info("Structured log dumper initialized → logs/*.jsonl")
except Exception as e:
    _log_dumper = None
    logger.warning(f"Log dumper init failed: {e}")


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
        self._uvicorn_server = None
        self._server_task = None
        self._global_pool = None
        self._peer_discovery = None

        # Core framework subsystems (wired in boot)
        self._lifecycle = None
        self._fitness = None
        self._storage = None
        self._ic_ae = None

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
        logger.info("[3/12] Spawning the sea...")
        await self._spawn_nanos()

        # Step 3b: Initialize AE framework subsystems
        logger.info("[4/12] Initializing AE framework (lifecycle, fitness, storage, IC-AE)...")
        await self._init_framework()

        # Step 4: Wire connections
        logger.info("[5/12] Wiring ripple connections...")
        await self._wire_connections()

        # Step 5: Start orchestration
        logger.info("[6/12] Starting orchestration layer...")
        await self._start_orchestration()

        # Step 6: Start mesh (if enabled)
        mesh_enabled = self._config.get("mesh_enabled", False)
        if mesh_enabled:
            logger.info("[7/12] Starting mesh node...")
            await self._start_mesh()
        else:
            logger.info("[7/12] Mesh disabled (enable with --mesh)")

        # Step 7: Global compute pool
        logger.info("[8/12] Starting global compute pool...")
        await self._start_global_pool()

        # Step 8: Peer discovery
        logger.info("[9/12] Starting peer discovery...")
        await self._start_peer_discovery()

        # Step 9: Start server
        logger.info("[10/12] Starting API server...")
        await self._start_server()

        # Step 10: Start trainer
        logger.info("[11/12] Starting background trainer...")
        await self._start_trainer()

        # Step 11: Start lifecycle monitor
        logger.info("[12/12] Starting lifecycle monitor...")
        await self._start_lifecycle_monitor()

        elapsed = time.time() - t0
        logger.info("=" * 60)
        logger.info(f"  SEA IS ALIVE — {len(self._nanos)} nanos spawned in {elapsed:.1f}s")
        logger.info(f"  API: http://localhost:{self._config.get('port', 5100)}")
        logger.info(f"  Hardware tier: {self._mesh_node.info.tier if self._mesh_node else '?'}")
        logger.info(f"  Framework: lifecycle={self._lifecycle is not None}, "
                     f"fitness={self._fitness is not None}, "
                     f"storage={self._storage is not None}, "
                     f"ic_ae={self._ic_ae is not None}")
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
        # Import triggers all @register_nano decorators
        from nanos import NANO_REGISTRY, create_nano
        from compute.device_manager import get_device_manager

        logger.info(f"  Registry contains {len(NANO_REGISTRY)} nano types")

        # Get AE seed for initialization
        seed = self._scanner.seed if self._scanner else None
        seed_rby = seed["rby"] if seed else {"r": 0.354, "b": 0.250, "y": 0.396}

        # Determine device distribution using the unified device manager so
        # Windows DirectML, ROCm, and multi-GPU setups don't collapse to CPU.
        device_manager = get_device_manager()
        devices = device_manager.all_devices
        if device_manager.is_gpu and device_manager.active_gpu and device_manager.active_gpu.vram_gb < 4:
            logger.info("  GPU VRAM < 4GB on primary device, using CPU")
            devices = ["cpu"]

        # Spawn all nanos
        for nano_idx, nano_type in enumerate(NANO_REGISTRY):
            try:
                nano = create_nano(nano_type)
                # Apply AE seed modulation to initial weights
                import torch
                with torch.no_grad():
                    for param in nano.parameters():
                        # Subtle seed modulation — makes each installation unique
                        r, b, y = seed_rby["r"], seed_rby["b"], seed_rby["y"]
                        param.data *= (1.0 + (r - 0.333) * 0.1)

                target_device = devices[nano_idx % len(devices)]
                nano = device_manager.to_device(nano) if target_device == device_manager.device else nano.to(target_device)
                nano.eval()  # start in inference mode
                self._nanos[nano_type] = nano
            except Exception as e:
                logger.warning(f"  Failed to spawn {nano_type}: {e}")

        logger.info(f"  Spawned {len(self._nanos)} nanos across {len(devices)} device(s): {devices}")

    # ── Step 3b: AE Framework ──────────────────────────────────
    async def _init_framework(self) -> None:
        """Initialize IC-AE, lifecycle, fitness evaluator, and tiered storage."""
        from core.ic_ae import ICAEEngine
        from core.lifecycle import LifecycleManager
        from core.fitness import FitnessEvaluator
        from core.storage import TieredStorageManager

        # IC-AE Recursive Infection Engine
        from nanos.base import create_nano as nano_factory
        self._ic_ae = ICAEEngine(
            max_depth=self._config.get("ic_ae_max_depth", 5),
            max_children=self._config.get("ic_ae_max_children", 500),
            max_total_sandboxes=self._config.get("ic_ae_max_total", 2000),
        )
        self._ic_ae.set_nano_factory(nano_factory)
        logger.info(f"  IC-AE engine ready (max_depth={self._ic_ae.max_depth}, "
                     f"max_total={self._ic_ae.max_total})")

        # Lifecycle Manager — tracks expansion→absularity→compression cycles
        self._lifecycle = LifecycleManager(
            epsilon=self._config.get("lifecycle_epsilon", 0.01),
            eta=self._config.get("lifecycle_eta", 0.05),
        )
        logger.info(f"  Lifecycle manager ready (phase={self._lifecycle.get_phase_name()})")

        # Fitness Evaluator — survival of the fittest
        self._fitness = FitnessEvaluator()
        for nano_type, nano in self._nanos.items():
            self._fitness.register(
                nano_id=nano.nano_id,
                nano_type=nano_type,
                param_count=nano.param_count,
            )
        logger.info(f"  Fitness evaluator tracking {len(self._nanos)} nanos")

        # Tiered Storage — hot/warm/cold/frozen/compressed
        storage_path = ROOT_DIR / "nano_data" / "storage"
        self._storage = TieredStorageManager(
            base_path=storage_path,
            hot_max_mb=self._config.get("hot_capacity_mb", 256),
            warm_max_mb=self._config.get("warm_capacity_mb", 512),
        )
        logger.info(f"  Tiered storage ready at {storage_path}")

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
            trainer=self._trainer,
        )

        port = self._config.get("port", 5100)
        config = uvicorn.Config(
            self._server.app,
            host="0.0.0.0",
            port=port,
            log_level="warning",
        )
        self._uvicorn_server = uvicorn.Server(config)

        # Wrap serve() so SystemExit from a port-bind failure
        # doesn't kill the entire process (Python 3.9 propagates
        # SystemExit out of asyncio tasks).
        self._bind_error: Optional[str] = None

        async def _safe_serve():
            try:
                await self._uvicorn_server.serve()
            except SystemExit:
                if not self._uvicorn_server.started:
                    self._bind_error = (
                        f"Port {port} already in use — is another Nano Sea running? "
                        f"Kill the old process or use --port {port + 1}"
                    )

        self._server_task = asyncio.create_task(_safe_serve())

        # Wait for the server to actually bind (or fail)
        for _ in range(50):  # up to 5 seconds
            await asyncio.sleep(0.1)
            if self._uvicorn_server.started:
                break
            if self._server_task.done():
                break

        if self._uvicorn_server.started:
            logger.info(f"  API server running on http://0.0.0.0:{port}")
        else:
            msg = self._bind_error or f"API server failed to start on port {port}"
            raise RuntimeError(msg)

    # ── Step 8: Trainer ────────────────────────────────────────
    async def _start_trainer(self) -> None:
        use_v2_swarm = self._config.get("v2_swarm", True)

        if use_v2_swarm:
            from training.swarm_runtime import SwarmRuntime

            self._trainer = SwarmRuntime(
                batch_size=self._config.get("v2_batch_size", 8),
                seq_len=self._config.get("v2_seq_len", 128),
                training_interval=self._config.get("v2_training_interval", 3.0),
                cycle_steps=self._config.get("v2_cycle_steps", 200),
                checkpoint_every=self._config.get("v2_checkpoint_every", 200),
            )
            await self._trainer.start()
            logger.info("  Trainer running (v2 swarm runtime + lifecycle loop)")
        else:
            from training.trainer import NanoTrainer

            self._trainer = NanoTrainer(
                data_dir=str(ROOT_DIR / "nano_data" / "training"),
                checkpoint_dir=str(ROOT_DIR / "checkpoints"),
                batch_size=4,  # small for weak hardware
                training_interval=120.0,  # train every 2 min
            )

            # Register nanos for training — include all inference pipeline nanos
            priority_nanos = [
                # Core inference pipeline nanos
                "TokenGeneratorNano", "EmbeddingNano", "QueryParserNano",
                "CodeCompletionNano", "TokenizationNano", "SearchNano",
                # Additional pipeline stage nanos
                "QueryExpanderNano", "QueryRouterNano", "RankNano",
                "ContextAssemblerNano", "ResponseValidatorNano", "ResponseFormatterNano",
            ]
            registered_count = 0
            for nano_type in priority_nanos:
                if nano_type in self._nanos:
                    self._trainer.register_nano(nano_type, self._nanos[nano_type])
                    registered_count += 1

            await self._trainer.start()
            logger.info(f"  Trainer running ({registered_count}/{len(priority_nanos)} priority nanos registered)")

        # Wire trainer into server (server was started before trainer)
        if self._server:
            self._server._trainer = self._trainer

    # ── Step 11: Lifecycle Monitor ─────────────────────────────
    async def _start_lifecycle_monitor(self) -> None:
        """Background task: monitors expansion, triggers evolution, handles absularity."""
        if self._trainer and getattr(self._trainer, "status", {}).get("trainer") == "swarm_v2":
            logger.info("  Lifecycle monitor delegated to v2 swarm runtime")
            return
        self._lifecycle_task = asyncio.create_task(self._lifecycle_loop())
        logger.info("  Lifecycle monitor running (evolution + absularity detection)")

    async def _lifecycle_loop(self) -> None:
        """Periodic lifecycle management: fitness evaluation, evolution, absularity check."""
        cycle_interval = self._config.get("lifecycle_interval", 300.0)  # 5 min
        evolution_interval = self._config.get("evolution_interval", 600.0)  # 10 min
        last_evolution = time.time()

        while True:
            try:
                await asyncio.sleep(cycle_interval)

                # ── Fitness evaluation ──
                if self._fitness:
                    for nano_type, nano in self._nanos.items():
                        record = self._fitness.get_record(nano.nano_id)
                        if record:
                            record.record_usage(self._lifecycle.cycle_id if self._lifecycle else 0)
                    rankings = self._fitness.rank_all()
                    if rankings:
                        top = rankings[:3]
                        bottom = rankings[-3:]
                        logger.debug(f"Fitness top 3: {[(r[0][:20], f'{r[1]:.3f}') for r in top]}")
                        logger.debug(f"Fitness bottom 3: {[(r[0][:20], f'{r[1]:.3f}') for r in bottom]}")

                # ── Evolution (tournament selection) ──
                now = time.time()
                if self._trainer and (now - last_evolution) >= evolution_interval:
                    last_evolution = now
                    # Evolve the lowest-performing trained nanos
                    if self._fitness:
                        candidates = self._fitness.get_pruning_candidates(keep_ratio=0.9)
                        for nano_id in candidates[:2]:  # evolve up to 2 per cycle
                            # Find nano_type from nano_id
                            for nt, n in self._nanos.items():
                                if n.nano_id == nano_id:
                                    try:
                                        best_fitness = await self._trainer.evolve(nt, population_size=4)
                                        if best_fitness is not None:
                                            logger.info(f"  Evolved {nt}: fitness={best_fitness:.4f}")
                                    except Exception as e:
                                        logger.debug(f"Evolution skipped for {nt}: {e}")
                                    break

                # ── Absularity check ──
                if self._lifecycle:
                    # Compute expansion volume: total param bytes across all nanos
                    total_bytes = sum(n.size_bytes for n in self._nanos.values())
                    # Track volume growth rate
                    dv_dt = total_bytes / max(1, time.time() - self._start_time)
                    d2v_dt2 = 0.0  # simplified — full tracking would use a history

                    absularity = self._lifecycle.check_absularity(
                        dv_dt=dv_dt,
                        d2v_dt2=d2v_dt2,
                    )
                    if absularity:
                        logger.warning("⚡ ABSULARITY DETECTED — expansion has plateaued")
                        # In future: trigger compression cycle
                        # self._lifecycle.transition(LifecycleState.COMPRESSION)

                # ── Tiered storage maintenance ──
                if self._storage and self._storage.needs_compression:
                    logger.info("Storage approaching capacity — compression recommended")

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Lifecycle monitor error: {e}", exc_info=True)

    # ══════════════════════════════════════════════════════════
    # SHUTDOWN
    # ══════════════════════════════════════════════════════════
    async def shutdown(self) -> None:
        logger.info("Shutting down Sea of Nanos...")
        # Cancel lifecycle monitor
        if hasattr(self, '_lifecycle_task') and self._lifecycle_task:
            self._lifecycle_task.cancel()
            try:
                await self._lifecycle_task
            except asyncio.CancelledError:
                pass
        # Stop uvicorn server
        if hasattr(self, '_uvicorn_server') and self._uvicorn_server:
            self._uvicorn_server.should_exit = True
            if hasattr(self, '_server_task') and self._server_task:
                try:
                    await asyncio.wait_for(self._server_task, timeout=3.0)
                except (asyncio.TimeoutError, asyncio.CancelledError):
                    pass
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
    parser.add_argument("--legacy-trainer", action="store_true", help="Use legacy NanoTrainer instead of v2 swarm runtime")
    parser.add_argument("--v2-training-interval", type=float, default=3.0, help="v2 swarm runtime training interval seconds")
    parser.add_argument("--v2-cycle-steps", type=int, default=200, help="v2 swarm lifecycle step interval")
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
        "v2_swarm": not args.legacy_trainer,
        "v2_training_interval": args.v2_training_interval,
        "v2_cycle_steps": args.v2_cycle_steps,
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
    except RuntimeError as e:
        logger.error(f"BOOT FAILED: {e}")
    finally:
        await sea.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
