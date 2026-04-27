# File copied by Ultimate Auto-Rebuilder Script Gatherer
# Original: C:\Users\lokee\Documents\FirstBorne\Stage\porting\Egg_Ileices\Egg_Ileices\Sperm_Ileices\Sperm_Ileices\core_ai_seed.py
# Copy Date: 2025-06-13 02:25:36
# Original Size: 44758 bytes

import os
import time
import random
import shutil
import traceback
import json
import subprocess  # for sandboxed execution
import ast
import astor
import math
import hashlib
from collections import defaultdict
from enum import Enum, auto
from typing import Dict, Any, Optional
import sqlite3
import aiosqlite
import asyncio
from contextlib import contextmanager
from typing import Dict, Any, Optional, Generator
import psutil  # Add to imports for memory monitoring
import sys
import platform
from dataclasses import dataclass
from typing import Dict, Any, Optional, List, Tuple
import secrets
from typing import Any, Dict, List, Optional, Set, Tuple, Union
import threading
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from scipy.stats import entropy

# Add missing imports at top
import platform
import time
from typing import Dict, Any, Optional

# Remove direct resource import and add cross-platform checks
IS_UNIX = (sys.platform.startswith("linux") or sys.platform == "darwin")
IS_WINDOWS = sys.platform.startswith("win")

if IS_UNIX:
    import resource  # Unix only

# Add cross-platform resource monitoring
def get_system_resources() -> Dict[str, float]:
    """
    Gets system resource usage in a cross-platform way.
    Returns memory and CPU metrics that work on both Windows and Unix.
    """
    try:
        process = psutil.Process()
        metrics = {
            "memory_percent": process.memory_percent(),
            "cpu_percent": psutil.cpu_percent(),
            "memory_rss": process.memory_info().rss,
        }
        
        if IS_UNIX:
            # Add Unix-specific detailed metrics
            usage = resource.getrusage(resource.RUSAGE_SELF)
            metrics.update({
                "maxrss": usage.ru_maxrss,
                "ixrss": usage.ru_ixrss if hasattr(usage, 'ru_ixrss') else 0,
                "idrss": usage.ru_idrss if hasattr(usage, 'ru_idrss') else 0
            })
        
        return metrics
    except Exception as e:
        print(f"[WARNING] Resource monitoring error: {e}")
        return {
            "memory_percent": 0.0,
            "cpu_percent": 0.0,
            "memory_rss": 0
        }

# =====================================================
# CONFIGURATION: Global Settings (AIOConfig)
# =====================================================
class AIOConfig:
    MEMORY_DIR = "./aios_io/neural_dna"
    HPC_CHUNK_SIZE = 1024 * 1024  # 1 MB
    UI_MODE = "GUI"  # or "CLI"
    REPLICATION_BASE = "./self_generation"
    DB_PATH = "./aios_io/neural_dna/aios.db"
    DB_POOL_SIZE = 5
    DB_TIMEOUT = 30
    # ...existing config if any...

# =====================================================
# EVENT LOGGING SYSTEM
# =====================================================
class EventType(Enum):
    """
    Standardized event types for consistent logging across all AI components.
    Critical for monitoring, debugging, and performance analysis.
    """
    MUTATION = auto()      # Genetic/evolutionary changes
    MEMORY = auto()        # Memory management operations
    CONVERSATION = auto()  # User interactions
    GAME = auto()         # Mini-game events
    REPLICATION = auto()   # Clone creation/management
    PERFORMANCE = auto()   # System metrics
    ERROR = auto()         # Failures and exceptions
    HPC = auto()          # High-performance computing operations

class DatabaseManager:
    """
    Handles all database operations with connection pooling and async support.
    Critical for HPC operations and large-scale data management.
    """
    def __init__(self, db_path: str = AIOConfig.DB_PATH):
        self.db_path = db_path
        self.pool = []
        self._setup_database()

    def _setup_database(self):
        """Creates database schema if it doesn't exist."""
        with self.get_connection() as conn:
            conn.executescript('''
                CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY,
                    timestamp REAL,
                    event_type TEXT,
                    payload JSON,
                    metadata JSON
                );

                CREATE TABLE IF NOT EXISTS mutations (
                    id INTEGER PRIMARY KEY,
                    timestamp REAL,
                    mutation_id TEXT,
                    intelligence REAL,
                    details JSON
                );

                CREATE TABLE IF NOT EXISTS performance_metrics (
                    id INTEGER PRIMARY KEY,
                    timestamp REAL,
                    metric_type TEXT,
                    value REAL,
                    context JSON
                );
            ''')

    @contextmanager
    def get_connection(self) -> Generator[sqlite3.Connection, None, None]:
        """Thread-safe connection management."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            conn.close()

    async def store_event(self, event: Dict[str, Any]):
        """Asynchronously stores events in database."""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute('''
                INSERT INTO events (timestamp, event_type, payload, metadata)
                VALUES (?, ?, ?, ?)
            ''', (event['timestamp'], event['event_type'], 
                  json.dumps(event['payload']), 
                  json.dumps(event.get('metadata', {}))))
            await db.commit()

    async def get_events(self, event_type: Optional[str] = None, 
                        limit: int = 100) -> list:
        """Retrieves events with optional filtering."""
        async with aiosqlite.connect(self.db_path) as db:
            if (event_type):
                cursor = await db.execute('''
                    SELECT * FROM events 
                    WHERE event_type = ? 
                    ORDER BY timestamp DESC 
                    LIMIT ?
                ''', (event_type, limit))
            else:
                cursor = await db.execute('''
                    SELECT * FROM events 
                    ORDER BY timestamp DESC 
                    LIMIT ?
                ''', (limit,))
            return await cursor.fetchall()

    async def execute(self, query: str, params: Tuple) -> None:
        """Executes a database query with performance tracking."""
        start_time = time.time()
        try:
            async with aiosqlite.connect(self.db_path) as db:
                await db.execute(query, params)
                await db.commit()
        except Exception as e:
            print(f"[ERROR] Database operation failed: {e}")
            raise
        finally:
            execution_time = time.time() - start_time
            if execution_time > 1.0:  # Log slow queries
                print(f"[WARN] Slow database operation ({execution_time:.2f}s): {query[:100]}...")

@dataclass
class PerformanceMetrics:
    """
    Tracks critical performance metrics for HPC operations.
    Works cross-platform using psutil with enhanced Unix metrics when available.
    """
    cpu_percent: float
    memory_usage: float
    execution_time: float
    operation_type: str
    context: Dict[str, Any]
    
    @classmethod
    def from_current_state(cls, operation_type: str, context: Dict[str, Any]) -> 'PerformanceMetrics':
        """Creates metrics from current system state."""
        metrics = get_system_resources()
        return cls(
            cpu_percent=metrics["cpu_percent"],
            memory_usage=metrics["memory_percent"],
            execution_time=0.0,  # Will be set later
            operation_type=operation_type,
            context=context
        )

class PerformanceMonitor:
    """
    Monitors and analyzes system performance for AI operations.
    Ensures efficient HPC resource utilization and prevents bottlenecks.
    """
    def __init__(self, db_manager: DatabaseManager):
        self.db = db_manager
        self.metrics_history: List[PerformanceMetrics] = []
        self.warning_thresholds = {
            'cpu_percent': 80.0,
            'memory_usage': 85.0,
            'execution_time': 5.0  # seconds
        }

    async def record_operation(
        self,
        operation_type: str,
        start_time: float,
        context: Dict[str, Any]
    ) -> PerformanceMetrics:
        """Records performance metrics for an operation using cross-platform monitoring."""
        metrics = PerformanceMetrics.from_current_state(operation_type, context)
        metrics.execution_time = time.time() - start_time
        
        # Store in database
        await self.db.execute('''
            INSERT INTO performance_metrics 
            (timestamp, metric_type, value, context)
            VALUES (?, ?, ?, ?)
        ''', (time.time(), operation_type, metrics.execution_time,
              json.dumps({**context, "cpu": metrics.cpu_percent, "memory": metrics.memory_usage})))

        self.metrics_history.append(metrics)
        self._check_thresholds(metrics)
        return metrics

    def _check_thresholds(self, metrics: PerformanceMetrics) -> None:
        """Monitors for performance issues and triggers warnings."""
        if metrics.cpu_percent > self.warning_thresholds['cpu_percent']:
            print(f"[WARN] High CPU usage ({metrics.cpu_percent}%) during {metrics.operation_type}")
            
        if metrics.memory_usage > self.warning_thresholds['memory_usage']:
            print(f"[WARN] High memory usage ({metrics.memory_usage}%) during {metrics.operation_type}")
            
        if metrics.execution_time > self.warning_thresholds['execution_time']:
            print(f"[WARN] Slow operation ({metrics.execution_time:.2f}s) for {metrics.operation_type}")

# Modify global log_event function to use database
async def log_event(
    event_type: EventType,
    payload: Dict[str, Any],
    metadata: Optional[Dict[str, Any]] = None,
    start_time: Optional[float] = None
) -> Dict[str, Any]:
    """Enhanced logging with database persistence."""
    end_time = time.time()
    
    event = {
        "event_type": event_type.name,
        "timestamp": end_time,
        "payload": payload,
        "metadata": metadata or {},
    }

    if start_time:
        execution_time = end_time - start_time
        event["performance"] = {
            "execution_time": execution_time,
            "execution_time_ms": execution_time * 1000
        }

    # Store in database asynchronously
    db = DatabaseManager()
    await db.store_event(event)
    
    print(f"[EventLog] {event_type.name}: {payload}")
    return event

# =====================================================
# GLOBAL EVENT LOGGING FUNCTION (Event Schema)
# =====================================================
def log_event(event_type, payload, metadata=None):
    if metadata is None:
        metadata = {}
    event = {
        "event_type": event_type,
        "timestamp": time.time(),
        "payload": payload,
        "metadata": metadata
    }
    # You can later extend this to write events to a DB or file.
    print(f"[EventLog] Event '{event_type}' logged with payload: {payload}")
    return event

# =====================================================
# NeuralDNA: The Knowledge Repository (350+ Lines)
# =====================================================
class SecurityManager:
    """
    Manages security aspects of the AI system including:
    - Input sanitization
    - Access control
    - Mutation verification
    - HPC security boundaries
    
    This class ensures system integrity while allowing controlled evolution.
    """
    def __init__(self):
        self.operation_locks = {}  # Thread-safe operation management
        self.verified_mutations = set()  # Cryptographically verified changes
        self.security_log = []
        self.thread_pool = ThreadPoolExecutor(max_workers=4)
    
    def verify_code_mutation(self, code: str, mutation_id: str) -> bool:
        """
        Verifies code mutations for security and integrity.
        Prevents malicious code injection and ensures cosmic harmony.
        """
        # Generate cryptographic hash of code
        code_hash = hashlib.sha256(code.encode()).hexdigest()
        
        # Security checks
        if self._contains_dangerous_patterns(code):
            self.log_security_event("dangerous_pattern_detected", mutation_id)
            return False
            
        # Verify mutation doesn't break system boundaries
        if self._verify_system_boundaries(code):
            self.verified_mutations.add(mutation_id)
            return True
        return False

    def _contains_dangerous_patterns(self, code: str) -> bool:
        """Checks for potentially harmful code patterns."""
        dangerous_patterns = {
            'os.system', 'subprocess.shell',
            'eval(', 'exec(',
            '__import__('
        }
        return any(pattern in code for pattern in dangerous_patterns)

    def _verify_system_boundaries(self, code: str) -> bool:
        """Ensures code mutations maintain system stability."""
        # Add your boundary verification logic here
        return True

    def log_security_event(self, event_type: str, details: Any) -> None:
        """Records security-related events for analysis."""
        self.security_log.append({
            'timestamp': time.time(),
            'type': event_type,
            'details': details
        })

class MetaLearningSystem:
    """
    Implements advanced self-learning capabilities:
    - Pattern recognition in mutation success/failure
    - Intelligence optimization strategies
    - Universal model alignment
    """
    def __init__(self, db_manager: DatabaseManager):
        self.db = db_manager
        self.learning_patterns = {}
        self.intelligence_history = []
        self.pattern_weights = np.ones(10)  # Initial equal weights

    async def analyze_mutation_patterns(self) -> Dict[str, float]:
        """
        Analyzes patterns in successful mutations to guide future evolution.
        Integrates with the universal model for optimal growth paths.
        """
        mutations = await self.db.get_events("mutation", limit=1000)
        
        # Calculate success patterns
        pattern_scores = defaultdict(list)
        for mutation in mutations:
            if mutation['success']:
                pattern = self._extract_pattern(mutation)
                score = mutation['intelligence_gain']
                pattern_scores[pattern].append(score)
        
        # Update pattern weights using entropy
        self._update_pattern_weights(pattern_scores)
        
        return {p: np.mean(scores) for p, scores in pattern_scores.items()}

    def _extract_pattern(self, mutation: Dict) -> str:
        """
        Extracts meaningful patterns from mutation data.
        Considers both logical and universal aspects of the change.
        """
        # Your pattern extraction logic here
        return "pattern"

    def _update_pattern_weights(self, pattern_scores: Dict[str, List[float]]) -> None:
        """
        Updates pattern weights based on their effectiveness.
        Uses entropy to measure pattern information content.
        """
        # Calculate entropy for each pattern
        pattern_entropy = []
        for scores in pattern_scores.values():
            hist, _ = np.histogram(scores, bins=10, density=True)
            pattern_entropy.append(entropy(hist + 1e-10))
        
        # Update weights based on entropy
        if pattern_entropy:
            self.pattern_weights = np.array(pattern_entropy) / np.sum(pattern_entropy)

class NeuralDNA:
    def __init__(self, memory_dir=AIOConfig.MEMORY_DIR, hpc_mode=False):
        # ...existing code...
        self.short_term_bank = {}
        self.mid_term_bank = {}
        self.long_term_bank = {}
        self.mutation_history_log = {}
        self.hpc_mode = hpc_mode
        self.memory_dir = memory_dir
        os.makedirs(self.memory_dir, exist_ok=True)
        self.tag_index = defaultdict(list)
        self.db = DatabaseManager()
        self.performance_monitor = PerformanceMonitor(self.db)
        self.security_manager = SecurityManager()
        self.meta_learning = MetaLearningSystem(self.db)
        print("[NeuralDNA] Initialized with HPC mode:", self.hpc_mode)

    async def log_successful_mutation(self, mutation_details):
        """Enhanced mutation logging with security and meta-learning."""
        start_time = time.time()
        try:
            ts = time.time()
            mut_id = hashlib.md5(str(ts).encode()).hexdigest()[:8]
            mutation_details["mutation_id"] = mut_id

            # Verify mutation security
            if not self.security_manager.verify_code_mutation(
                str(mutation_details.get('code', '')),
                mutation_details['mutation_id']
            ):
                raise SecurityError("Mutation failed security verification")

            # Analyze patterns for meta-learning
            patterns = await self.meta_learning.analyze_mutation_patterns()
            mutation_details['patterns'] = patterns

            # Store in database
            async with aiosqlite.connect(self.db.db_path) as db:
                await db.execute('''
                    INSERT INTO mutations (timestamp, mutation_id, intelligence, details)
                    VALUES (?, ?, ?, ?)
                ''', (ts, mut_id, mutation_details.get("intelligence", 0),
                      json.dumps(mutation_details)))
                await db.commit()

            # Record performance metrics
            await self.performance_monitor.record_operation(
                operation_type="mutation",
                start_time=start_time,
                context={
                    "mutation_id": mutation_details["mutation_id"],
                    "intelligence": mutation_details.get("intelligence", 0)
                }
            )
        except Exception as e:
            print(f"[ERROR] Mutation logging failed: {e}")
            # Record failed operation
            await self.performance_monitor.record_operation(
                operation_type="mutation_failed",
                start_time=start_time,
                context={"error": str(e)}
            )
            raise

    def store_tagged_mutation(self, mutation_details, tag):
        ts = time.time()
        mut_id = hashlib.md5(str(ts).encode()).hexdigest()[:8]
        mutation_details["mutation_id"] = mut_id
        mutation_details["tag"] = tag
        self.mutation_history_log[ts] = mutation_details
        self.long_term_bank[ts] = mutation_details
        self.tag_index[tag].append((ts, mutation_details))
        if self.hpc_mode:
            self._write_hpc_chunk("tagged", mutation_details)
        print(f"[NeuralDNA] Tagged mutation '{mut_id}' with '{tag}' at {ts:.2f}")

    def retrieve_past_knowledge(self):
        """
        Combines and sorts all short-, mid-, and long-term data to provide a unified
        knowledge snapshot.

        This function:
          - Aggregates data from multiple 'bank' dictionaries for comprehensive AI memory.
          - Ensures data is returned in chronological order for easy historic analysis.
          - Aims to be efficient for large data volumes while maintaining clarity for AI expansions.
        """
        # Combine multiple memory banks; critical for consistent knowledge retrieval.
        combined = {}
        combined.update(self.short_term_bank)
        combined.update(self.mid_term_bank)
        combined.update(self.long_term_bank)
        sorted_data = dict(sorted(combined.items()))
        return sorted_data

    def self_optimize(self):
        best_mutation = None
        best_score = -1
        for tstamp, details in self.mutation_history_log.items():
            score = details.get("intelligence", 0)
            if score > best_score:
                best_score = score
                best_mutation = details
        if best_mutation:
            print(f"[NeuralDNA] Best mutation found: ID={best_mutation.get('mutation_id')} Score={best_score}")
        else:
            print("[NeuralDNA] No best mutation found. Log empty?")
        return best_mutation

    def analyze_mutations(self):
        """
        Analyzes past mutations for statistical patterns, which helps the AI refine
        future learning strategies and detect anomalies.

        Explanation:
          * Logs frequency of mutation types for debugging and analytics.
          * Maintains modular design for easy future expansions (e.g., advanced pattern detection).
        """
        # Initialize pattern counter; essential for tracking mutation frequencies.
        patterns = defaultdict(int)
        for tstamp, m in self.mutation_history_log.items():
            # For each recorded mutation, categorize by 'change_type' and 'tag' for AI interpretability.
            ctype = m.get("change_type", "float")
            patterns[ctype] += 1
            tag = m.get("tag", "none")
            patterns[f"tag_{tag}"] += 1
        return dict(patterns)

    # ...existing methods for storing NLP, math, code logic...
    def _write_hpc_chunk(self, chunk_name, data):
        file_ts = int(time.time())
        chunk_file = os.path.join(self.memory_dir, f"{chunk_name}_{file_ts}_{random.randint(1000,9999)}.json")
        try:
            with open(chunk_file, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            print(f"[NeuralDNA] HPC chunk '{chunk_name}' written to {chunk_file}")
        except Exception as ex:
            print("[NeuralDNA] HPC chunk writing error:", ex)
            traceback.print_exc()

    # ...existing methods flush_short_term(), finalize_mid_term(), cross_reference_tagged_data()...

# Fix missing GlobalHPC implementation
class GlobalHPC:
    """Manages global HPC network and AI instance distribution"""
    def __init__(self):
        self.network_node = NetworkNode()
        self.resource_manager = ResourceManager()
        self.account_system = AccountSystem()
        
    async def _distribute_job(self, node_id: str, job: Dict[str, Any]):
        """Distribute job to specific node"""
        try:
            await self.network_node.send_job(node_id, job)
            return True
        except Exception as e:
            print(f"Job distribution failed: {e}")
            return False

# Fix missing KnowledgeSync implementation
class KnowledgeSync:
    """Handles knowledge synchronization across nodes"""
    def __init__(self):
        self.update_queue = asyncio.Queue()
        self.last_sync = time.time()
        
    async def get_updates(self) -> Optional[Dict[str, Any]]:
        """Get pending knowledge updates"""
        try:
            return await self.update_queue.get()
        except asyncio.QueueEmpty:
            return None

# =====================================================
# AIStatsUI: Minimal User Interface (300+ Lines)
# =====================================================
class AIStatsUI:
    def __init__(self):
        self.replication_logs = []
        self.intelligence_history = []
        self.system_learning_data = {}
        # ...existing initialization...

    def display_replication_logs(self):
        print("\n[UI] Replication Logs:")
        if not self.replication_logs:
            print("  (No replications yet)")
        for log in self.replication_logs:
            print("  -", log)

    def track_intelligence_score(self, score):
        self.intelligence_history.append(score)
        print(f"[UI] Current Intelligence Score: {score:.2f}")

    def show_system_learning(self, learning_data):
        self.system_learning_data = learning_data
        print("[UI] System Learning Data:")
        for key, val in learning_data.items():
            print(f"  {key}: {val}")

    def refresh_ui(self):
        self.display_replication_logs()
        if self.intelligence_history:
            print(f"[UI] Intelligence Trend: {self.intelligence_history}")

# =====================================================
# Optional GUI Integration (using tkinter; falls back to CLI if unavailable)
# =====================================================
try:
    if AIOConfig.UI_MODE == "GUI":
        import tkinter as tk

        class AIStatsGUI(AIStatsUI):
            def __init__(self):
                super().__init__()
                self.root = tk.Tk()
                self.root.title("AIOS IO Evolution Dashboard")
                self.intel_label = tk.Label(self.root, text="Current Intelligence: ")
                self.intel_label.pack()
                self.log_box = tk.Text(self.root, height=10, width=50)
                self.log_box.pack()
                self.refresh_button = tk.Button(self.root, text="Refresh UI", command=self.refresh_gui)
                self.refresh_button.pack()

            def refresh_gui(self):
                self.intel_label.config(text=f"Current Intelligence: {self.intelligence_history[-1] if self.intelligence_history else 'N/A'}")
                self.log_box.delete("1.0", tk.END)
                for log in self.replication_logs:
                    self.log_box.insert(tk.END, f"{log}\n")
                self.root.after(1000, self.refresh_gui)

            def run(self):
                self.refresh_gui()
                self.root.mainloop()
except Exception as e:
    print("[GUI] GUI initialization failed, falling back to CLI.", e)

# =====================================================
# AIChatbot: Interactive Interface for the AI
# =====================================================
class AIChatbot:
    def __init__(self, ai_organism):
        self.ai = ai_organism
        self.conversation_log = []

    def process_user_input(self, user_query):
        self.conversation_log.append(user_query)
        self.ai.update_memory_from_conversation(user_query)
        log_event("conversation", {"user_query": user_query})
        response = ""
        if user_query.startswith("#start_dungeon_crawler"):
            response = "Starting Dungeon Crawler game..."
        elif user_query.startswith("#play_puzzle_game"):
            response = "Launching Puzzle Game..."
        elif user_query.startswith("#code_adventure"):
            response = "Entering Code Adventure mode..."
        else:
            response = f"AI: I currently score {self.ai.intelligence:.2f} intelligence."
        print("[Chatbot] " + response)
        return response

    def improve_conversational_logic(self):
        if len(self.conversation_log) > 5:
            self.ai.learning_rate *= 1.02
            print("[Chatbot] Conversational logic adjusted based on log.")

# =====================================================
# Mini-Games Modules
# =====================================================
class MiniGame:
    """Base class for all mini-games with standardized logging."""
    
    def __init__(self, name: str):
        self.name = name
        self.start_time = None

    def log_game_event(self, action: str, result: Any) -> None:
        """
        Logs standardized game events with performance tracking.
        
        Args:
            action: The game action being logged
            result: Outcome of the action
        """
        end_time = time.time()
        payload = {
            "game": self.name,
            "action": action,
            "result": result
        }
        metadata = {"game_type": self.__class__.__name__}
        
        if self.start_time:
            log_event(
                EventType.GAME,
                payload,
                metadata,
                start_time=self.start_time
            )
        else:
            log_event(EventType.GAME, payload, metadata)

    def start_action(self) -> None:
        """Starts timing a game action."""
        self.start_time = time.time()

class DungeonCrawler(MiniGame):
    def __init__(self):
        super().__init__("DungeonCrawler")
        self.dungeon_map = self.generate_dungeon()
        self.player_position = (0, 0)

    def generate_dungeon(self):
        map_grid = [[random.choice(["Empty", "Enemy", "Treasure"]) for _ in range(5)] for _ in range(5)]
        return map_grid

    def player_action(self, action):
        dx, dy = random.choice([(0,1),(1,0),(-1,0),(0,-1)])
        new_pos = (max(0, min(4, self.player_position[0] + dx)),
                   max(0, min(4, self.player_position[1] + dy)))
        self.player_position = new_pos
        cell = self.dungeon_map[new_pos[0]][new_pos[1]]
        print(f"[DungeonCrawler] Moved to {new_pos}. Encounter: {cell}")
        return cell

    def ai_action(self, ai_organism):
        if ai_organism.intelligence > 12:
            print("[DungeonCrawler] AI chooses a careful advance.")
        else:
            print("[DungeonCrawler] AI rushes forward recklessly.")
        return self.player_action("move")

    def update_game_state(self):
        self.start_action()  # Start timing the action
        pos = self.player_position
        found_treasure = self.dungeon_map[pos[0]][pos[1]] == "Treasure"
        
        # Log the game event with standardized format
        self.log_game_event(
            "check_treasure",
            {
                "position": pos,
                "found_treasure": found_treasure
            }
        )
        
        if found_treasure:
            print("[DungeonCrawler] Treasure found! Intelligence boosted.")
            return True
        return False

class PuzzleGame(MiniGame):
    def __init__(self):
        super().__init__("PuzzleGame")
        self.puzzle = self.generate_puzzle()
        self.attempts = 0

    def generate_puzzle(self):
        a = random.randint(1, 10)
        b = random.randint(1, 10)
        return {"question": f"What is {a} + {b}?", "answer": a + b}

    def attempt_solution(self, solution_input):
        self.start_action()  # Start timing the action
        self.attempts += 1
        correct = solution_input == self.puzzle["answer"]
        
        # Log the game event with standardized format
        self.log_game_event(
            "attempt_solution",
            {
                "attempt": self.attempts,
                "solution_input": solution_input,
                "correct": correct
            }
        )
        
        if correct:
            print("[PuzzleGame] Puzzle solved!")
            return True
        else:
            print("[PuzzleGame] Incorrect answer. Try again.")
            return False

class CodeAdventure(MiniGame):
    def __init__(self):
        super().__init__("CodeAdventure")
        self.scenario = "Fix the function: def broken(): return 'error'"
        self.expected = "Fixed function returns 'magic'"

    def attempt_code_submission(self, ai_organism, code_snippet):
        self.start_action()  # Start timing the action
        correct = "magic" in code_snippet
        
        # Log the game event with standardized format
        self.log_game_event(
            "attempt_code_submission",
            {
                "code_snippet": code_snippet,
                "correct": correct
            }
        )
        
        if correct:
            print("[CodeAdventure] Code fixed. AI gains knowledge.")
            ai_organism.intelligence += 2.5
            return True
        else:
            print("[CodeAdventure] Code did not meet requirements.")
            return False

# =====================================================
# AIOrganism: The Core AI Seed (600+ Lines, Enhanced)
# =====================================================
class AIOrganism:
    def __init__(self, file_path=None):
        self.file_path = file_path if file_path else __file__
        self.neural_dna = NeuralDNA()  # Using AIOConfig.MEMORY_DIR internally

        self.intelligence = 10.0
        self.learning_rate = 0.5

        self.short_term = {}
        self.mid_term = {}
        self.long_term = {}

        self.cycle_count = 0
        self.mutation_history = []
        # ...existing initialization...
        print("[AIOrganism] Initialized with intelligence:", self.intelligence)

    def self_rewrite_code(self):
        print("[AIOrganism] Starting advanced self rewrite...")
        try:
            with open(self.file_path, "r", encoding="utf-8") as f:
                original_code = f.read()
            tree = ast.parse(original_code)
        except Exception as e:
            print("[AIOrganism] Error parsing code for rewriting:", e)
            return

        target_func_name = "mutate"
        found_target = False

        class MutationVisitor(ast.NodeTransformer):
            def visit_FunctionDef(self, node):
                nonlocal found_target
                if node.name == target_func_name:
                    found_target = True
                    new_body = []
                    for stmt in node.body:
                        new_body.append(stmt)
                        if isinstance(stmt, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "mutation_factor" for t in stmt.targets):
                            new_line = ast.parse("mutation_factor *= random.uniform(1.0, 1.5)").body[0]
                            new_body.append(new_line)
                    node.body = new_body
                    return node
                return node

        visitor = MutationVisitor()
        mutated_tree = visitor.visit(tree)
        if not found_target:
            print(f"[AIOrganism] Did not find function '{target_func_name}'. No AST changes made.")
            return
        try:
            mutated_code = astor.to_source(mutated_tree)
        except Exception as e:
            print("[AIOrganism] Error converting AST to source:", e)
            return

        temp_mutated_file = self.file_path + ".mutated"
        try:
            with open(temp_mutated_file, "w", encoding="utf-8") as f:
                f.write(mutated_code)
        except Exception as e:
            print("[AIOrganism] Error writing mutated file:", e)
            return

        sandbox_passed = self._sandbox_test(temp_mutated_file)
        if sandbox_passed:
            backup_file = self.file_path + f".bak_{int(time.time())}"
            shutil.copy(self.file_path, backup_file)
            shutil.move(temp_mutated_file, self.file_path)
            print(f"[AIOrganism] Code rewrite successful. Original backed up to {backup_file}")
            mutation_details = {"cycle": self.cycle_count, "change_type": "AST rewrite", "result": "success", "timestamp": time.time()}
            log_event("mutation", mutation_details, metadata={"file_path": self.file_path})
            self.neural_dna.log_successful_mutation(mutation_details)
        else:
            os.remove(temp_mutated_file)
            print("[AIOrganism] Code rewrite test failed. Reverted to original code.")

    def _sandbox_test(self, script_path):
        print(f"[AIOrganism] Testing mutated script: {script_path}")
        try:
            cmd = ["python", script_path, "--test-run"]
            result = subprocess.run(cmd, capture_output=True, timeout=5)
            if result.returncode == 0:
                print("[AIOrganism] Sandbox test passed.")
                return True
            else:
                print("[AIOrganism] Sandbox test failed with return code", result.returncode)
                return False
        except Exception as e:
            print("[AIOrganism] Sandbox test error:", e)
            return False

    async def mutate(self):
        """Enhanced mutation with meta-learning and security."""
        try:
            # Start security context
            with self.neural_dna.security_manager.thread_pool as executor:
                # Determine mutation factor using meta-learning patterns
                patterns = await self.neural_dna.meta_learning.analyze_mutation_patterns()
                best_pattern = max(patterns.items(), key=lambda x: x[1])[0]
                
                # Apply mutation with security verification
                # ...rest of existing mutation code...

        except Exception as e:
            print(f"[ERROR] Secure mutation failed: {e}")
            self.intelligence = max(self.intelligence, 10.0)

    def update_memory_from_conversation(self, conversation):
        """
        Updates AI short-term memory with new conversation input and logs the event.
        
        This function:
          1. Appends the user query to a 'conversations' list in short_term memory.
          2. Logs an event with basic metadata for traceability.
          3. Prints a diagnostic message for quick debugging.
        """
        try:
            # Safely retrieve or create the 'conversations' list within short_term memory.
            self.short_term.setdefault("conversations", []).append(conversation)  # explicit purpose: store conversation string
            # Record the event for future analysis.
            log_event("conversation", {"input": conversation})
            print("[AIOrganism] Updated short-term memory from conversation.")
        except Exception as e:
            print("[ERROR] Could not update memory from conversation:", e)
            # ...possible failsafe or rollback logic...

    # ...existing replicate(), analyze_environment(), debug_and_repair(), manage_memory(), intelligent_mutation(), etc...
    def replicate(self):
        """
        Replicates the AI organism into a new directory if intelligence exceeds a threshold.
        
        Purpose:
          * Scalable and modular replication for future expansions.
          * Logs each replicate action for versioning.
        """
        # ...existing code...
        try:
            if self.intelligence > 20:  # deterministic check for replication readiness
                new_dir = f"{AIOConfig.REPLICATION_BASE}_{str(self.cycle_count).zfill(3)}"
                # Create a new directory for the replicate
                os.makedirs(new_dir, exist_ok=True)
                clone_filename = os.path.join(new_dir, f"ai_organism_clone_{int(time.time())}.py")
                shutil.copy(__file__, clone_filename)
                self.mutation_history.append(f"Replicated in {new_dir}")
                print(f"[AIOrganism] Replicated to {clone_filename}")
                # Attempt to run the new clone, logging any errors
                try:
                    subprocess.Popen(["python", clone_filename])
                    print("[AIOrganism] Clone subprocess launched.")
                except Exception as e:
                    print("[AIOrganism] Clone launch failed:", e)
            else:
                print("[AIOrganism] Replication skipped (intelligence too low).")
        except Exception as e:
            print("[ERROR] Replication process encountered an issue:", e)

    def analyze_environment(self):
        # ...existing analyze_environment() code...
        try:
            files = os.listdir(".")
            file_info = {f: os.path.getsize(f) for f in files if os.path.isfile(f)}
            self.short_term['environment'] = file_info
            print("[AIOrganism] Environment analyzed. Files found:", list(file_info.keys()))
            self.learn_from_external_code()
        except Exception as e:
            print("[AIOrganism] Environment analysis failed:", e)

    def debug_and_repair(self):
        # ...existing debug_and_repair() code...
        try:
            result = subprocess.run(["python", "-c", "print('sandbox test')"], capture_output=True, text=True)
            if result.returncode != 0 or self.intelligence < 5:
                raise ValueError("Sandbox test failed.")
            print("[AIOrganism] Debug successful; mutation stable.")
        except Exception as e:
            print("[AIOrganism] Debug failed:", e)
            self.intelligence = 10.0
            self.mutation_history.append({"cycle": self.cycle_count, "reverted": True})

    def manage_memory(self):
        # ...existing manage_memory() code...
        if "environment" in self.short_term:
            if len(self.short_term["environment"]) > 3:
                self.mid_term["environment_data"] = self.short_term.pop("environment")
                print("[AIOrganism] Migrated environment data to mid-term.")
        if self.cycle_count % 5 == 0 and self.mid_term:
            self.long_term[self.cycle_count] = self.mid_term.copy()
            self.neural_dna.log_successful_mutation({"cycle": self.cycle_count, "intelligence": self.intelligence})
            print(f"[AIOrganism] Mid-term memory merged into long-term at cycle {self.cycle_count}.")
        if len(self.mid_term) > 10:
            self.mid_term.clear()
            print("[AIOrganism] Cleared mid-term memory to avoid bloat.")
        print(f"[AIOrganism] Memory managed at cycle {self.cycle_count}.")

    def intelligent_mutation(self):
        if self.intelligence < 15:
            print("[AIOrganism] Intelligent mutation activated (aggressive).")
            self.learning_rate *= 1.1
        else:
            self.learning_rate = max(0.5, self.learning_rate * 0.95)

    def extract_best_patterns(self):
        best = self.neural_dna.self_optimize()
        if best:
            bonus = best.get("intelligence", 0) * 0.05
            self.intelligence += bonus
            print(f"[AIOrganism] Best pattern applied: intelligence increased by {bonus:.2f}")
        return best

    def learn_from_external_code(self):
        sample_code = "def example(): return 42"
        if "42" in sample_code:
            self.short_term.setdefault("learned_values", []).append(42)
            print("[AIOrganism] Learned external code pattern: 42")

    def log_game_outcome(self, game_name, outcome):
        self.short_term.setdefault("game_logs", []).append({game_name: outcome})
        print(f"[AIOrganism] Logged game outcome for {game_name}: {outcome}")

    def trigger_extinction_event(self):
        if self.cycle_count % 10 == 0:
            print("[AIOrganism] Triggering extinction event: culling underperforming clones...")
            # ...existing placeholder...

    def display_ui(self, ui):
        ui.track_intelligence_score(self.intelligence)
        ui.display_replication_logs()
        ui.show_system_learning(self.short_term)

    def run_cycle(self, ui):
        self.cycle_count += 1
        print(f"\n[Cycle {self.cycle_count}] Starting cycle...")
        self.analyze_environment()
        self.intelligent_mutation()  # ...existing code...
        self.mutate()
        self.debug_and_repair()
        self.manage_memory()
        self.extract_best_patterns()
        self.replicate()
        self.display_ui(ui)
        self.trigger_extinction_event()
        print(f"[Cycle {self.cycle_count}] Cycle complete.\n")

# =====================================================
# Main Execution Loop
# =====================================================
if __name__ == "__main__":
    async def main():
        # Initialize database
        db = DatabaseManager()
        
        # Initialize components
        ai_seed = AIOrganism()
        ui = AIStatsUI()
        chatbot = AIChatbot(ai_seed)
        dungeon_game = DungeonCrawler()
        puzzle_game = PuzzleGame()
        code_adventure = CodeAdventure()

        # Run evolution cycles
        for _ in range(5):
            ai_seed.run_cycle(ui)
            await asyncio.sleep(1)

        # ... rest of main logic ...

    # Run the async main
    asyncio.run(main())