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
import asyncio, json, time, uuid, logging
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
                    respect=None, help_sys=None, scheduler=None) -> None:
        self._sea = sea
        self._mesh_node = mesh_node
        self._pipeline_executor = pipeline
        self._respect_system = respect
        self._help_system = help_sys
        self._scheduler = scheduler

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
            return {
                "status": "idle",
                "total_training_steps": 0,
                "nano_count": len(self._sea) if self._sea else 0,
            }

    # ── Response Generation ────────────────────────────────────
    async def _complete_response(self, request: ChatCompletionRequest) -> dict:
        """Non-streaming response — run inference pipeline."""
        user_msg = ""
        for msg in request.messages:
            if msg.role == "user":
                user_msg = msg.content

        # Try nano pipeline first
        response_text = await self._run_inference(user_msg)

        return ChatCompletionResponse(
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
        ).model_dump()

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
                    return str(format_result)
            except Exception as e:
                logger.warning(f"Pipeline inference failed: {e}")

        # Fallback: acknowledge the query
        return (
            f"[Nano Sea] I received your query ({len(query)} chars). "
            f"The sea is alive with {len(self._sea) if self._sea else 0} nanos, "
            f"but training is needed before I can give meaningful answers. "
            f"Use the IDE's LLM providers for now — I'm learning from every conversation."
        )


def create_server() -> NanoServer:
    """Factory function to create the server."""
    return NanoServer()
