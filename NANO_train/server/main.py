"""
FastAPI Server — OpenAI-compatible API + Mesh endpoints + Dashboard.

Endpoints:
  /v1/chat/completions   — OpenAI-compatible chat (stream + non-stream)
  /v1/models             — List available models/nano-sea versions
  /v1/mesh/info          — This node's info
  /v1/mesh/peers         — Connected peers
  /v1/mesh/stats         — System statistics
  /v1/mesh/help          — Help request management
  /v1/training/status    — Training pipeline status
  /v1/health             — Health check
"""
from __future__ import annotations
import asyncio, json, time, uuid, logging, math
from typing import Optional, Dict, Any, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════
# Pydantic Models (OpenAI-compatible)
# ═══════════════════════════════════════════════════════════════

class ChatMessage(BaseModel):
    role: str = "user"
    content: str = ""

class ChatCompletionRequest(BaseModel):
    model: str = "nano-sea"
    messages: List[ChatMessage]
    temperature: float = 0.7
    max_tokens: int = 2048
    stream: bool = False
    top_p: float = 1.0
    frequency_penalty: float = 0.0
    presence_penalty: float = 0.0

class ChatChoice(BaseModel):
    index: int = 0
    message: ChatMessage
    finish_reason: str = "stop"

class Usage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0

class ChatCompletionResponse(BaseModel):
    id: str = Field(default_factory=lambda: f"chatcmpl-{uuid.uuid4().hex[:12]}")
    object: str = "chat.completion"
    created: int = Field(default_factory=lambda: int(time.time()))
    model: str = "nano-sea"
    choices: List[ChatChoice]
    usage: Usage = Field(default_factory=Usage)

class ModelInfo(BaseModel):
    id: str
    object: str = "model"
    created: int = Field(default_factory=lambda: int(time.time()))
    owned_by: str = "nano-sea"
    description: str = ""
    context_window: int = 32768
    max_output_tokens: int = 4096


# ═══════════════════════════════════════════════════════════════
# Server Factory
# ═══════════════════════════════════════════════════════════════

class NanoServer:
    """Wraps FastAPI with nano-sea integration."""

    def __init__(self):
        self.app = FastAPI(title="Nano Sea API", version="1.0.0")
        self._sea = None
        self._mesh_node = None
        self._pipeline_executor = None
        self._respect_system = None
        self._help_system = None
        self._scheduler = None
        self._global_pool = None
        self._peer_discovery = None
        self._trainer = None
        self._start_time = time.time()

        # CORS
        self.app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_methods=["*"],
            allow_headers=["*"],
        )

        self._register_routes()

    def set_systems(self, sea=None, mesh_node=None, pipeline=None,
                    respect=None, help_sys=None, scheduler=None,
                    global_pool=None, peer_discovery=None,
                    trainer=None) -> None:
        self._sea = sea
        self._mesh_node = mesh_node
        self._pipeline_executor = pipeline
        self._respect_system = respect
        self._help_system = help_sys
        self._scheduler = scheduler
        self._global_pool = global_pool
        self._peer_discovery = peer_discovery
        self._trainer = trainer

    def _register_routes(self) -> None:
        app = self.app

        # ── Health ─────────────────────────────────────────────
        @app.get("/v1/health")
        async def health():
            return {
                "status": "ok",
                "uptime_s": round(time.time() - self._start_time, 1),
                "nano_count": len(self._sea) if self._sea else 0,
            }

        # ── Models ─────────────────────────────────────────────
        @app.get("/v1/models")
        async def list_models():
            nano_count = len(self._sea) if self._sea else 0
            models = [
                ModelInfo(
                    id="nano-sea",
                    description=f"Full Sea of Nanos — {nano_count} micro-neural-networks learning from your codebase",
                    context_window=32768,
                    max_output_tokens=4096,
                ),
                ModelInfo(
                    id="nano-sea-fast",
                    description=f"Fast subset — priority nanos only for low-latency inference",
                    context_window=8192,
                    max_output_tokens=2048,
                ),
            ]
            return {"object": "list", "data": [m.model_dump() for m in models]}

        # ── Chat Completions ───────────────────────────────────
        @app.post("/v1/chat/completions")
        async def chat_completions(request: ChatCompletionRequest):
            if request.stream:
                return StreamingResponse(
                    self._stream_response(request),
                    media_type="text/event-stream",
                )
            return await self._complete_response(request)

        # ── Mesh Info ──────────────────────────────────────────
        @app.get("/v1/mesh/info")
        async def mesh_info():
            if self._mesh_node:
                return self._mesh_node.info.to_dict()
            return {"error": "Mesh not initialized"}

        @app.get("/v1/mesh/peers")
        async def mesh_peers():
            if self._mesh_node:
                return {
                    "peers": [p.to_dict() for p in self._mesh_node.peers.values()]
                }
            return {"peers": []}

        @app.get("/v1/mesh/stats")
        async def mesh_stats():
            stats = {"uptime_s": round(time.time() - self._start_time, 1)}
            if self._mesh_node:
                stats["node"] = self._mesh_node.stats
            if self._scheduler:
                stats["scheduler"] = self._scheduler.stats
            if self._respect_system:
                stats["respect"] = self._respect_system.stats
            if self._help_system:
                stats["help"] = self._help_system.stats
            if self._pipeline_executor:
                stats["pipeline"] = self._pipeline_executor.stats
            return stats

        # ── Help Requests ──────────────────────────────────────
        @app.post("/v1/mesh/help/request")
        async def request_help(request: Request):
            body = await request.json()
            if self._help_system:
                req = await self._help_system.request_help(
                    description=body.get("description", ""),
                    nano_types=body.get("nano_types"),
                    require_gpu=body.get("require_gpu", False),
                )
                if req:
                    return {"request_id": req.request_id, "state": req.state.value}
            raise HTTPException(503, "Help system not available")

        @app.post("/v1/mesh/help/accept/{request_id}")
        async def accept_help(request_id: str):
            if self._help_system:
                ok = await self._help_system.accept_request(request_id)
                return {"accepted": ok}
            raise HTTPException(503, "Help system not available")

        @app.get("/v1/mesh/help/toggle")
        async def toggle_auto_accept():
            if self._help_system:
                self._help_system.auto_accept = not self._help_system.auto_accept
                return {"auto_accept": self._help_system.auto_accept}
            raise HTTPException(503, "Help system not available")

        # ── Training Status ────────────────────────────────────
        @app.get("/v1/training/status")
        async def training_status():
            if self._trainer:
                status = self._trainer.status if hasattr(self._trainer, "status") else {
                    "running": False,
                    "status": "unknown",
                }
                status["nano_count"] = len(self._sea) if self._sea else 0
                return status
            return {
                "running": False,
                "status": "no_trainer",
                "total_steps": 0,
                "nano_count": len(self._sea) if self._sea else 0,
            }

        @app.post("/v1/training/observe")
        async def training_observe(request: Request):
            """Feed an observation (query/response pair) to the trainer."""
            body = await request.json()
            if self._trainer:
                if hasattr(self._trainer, "add_observation"):
                    self._trainer.add_observation(
                        query=body.get("query", ""),
                        response=body.get("response", ""),
                        source=body.get("source", "api"),
                        quality=body.get("quality", 0.8),
                    )
                    status = self._trainer.status if hasattr(self._trainer, "status") else {}
                    return {
                        "success": True,
                        "buffer_size": status.get("buffer_size", 0),
                    }
                return {"success": False, "error": "Trainer does not support observation"}
            return {"success": False, "error": "Trainer not initialized"}

        @app.get("/v1/training/checkpoints")
        async def training_checkpoints():
            """Get info about all saved model checkpoints."""
            if self._trainer:
                if hasattr(self._trainer, "get_checkpoint_info"):
                    return self._trainer.get_checkpoint_info()
                return {"checkpoint_dir": "", "nanos": {}, "total_checkpoints": 0}
            return {"checkpoint_dir": "", "nanos": {}, "total_checkpoints": 0}

        # ── Global Pool endpoints ──────────────────────────────
        @app.get("/v1/pool/stats")
        async def pool_stats():
            if self._global_pool:
                return self._global_pool.stats
            return {"error": "Global pool not initialized"}

        @app.put("/v1/pool/donation")
        async def set_donation(request: Request):
            body = await request.json()
            pct = body.get("percent", 25)
            if self._global_pool and self._mesh_node:
                self._global_pool.set_donation_percent(
                    self._mesh_node.node_id, int(pct))
                return {"success": True, "donation_percent": pct}
            return {"error": "Pool not initialized"}

        @app.put("/v1/pool/idle-training")
        async def toggle_idle_training(request: Request):
            body = await request.json()
            if self._global_pool:
                self._global_pool._idle_training_enabled = body.get("enabled", True)
                return {"success": True, "idle_training": self._global_pool._idle_training_enabled}
            return {"error": "Pool not initialized"}

        @app.post("/v1/pool/permanent-node")
        async def toggle_permanent_node(request: Request):
            body = await request.json()
            if self._global_pool and self._mesh_node:
                if body.get("enabled", False):
                    self._global_pool.add_permanent_node(self._mesh_node.node_id)
                else:
                    self._global_pool.remove_member(self._mesh_node.node_id)
                return {"success": True}
            return {"error": "Pool not initialized"}

        # ── Peer Discovery endpoints ───────────────────────────
        @app.get("/v1/discovery/status")
        async def discovery_status():
            if self._peer_discovery:
                return self._peer_discovery.status
            return {"error": "Peer discovery not initialized"}

        @app.get("/v1/discovery/peers")
        async def discovery_peers():
            if self._peer_discovery:
                return {
                    "peers": [p.to_dict() for p in self._peer_discovery.get_all_peers()]
                }
            return {"peers": []}

        @app.post("/v1/discovery/opt-in")
        async def discovery_opt_in(request: Request):
            body = await request.json()
            if self._peer_discovery:
                from mesh.peer_discovery import SharingLevel
                level = SharingLevel(body.get("sharing_level", "metadata"))
                self._peer_discovery.set_opt_in(body.get("enabled", True), level)
                return {"success": True}
            return {"error": "Discovery not initialized"}

        @app.post("/v1/discovery/connect")
        async def discovery_connect(request: Request):
            body = await request.json()
            node_id = body.get("node_id", "")
            if self._peer_discovery and node_id:
                ok = await self._peer_discovery.send_connection_request(node_id)
                return {"success": ok}
            return {"error": "Invalid request"}

        @app.post("/v1/discovery/disconnect")
        async def discovery_disconnect(request: Request):
            body = await request.json()
            node_id = body.get("node_id", "")
            if self._peer_discovery and node_id:
                self._peer_discovery.disconnect_peer(node_id)
                return {"success": True}
            return {"error": "Invalid request"}

        @app.post("/v1/discovery/accept")
        async def discovery_accept(request: Request):
            body = await request.json()
            node_id = body.get("node_id", "")
            if self._peer_discovery and node_id:
                ok = self._peer_discovery.accept_connection(node_id)
                return {"success": ok}
            return {"error": "Invalid request"}

        @app.post("/v1/discovery/block")
        async def discovery_block(request: Request):
            body = await request.json()
            node_id = body.get("node_id", "")
            if self._peer_discovery and node_id:
                self._peer_discovery.block_peer(node_id)
                return {"success": True}
            return {"error": "Invalid request"}

        @app.get("/v1/discovery/groups")
        async def discovery_groups():
            if self._peer_discovery:
                return {"groups": [g.to_dict() for g in self._peer_discovery.get_groups()]}
            return {"groups": []}

        @app.post("/v1/discovery/groups/create")
        async def create_group(request: Request):
            body = await request.json()
            if self._peer_discovery:
                group = self._peer_discovery.create_group(
                    name=body.get("name", "Untitled Group"),
                    description=body.get("description", ""),
                )
                return {"success": True, "group": group.to_dict()}
            return {"error": "Discovery not initialized"}

        # ── Log Query endpoints ────────────────────────────────────
        @app.get("/v1/logs/query")
        async def query_logs(
            channel: Optional[str] = None,
            level: Optional[str] = None,
            since: Optional[float] = None,
            limit: int = 100,
            search: Optional[str] = None,
        ):
            """Query structured logs with optional filters."""
            try:
                from log_system.log_dumper import get_log_dumper
                dumper = get_log_dumper()
                return {
                    "entries": dumper.query(
                        channel=channel, level=level,
                        since=since, limit=limit, search=search,
                    ),
                }
            except Exception as e:
                return {"entries": [], "error": str(e)}

        @app.get("/v1/logs/stats")
        async def log_stats():
            """Get log system statistics."""
            try:
                from log_system.log_dumper import get_log_dumper
                return get_log_dumper().stats
            except Exception as e:
                return {"error": str(e)}

        @app.get("/v1/compute/status")
        async def compute_status():
            """Get GPU/compute device information."""
            try:
                from compute.device_manager import get_device_manager
                return get_device_manager().status()
            except Exception as e:
                return {"error": str(e), "device": "cpu"}

    # ── Response Generation ────────────────────────────────────
    async def _complete_response(self, request: ChatCompletionRequest) -> dict:
        """Non-streaming response — run inference pipeline with ensemble confidence."""
        user_msg = ""
        for msg in request.messages:
            if msg.role == "user":
                user_msg = msg.content

        # Gather outputs from multiple nanos for ensemble agreement
        nano_outputs: List[str] = await self._run_ensemble_inference(user_msg)
        response_text = nano_outputs[0] if nano_outputs else ""
        confidence = self._compute_ensemble_confidence(nano_outputs)

        return {
            **ChatCompletionResponse(
                model=request.model,
                choices=[
                    ChatChoice(
                        message=ChatMessage(role="assistant", content=response_text),
                    )
                ],
                usage=Usage(
                    prompt_tokens=len(user_msg.split()),
                    completion_tokens=len(response_text.split()),
                    total_tokens=len(user_msg.split()) + len(response_text.split()),
                ),
            ).model_dump(),
            # Extension fields — callers that understand confidence can use them;
            # callers that don't (standard OpenAI clients) safely ignore them.
            "confidence": confidence,
            "nano_count": len(nano_outputs),
        }

    # ── Ensemble Helpers ──────────────────────────────────────

    async def _run_ensemble_inference(self, query: str, max_nanos: int = 5) -> List[str]:
        """Collect up to max_nanos independent nano outputs for the same query.
        Falls back to a single _run_inference call if no active nano sea exists."""
        if not self._sea or len(self._sea) < 2:
            result = await self._run_inference(query)
            return [result]

        outputs: List[str] = []
        for name, nano in list(self._sea.items())[:max_nanos]:
            try:
                if hasattr(nano, 'generate_text'):
                    text = nano.generate_text(query)
                    if text and isinstance(text, str) and len(text.strip()) > 5:
                        outputs.append(text.strip())
            except Exception:
                pass

        if not outputs:
            result = await self._run_inference(query)
            return [result]

        return outputs

    def _compute_ensemble_confidence(self, outputs: List[str]) -> float:
        """Pairwise token-overlap agreement across nano outputs.
        Returns a float in [0.0, 1.0].  1.0 = all nanos produced identical output.
        Falls back to 0.0 when fewer than 2 outputs are available."""
        if len(outputs) < 2:
            return 0.0

        def token_set(text: str):
            return set(text.lower().split())

        scores: List[float] = []
        for i in range(len(outputs)):
            for j in range(i + 1, len(outputs)):
                a = token_set(outputs[i])
                b = token_set(outputs[j])
                union = a | b
                if not union:
                    continue
                jaccard = len(a & b) / len(union)
                scores.append(jaccard)

        return round(sum(scores) / len(scores), 4) if scores else 0.0


    async def _stream_response(self, request: ChatCompletionRequest):
        """SSE streaming response."""
        user_msg = ""
        for msg in request.messages:
            if msg.role == "user":
                user_msg = msg.content

        response_text = await self._run_inference(user_msg)

        # Stream token by token
        completion_id = f"chatcmpl-{uuid.uuid4().hex[:12]}"
        for i, token in enumerate(response_text.split()):
            chunk = {
                "id": completion_id,
                "object": "chat.completion.chunk",
                "created": int(time.time()),
                "model": request.model,
                "choices": [{
                    "index": 0,
                    "delta": {"content": token + " "},
                    "finish_reason": None,
                }],
            }
            yield f"data: {json.dumps(chunk)}\n\n"
            await asyncio.sleep(0.02)

        # Final chunk
        final = {
            "id": completion_id,
            "object": "chat.completion.chunk",
            "created": int(time.time()),
            "model": request.model,
            "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
        }
        yield f"data: {json.dumps(final)}\n\n"
        yield "data: [DONE]\n\n"

    async def _run_inference(self, query: str) -> str:
        """Run the nano inference pipeline on a query."""
        # If pipeline executor available, try it
        if self._pipeline_executor and "inference" in self._pipeline_executor._pipelines:
            try:
                results = await self._pipeline_executor.execute("inference", query)
                # Get the last stage result
                format_result = results.get("format") or results.get("generate")
                if format_result is not None:
                    text = str(format_result)
                    # Only return if it's meaningful (not just tensor repr)
                    if not text.startswith("tensor(") and len(text.strip()) > 5:
                        return text
            except Exception as e:
                logger.warning(f"Pipeline inference failed: {e}")

        # Try individual nano inference as fallback
        if self._trainer and hasattr(self._trainer, "generate_text"):
            try:
                generated = self._trainer.generate_text(query, max_new_tokens=80)
                if generated and len(generated.strip()) > 5:
                    return generated
            except Exception as e:
                logger.warning(f"Swarm runtime generation failed: {e}")

        if self._sea:
            try:
                # Try code completion nano directly
                for name, nano in self._sea.items():
                    if "CodeCompletion" in name or "TokenGenerator" in name:
                        if hasattr(nano, 'generate_text'):
                            result = nano.generate_text(query)
                            if result and isinstance(result, str) and len(result.strip()) > 5:
                                return f"[Nano: {name}] {result}"
            except Exception as e:
                logger.warning(f"Direct nano inference failed: {e}")

        # Transparent fallback: let the user know nanos are learning
        nano_count = len(self._sea) if self._sea else 0
        trained = sum(1 for n in (self._sea or {}).values() if hasattr(n, 'training_steps') and n.training_steps > 0)
        return (
            f"[Nano Sea — {nano_count} nanos, {trained} trained] "
            f"I'm still learning from your conversations with the LLM providers. "
            f"Keep chatting with GitHub Models, Ollama, or other providers — "
            f"the midwife feeds your interactions to me as training data. "
            f"Once enough training accumulates, I'll start providing real answers."
        )


def create_server() -> NanoServer:
    """Factory function to create the server."""
    return NanoServer()
