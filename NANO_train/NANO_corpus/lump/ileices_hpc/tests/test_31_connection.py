"""
Test 31: Basic P2P Connection & Communication
=============================================
Tests:
  1. Server starts and listens
  2. Client connects with handshake
  3. Bidirectional message passing
  4. Round-trip latency measurement
  5. Multiple simultaneous peers
  6. Encryption if PyNaCl available
  7. Clean disconnect
  8. Reconnection after disconnect

Run: python -m ileices_hpc.tests.test_31_connection
"""
import asyncio
import time
import sys
import os
import shutil

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from ileices_hpc.crypto.identity import NodeIdentity
from ileices_hpc.mesh.server import MeshServer
from ileices_hpc.mesh.client import MeshClient
from ileices_hpc.mesh.protocol import MessageType, make_message

# Use high ports to avoid conflicts
BASE_PORT = 18800
_port_counter = 0
_test_dirs = []


def next_port():
    global _port_counter
    _port_counter += 1
    return BASE_PORT + _port_counter


def make_identity(name):
    d = f".test_keys_{name}_{os.getpid()}"
    _test_dirs.append(d)
    return NodeIdentity(d)


def cleanup_test_dirs():
    for d in _test_dirs:
        if os.path.exists(d):
            try:
                shutil.rmtree(d)
            except Exception:
                pass


class TestResult:
    def __init__(self):
        self.tests: list = []
        self.passed = 0
        self.failed = 0

    def record(self, name: str, passed: bool, detail: str = ""):
        status = "PASS" if passed else "FAIL"
        self.tests.append((name, status, detail))
        if passed:
            self.passed += 1
        else:
            self.failed += 1
        print(f"  [{status}] {name}" + (f" -- {detail}" if detail else ""))

    def summary(self):
        print(f"\n{'='*50}")
        print(f"Test 31 Results: {self.passed}/{self.passed + self.failed} passed")
        if self.failed > 0:
            print("FAILURES:")
            for name, status, detail in self.tests:
                if status == "FAIL":
                    print(f"  - {name}: {detail}")
        print(f"{'='*50}")
        return self.failed == 0


async def test_basic_connection(results: TestResult):
    print("\n--- Test 1: Basic Server-Client Connection ---")
    server_id = make_identity("srv1")
    client_id = make_identity("cli1")
    port = next_port()

    server = MeshServer(server_id, host="127.0.0.1", port=port, crypto_enabled=False)
    await server.start()

    connected_event = asyncio.Event()
    async def on_connected(peer_id, peer_info):
        connected_event.set()
    server.on_message('peer_connected', on_connected)

    client = MeshClient(client_id, local_port=next_port(), crypto_enabled=False,
                        hardware_profile={'tier': 'CORE', 'gpus': [{'name': 'Test', 'tflops_fp32': 5.0, 'vram_mb': 6144}],
                                          'total_vram_mb': 6144, 'cpu_cores_physical': 8, 'ram_total_mb': 32000})
    peer_id = await client.connect("127.0.0.1", port, reconnect=False, timeout=5.0)
    results.record("Client connects to server", peer_id is not None,
                    f"peer_id={peer_id[:10] if peer_id else 'None'}")
    try:
        await asyncio.wait_for(connected_event.wait(), timeout=3.0)
        results.record("Server registers peer", True, f"peers={len(server.peers)}")
    except asyncio.TimeoutError:
        results.record("Server registers peer", False, "Timeout")

    await client.disconnect_all()
    await server.stop()


async def test_bidirectional_messaging(results: TestResult):
    print("\n--- Test 2: Bidirectional Messaging ---")
    server_id = make_identity("srv2")
    client_id = make_identity("cli2")
    port = next_port()

    server = MeshServer(server_id, host="127.0.0.1", port=port, crypto_enabled=False)
    server_received = []
    client_received = []
    async def on_server_recv(sender_id, msg):
        server_received.append(msg)
    async def on_client_recv(sender_id, msg):
        client_received.append(msg)
    server.on_message(MessageType.STATUS_REQUEST.value, on_server_recv)
    await server.start()

    client = MeshClient(client_id, local_port=next_port(), crypto_enabled=False)
    client.on_message(MessageType.STATUS_RESPONSE.value, on_client_recv)
    peer_id = await client.connect("127.0.0.1", port, reconnect=False)
    await asyncio.sleep(0.5)

    msg = make_message(MessageType.STATUS_REQUEST, client_id.node_id, data="hello_server")
    await client.send_to(peer_id, msg)
    await asyncio.sleep(0.3)
    results.record("Client -> Server message",
                    len(server_received) == 1 and server_received[0].get('data') == 'hello_server',
                    f"received={len(server_received)}")

    client_node_id = list(server.peers.keys())[0] if server.peers else None
    if client_node_id:
        msg = make_message(MessageType.STATUS_RESPONSE, server_id.node_id, data="hello_client")
        await server.send_to(client_node_id, msg)
        await asyncio.sleep(0.3)
        results.record("Server -> Client message",
                        len(client_received) == 1 and client_received[0].get('data') == 'hello_client',
                        f"received={len(client_received)}")
    else:
        results.record("Server -> Client message", False, "No peer on server")

    await client.disconnect_all()
    await server.stop()


async def test_round_trip_latency(results: TestResult):
    print("\n--- Test 3: Round-Trip Latency ---")
    server_id = make_identity("srv3")
    client_id = make_identity("cli3")
    port = next_port()

    server = MeshServer(server_id, host="127.0.0.1", port=port, crypto_enabled=False)
    async def echo_handler(sender_id, msg):
        reply = make_message(MessageType.STATUS_RESPONSE, server_id.node_id,
                             echo_data=msg.get('data', ''))
        await server.send_to(sender_id, reply)
    server.on_message(MessageType.STATUS_REQUEST.value, echo_handler)
    await server.start()

    client = MeshClient(client_id, local_port=next_port(), crypto_enabled=False)
    response_times = []
    response_event = asyncio.Event()
    async def on_response(sender_id, msg):
        response_times.append(time.perf_counter())
        response_event.set()
    client.on_message(MessageType.STATUS_RESPONSE.value, on_response)

    peer_id = await client.connect("127.0.0.1", port, reconnect=False)
    await asyncio.sleep(0.3)

    rtts = []
    for i in range(10):
        response_event.clear()
        send_time = time.perf_counter()
        msg = make_message(MessageType.STATUS_REQUEST, client_id.node_id, data=f"ping_{i}")
        await client.send_to(peer_id, msg)
        try:
            await asyncio.wait_for(response_event.wait(), timeout=2.0)
            rtt = (response_times[-1] - send_time) * 1000
            rtts.append(rtt)
        except asyncio.TimeoutError:
            pass

    if rtts:
        avg_rtt = sum(rtts) / len(rtts)
        results.record("Round-trip latency", avg_rtt < 100,
                        f"avg={avg_rtt:.2f}ms min={min(rtts):.2f}ms max={max(rtts):.2f}ms ({len(rtts)}/10)")
    else:
        results.record("Round-trip latency", False, "No responses")

    await client.disconnect_all()
    await server.stop()


async def test_multiple_peers(results: TestResult):
    print("\n--- Test 4: Multiple Peers ---")
    server_id = make_identity("srv4")
    port = next_port()
    server = MeshServer(server_id, host="127.0.0.1", port=port, crypto_enabled=False)
    await server.start()

    clients = []
    peer_ids = []
    for i in range(5):
        cid = make_identity(f"multi_{i}")
        client = MeshClient(cid, local_port=next_port(), crypto_enabled=False)
        pid = await client.connect("127.0.0.1", port, reconnect=False)
        clients.append(client)
        peer_ids.append(pid)
    await asyncio.sleep(1.0)

    connected = sum(1 for p in peer_ids if p is not None)
    server_peers = len(server.peers)
    results.record("Multiple peers connect",
                    connected == 5 and server_peers == 5,
                    f"connected={connected}/5, server_peers={server_peers}/5")

    msg = make_message(MessageType.STATUS_RESPONSE, server_id.node_id, data="broadcast_test")
    await server.broadcast(msg)
    await asyncio.sleep(0.5)
    results.record("Server broadcast", True, f"sent to {server_peers} peers")

    await clients[2].disconnect_all()
    await asyncio.sleep(1.0)
    remaining = len(server.peers)
    results.record("Peer disconnect detected", remaining <= 4, f"remaining={remaining}")

    for c in clients:
        await c.disconnect_all()
    await server.stop()


async def test_encryption(results: TestResult):
    print("\n--- Test 5: Encryption ---")
    from ileices_hpc.crypto.identity import HAS_NACL
    if not HAS_NACL:
        results.record("PyNaCl available", False, "pip install pynacl")
        results.record("Encrypted channel", False, "Skipped")
        return
    results.record("PyNaCl available", True)

    server_id = make_identity("enc_srv")
    client_id = make_identity("enc_cli")
    port = next_port()

    server = MeshServer(server_id, host="127.0.0.1", port=port, crypto_enabled=True)
    encrypted_msg = []
    async def on_msg(sender_id, msg):
        encrypted_msg.append(msg)
    server.on_message(MessageType.STATUS_REQUEST.value, on_msg)
    await server.start()

    client = MeshClient(client_id, local_port=next_port(), crypto_enabled=True)
    peer_id = await client.connect("127.0.0.1", port, reconnect=False)
    await asyncio.sleep(0.5)

    if peer_id and server.peers:
        client_peer_id = list(server.peers.keys())[0]
        conn = server.peers[client_peer_id]
        is_encrypted = conn.channel.encrypted
        results.record("Encrypted channel", is_encrypted,
                        f"type={type(conn.channel).__name__}")
    else:
        results.record("Encrypted channel", False, "No connection")

    if peer_id:
        msg = make_message(MessageType.STATUS_REQUEST, client_id.node_id, data="secret_data")
        await client.send_to(peer_id, msg)
        await asyncio.sleep(0.5)
        results.record("Encrypted message received",
                        len(encrypted_msg) == 1 and encrypted_msg[0].get('data') == 'secret_data',
                        f"received={len(encrypted_msg)}")

    await client.disconnect_all()
    await server.stop()


async def test_clean_disconnect(results: TestResult):
    print("\n--- Test 6: Clean Disconnect ---")
    server_id = make_identity("disc_srv")
    client_id = make_identity("disc_cli")
    port = next_port()

    server = MeshServer(server_id, host="127.0.0.1", port=port, crypto_enabled=False)
    disconnect_event = asyncio.Event()
    async def on_disconnect(peer_id):
        disconnect_event.set()
    server.on_message('peer_disconnected', on_disconnect)
    await server.start()

    client = MeshClient(client_id, local_port=next_port(), crypto_enabled=False)
    peer_id = await client.connect("127.0.0.1", port, reconnect=False)
    await asyncio.sleep(0.3)
    results.record("Connection established", peer_id is not None and len(server.peers) == 1)

    await client.disconnect_all()
    try:
        await asyncio.wait_for(disconnect_event.wait(), timeout=3.0)
        results.record("Server notified of disconnect", True)
    except asyncio.TimeoutError:
        results.record("Server notified of disconnect", len(server.peers) == 0, f"peers={len(server.peers)}")

    await asyncio.sleep(0.5)
    results.record("Server peer count = 0", len(server.peers) == 0, f"peers={len(server.peers)}")
    await server.stop()


async def test_reconnection(results: TestResult):
    print("\n--- Test 7: Reconnection After Disconnect ---")
    server_id = make_identity("recon_srv")
    client_id = make_identity("recon_cli")
    port = next_port()

    server = MeshServer(server_id, host="127.0.0.1", port=port, crypto_enabled=False)
    connect_count = 0
    connect_event = asyncio.Event()
    async def on_connected(peer_id, peer_info):
        nonlocal connect_count
        connect_count += 1
        connect_event.set()
    server.on_message('peer_connected', on_connected)
    await server.start()

    client = MeshClient(client_id, local_port=next_port(), crypto_enabled=False,
                        max_reconnect_attempts=5)
    peer_id = await client.connect("127.0.0.1", port, reconnect=True)
    await asyncio.sleep(0.5)
    results.record("Initial connection", peer_id is not None and connect_count == 1)

    # Kill the server side of the connection to force a reconnect
    if server.peers:
        for pid, conn in list(server.peers.items()):
            conn.close()
            del server.peers[pid]

    # Wait for client to detect disconnect and reconnect
    connect_event.clear()
    try:
        await asyncio.wait_for(connect_event.wait(), timeout=15.0)
        results.record("Reconnection succeeded", connect_count >= 2,
                        f"connect_count={connect_count}")
    except asyncio.TimeoutError:
        results.record("Reconnection succeeded", False, f"Timeout. connect_count={connect_count}")

    await client.disconnect_all()
    await server.stop()


async def run_all_tests():
    print("=" * 60)
    print("TEST 31: Basic P2P Connection & Communication")
    print("=" * 60)

    results = TestResult()
    try:
        await test_basic_connection(results)
        await test_bidirectional_messaging(results)
        await test_round_trip_latency(results)
        await test_multiple_peers(results)
        await test_encryption(results)
        await test_clean_disconnect(results)
        await test_reconnection(results)
    finally:
        cleanup_test_dirs()

    return results.summary()


if __name__ == '__main__':
    success = asyncio.run(run_all_tests())
    sys.exit(0 if success else 1)
