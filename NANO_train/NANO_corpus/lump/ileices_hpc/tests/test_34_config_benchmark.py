"""
Test 34: Config, Hardware Benchmark, and Protocol Validation.
Tests config loading/saving/validation, protocol encoding, tier classification, benchmark.
"""
import sys
import time
import json
import os
import tempfile
import struct

PASS = 0
FAIL = 0


def report(name, passed, detail=""):
    global PASS, FAIL
    tag = "PASS" if passed else "FAIL"
    if passed:
        PASS += 1
    else:
        FAIL += 1
    suffix = f" -- {detail}" if detail else ""
    print(f"  [{tag}] {name}{suffix}")


def test_config_defaults():
    """Config has correct defaults."""
    print("\n--- Test 1: Config Defaults ---")
    from ileices_hpc.agent.config import AgentConfig
    c = AgentConfig()
    report("default role is worker", c.role == "worker")
    report("default port is 7777", c.mesh.listen_port == 7777)
    report("crypto enabled by default", c.crypto.enabled is True)
    report("max_peers > 0", c.mesh.max_peers > 0)


def test_config_validation():
    """Config validation catches bad values."""
    print("\n--- Test 2: Config Validation ---")
    from ileices_hpc.agent.config import AgentConfig

    # Bad role
    c = AgentConfig(role="invalid")
    try:
        c.validate()
        report("rejects invalid role", False, "no error raised")
    except ValueError:
        report("rejects invalid role", True)

    # Bad port
    c = AgentConfig(role="worker")
    c.mesh.listen_port = 80
    try:
        c.validate()
        report("rejects port < 1024", False, "no error raised")
    except ValueError:
        report("rejects port < 1024", True)

    # Bad commander address
    c = AgentConfig(role="worker", commander_address="no-port-here")
    try:
        c.validate()
        report("rejects bad commander address", False, "no error raised")
    except ValueError:
        report("rejects bad commander address", True)

    # Valid config
    c = AgentConfig(role="commander")
    try:
        c.validate()
        report("accepts valid config", True)
    except ValueError as e:
        report("accepts valid config", False, str(e))


def test_config_save_load():
    """Config round-trips through save/load."""
    print("\n--- Test 3: Config Save/Load ---")
    from ileices_hpc.agent.config import AgentConfig

    c1 = AgentConfig(
        node_name="test-node",
        role="worker",
        commander_address="192.168.1.100:7777",
    )
    c1.mesh.listen_port = 8888

    tmpdir = tempfile.mkdtemp()
    path = os.path.join(tmpdir, "test_config.json")
    try:
        c1.save(path)
        report("config saved", os.path.exists(path))

        c2 = AgentConfig.load(path)
        report("config loaded", c2 is not None)
        report("node_name preserved", c2.node_name == "test-node")
        report("role preserved", c2.role == "worker")
        report("port preserved", c2.mesh.listen_port == 8888)
        report("commander_address preserved", c2.commander_address == "192.168.1.100:7777")
    finally:
        if os.path.exists(path):
            os.remove(path)
        os.rmdir(tmpdir)


def test_config_load_malformed():
    """Config.load rejects malformed JSON."""
    print("\n--- Test 4: Config Malformed JSON ---")
    from ileices_hpc.agent.config import AgentConfig

    tmpdir = tempfile.mkdtemp()
    path = os.path.join(tmpdir, "bad.json")
    try:
        with open(path, 'w') as f:
            f.write("{not valid json{{}")
        try:
            AgentConfig.load(path)
            report("rejects malformed JSON", False)
        except ValueError:
            report("rejects malformed JSON", True)

        # Missing file
        try:
            AgentConfig.load(os.path.join(tmpdir, "nonexistent.json"))
            report("rejects missing file", False)
        except ValueError:
            report("rejects missing file", True)
    finally:
        if os.path.exists(path):
            os.remove(path)
        os.rmdir(tmpdir)


def test_config_cli_overrides():
    """Config CLI overrides take priority over config file."""
    print("\n--- Test 5: CLI Overrides ---")
    from ileices_hpc.agent.config import AgentConfig

    tmpdir = tempfile.mkdtemp()
    path = os.path.join(tmpdir, "base.json")
    try:
        # Save a base config with port 9999
        base = AgentConfig(role="worker")
        base.mesh.listen_port = 9999
        base.save(path)

        # Simulate argparse namespace with overrides
        class Args:
            config = path
            role = "commander"  # Override role
            port = 7777  # Override port
            commander = None
            name = "my-node"
            no_crypto = False
            log_file = None
            log_level = None

        c = AgentConfig.from_args(Args())
        report("CLI role overrides file", c.role == "commander")
        report("CLI port overrides file", c.mesh.listen_port == 7777, f"port={c.mesh.listen_port}")
        report("CLI name applied", c.node_name == "my-node")
    finally:
        if os.path.exists(path):
            os.remove(path)
        os.rmdir(tmpdir)


def test_protocol_encode_decode():
    """Messages encode and decode correctly."""
    print("\n--- Test 6: Protocol Encode/Decode ---")
    import asyncio
    from ileices_hpc.mesh.protocol import make_message, encode_message, read_message, MessageType

    msg = make_message(MessageType.HEARTBEAT, "test_sender", data="hello")
    encoded = encode_message(msg)

    report("encoded is bytes", isinstance(encoded, bytes))
    report("starts with 4-byte length", len(encoded) >= 4)

    # Decode the length prefix
    length = struct.unpack('>I', encoded[:4])[0]
    report("length matches payload", length == len(encoded) - 4,
           f"length={length}, payload={len(encoded)-4}")

    # Decode via read_message with a mock reader
    async def _test():
        reader = asyncio.StreamReader()
        reader.feed_data(encoded)
        reader.feed_eof()
        decoded = await read_message(reader)
        return decoded

    decoded = asyncio.run(_test())
    report("decoded type matches", decoded['type'] == MessageType.HEARTBEAT.value)
    report("decoded sender matches", decoded['sender'] == "test_sender")
    report("decoded data matches", decoded.get('data') == "hello")


def test_protocol_validate_message():
    """validate_message catches malformed messages."""
    print("\n--- Test 7: Message Validation ---")
    from ileices_hpc.mesh.protocol import validate_message

    # Good message
    good = {'type': 'heartbeat', 'sender': 'node1', 'timestamp': time.time()}
    report("valid message accepted", validate_message(good) is True)

    # Missing type
    report("rejects no type", validate_message({'sender': 'x', 'timestamp': 1}) is False)

    # Missing sender
    report("rejects no sender", validate_message({'type': 'x', 'timestamp': 1}) is False)

    # Not a dict
    report("rejects non-dict", validate_message("string") is False)
    report("rejects None", validate_message(None) is False)


def test_tier_classification():
    """classify_tier returns correct tiers."""
    print("\n--- Test 8: Tier Classification ---")
    from ileices_hpc.mesh.protocol import classify_tier

    report("A100 → ULTRA", classify_tier(81920, "NVIDIA A100", 64, 256000) == "ULTRA")
    report("H100 → ULTRA", classify_tier(81920, "NVIDIA H100", 64, 256000) == "ULTRA")
    report("RTX 3090 → CORE", classify_tier(24576, "RTX 3090", 16, 64000) == "CORE")
    report("GTX 1660 → EDGE", classify_tier(6144, "GTX 1660 SUPER", 12, 32000) == "EDGE")
    report("CPU only (big) → EDGE", classify_tier(0, "none", 16, 32000) == "EDGE")
    report("CPU only (small) → NANO", classify_tier(0, "none", 4, 8000) == "NANO")
    report("40GB+ VRAM → ULTRA", classify_tier(40960, "unknown", 8, 32000) == "ULTRA")


def test_peer_info_roundtrip():
    """PeerInfo serializes and deserializes."""
    print("\n--- Test 9: PeerInfo Roundtrip ---")
    from ileices_hpc.mesh.protocol import PeerInfo

    p1 = PeerInfo(
        node_id="abc123", host="192.168.0.1", port=7777,
        tier="CORE", gpu_model="RTX 3090", gpu_vram_mb=24576,
    )
    d = p1.to_dict()
    report("to_dict returns dict", isinstance(d, dict))

    p2 = PeerInfo.from_dict(d)
    report("node_id preserved", p2.node_id == "abc123")
    report("host preserved", p2.host == "192.168.0.1")
    report("tier preserved", p2.tier == "CORE")
    report("gpu_model preserved", p2.gpu_model == "RTX 3090")


def test_hardware_benchmark():
    """Hardware benchmark runs without crashing."""
    print("\n--- Test 10: Hardware Benchmark ---")
    from ileices_hpc.agent.hardware_benchmark import run_benchmark

    try:
        profile = run_benchmark(
            gpu_warmup=2, gpu_iters=5, matrix_size=512,
            disk_test_mb=1, skip_disk=True,
        )
        report("benchmark completes", True)
        report("has tier", profile.tier in ("NANO", "EDGE", "CORE", "ULTRA"),
               f"tier={profile.tier}")
        report("has cpu_cores", profile.cpu_cores_physical > 0,
               f"cores={profile.cpu_cores_physical}")
        report("has ram_total", profile.ram_total_mb > 0,
               f"ram={profile.ram_total_mb}MB")
        report("has hostname", len(profile.hostname) > 0)
        summary = profile.summary()
        report("summary is string", isinstance(summary, str) and len(summary) > 0)
    except Exception as e:
        report("benchmark completes", False, str(e))


def test_identity():
    """NodeIdentity creates and loads keys."""
    print("\n--- Test 11: NodeIdentity ---")
    import tempfile
    import shutil
    from ileices_hpc.crypto.identity import NodeIdentity

    tmpdir = tempfile.mkdtemp()
    try:
        # First creation
        id1 = NodeIdentity(tmpdir)
        report("identity created", len(id1.node_id) > 0, f"id={id1.node_id[:10]}")
        report("has verify key", id1.verify_key_bytes is not None or not id1.has_crypto)

        # Reload from same directory
        id2 = NodeIdentity(tmpdir)
        report("identity persists", id1.node_id == id2.node_id)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def test_encryption_channel():
    """Encrypted channel encrypts and decrypts."""
    print("\n--- Test 12: Encryption Channel ---")
    try:
        from nacl.public import PrivateKey
        from ileices_hpc.crypto.encryption import EncryptedChannel

        key_a = PrivateKey.generate()
        key_b = PrivateKey.generate()

        # EncryptedChannel takes raw public key bytes
        chan_a = EncryptedChannel(key_a, bytes(key_b.public_key))
        chan_b = EncryptedChannel(key_b, bytes(key_a.public_key))

        # A encrypts, B decrypts
        plaintext = b"hello encrypted world"
        ciphertext = chan_a.encrypt(plaintext)
        report("ciphertext differs from plaintext", ciphertext != plaintext)

        decrypted = chan_b.decrypt(ciphertext)
        report("B decrypts A's message", decrypted == plaintext)

        # B encrypts, A decrypts
        plaintext2 = b"reply from B"
        ct2 = chan_b.encrypt(plaintext2)
        pt2 = chan_a.decrypt(ct2)
        report("A decrypts B's message", pt2 == plaintext2)

    except ImportError:
        report("PyNaCl available", False, "not installed")


def main():
    print("=" * 60)
    print("TEST 34: Config, Benchmark & Protocol Validation")
    print("=" * 60)

    test_config_defaults()
    test_config_validation()
    test_config_save_load()
    test_config_load_malformed()
    test_config_cli_overrides()
    test_protocol_encode_decode()
    test_protocol_validate_message()
    test_tier_classification()
    test_peer_info_roundtrip()
    test_hardware_benchmark()
    test_identity()
    test_encryption_channel()

    total = PASS + FAIL
    print(f"\n{'=' * 50}")
    print(f"Test 34 Results: {PASS}/{total} passed")
    print(f"{'=' * 50}")
    return 0 if FAIL == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
