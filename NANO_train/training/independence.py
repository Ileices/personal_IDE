"""Independence tracker: measures nano sea vs midwife performance."""
from __future__ import annotations

from typing import Dict, List


class IndependenceTracker:
    def __init__(self):
        self.task_scores: Dict[str, Dict[str, int]] = {}

    def record(self, task_name: str, sea_correct: bool, llm_correct: bool):
        if task_name not in self.task_scores:
            self.task_scores[task_name] = {"sea_correct": 0, "llm_correct": 0, "total": 0}
        self.task_scores[task_name]["total"] += 1
        if sea_correct:
            self.task_scores[task_name]["sea_correct"] += 1
        if llm_correct:
            self.task_scores[task_name]["llm_correct"] += 1

    def independence_ratio(self, task_name: str) -> float:
        if task_name not in self.task_scores:
            return 0.0
        scores = self.task_scores[task_name]
        if scores["llm_correct"] == 0:
            return 1.0
        return scores["sea_correct"] / scores["llm_correct"]

    def independent_tasks(self, threshold: float = 0.9) -> List[str]:
        return [t for t in self.task_scores if self.independence_ratio(t) >= threshold]

    def dependent_tasks(self, threshold: float = 0.5) -> List[str]:
        return [t for t in self.task_scores if self.independence_ratio(t) < threshold]

    def summary(self) -> Dict[str, Dict]:
        return {
            task: {"independence": f"{self.independence_ratio(task):.1%}", **scores}
            for task, scores in self.task_scores.items()
        }
