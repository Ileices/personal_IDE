"""
Pipeline Executor — DAG-based nano chain execution.

A pipeline is a directed acyclic graph of nanos:
  tokenize → embed → search → rank → generate → validate

Each stage can fan-out (parallel) and fan-in (merge).
Pipelines are defined declaratively and executed with data flowing through.
"""
from __future__ import annotations
import asyncio, time, logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Tuple, TYPE_CHECKING

if TYPE_CHECKING:
    from nanos.base import BaseNano

logger = logging.getLogger(__name__)


@dataclass
class PipelineStage:
    """A single stage in the pipeline."""
    name: str
    nano_type: str
    depends_on: List[str] = field(default_factory=list)
    timeout: float = 10.0
    # Result storage
    result: Any = None
    error: Optional[str] = None
    duration: float = 0.0


@dataclass
class PipelineDefinition:
    """Declarative pipeline definition."""
    name: str
    stages: List[PipelineStage]
    description: str = ""

    def validate(self) -> List[str]:
        """Check for cycles and missing dependencies."""
        errors = []
        names = {s.name for s in self.stages}
        for stage in self.stages:
            for dep in stage.depends_on:
                if dep not in names:
                    errors.append(f"Stage '{stage.name}' depends on unknown '{dep}'")
        # Cycle detection via topological sort
        visited: set = set()
        path: set = set()
        def _dfs(name: str) -> bool:
            if name in path:
                return True  # cycle
            if name in visited:
                return False
            path.add(name)
            stage = next((s for s in self.stages if s.name == name), None)
            if stage:
                for dep in stage.depends_on:
                    if _dfs(dep):
                        return True
            path.discard(name)
            visited.add(name)
            return False
        for s in self.stages:
            if _dfs(s.name):
                errors.append(f"Cycle detected involving stage '{s.name}'")
                break
        return errors


class PipelineExecutor:
    """Executes nano pipelines with parallel stage scheduling."""

    def __init__(self, nanos: Dict[str, "BaseNano"] | None = None):
        self._nanos: Dict[str, "BaseNano"] = nanos or {}
        self._pipelines: Dict[str, PipelineDefinition] = {}
        self._execution_count = 0

    def register_nano(self, nano: "BaseNano") -> None:
        self._nanos[nano.NANO_TYPE] = nano

    def register_pipeline(self, pipeline: PipelineDefinition) -> List[str]:
        """Register a pipeline. Returns list of validation errors (empty = ok)."""
        errors = pipeline.validate()
        if not errors:
            self._pipelines[pipeline.name] = pipeline
        return errors

    # ── Predefined Pipelines ───────────────────────────────────
    def create_inference_pipeline(self) -> PipelineDefinition:
        """Standard inference pipeline: parse → expand → route → assemble → generate → validate."""
        return PipelineDefinition(
            name="inference",
            description="Standard query→response pipeline",
            stages=[
                PipelineStage("parse", "QueryParserNano"),
                PipelineStage("expand", "QueryExpanderNano", depends_on=["parse"]),
                PipelineStage("route", "QueryRouterNano", depends_on=["expand"]),
                PipelineStage("search", "SearchNano", depends_on=["route"]),
                PipelineStage("rank", "RankNano", depends_on=["search"]),
                PipelineStage("context", "ContextAssemblerNano", depends_on=["rank"]),
                PipelineStage("generate", "TokenGeneratorNano", depends_on=["context"]),
                PipelineStage("validate", "ResponseValidatorNano", depends_on=["generate"]),
                PipelineStage("format", "ResponseFormatterNano", depends_on=["validate"]),
            ],
        )

    def create_training_pipeline(self) -> PipelineDefinition:
        """Training observation pipeline: observe LLM → extract pairs → distill."""
        return PipelineDefinition(
            name="training",
            description="LLM observation → nano training pipeline",
            stages=[
                PipelineStage("observe", "LLMObserverNano"),
                PipelineStage("tokenize", "TokenizationNano", depends_on=["observe"]),
                PipelineStage("embed", "EmbeddingNano", depends_on=["tokenize"]),
                PipelineStage("sample", "DataSamplerNano", depends_on=["embed"]),
                PipelineStage("train", "OnlineTrainerNano", depends_on=["sample"]),
                PipelineStage("validate", "TrainingValidationNano", depends_on=["train"]),
                PipelineStage("log", "TrainingLoggerNano", depends_on=["validate"]),
            ],
        )

    # ── Execution ──────────────────────────────────────────────
    async def execute(self, pipeline_name: str, initial_input: Any = None) -> Dict[str, Any]:
        """Execute a registered pipeline. Returns dict of stage_name → result."""
        pipeline = self._pipelines.get(pipeline_name)
        if not pipeline:
            raise ValueError(f"Unknown pipeline: {pipeline_name}")

        self._execution_count += 1
        start = time.time()
        results: Dict[str, Any] = {"__input__": initial_input}
        completed: set = set()
        stage_map = {s.name: s for s in pipeline.stages}

        # Topological execution with parallelism
        while len(completed) < len(pipeline.stages):
            # Find ready stages (all deps completed)
            ready = []
            for stage in pipeline.stages:
                if stage.name in completed:
                    continue
                if all(d in completed for d in stage.depends_on):
                    ready.append(stage)

            if not ready:
                failed = [s.name for s in pipeline.stages if s.name not in completed]
                raise RuntimeError(f"Pipeline stuck — stages not ready: {failed}")

            # Execute ready stages in parallel
            tasks = [self._execute_stage(stage, results) for stage in ready]
            await asyncio.gather(*tasks)

            for stage in ready:
                results[stage.name] = stage.result
                completed.add(stage.name)

        total_time = time.time() - start
        results["__duration__"] = total_time
        results["__stages__"] = len(pipeline.stages)
        return results

    async def _execute_stage(self, stage: PipelineStage, context: Dict[str, Any]) -> None:
        """Execute a single pipeline stage."""
        start = time.time()
        try:
            nano = self._nanos.get(stage.nano_type)
            if nano is None:
                # Skip gracefully if nano not available
                logger.warning(f"Nano {stage.nano_type} not available, skipping stage {stage.name}")
                stage.result = context.get("__input__")
                return

            import torch
            # Gather inputs from dependencies
            dep_results = [context.get(d) for d in stage.depends_on]
            if dep_results:
                # Merge dependency results — use first non-None
                input_data = next((r for r in dep_results if r is not None), None)
            else:
                input_data = context.get("__input__")

            # Execute nano
            with torch.no_grad():
                if isinstance(input_data, torch.Tensor):
                    stage.result = nano(input_data)
                else:
                    # Wrap in tensor if needed
                    stage.result = nano(torch.zeros(1, nano.input_size))

        except Exception as e:
            stage.error = str(e)
            stage.result = None
            logger.error(f"Stage {stage.name} ({stage.nano_type}) failed: {e}")
        finally:
            stage.duration = time.time() - start

    # ── Stats ──────────────────────────────────────────────────
    @property
    def stats(self) -> dict:
        return {
            "registered_pipelines": list(self._pipelines.keys()),
            "execution_count": self._execution_count,
            "available_nanos": len(self._nanos),
        }
