# 12 — Distributed Mesh

## Multi-Machine Scaling: Friends as AE Sources, Peers as Compute

---

## Philosophy

> A single machine runs one Nano Sea. Multiple machines run **one ocean**.
> Each node is sovereign — it runs its own expansion/compression cycles —
> but nodes can share deposits, nanos, and AE data across the mesh.
> Your friend's compressed intelligence enriches your sea without you
> ever seeing their raw data.

The mesh is **not** distributed training. Nanos are never split across machines.
Instead, the mesh enables:

1. **Deposit Gossip** — Propagating fitness/deposit scores (tiny messages, ~64B each)
2. **Weight Sharing** — Sharing trained nano weights (72KB–50MB, infrequent)
3. **Nano Discovery** — Finding which nanos exist and what they can do
4. **Nano Migration** — Moving nanos between users (only when user requests)
5. **Compute Marketplace** — Idle GPU donation for GPU-less users (opt-in)

### Critical Architecture Insight (Experiment 10–11)

**Compute stays LOCAL. The mesh is for COORDINATION, not compute offloading.**

Data transfer at 50 Mbps: 10 MB takes 1.7 seconds.
Local CPU processes 50 nanos in 0.004 seconds.
**Local almost always wins for compute.** The mesh only transfers:
- Deposit scores (64 bytes per nano)
- Weight snapshots (72 KB–50 MB, infrequent)
- Discovery queries (128 bytes)

Total mesh bandwidth per node: **< 1 Mbps** (0.62 Mbps measured).
This runs on any home internet connection.

---

## Mesh Architecture

```
┌──────────────────────┐         ┌──────────────────────┐
│  Node A (Your PC)    │◄───────►│  Node B (Friend's)   │
│                      │  Mesh   │                      │
│  ┌──────────────┐    │  Proto  │    ┌──────────────┐  │
│  │  NanoSea A   │    │         │    │  NanoSea B   │  │
│  │  ├─ models/  │    │         │    │  ├─ models/  │  │
│  │  ├─ deposits/│◄──────────────────►│  ├─ deposits/│  │
│  │  └─ state.db │    │         │    │  └─ state.db │  │
│  └──────────────┘    │         │    └──────────────┘  │
│                      │         │                      │
│  AE: C:/Docs         │         │  AE: ~/research      │
└──────────┬───────────┘         └──────────┬───────────┘
           │                                │
           │         ┌──────────────────┐   │
           └────────►│  Node C (Server) │◄──┘
                     │  High Compute    │
                     │  Trains nanos    │
                     │  for A and B     │
                     └──────────────────┘
```

---

## Mesh Protocol

### Discovery

Nodes find each other via:
1. **Manual peering** — User enters IP:port of a friend's node
2. **mDNS/Zeroconf** — Automatic discovery on local network
3. **Rendezvous server** — Optional cloud relay for NAT traversal

```python
@dataclass
class MeshPeer:
    """Identity of a peer node."""
    node_id: str             # SHA256 of public key
    display_name: str        # Human-readable name
    endpoint: str            # "ws://192.168.1.42:8787"
    public_key: bytes        # Ed25519 public key
    last_seen: float         # Timestamp
    trust_score: float       # 0.0 - 1.0 (starts at 0.5)
    capabilities: List[str]  # ["deposit_share", "nano_migrate", "compute_donate"]


class MeshRegistry:
    """Manages known peers and their capabilities."""

    def __init__(self, own_node_id: str, own_key_pair):
        self.own_id = own_node_id
        self.key_pair = own_key_pair
        self.peers: Dict[str, MeshPeer] = {}

    def add_peer(self, endpoint: str, display_name: str = "") -> MeshPeer:
        """Manually add a peer by endpoint."""
        # Initiate handshake to exchange keys and capabilities
        ...

    def discover_local(self):
        """mDNS discovery on LAN."""
        ...

    def get_trusted_peers(self, min_trust: float = 0.3) -> List[MeshPeer]:
        return [p for p in self.peers.values() if p.trust_score >= min_trust]
```

### Handshake

All mesh communication uses WebSocket (same server as the inference API):

```
Node A → Node B:  HELLO { node_id, public_key, capabilities, sea_summary }
Node B → Node A:  HELLO_ACK { node_id, public_key, capabilities, sea_summary }
                  (Both verify signatures)
Node A → Node B:  PEER_ESTABLISHED
```

`sea_summary` contains:
- Current cycle number
- Population size
- Seed RBY
- Deposit count
- Specialization histogram (what domains this sea knows about)

---

## Deposit Sharing

The primary value of the mesh. Deposits are already compressed intelligence —
they contain NO raw data, only weight statistics and metadata.

```python
@dataclass
class DepositEnvelope:
    """A deposit wrapped for mesh transmission."""
    deposit: Dict               # The raw deposit (weight stats, RBY, fitness, etc.)
    source_node_id: str         # Which node created this deposit
    source_cycle: int           # Which cycle it came from
    signature: bytes            # Ed25519 signature from source node
    relevance_tags: List[str]   # ["python", "math", "images", ...]

class DepositSharing:
    """Manages deposit exchange with mesh peers."""

    def __init__(self, mesh: MeshRegistry, deposit_manager: "DepositManager"):
        self.mesh = mesh
        self.deposit_manager = deposit_manager

    async def offer_deposits(self, peer: MeshPeer, deposits: List[Dict]):
        """Offer our deposits to a peer. They choose which to accept."""
        envelopes = [
            DepositEnvelope(
                deposit=d,
                source_node_id=self.mesh.own_id,
                source_cycle=d.get("cycle", 0),
                signature=sign(d, self.mesh.key_pair),
                relevance_tags=extract_tags(d),
            )
            for d in deposits
        ]
        # Send via WebSocket
        await peer.send("DEPOSIT_OFFER", envelopes)

    async def receive_deposit_offer(self, envelopes: List[DepositEnvelope]):
        """
        Evaluate incoming deposits. Accept only those that are:
        1. From a trusted peer
        2. Relevant to our sea's current needs
        3. Not redundant with existing deposits
        """
        accepted = []
        for env in envelopes:
            if not verify_signature(env.deposit, env.signature, env.source_node_id):
                continue  # Reject unsigned/forged deposits

            relevance = self.compute_relevance(env)
            if relevance > 0.3:  # Only accept if materially useful
                self.deposit_manager.ingest_foreign_deposit(env.deposit, env.source_node_id)
                accepted.append(env)

        return accepted

    def compute_relevance(self, env: DepositEnvelope) -> float:
        """How useful is this foreign deposit to our sea?"""
        # High relevance if it covers RBY regions we're weak in
        our_coverage = self.deposit_manager.get_rby_coverage()
        deposit_rby = RBY(*env.deposit["rby"])

        # Distance from nearest existing deposit
        min_dist = min(
            deposit_rby.distance(RBY(*d["rby"]))
            for d in self.deposit_manager.hot_deposits
        ) if self.deposit_manager.hot_deposits else 1.0

        return min_dist  # Higher distance = more novel = more relevant
```

### Privacy Guarantees

Deposits contain ONLY:
- Weight statistics (mean, std, min, max per layer) — NOT actual weights
- RBY position (a 3-float coordinate)
- Fitness score (a single float)
- Specialization tag (e.g., "python_parser") — human-readable label
- Nano type (e.g., "pattern")

They do NOT contain:
- Any raw training data
- Actual model weights
- User file contents
- File paths or filenames

---

## Nano Migration

High-fitness nanos can be cloned and sent to peer nodes:

```python
class NanoMigration:
    """Handles nano transfer between mesh peers."""

    async def export_nano(
        self,
        gid: str,
        nanos: Dict[str, Tuple[nn.Module, NanoCard]],
    ) -> bytes:
        """Serialize a nano for mesh transmission."""
        model, card = nanos[gid]
        payload = {
            "card": asdict(card),
            "state_dict": {k: v.cpu().numpy().tolist() for k, v in model.state_dict().items()},
        }
        # Compress and sign
        data = gzip.compress(json.dumps(payload).encode())
        return data

    async def import_nano(
        self,
        data: bytes,
        source_node: str,
        cycle: int,
        models_dir: str,
    ) -> Tuple[nn.Module, NanoCard]:
        """Deserialize and instantiate a foreign nano."""
        payload = json.loads(gzip.decompress(data))
        card_data = payload["card"]

        # Create a new local identity (don't trust foreign GIDs)
        local_gid = gen_gid()
        nano_type = card_data["nano_type"]
        cls = NANO_CLASSES[nano_type]
        model = cls()

        # Load weights
        state_dict = {
            k: torch.tensor(v) for k, v in payload["state_dict"].items()
        }
        model.load_state_dict(state_dict)

        card = NanoCard(
            gid=local_gid,
            nano_type=nano_type,
            specialization=f"migrated_{card_data['specialization']}",
            rby=RBY(card_data["rby"]["r"], card_data["rby"]["b"], card_data["rby"]["y"]),
            parent_gid=None,
            cycle_born=cycle,
            generation_depth=0,  # Resets on migration
            model_path=os.path.join(models_dir, f"{local_gid}.pt"),
        )

        torch.save(model.state_dict(), card.model_path)
        return model, card
```

### Migration Policy

Not all nanos should migrate. Policy controls:

```python
class MigrationPolicy:
    """Controls which nanos can migrate and where."""

    def should_export(self, card: NanoCard) -> bool:
        """Only export high-fitness, well-tested nanos."""
        return (
            card.fitness >= 0.7
            and card.usage_count >= 20
            and card.generation_depth <= 3  # Don't export deep specializations
        )

    def should_import(self, foreign_card: Dict, our_sea_state: Dict) -> bool:
        """Only import nanos that fill gaps in our sea."""
        foreign_rby = RBY(foreign_card["rby"]["r"], foreign_card["rby"]["b"], foreign_card["rby"]["y"])
        # Accept if it covers a region we're weak in
        our_coverage = our_sea_state["rby_coverage"]
        return compute_gap(foreign_rby, our_coverage) > 0.2

    def max_foreign_ratio(self) -> float:
        """Foreign nanos should never exceed 30% of total population."""
        return 0.30
```

---

## Compute Donation

Idle nodes can train nanos on behalf of busy peers:

```python
class ComputeDonation:
    """
    Node A has a nano that needs training but no spare compute.
    Node B is idle. Node A sends the nano + training data to Node B.
    Node B trains it and returns the updated weights.
    """

    async def request_training(
        self,
        peer: MeshPeer,
        nano_data: bytes,      # Serialized nano
        training_data: bytes,  # Encrypted training batch
        epochs: int = 5,
    ):
        """Send a training request to a peer."""
        await peer.send("TRAIN_REQUEST", {
            "nano": nano_data,
            "data": training_data,
            "epochs": epochs,
        })

    async def handle_training_request(self, request: Dict) -> bytes:
        """Train a foreign nano and return updated weights."""
        # Deserialize
        model, card = deserialize_nano(request["nano"])
        data = deserialize_training_data(request["data"])

        # Train in a sandbox (resource-limited)
        trainer = SandboxTrainer(max_ram_mb=512, max_time_s=60)
        updated_model = trainer.train(model, data, epochs=request["epochs"])

        # Return updated weights
        return serialize_weights(updated_model)
```

---

## Trust System

Trust evolves over time based on deposit quality and behavior:

```python
class TrustManager:
    """
    Tracks trust scores for mesh peers.
    Trust increases when:
      - Foreign deposits lead to successful nanos
      - Migrated nanos perform well
      - Compute donations return valid results
    Trust decreases when:
      - Foreign deposits are irrelevant or harmful
      - Migrated nanos consistently fail
      - Compute results are corrupted
    """

    def update_trust(self, node_id: str, event: str, outcome: float):
        """
        event: "deposit_used" | "nano_migrated" | "compute_donated"
        outcome: 0.0 (bad) to 1.0 (good)
        """
        peer = self.mesh.peers[node_id]
        lr = 0.1  # Trust moves slowly
        peer.trust_score = peer.trust_score * (1 - lr) + outcome * lr
        peer.trust_score = max(0.0, min(1.0, peer.trust_score))

    def ban_peer(self, node_id: str, reason: str):
        """Permanently block a peer."""
        if node_id in self.mesh.peers:
            self.mesh.peers[node_id].trust_score = 0.0
            log.warning(f"Banned peer {node_id}: {reason}")
```

---

## Mesh Message Types

| Type              | Direction   | Payload                               |
|-------------------|-------------|---------------------------------------|
| HELLO             | A → B       | node_id, pubkey, capabilities, summary |
| HELLO_ACK         | B → A       | node_id, pubkey, capabilities, summary |
| DEPOSIT_OFFER     | A → B       | List[DepositEnvelope]                 |
| DEPOSIT_ACCEPT    | B → A       | List[accepted envelope IDs]           |
| NANO_EXPORT       | A → B       | Compressed nano bytes                 |
| NANO_IMPORT_ACK   | B → A       | Local GID assigned                    |
| TRAIN_REQUEST     | A → B       | nano + data + config                  |
| TRAIN_RESULT      | B → A       | Updated weights                       |
| HEARTBEAT         | A ↔ B       | cycle, population, seed RBY           |
| DISCONNECT        | A → B       | reason                                |

All messages are:
- Signed with Ed25519 (authenticity)
- Optionally encrypted with X25519 (privacy)
- Transmitted over WebSocket (port 8787, same as inference API)

---

## Wire Protocol (Binary, from Experiment 11)

Every mesh message uses a **44-byte binary header** + variable payload:

```
[msg_type: u8][payload_len: u16][sender_id: 32B][timestamp_ms: u64][ttl: u8] + [payload]
```

| Message Type     | Code | Typical Payload | Total Size | Purpose |
|------------------|------|-----------------|------------|---------|
| HEARTBEAT        | 0x01 | 32 B            | 76 B       | "I'm alive, here's my capacity" |
| DEPOSIT_GOSSIP   | 0x02 | 64 B            | 108 B      | "Nano X has deposit D, fitness F" |
| WEIGHT_SHARE     | 0x03 | 72 KB           | ~72 KB     | "Here are trained weights for nano X" |
| NANO_DISCOVERY   | 0x04 | 128 B           | 172 B      | "What nanos do you have for task T?" |
| NANO_REQUEST     | 0x05 | 16 B            | 60 B       | "Send me nano X's weights" |
| COMPUTE_OFFER    | 0x06 | 32 B            | 76 B       | "I have N NCU/s available" |
| COMPUTE_REQUEST  | 0x07 | 64 KB           | ~64 KB     | "Train these nanos on your GPU" |
| RESULT_RETURN    | 0x08 | 72 KB           | ~72 KB     | "Here are the trained weights back" |
| MESH_JOIN        | 0x09 | 256 B           | 300 B      | "New node joining" |
| MESH_LEAVE       | 0x0A | 16 B            | 60 B       | "Node leaving" |

### Bandwidth Budget Per Node

| Traffic type | Bytes/s | Mbps | Notes |
|-------------|---------|------|-------|
| Deposit gossip (top-100 × 10 peers) | 64,440 | 0.516 | Dominant cost |
| Heartbeats (10 peers × 1/5s) | 152 | 0.001 | Negligible |
| Weight sharing (10 nanos/min) | 12,295 | 0.098 | Infrequent |
| Discovery queries (1/s) | 172 | 0.001 | On-demand |
| **TOTAL** | **77,059** | **0.616** | **1.2% of a 50 Mbps link** |

---

## Gossip Protocol — Deposit Propagation (Experiment 11)

Each node gossips its **top-K nanos by deposit** to connected peers once per
second. This is the primary mechanism for the mesh to know which nanos
exist and how valuable they are.

**Gossip-Merge Strategy:**
1. Each nano copy tracks deposits locally
2. During gossip, nodes share `{nano_id, deposit, fitness, generation}`
3. Receiving node: `deposit = max(local_deposit, gossip_deposit)`
4. Over time, the highest deposit value propagates everywhere

This is simple, correct, and requires **no blockchain**.

**Convergence (measured, 100 nodes, 10K nanos, 10 peers):**
- After 1 round: nodes know ~3.4% of all nanos (local + peers' top-K)
- Full convergence requires increasing K or more rounds
- For practical mesh: K=100 is sufficient (you only need the BEST nanos)

---

## Multi-User Universe Model (Experiment 11)

| Mode | Description | Network Usage | Who Uses This |
|------|-------------|---------------|---------------|
| **Private** (default) | All local, no mesh | 0 Mbps | 90% of users |
| **Shared** (opt-in) | Gossip + weight sharing | < 0.01 Mbps | Users who want better nanos |
| **Marketplace** (opt-in) | Compute donation for deposits | < 0.1 Mbps | GPU donors / CPU-only users |
| **Federated** (advanced) | Gradient aggregation (FedAvg) | < 1 Mbps | Research collaborators |

### Weight Sharing Traffic (per hour)

| Scenario | Requests | Evolutions | Replications | Total |
|----------|----------|------------|--------------|-------|
| Light (100 nanos) | 15 MB/hr | 76 MB/hr | 38 MB/hr | 130 MB/hr |
| Medium (1K nanos) | 76 MB/hr | 381 MB/hr | 152 MB/hr | 616 MB/hr |
| Heavy (10K nanos) | 381 MB/hr | 1.5 GB/hr | 762 MB/hr | 2.7 GB/hr |

### Weight Transfer Times

| Nano Type | Size | @50 Mbps | @1 Gbps |
|-----------|------|----------|---------|
| FeatureNano | 72 KB | 11.8 ms | 0.6 ms |
| PatternNano | 33 KB | 5.4 ms | 0.3 ms |
| BigPattern | 3 MB | 508 ms | 25 ms |
| HugeAction | 50 MB | 8.4 s | 420 ms |

---

## Session 3 Patch — [DATE: 2025-07-XX]

### Experimental Findings: Mesh Security & Resilience (test_14, test_15)

**Source:** test_14 (mesh protocol validation), test_15 (S-03, S-04, S-07, S-10, M-03, M-05).

All findings below have been experimentally validated (8/8 protocol tests passed,
10/10 edge-case tests passed).

#### Wire Protocol v2 — Updated Header

**Source:** test_14.

The wire protocol header in §Wire Protocol above specified a 44-byte header.
Test_14 validated a **42-byte header** with HMAC-SHA256 authentication:

```
[magic: 2B][version: 1B][msg_type: 1B][payload_len: 4B][sender_id: 16B][hmac: 16B][nonce: 2B]
= 42 bytes + payload
```

| Field | Size | Description |
|-------|------|-------------|
| magic | 2B | `0x4E53` ("NS" = NanoSea) |
| version | 1B | `0x02` (v2) |
| msg_type | 1B | Message type code (same as table above) |
| payload_len | 4B | Big-endian u32 |
| sender_id | 16B | Truncated SHA256 of sender's public key |
| hmac | 16B | Truncated HMAC-SHA256 of payload |
| nonce | 2B | Replay prevention counter |

**Performance (test_14 localhost):**
- Handshake with proof-of-compute: 0.187s
- Weight migration (418 KB): 8.5ms round-trip
- Trust evolution: starts 0.5 → 0.55 after verified good behavior

#### M-05 FIX — Sybil Prevention via Proof-of-Compute

**Source:** ADVERSARIAL_AUDIT finding M-05, implemented in test_14.

**Problem:** Any node can announce itself as a mesh peer. Without identity
verification, an attacker can create thousands of fake peers (Sybil attack)
to flood the mesh with poisoned deposits.

**Fix — Proof-of-Compute Challenge:**

```python
import hashlib

class ProofOfCompute:
    """
    During handshake, the existing peer sends a challenge.
    The new peer must find a nonce such that:
        SHA256(challenge + nonce) starts with `difficulty` zero bits.
    
    At difficulty=16, this takes ~0.19s on a modern CPU —
    trivial for a real user, expensive for a bot army.
    """
    DIFFICULTY = 16  # bits of leading zeros required
    
    @staticmethod
    def create_challenge() -> bytes:
        import os
        return os.urandom(32)
    
    @staticmethod
    def solve(challenge: bytes) -> int:
        target = 2 ** (256 - ProofOfCompute.DIFFICULTY)
        nonce = 0
        while True:
            digest = hashlib.sha256(challenge + nonce.to_bytes(8, 'big')).digest()
            if int.from_bytes(digest, 'big') < target:
                return nonce
            nonce += 1
    
    @staticmethod
    def verify(challenge: bytes, nonce: int) -> bool:
        target = 2 ** (256 - ProofOfCompute.DIFFICULTY)
        digest = hashlib.sha256(challenge + nonce.to_bytes(8, 'big')).digest()
        return int.from_bytes(digest, 'big') < target
```

**Integration:** Add to handshake protocol:
```
Node A → B:  HELLO { ..., challenge: bytes }
Node B:      nonce = ProofOfCompute.solve(challenge)  # ~0.19s
Node B → A:  HELLO_ACK { ..., proof_nonce: int }
Node A:      ProofOfCompute.verify(challenge, proof_nonce)  # instant
             If fail → reject peer, trust = 0
```

#### S-03 FIX — SecureGossipMerge

**Source:** test_15 finding S-03.

**Problem:** The gossip protocol (§Gossip Protocol above) uses `max(local_deposit,
gossip_deposit)` for deposit merging. This is vulnerable to:
1. **Deposit inflation:** A malicious peer announces arbitrarily high deposits
2. **Outlier injection:** A single bad value skews the network's view
3. **Unbounded growth:** No cap on deposit increases per cycle

**Fix — SecureGossipMerge:**

```python
class SecureGossipMerge:
    """
    Trust-weighted gossip merge with outlier detection.
    Replaces naive max-merge in the gossip protocol.
    
    Rules:
    1. Incoming deposit weighted by sender's trust score
    2. Outlier detection: reject deposits > 3σ from local mean
    3. Bounded increase: max +5.0 deposit per gossip cycle
    4. Result = trust-weighted average, not max
    """
    MAX_DEPOSIT_INCREASE = 5.0  # per cycle
    OUTLIER_SIGMA = 3.0
    
    def merge(self, local_deposit: float, gossip_deposit: float,
             sender_trust: float, local_stats: dict) -> float:
        # Outlier check
        mean = local_stats.get('deposit_mean', local_deposit)
        std = local_stats.get('deposit_std', 1.0)
        if abs(gossip_deposit - mean) > self.OUTLIER_SIGMA * max(std, 0.1):
            return local_deposit  # Reject outlier
        
        # Trust-weighted merge
        weight = max(0.1, min(1.0, sender_trust))
        merged = (1 - weight * 0.3) * local_deposit + (weight * 0.3) * gossip_deposit
        
        # Bound the increase
        max_allowed = local_deposit + self.MAX_DEPOSIT_INCREASE
        return min(merged, max_allowed)
```

#### S-04 FIX — VRAMGuard

**Source:** test_15 finding S-04.

**Problem:** GPU population training (NanoPopulation) has no VRAM monitoring.
If populations grow too large, CUDA OOM crashes the entire process.

**Fix — VRAMGuard:**

```python
class VRAMGuard:
    """
    Monitors GPU VRAM and takes progressive action:
    - 85% VRAM: WARNING, reduce new population sizes
    - 95% VRAM: SPILL, move oldest populations to CPU
    - OOM caught: RECOVERY, clear cache and retry on CPU
    """
    WARN_THRESHOLD = 0.85
    SPILL_THRESHOLD = 0.95
    
    def get_vram_usage(self, device_idx: int = 0) -> float:
        if not torch.cuda.is_available():
            return 0.0
        allocated = torch.cuda.memory_allocated(device_idx)
        total = torch.cuda.get_device_properties(device_idx).total_mem
        return allocated / total
    
    def check_and_act(self, populations: list, device_idx: int = 0) -> str:
        usage = self.get_vram_usage(device_idx)
        if usage >= self.SPILL_THRESHOLD:
            # Move oldest population to CPU
            if populations:
                oldest = populations[0]
                for p in [oldest.W1, oldest.b1, oldest.W2, oldest.b2]:
                    p.data = p.data.cpu()
            return 'SPILL'
        elif usage >= self.WARN_THRESHOLD:
            return 'WARN'
        return 'OK'
    
    def handle_oom(self, func, *args, **kwargs):
        """Wrap a GPU operation with OOM recovery."""
        try:
            return func(*args, **kwargs)
        except torch.cuda.OutOfMemoryError:
            torch.cuda.empty_cache()
            # Retry on CPU
            return func(*args, device='cpu', **kwargs)
```

#### S-07 FIX — PartitionAwareMerge with Vector Clocks

**Source:** test_15 finding S-07.

**Problem:** When the mesh partitions (e.g., LAN segment goes down) and later
reconnects, conflicting deposit updates exist on both sides. The original
`max-merge` picks the higher value, which can discard valid information from
the lower-valued partition.

**Fix — PartitionAwareMerge:**

```python
class PartitionAwareMerge:
    """
    Uses vector clocks to detect concurrent (conflicting) updates.
    On conflict: weighted average instead of max.
    
    Vector clock: {node_id: logical_timestamp} per deposit.
    If neither clock dominates the other, updates are concurrent.
    """
    
    def __init__(self, node_id: str):
        self.node_id = node_id
    
    def is_concurrent(self, clock_a: dict, clock_b: dict) -> bool:
        """True if neither clock dominates (happened-before) the other."""
        a_leq_b = all(clock_a.get(k, 0) <= clock_b.get(k, 0)
                       for k in set(clock_a) | set(clock_b))
        b_leq_a = all(clock_b.get(k, 0) <= clock_a.get(k, 0)
                       for k in set(clock_a) | set(clock_b))
        return not a_leq_b and not b_leq_a
    
    def merge_deposits(self, local: dict, remote: dict) -> dict:
        """
        Merge two deposit records with vector-clock conflict resolution.
        
        - If one dominates: take the dominator (causal ordering)
        - If concurrent: weighted average of deposit values,
          union of vector clocks with max per entry
        """
        local_clock = local.get('vclock', {self.node_id: 0})
        remote_clock = remote.get('vclock', {})
        
        if self.is_concurrent(local_clock, remote_clock):
            # Conflict: weighted average
            merged_deposit = 0.5 * local['deposit'] + 0.5 * remote['deposit']
        else:
            # Causal: take the one with higher vector clock
            if all(local_clock.get(k, 0) >= remote_clock.get(k, 0)
                   for k in set(local_clock) | set(remote_clock)):
                return local
            else:
                return remote
        
        # Merge vector clocks: max per entry
        merged_clock = {}
        for k in set(local_clock) | set(remote_clock):
            merged_clock[k] = max(local_clock.get(k, 0), remote_clock.get(k, 0))
        merged_clock[self.node_id] = merged_clock.get(self.node_id, 0) + 1
        
        result = {**local, 'deposit': merged_deposit, 'vclock': merged_clock}
        return result
```

#### M-03 FIX — NanoBackupManager

**Source:** ADVERSARIAL_AUDIT finding M-03.

**Problem:** If a nano is killed (node crash, compression error, disk failure),
its weights are permanently lost. There is no replication.

**Fix — NanoBackupManager:**

```python
class NanoBackupManager:
    """
    Replicates critical nano weights to peer nodes.
    Replication factor: 2 (each critical nano exists on 2+ nodes).
    
    'Critical' = fitness > 0.7 OR is_bridge with bridged cluster count > 1.
    """
    REPLICATION_FACTOR = 2
    FITNESS_THRESHOLD = 0.7
    
    def __init__(self, mesh_registry, migration_handler):
        self.mesh = mesh_registry
        self.migration = migration_handler
        self.backup_map = {}  # gid → [peer_node_ids]
    
    def identify_critical(self, nanos: dict) -> list:
        """Find nanos that need backup."""
        critical = []
        for gid, (model, card) in nanos.items():
            if card.fitness >= self.FITNESS_THRESHOLD:
                critical.append(gid)
            elif card.nano_type == 'bridge':
                critical.append(gid)
        return critical
    
    async def ensure_backups(self, nanos: dict):
        """Replicate critical nanos to trusted peers."""
        critical = self.identify_critical(nanos)
        peers = self.mesh.get_trusted_peers(min_trust=0.5)
        
        for gid in critical:
            current_backups = self.backup_map.get(gid, [])
            needed = self.REPLICATION_FACTOR - len(current_backups)
            
            if needed > 0:
                for peer in peers[:needed]:
                    data = await self.migration.export_nano(gid, nanos)
                    await peer.send('NANO_BACKUP', data)
                    current_backups.append(peer.node_id)
                
                self.backup_map[gid] = current_backups
    
    async def recover_nano(self, gid: str) -> bytes | None:
        """Attempt to recover a lost nano from peer backups."""
        backup_peers = self.backup_map.get(gid, [])
        for node_id in backup_peers:
            peer = self.mesh.peers.get(node_id)
            if peer and peer.trust_score > 0.3:
                try:
                    data = await peer.request('NANO_RECOVER', {'gid': gid})
                    return data
                except Exception:
                    continue
        return None
```

#### Summary of Mesh Protocol Test Results (test_14)

| Test | Result | Details |
|------|--------|---------|
| Wire format encode/decode | PASS | 42-byte header, all types |
| Handshake + proof-of-compute | PASS | Challenge solved in 0.187s |
| Heartbeat exchange | PASS | Bidirectional, 5-second interval |
| Deposit gossip round | PASS | Top-100 deposits propagated |
| Weight migration | PASS | 418 KB transferred in 8.5ms |
| Trust score evolution | PASS | 0.50 → 0.55 after good behavior |
| Reconnection after disconnect | PASS | State resynchronized |
| Full protocol sequence | PASS | All message types in sequence |

---

## SESSION 4 ARCHITECTURAL PIVOT (test_16 + test_17)

> **The mesh model above is partially SUPERSEDED.** The old mesh assumed independent
> nanos that can be freely shipped between nodes. In NanoMoE, nanos are expert FFN
> blocks that require shared attention infrastructure. This changes what the mesh does.

### New Mesh Distribution Model

#### What Stays the Same

- **Deposit gossip** — still works. Expert fitness scores propagate the same way.
- **Trust scoring** — still works. Node reputation is architecture-agnostic.
- **Heartbeat / discovery** — still works. Protocol layer unchanged.
- **Wire format** — still works. 42-byte header, all message types.

#### What Changes

**1. Attention is LOCAL to each node.**

The shared multi-head attention layer runs entirely on the local machine. It is
not distributed. This is the infrastructure backbone — it must be fast and cannot
tolerate network latency.

```
Node A:  [Embedding] → [Local Attention] → [Router] → [Expert Pool A + Remote Experts]
Node B:  [Embedding] → [Local Attention] → [Router] → [Expert Pool B + Remote Experts]
```

**2. Experts (nanos) are distributed across nodes.**

Each node hosts a subset of the total expert pool. The router can route tokens
to remote experts on other nodes, but with a latency penalty:

| Routing Target | Latency | When to Use |
|----------------|---------|-------------|
| Local expert | < 1 ms | Default — always preferred |
| Remote expert (LAN) | 5–50 ms | When local experts lack specialization |
| Remote expert (WAN) | 50–500 ms | Rare — only for unique expertise |

The router learns to prefer local experts via a **locality bias** added to gating
scores, penalizing remote routing proportional to expected latency.

**3. Expert migration replaces nano shipping.**

Instead of copying full nano models arbitrarily, the mesh now supports **expert
migration**: moving expert FFN weights to nodes where they are frequently requested.

```
Migration trigger: remote_request_count(expert_i, node_j) > threshold
Action:           Copy expert_i weights to node_j's local expert pool
Result:           Future requests route locally instead of remotely
```

This is a form of **load-aware caching** — popular experts replicate to where
demand is highest.

**4. Router synchronization across nodes.**

Each node maintains its own router, but routers periodically share their gating
statistics so that:
- Nodes learn which remote experts exist and what they specialize in
- Router scores for remote experts are initialized from the source node's statistics
- Expert discovery is automatic — no manual configuration

### Revised Mesh Architecture

```
┌──────────────────────────────┐         ┌──────────────────────────────┐
│  Node A                      │◄───────►│  Node B                      │
│                              │  Mesh   │                              │
│  ┌────────────────────────┐  │  Proto  │  ┌────────────────────────┐  │
│  │  Local Attention       │  │         │  │  Local Attention       │  │
│  │  (not distributed)     │  │         │  │  (not distributed)     │  │
│  └──────────┬─────────────┘  │         │  └──────────┬─────────────┘  │
│             ▼                │         │             ▼                │
│  ┌────────────────────────┐  │         │  ┌────────────────────────┐  │
│  │  Router A              │  │         │  │  Router B              │  │
│  │  (prefers local)       │  │         │  │  (prefers local)       │  │
│  └──┬─────────────┬───────┘  │         │  └──┬─────────────┬───────┘  │
│     ▼             ▼          │         │     ▼             ▼          │
│  [Expert 1]   [Expert 2]    │         │  [Expert 3]   [Expert 4]    │
│  [Expert 5]   (local pool)  │◄───────►│  [Expert 6]   (local pool)  │
│                              │ Expert  │                              │
│                              │ Migrate │                              │
└──────────────────────────────┘         └──────────────────────────────┘
```

### Bandwidth Implications

The mesh bandwidth profile changes slightly:

| Traffic Type | Old Model | New Model | Notes |
|-------------|-----------|-----------|-------|
| Deposit gossip | 64 B/nano | 64 B/expert | Unchanged |
| Weight sharing | 72 KB–50 MB | 33 KB–2 MB per expert | Experts are smaller than full nanos |
| Router stats | N/A | ~1 KB per sync | New: periodic router score exchange |
| Remote expert calls | N/A | ~256 B + d_model floats | New: token routing across network |
| Total per node | < 1 Mbps | < 2 Mbps | Still runs on home internet |
