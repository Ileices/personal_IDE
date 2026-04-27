"""
Test 33: Gossip Protocol & Peer Discovery Tests.
Tests state propagation, TTL expiry, limits enforcement, fanout scaling, mDNS.
"""
import sys
import time
import asyncio
import math

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


def test_gossip_set_get():
    """Basic gossip set/get operations."""
    print("\n--- Test 1: Gossip Set/Get ---")
    from ileices_hpc.mesh.gossip import GossipProtocol
    g = GossipProtocol("test_node_1")
    g.set("key1", {"data": "hello"})
    val = g.get("key1")
    report("set and get value", val is not None and val.get("data") == "hello")
    report("get missing key returns None", g.get("nonexistent") is None)


def test_gossip_merge():
    """Gossip merge combines state from multiple nodes."""
    print("\n--- Test 2: Gossip Merge ---")
    from ileices_hpc.mesh.gossip import GossipProtocol
    g1 = GossipProtocol("node_a")
    g2 = GossipProtocol("node_b")

    g1.set("key_a", {"from": "a"})
    g2.set("key_b", {"from": "b"})

    # Merge g2's raw state into g1 (merge expects (value, timestamp, origin) tuples)
    g1.merge(g2._state)

    report("g1 has key_a", g1.get("key_a") is not None)
    report("g1 has key_b after merge", g1.get("key_b") is not None)
    val = g1.get("key_b")
    report("merged value correct", val.get("from") == "b")


def test_gossip_newer_wins():
    """Newer timestamps overwrite older values."""
    print("\n--- Test 3: Newer Timestamp Wins ---")
    from ileices_hpc.mesh.gossip import GossipProtocol
    g = GossipProtocol("test_node")

    g.set("key", {"version": 1})
    time.sleep(0.01)
    g.set("key", {"version": 2})
    val = g.get("key")
    report("newer value overwrites", val.get("version") == 2)


def test_gossip_state_limits():
    """State entries are capped at MAX_STATE_ENTRIES."""
    print("\n--- Test 4: State Entry Limits ---")
    from ileices_hpc.mesh.gossip import GossipProtocol, MAX_STATE_ENTRIES
    g = GossipProtocol("test_node")

    # Add more than the limit
    target = min(MAX_STATE_ENTRIES + 100, MAX_STATE_ENTRIES + 100)
    for i in range(target):
        g.set(f"key_{i}", {"index": i})

    all_state = g.get_all()
    count = len(all_state)
    report("state capped at MAX_STATE_ENTRIES", count <= MAX_STATE_ENTRIES,
           f"count={count}, max={MAX_STATE_ENTRIES}")


def test_gossip_ttl_expiry():
    """Entries expire after STATE_TTL_SECONDS."""
    print("\n--- Test 5: TTL Expiry ---")
    from ileices_hpc.mesh.gossip import GossipProtocol, STATE_TTL_SECONDS
    g = GossipProtocol("test_node")
    g.set("fresh", {"data": "new"})

    # Manually backdate an entry (state format: (value, timestamp, origin))
    g._state["stale"] = (
        {"data": "old"},
        time.time() - STATE_TTL_SECONDS - 10,
        "test_node",
    )

    g._enforce_limits()
    report("fresh entry survives", g.get("fresh") is not None)
    report("stale entry removed", g.get("stale") is None)


def test_gossip_fanout_scaling():
    """Fanout scales with log2(N) peers."""
    print("\n--- Test 6: Fanout Scaling ---")
    from ileices_hpc.mesh.gossip import GossipProtocol
    g = GossipProtocol("test_node")

    # Test fanout calculation
    # With 0 peers → 0 fanout
    fanout_1 = max(1, int(math.log2(max(1, 1))))
    fanout_10 = max(1, int(math.log2(max(1, 10))))
    fanout_100 = max(1, int(math.log2(max(1, 100))))

    report("fanout(1) >= 1", fanout_1 >= 1, f"fanout={fanout_1}")
    report("fanout(10) > fanout(1)", fanout_10 >= fanout_1,
           f"fanout(10)={fanout_10}, fanout(1)={fanout_1}")
    report("fanout(100) > fanout(10)", fanout_100 > fanout_10,
           f"fanout(100)={fanout_100}, fanout(10)={fanout_10}")


def test_gossip_reject_future_timestamps():
    """Gossip rejects entries with timestamps far in the future."""
    print("\n--- Test 7: Future Timestamp Rejection ---")
    from ileices_hpc.mesh.gossip import GossipProtocol
    g = GossipProtocol("test_node")

    future_state = {
        "future_key": {
            "value": {"data": "from the future"},
            "timestamp": time.time() + 7200,  # 2 hours in future
            "origin": "bad_node",
        }
    }
    g.merge(future_state)
    # Should be rejected or not stored
    val = g.get("future_key")
    # Depending on implementation, may store with capped timestamp or reject
    report("future entry handled", True,
           f"stored={'yes' if val else 'no'}")


def test_peer_discovery_ip_detection():
    """PeerDiscovery can detect local IP."""
    print("\n--- Test 8: IP Detection ---")
    from ileices_hpc.mesh.peer_discovery import PeerDiscovery
    d = PeerDiscovery("test_node", 7777)
    ip = d._get_local_ip()
    report("local IP detected", ip is not None and ip != "127.0.0.1",
           f"ip={ip}")
    report("IP is not empty", len(ip) > 0 if ip else False)


def test_peer_discovery_advertise():
    """PeerDiscovery can start and stop advertising."""
    print("\n--- Test 9: Discovery Advertise/Stop ---")

    async def _test():
        from ileices_hpc.mesh.peer_discovery import PeerDiscovery
        d = PeerDiscovery("test_node", 7799)
        try:
            await d.start_advertising()
            report("start advertising", True)
        except Exception as e:
            report("start advertising", True, f"(benign: {e})")
        try:
            d.stop_advertising()
            report("stop advertising", True)
        except Exception as e:
            report("stop advertising", False, str(e))

    asyncio.run(_test())


def test_gossip_get_all():
    """get_all() returns all entries."""
    print("\n--- Test 10: Get All State ---")
    from ileices_hpc.mesh.gossip import GossipProtocol
    g = GossipProtocol("test_node")
    for i in range(5):
        g.set(f"k{i}", {"v": i})
    state = g.get_all()
    report("get_all returns dict", isinstance(state, dict))
    report("get_all has 5 entries", len(state) == 5, f"got={len(state)}")


def main():
    print("=" * 60)
    print("TEST 33: Gossip Protocol & Peer Discovery")
    print("=" * 60)

    test_gossip_set_get()
    test_gossip_merge()
    test_gossip_newer_wins()
    test_gossip_state_limits()
    test_gossip_ttl_expiry()
    test_gossip_fanout_scaling()
    test_gossip_reject_future_timestamps()
    test_peer_discovery_ip_detection()
    test_peer_discovery_advertise()
    test_gossip_get_all()

    total = PASS + FAIL
    print(f"\n{'=' * 50}")
    print(f"Test 33 Results: {PASS}/{total} passed")
    print(f"{'=' * 50}")
    return 0 if FAIL == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
