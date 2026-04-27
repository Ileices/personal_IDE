"""Validated Midwife: LLM-generated training pairs with validation hooks."""
from __future__ import annotations

import subprocess
import tempfile
from typing import Dict, List


class ValidatedMidwife:
    def __init__(self, llm_endpoint: str = "http://localhost:11434/api/generate", difficulty: float = 0.3):
        self.llm_endpoint = llm_endpoint
        self.difficulty = difficulty
        self.pass_rate_history: List[float] = []

    def generate_batch(self, n: int = 10, topic: str = "python") -> List[Dict]:
        raw_pairs = self._ask_llm(n, topic)
        validated = []

        for pair in raw_pairs:
            if pair.get("type") == "code":
                if self._validate_code(pair):
                    validated.append(pair)
            elif pair.get("type") == "text":
                if self._validate_text(pair):
                    validated.append(pair)
            else:
                validated.append(pair)

        if raw_pairs:
            self.pass_rate_history.append(len(validated) / len(raw_pairs))

        return validated

    def _ask_llm(self, n: int, topic: str) -> List[Dict]:
        prompt = (
            f"Generate {n} Python coding exercises at difficulty {self.difficulty:.1f}/1.0 about {topic}.\n"
            "For each, provide prompt, solution, test_input, expected_output, type as JSON array."
        )
        _ = prompt
        return []

    def _validate_code(self, pair: Dict) -> bool:
        solution = pair.get("solution", "")
        test_input = pair.get("test_input", "")
        expected = pair.get("expected_output", "")
        if not solution or not expected:
            return False

        code = f"{solution}\n{test_input}"
        try:
            with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False) as temp:
                temp.write(code)
                temp.flush()
                result = subprocess.run(["python", temp.name], capture_output=True, text=True, timeout=10)
            return result.stdout.strip() == expected.strip()
        except Exception:
            return False

    def _validate_text(self, pair: Dict) -> bool:
        output = pair.get("expected_output", "")
        if not output or len(output) < 10:
            return False
        return len(set(output)) >= 5

    def update_difficulty(self):
        if len(self.pass_rate_history) < 10:
            return

        avg = sum(self.pass_rate_history[-10:]) / 10
        if avg > 0.8:
            self.difficulty = min(1.0, self.difficulty + 0.05)
        elif avg < 0.3:
            self.difficulty = max(0.1, self.difficulty - 0.05)
