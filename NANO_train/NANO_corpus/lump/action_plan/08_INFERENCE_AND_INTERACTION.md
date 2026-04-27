# 08 — Inference and Interaction

## How User Queries Activate the Nano Sea

This is the "throwing the stone into the pond" — how a user prompt shatters 
into the nano sea and produces a coherent response.

---

## The Inference Pipeline

```
USER QUERY
    │
    ▼
┌─────────────────────────────────────┐
│  STAGE 1: SHATTER                   │
│  Query → tokens → PTAIE → RBY      │
│  Intent classification              │
│  Compute budget allocation          │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  STAGE 2: RIPPLE                    │
│  Router Nano → activation list      │
│  Deposit search → bias vectors      │
│  Nano loading into memory           │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  STAGE 3: ACTIVATE                  │
│  Parallel nano inference            │
│  Feature → Pattern → Bridge → Action│
│  Each nano produces partial output  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  STAGE 4: ORCHESTRATE               │
│  Orchestrator combines outputs      │
│  Deposit bias applied (coherence)   │
│  Conflict resolution                │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  STAGE 5: EXCRETE                   │
│  Response formatted and delivered   │
│  Interaction logged as training data│
│  Micro-absoleices recorded          │
│  New nanos may spawn from exchange  │
└─────────────────────────────────────┘
```

---

## Stage 1: Shatter

The query is decomposed into its RBY components:

```python
class QueryShatterer:
    """Decompose a user query into activatable fragments."""
    
    def __init__(self, ptaie: PTAIE):
        self.ptaie = ptaie
    
    def shatter(self, query: str, compute_budget: float = 1.0) -> ShatteredQuery:
        """
        Break a query into fragments that target different parts of the nano sea.
        
        compute_budget: 0.1 (light throw) to 10.0 (maximum throw)
        Higher budget = larger ripple = more nanos activated
        """
        result = ShatteredQuery()
        
        # 1. Overall RBY coordinate
        result.rby = self.ptaie.encode_sequence(query)
        
        # 2. Token-level breakdown
        tokens = self._tokenize(query)
        result.token_rbys = [self.ptaie.encode_sequence(t) for t in tokens]
        
        # 3. Intent classification (simple heuristic, replaced by trained nano later)
        result.intent = self._classify_intent(query)
        
        # 4. Compute allocation
        result.max_nanos = int(20 * compute_budget)      # Base: 20 nanos
        result.max_depth = int(3 * compute_budget)        # IC-AE activation depth
        result.timeout_ms = int(5000 * compute_budget)    # Response time budget
        
        # 5. Domain hints
        result.domain_hints = self._extract_domains(tokens)
        
        return result
    
    def _tokenize(self, query: str) -> List[str]:
        """Simple whitespace + punctuation tokenizer."""
        import re
        return re.findall(r'\b\w+\b|[^\w\s]', query.lower())
    
    def _classify_intent(self, query: str) -> str:
        """Basic intent classification."""
        q = query.lower()
        if any(w in q for w in ['write', 'create', 'generate', 'make', 'build']):
            return 'generation'
        elif any(w in q for w in ['what', 'why', 'how', 'explain', 'describe']):
            return 'explanation'
        elif any(w in q for w in ['fix', 'debug', 'error', 'wrong', 'broken']):
            return 'debugging'
        elif any(w in q for w in ['find', 'search', 'where', 'locate']):
            return 'search'
        else:
            return 'general'
    
    def _extract_domains(self, tokens: List[str]) -> List[str]:
        """Extract domain hints from query tokens."""
        code_words = {'python', 'javascript', 'code', 'function', 'class', 'variable', 
                      'loop', 'array', 'list', 'dict', 'api', 'server', 'database'}
        science_words = {'physics', 'chemistry', 'biology', 'math', 'equation', 'formula'}
        
        domains = []
        token_set = set(tokens)
        if token_set & code_words:
            domains.append('code')
        if token_set & science_words:
            domains.append('science')
        if not domains:
            domains.append('general')
        
        return domains
```

---

## Stage 2: Ripple

The Router Nano + vector search finds which nanos to activate:

```python
class Ripple:
    """Find and load the nanos that should respond to this query."""
    
    def __init__(self, registry: NanoRegistry, deposit_store: DepositManager):
        self.registry = registry
        self.deposit_store = deposit_store
    
    def find_activation_set(self, shattered: ShatteredQuery) -> ActivationSet:
        """
        Determine which nanos should activate for this query.
        
        The "ripple" spreads from the query's RBY coordinate outward,
        activating nanos within the ripple radius (controlled by compute budget).
        """
        activation = ActivationSet()
        
        # 1. Query the vector index for nearest nanos by RBY similarity
        query_embedding = self._rby_to_embedding(shattered.rby)
        candidates = self.registry.query(query_embedding, k=shattered.max_nanos * 3)
        
        # 2. Filter by type — ensure we have the full pipeline
        type_buckets = defaultdict(list)
        for card, similarity in candidates:
            type_buckets[card.nano_type].append((card, similarity))
        
        # Ensure minimum representation of each type
        MIN_PER_TYPE = {'feature': 2, 'pattern': 2, 'action': 2, 
                        'bridge': 1, 'router': 0, 'orchestrator': 1}
        
        selected = []
        for nano_type, minimum in MIN_PER_TYPE.items():
            bucket = type_buckets.get(nano_type, [])
            selected.extend(bucket[:max(minimum, 1)])
        
        # Fill remaining slots with best overall candidates
        remaining_budget = shattered.max_nanos - len(selected)
        all_remaining = [(c, s) for c, s in candidates 
                        if c.gid not in {s_c.gid for s_c, _ in selected}]
        all_remaining.sort(key=lambda x: x[1], reverse=True)
        selected.extend(all_remaining[:remaining_budget])
        
        activation.nanos = selected
        
        # 3. Find relevant deposits for coherence bias
        activation.deposits = self.deposit_store.find_relevant(
            shattered.rby, k=3
        )
        
        return activation
    
    def _rby_to_embedding(self, rby: Tuple[float, float, float]) -> np.ndarray:
        """
        Convert RBY coordinate to a full embedding vector for index search.
        RBY is expanded to match the embedding dimension of the index.
        """
        r, b, y = rby
        # Create a feature vector from RBY using harmonic expansion
        components = [r, b, y, r*b, b*y, r*y, r*r, b*b, y*y,
                     math.sin(r * math.pi), math.sin(b * math.pi), math.sin(y * math.pi)]
        
        # Pad or project to match index dimension
        embed = np.array(components, dtype=np.float32)
        # If needed, pass through a learned projection
        return embed
```

---

## Stage 3: Activate

All selected nanos run in parallel:

```python
class NanoActivator:
    """Run selected nanos in parallel and collect their outputs."""
    
    def __init__(self, nano_loader: Callable, max_workers: int = 8):
        self.loader = nano_loader
        self.max_workers = max_workers
    
    def activate_all(self, activation: ActivationSet, 
                     shattered: ShatteredQuery) -> List[NanoOutput]:
        """Run all selected nanos and collect outputs."""
        
        # Prepare input tensor from query
        input_tensor = self._prepare_input(shattered)
        
        outputs = []
        with ThreadPoolExecutor(max_workers=self.max_workers) as pool:
            futures = {}
            for card, similarity in activation.nanos:
                future = pool.submit(self._run_one, card, input_tensor, similarity)
                futures[future] = card
            
            for future in as_completed(futures, timeout=shattered.timeout_ms / 1000):
                try:
                    output = future.result()
                    if output is not None:
                        outputs.append(output)
                except Exception as e:
                    card = futures[future]
                    # Log failure — this becomes training data
                    outputs.append(NanoOutput(
                        nano_gid=card.gid,
                        nano_type=card.nano_type,
                        output=None,
                        confidence=0.0,
                        error=str(e),
                        latency_ms=0
                    ))
        
        return outputs
    
    def _run_one(self, card: NanoCard, input_tensor: torch.Tensor,
                 similarity: float) -> NanoOutput:
        """Run a single nano and wrap the result."""
        start = time.perf_counter()
        
        nano = self.loader(card.gid)
        with torch.no_grad():
            raw_output = nano.forward(input_tensor)
        
        latency = (time.perf_counter() - start) * 1000
        
        return NanoOutput(
            nano_gid=card.gid,
            nano_type=card.nano_type,
            output=raw_output,
            confidence=similarity * card.success_rate,
            error=None,
            latency_ms=latency
        )
```

---

## Stage 4: Orchestrate

The Orchestrator Nano combines partial outputs into a coherent response:

```python
class ResponseOrchestrator:
    """Combine nano outputs into a coherent response."""
    
    def __init__(self, orchestrator_nano: OrchestratorNano, 
                 deposits: List[MacroAbsoleice]):
        self.orchestrator = orchestrator_nano
        self.deposits = deposits
    
    def orchestrate(self, nano_outputs: List[NanoOutput],
                    shattered: ShatteredQuery) -> str:
        """
        Combine outputs using the orchestrator nano + deposit coherence.
        
        The orchestrator acts like a conductor:
        - Feature outputs → what was perceived
        - Pattern outputs → what patterns were found
        - Bridge outputs → how domains connect
        - Action outputs → what should be generated
        """
        # Sort outputs by pipeline stage
        perception = [o for o in nano_outputs if o.nano_type == 'feature' and o.output is not None]
        cognition = [o for o in nano_outputs if o.nano_type == 'pattern' and o.output is not None]
        bridges = [o for o in nano_outputs if o.nano_type == 'bridge' and o.output is not None]
        actions = [o for o in nano_outputs if o.nano_type == 'action' and o.output is not None]
        
        # Stack valid outputs for the orchestrator
        all_valid = [o for o in nano_outputs if o.output is not None]
        if not all_valid:
            return self._fallback_response(shattered)
        
        # Prepare orchestrator input
        output_stack = torch.stack([o.output.flatten()[:128] for o in all_valid])  # [N, 128]
        confidence_weights = torch.tensor([o.confidence for o in all_valid])
        
        # Apply deposit coherence bias
        if self.deposits:
            bias = self._compute_deposit_bias(shattered.rby)
            output_stack = output_stack + bias * CONSCIOUSNESS_COUPLING * 1e6
        
        # Run orchestrator
        query_embed = self._embed_query(shattered)
        combined = self.orchestrator.forward(
            output_stack.unsqueeze(0),  # [1, N, 128]
            query_embed.unsqueeze(0)    # [1, 1, 128]
        )
        
        # Decode to text
        response = self._decode(combined, shattered.intent)
        return response
    
    def _fallback_response(self, shattered: ShatteredQuery) -> str:
        """When no nanos produced valid output, use deposits directly."""
        return "[Nano sea is too sparse for this query. Expansion needed in this region.]"
    
    def _compute_deposit_bias(self, query_rby: Tuple[float, float, float]) -> torch.Tensor:
        """
        Extract coherence bias from deposits.
        This is the "light leaking in" during inference.
        """
        bias = torch.zeros(128)
        for deposit in self.deposits:
            if deposit.centroid_embedding is not None:
                weight = 1.0 / (1 + np.linalg.norm(
                    np.array(query_rby) - np.array(deposit.seed_end)
                ))
                bias += torch.tensor(deposit.centroid_embedding[:128]) * weight
        return bias
```

---

## Stage 5: Excrete (Log and Learn)

Every interaction generates training data for future nanos:

```python
class InteractionLogger:
    """Log every interaction as training data for the continuous trainer."""
    
    def __init__(self, data_buffer: Queue, registry: NanoRegistry):
        self.buffer = data_buffer
        self.registry = registry
    
    def log_interaction(self, shattered: ShatteredQuery, 
                        activation: ActivationSet,
                        outputs: List[NanoOutput],
                        final_response: str,
                        user_feedback: Optional[float] = None):
        """
        Record this interaction as:
        1. Micro-absoleices for each nano that activated
        2. Training data for future nanos
        3. Feedback signal for nano fitness updates
        """
        
        # 1. Record micro-absoleices
        for output in outputs:
            micro = MicroAbsoleice(
                action="infer",
                nano_gid=output.nano_gid,
                metrics={
                    'confidence': output.confidence,
                    'latency_ms': output.latency_ms,
                    'had_error': output.error is not None,
                },
                success=output.error is None and output.confidence > 0.3,
                benign=output.confidence <= 0.3 and output.error is None,
                rby=shattered.rby,
                timestamp=time.time()
            )
            self.buffer.put(('micro_absoleice', micro))
        
        # 2. Create training example
        example = {
            'query': shattered.original_text,
            'query_rby': shattered.rby,
            'intent': shattered.intent,
            'response': final_response,
            'activated_nanos': [o.nano_gid for o in outputs],
            'confidences': [o.confidence for o in outputs],
            'user_feedback': user_feedback,
            'timestamp': time.time()
        }
        self.buffer.put(('training_example', example))
        
        # 3. Update nano fitness
        for output in outputs:
            card = self.registry.cards.get(output.nano_gid)
            if card:
                card.usage_count += 1
                card.last_used = time.time()
                if output.error is None:
                    if user_feedback is not None and user_feedback > 0.5:
                        card.success_count += 1
                    elif output.confidence > 0.5:
                        card.success_count += 1
                else:
                    card.failure_count += 1
        
        # 4. Spawn signal: if many nanos had low confidence, this region needs more nanos
        avg_confidence = np.mean([o.confidence for o in outputs])
        if avg_confidence < 0.3:
            self.buffer.put(('spawn_signal', {
                'rby': shattered.rby,
                'intent': shattered.intent,
                'reason': f"Low confidence ({avg_confidence:.2f}) in region"
            }))
```

---

## Compute Budget (Throwing Harder)

The user controls how many nanos activate via compute budget:

| Budget | Nanos Activated | Latency  | Quality  | Use Case             |
|--------|-----------------|----------|----------|----------------------|
| 0.1    | ~2              | ~10ms    | Basic    | Quick lookup         |
| 0.5    | ~10             | ~50ms    | Good     | Simple questions     |
| 1.0    | ~20             | ~100ms   | Standard | General use (default)|
| 3.0    | ~60             | ~300ms   | High     | Complex tasks        |
| 10.0   | ~200            | ~1000ms  | Maximum  | Critical/creative    |

Higher budget = bigger ripple = more nanos = slower but better.

---

## External LLM as Consultant (Not Brain)

The framework explicitly positions external LLMs (Ollama, etc.) as consultants:

```python
class LLMConsultant:
    """
    External LLM used ONLY when the nano sea cannot handle a query.
    The organism decides WHEN and WHAT to ask.
    """
    
    def __init__(self, endpoint: str = "http://localhost:11434"):
        self.endpoint = endpoint
        self.call_count = 0
    
    def should_consult(self, avg_confidence: float, intent: str) -> bool:
        """The organism decides whether to ask the LLM."""
        if avg_confidence > 0.6:
            return False  # Sea can handle it
        if intent == 'generation' and avg_confidence > 0.3:
            return False  # Generation is ok with lower confidence
        return True  # Need help
    
    def consult(self, query: str, context: str) -> str:
        """Ask the LLM and use its response as training data."""
        response = requests.post(f"{self.endpoint}/api/generate", json={
            "model": "llama3",
            "prompt": f"Context: {context}\n\nQuestion: {query}\n\nAnswer:",
            "stream": False
        }).json()
        
        self.call_count += 1
        
        # The LLM response becomes TRAINING DATA for new nanos
        # It does NOT go directly to the user
        return response.get("response", "")
```

The key insight: the LLM's response is used to train new nanos, not to respond 
directly. Over time, the nano sea grows dense enough that the LLM is never needed.

---

## SESSION 4 ARCHITECTURAL PIVOT (test_16 + test_17)

> **The entire inference pipeline above is SUPERSEDED.** The old Shatter→Ripple→
> Activate→Orchestrate→Excrete pipeline assumed independent nanos producing partial
> outputs that get combined. This was proven broken (22.7% accuracy ceiling).

### New Inference Pipeline: NanoMoE

```
USER QUERY
    │
    ▼
┌─────────────────────────────────────┐
│  STAGE 1: EMBED                     │
│  Tokens → Learned Embedding         │
│  Positional encoding added          │
│  Shape: (batch, seq_len, d_model)   │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  STAGE 2: ATTEND                    │
│  Shared Multi-Head Self-Attention   │
│  Cross-position communication       │
│  All tokens see all other tokens    │
│  This is the INFRASTRUCTURE layer   │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  STAGE 3: ROUTE                     │
│  Router scores each token vs each   │
│  expert. Top-K experts selected     │
│  per token. Gating weights computed │
│  via softmax over top-k scores.     │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  STAGE 4: EXPERT PROCESS            │
│  Each selected nano expert applies  │
│  its FFN: d_model → ff_dim → d_model│
│  Outputs weighted by gating scores  │
│  and summed per token.              │
│  Batched via torch.bmm for speed.   │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  STAGE 5: PREDICT                   │
│  Output head: d_model → vocab_size  │
│  ALL positions produce predictions  │
│  (not just last token)              │
│  Loss = cross-entropy over all pos  │
└─────────────────────────────────────┘
```

### Key Differences From Old Pipeline

| Aspect | Old Pipeline | New Pipeline |
|--------|-------------|-------------|
| Token interaction | None (nanos independent) | Shared attention (all tokens see all) |
| Expert selection | Static router nano + deposit bias | Learned gating function (differentiable) |
| Output combination | Orchestrator heuristic | Weighted sum by router scores |
| Prediction scope | Last token only (via pooling) | All positions simultaneously |
| Gradient flow | None across nanos | End-to-end through entire stack |
| Fallback to LLM | Required for coherence | Not needed — attention provides coherence |

### Why This Works

1. **Shared attention solves the cross-position problem**: Tokens communicate through
   attention heads before reaching experts. No nano needs to "know" about other positions.
2. **Router replaces manual activation**: Instead of a hand-coded router nano with
   deposit biases, the router is a learned linear layer trained end-to-end.
3. **All-position prediction**: The old pipeline could only predict the next token
   (via pooling). The new pipeline predicts at every position, providing N× more
   training signal per example.
4. **Gradient flow enables real learning**: Experts improve via backprop through the
   full stack, not via evolutionary fitness over isolated forward passes.
