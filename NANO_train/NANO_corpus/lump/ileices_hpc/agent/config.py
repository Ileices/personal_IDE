"""
Configuration for the Ileices HPC agent.
All tunable parameters in one place with validation.
"""
import os
import json
import logging
from pathlib import Path
from dataclasses import dataclass, field, asdict
from typing import Optional

logger = logging.getLogger("ileices.agent.config")

VALID_ROLES = ("commander", "worker")


@dataclass
class MeshConfig:
    listen_host: str = "0.0.0.0"
    listen_port: int = 7777
    max_peers: int = 128
    heartbeat_interval_s: float = 5.0
    heartbeat_timeout_s: float = 15.0
    gossip_interval_s: float = 10.0
    message_max_bytes: int = 64 * 1024 * 1024
    connection_timeout_s: float = 10.0
    reconnect_delay_s: float = 5.0
    max_reconnect_attempts: int = 20


@dataclass
class CryptoConfig:
    enabled: bool = True
    key_dir: str = ".ileices_keys"
    require_auth: bool = True


@dataclass
class BenchmarkConfig:
    gpu_warmup_iters: int = 50
    gpu_bench_iters: int = 200
    matrix_size: int = 4096
    disk_test_size_mb: int = 256


@dataclass
class NanoPoolConfig:
    max_gpu_nanos: int = 50000
    max_cpu_nanos: int = 200000
    nano_checkpoint_dir: str = "nano_checkpoints"
    checkpoint_interval_steps: int = 100


@dataclass
class TrainingConfig:
    default_batch_size: int = 32
    default_lr: float = 1e-3
    gradient_compression: str = "topk"
    topk_ratio: float = 0.01
    federated_avg_interval_steps: int = 50


@dataclass
class AgentConfig:
    node_name: Optional[str] = None
    role: str = "worker"
    commander_address: Optional[str] = None
    data_dir: str = "ileices_data"
    log_level: str = "INFO"
    log_file: Optional[str] = None  # If set, also log to this file

    mesh: MeshConfig = field(default_factory=MeshConfig)
    crypto: CryptoConfig = field(default_factory=CryptoConfig)
    benchmark: BenchmarkConfig = field(default_factory=BenchmarkConfig)
    nanopool: NanoPoolConfig = field(default_factory=NanoPoolConfig)
    training: TrainingConfig = field(default_factory=TrainingConfig)

    def validate(self):
        """Validate config values. Raises ValueError on problems."""
        if self.role not in VALID_ROLES:
            raise ValueError(f"Invalid role '{self.role}'. Must be one of {VALID_ROLES}")
        if not (1024 <= self.mesh.listen_port <= 65535):
            raise ValueError(f"Port {self.mesh.listen_port} out of range [1024, 65535]")
        if self.commander_address:
            parts = self.commander_address.rsplit(':', 1)
            if len(parts) != 2:
                raise ValueError(f"Invalid commander_address '{self.commander_address}'. Use host:port")
            try:
                port = int(parts[1])
                if not (1 <= port <= 65535):
                    raise ValueError
            except ValueError:
                raise ValueError(f"Invalid port in commander_address: {parts[1]}")
        if self.mesh.max_peers < 1:
            raise ValueError("max_peers must be >= 1")

    def save(self, path: str):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with open(path, 'w') as f:
            json.dump(asdict(self), f, indent=2)

    @classmethod
    def load(cls, path: str) -> 'AgentConfig':
        try:
            with open(path) as f:
                data = json.load(f)
        except json.JSONDecodeError as e:
            raise ValueError(f"Malformed config file {path}: {e}")
        except FileNotFoundError:
            raise ValueError(f"Config file not found: {path}")

        mesh = MeshConfig(**data.pop('mesh', {}))
        crypto = CryptoConfig(**data.pop('crypto', {}))
        benchmark = BenchmarkConfig(**data.pop('benchmark', {}))
        nanopool = NanoPoolConfig(**data.pop('nanopool', {}))
        training = TrainingConfig(**data.pop('training', {}))
        # Remove unknown keys
        known = set(cls.__dataclass_fields__)
        filtered = {k: v for k, v in data.items() if k in known}
        return cls(mesh=mesh, crypto=crypto, benchmark=benchmark,
                   nanopool=nanopool, training=training, **filtered)

    @classmethod
    def from_args(cls, args) -> 'AgentConfig':
        """Build config from argparse namespace.
        BUG FIX: Load config file FIRST, then apply CLI overrides.
        """
        # Step 1: Start from defaults or config file
        if hasattr(args, 'config') and args.config:
            config = cls.load(args.config)
            logger.info(f"Loaded config from {args.config}")
        else:
            config = cls()

        # Step 2: Apply CLI overrides (these take priority)
        if args.role:
            config.role = args.role
        if args.port:
            config.mesh.listen_port = args.port
        if args.commander:
            config.commander_address = args.commander
        if args.name:
            config.node_name = args.name
        if hasattr(args, 'no_crypto') and args.no_crypto:
            config.crypto.enabled = False
        if hasattr(args, 'log_file') and args.log_file:
            config.log_file = args.log_file
        if hasattr(args, 'log_level') and args.log_level:
            config.log_level = args.log_level

        # Step 3: Validate
        config.validate()
        return config
