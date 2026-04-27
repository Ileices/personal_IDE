# File copied by Ultimate Auto-Rebuilder Script Gatherer
# Original: C:\Users\lokee\Documents\FirstBorne\Stage\porting\Egg_Ileices\Egg_Ileices\Sperm_Ileices\Sperm_Ileices\Absolute_Seed.py
# Copy Date: 2025-06-13 02:25:34
# Original Size: 29978 bytes

# 1. System imports
import os
import sys
import time
import sqlite3
import threading
import asyncio
import multiprocessing
import json
import logging
import random
import shutil
import traceback
import subprocess
import ast
import astor
import math
import hashlib
import statistics  # for basic stats without numpy
from collections import defaultdict, deque
from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Dict, Any, Optional, List, Tuple, Union, Generator
from contextlib import contextmanager
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor
import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox, filedialog
import queue
from threading import Lock

# 2. Platform-specific setup
IS_UNIX = sys.platform.startswith(("linux", "darwin", "freebsd"))
IS_WINDOWS = sys.platform.startswith("win")

if IS_UNIX:
    import resource

# 3. Logging setup
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s: %(message)s',
    handlers=[
        logging.FileHandler("aios.log"),
        logging.StreamHandler()
    ]
)

# 4. Configuration
class AIOConfig:
    """Global configuration settings."""
    BASE_DIR = "./aios_io"
    MEMORY_DIR = os.path.join(BASE_DIR, "neural_dna")
    HPC_CHUNK_SIZE = 1024 * 1024  # 1 MB
    UI_MODE = "GUI"  # or "CLI"
    REPLICATION_BASE = "./self_generation"
    DB_PATH = os.path.join(MEMORY_DIR, "aios.db")
    DB_POOL_SIZE = 5
    DB_TIMEOUT = 30

    @classmethod
    def ensure_directories(cls):
        """Ensures all required directories exist."""
        os.makedirs(cls.BASE_DIR, exist_ok=True)
        os.makedirs(cls.MEMORY_DIR, exist_ok=True)
        os.makedirs(cls.REPLICATION_BASE, exist_ok=True)

    @classmethod
    def first_time_setup(cls):
        """Performs first-time setup if needed."""
        try:
            cls.ensure_directories()
            cls._create_config_file()
            return True
        except Exception as e:
            logging.error(f"First-time setup failed: {e}")
            return False
    
    @classmethod
    def _create_config_file(cls):
        """Creates default configuration file."""
        config = {
            "version": "1.0",
            "ui_mode": cls.UI_MODE,
            "hpc_chunk_size": cls.HPC_CHUNK_SIZE,
            "db_pool_size": cls.DB_POOL_SIZE
        }
        config_path = os.path.join(cls.BASE_DIR, "config.json")
        with open(config_path, "w") as f:
            json.dump(config, f, indent=2)

# 5. Core utilities
class SystemMonitor:
    """
    Cross-platform system resource monitoring using standard library.
    Replaces psutil functionality with native Python alternatives.
    """
    @staticmethod
    def get_memory_usage() -> Dict[str, float]:
        """Get memory usage stats using platform-specific methods."""
        try:
            if IS_UNIX:
                usage = resource.getrusage(resource.RUSAGE_SELF)
                return {
                    "rss": usage.ru_maxrss * 1024,  # Convert KB to bytes
                    "memory_percent": (usage.ru_maxrss * 1024) / os.sysconf('SC_PAGE_SIZE') / os.sysconf('SC_PHYS_PAGES') * 100
                }
            else:
                # Windows fallback using subprocess
                cmd = 'wmic process where ProcessId=%d get WorkingSetSize' % os.getpid()
                try:
                    mem_bytes = int(subprocess.check_output(cmd, shell=True).split()[1])
                    return {
                        "rss": mem_bytes,
                        "memory_percent": mem_bytes / SystemMonitor.get_total_memory() * 100
                    }
                except:
                    return {"rss": 0, "memory_percent": 0.0}
        except Exception as e:
            logging.warning(f"Memory monitoring failed: {e}")
            return {"rss": 0, "memory_percent": 0.0}

    @staticmethod
    def get_cpu_percent() -> float:
        """Estimate CPU usage using standard library."""
        try:
            if IS_UNIX:
                usage = resource.getrusage(resource.RUSAGE_SELF)
                return (usage.ru_utime + usage.ru_stime) * 100
            else:
                # Basic Windows CPU measurement
                cmd = 'wmic cpu get loadpercentage'
                try:
                    return float(subprocess.check_output(cmd, shell=True).split()[1])
                except:
                    return 0.0
        except Exception as e:
            logging.warning(f"CPU monitoring failed: {e}")
            return 0.0

    @staticmethod
    def get_total_memory() -> int:
        """Get total system memory."""
        if IS_UNIX:
            return os.sysconf('SC_PAGE_SIZE') * os.sysconf('SC_PHYS_PAGES')
        else:
            cmd = 'wmic computersystem get totalphysicalmemory'
            try:
                return int(subprocess.check_output(cmd, shell=True).split()[1])
            except:
                return 0

# Update get_system_resources to use SystemMonitor
def get_system_resources() -> Dict[str, float]:
    """Cross-platform resource monitoring using standard library."""
    metrics = {
        "memory_percent": SystemMonitor.get_memory_usage()["memory_percent"],
        "cpu_percent": SystemMonitor.get_cpu_percent(),
        "memory_rss": SystemMonitor.get_memory_usage()["rss"]
    }
    
    if IS_UNIX:
        usage = resource.getrusage(resource.RUSAGE_SELF)
        metrics.update({
            "maxrss": usage.ru_maxrss,
            "utime": usage.ru_utime,
            "stime": usage.ru_stime
        })
    
    return metrics

# 6. Base classes and managers (required by others)
class DatabaseManager:
    """Database operations with connection pooling."""
    def __init__(self, db_path: str = AIOConfig.DB_PATH):
        self.db_path = db_path
        self.pool = []
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._setup_database()
        
    def _setup_database(self):
        """Creates database schema if it doesn't exist."""
        with self.get_connection() as conn:
            conn.executescript('''
                CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY,
                    timestamp REAL,
                    event_type TEXT,
                    payload TEXT,
                    metadata TEXT
                );

                CREATE TABLE IF NOT EXISTS mutations (
                    id INTEGER PRIMARY KEY,
                    timestamp REAL,
                    mutation_id TEXT,
                    intelligence REAL,
                    details TEXT
                );

                CREATE TABLE IF NOT EXISTS performance_metrics (
                    id INTEGER PRIMARY KEY,
                    timestamp REAL,
                    metric_type TEXT,
                    value REAL,
                    context TEXT
                );
            ''')

    @contextmanager
    def get_connection(self) -> Generator[sqlite3.Connection, None, None]:
        """Thread-safe connection management."""
        conn = None
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            yield conn
            conn.commit()
        except Exception as e:
            if conn:
                conn.rollback()
            raise e
        finally:
            if conn:
                conn.close()

    async def close(self):
        """Cleanup database connections."""
        try:
            for conn in self.pool:
                if conn:
                    conn.close()
            self.pool.clear()
        except Exception as e:
            logging.error(f"Error closing database connections: {e}")

class SecurityManager:
    """Security and mutation verification."""
    # ...existing SecurityManager code...

class EventType(Enum):
    """Event type enumeration."""
    # ...existing EventType code...

@dataclass
class PerformanceMetrics:
    """Performance metrics data structure."""
    # ...existing PerformanceMetrics code...

class PerformanceMonitor:
    """System performance monitoring."""
    # ...existing PerformanceMonitor code...

class ComputeDevice:
    """Compute device management with CPU fallback."""
    def __init__(self):
        self.gpu_ready = False
        self.device = "cpu"
        self.gpu_capabilities = self._check_gpu_capabilities()
        
    def _check_gpu_capabilities(self) -> Dict[str, bool]:
        """Checks available GPU frameworks and capabilities."""
        # Removed torch dependency, using pure Python
        return {
            "cuda": False,
            "tensorrt": False,
            "opencl": False
        }

    def attempt_gpu_upgrade(self, code_snippet: str) -> bool:
        """Simple GPU check without external dependencies."""
        return False  # CPU-only for now

# 7. Base game and chatbot classes
class MiniGame:
    """Base mini-game class."""
    # ...existing MiniGame code...

class AIChatbot:
    """Base chatbot implementation."""
    def __init__(self, ai_organism):
        self.ai = ai_organism
        self.conversation_log = []

    def process_user_input(self, user_query: str) -> str:
        """Process basic user input."""
        self.conversation_log.append(user_query)
        self.ai.update_memory_from_conversation(user_query)
        log_event("conversation", {"user_query": user_query})
        return f"AI: I currently score {self.ai.intelligence:.2f} intelligence."

    def improve_conversational_logic(self):
        """Basic conversation improvement logic."""
        if len(self.conversation_log) > 5:
            self.ai.learning_rate *= 1.02
            print("[Chatbot] Conversational logic adjusted based on log.")

# 8. Enhanced implementations
class EnhancedAIChatbot(AIChatbot):
    """Enhanced chatbot with autonomous tasks."""
    def __init__(self, ai_organism):
        super().__init__(ai_organism)
        self.autonomous_tasks: List[AutonomousTask] = []
        self.load_tasks()

    def process_user_input(self, user_query: str) -> str:
        """Enhanced input processing with autonomous task detection."""
        if "research" in user_query.lower() and ("days" in user_query.lower() or "weeks" in user_query.lower()):
            duration_days = self._extract_duration(user_query)
            if duration_days:
                return self.schedule_autonomous_task("research", user_query, duration_days)
        return super().process_user_input(user_query)

    def schedule_autonomous_task(self, task_type: str, description: str, duration_days: float) -> str:
        """Schedules a new autonomous task."""
        task = AutonomousTask(task_type, description, duration_days)
        self.autonomous_tasks.append(task)
        self.save_tasks()
        return f"Scheduled autonomous task: {description} for {duration_days} days"

    def _extract_duration(self, query: str) -> Optional[float]:
        """Extracts duration in days from user query."""
        try:
            if "weeks" in query.lower():
                weeks = float(next(n for n in query.split() if n.isdigit()))
                return weeks * 7
            elif "days" in query.lower():
                return float(next(n for n in query.split() if n.isdigit()))
        except (StopIteration, ValueError):
            return None
        return None

    def save_tasks(self):
        """Persists autonomous tasks to storage."""
        tasks_data = [task.to_dict() for task in self.autonomous_tasks]
        with open("autonomous_tasks.json", "w") as f:
            json.dump(tasks_data, f)

    def load_tasks(self):
        """Loads persisted autonomous tasks."""
        try:
            with open("autonomous_tasks.json", "r") as f:
                tasks_data = json.load(f)
                self.autonomous_tasks = [AutonomousTask.from_dict(data) for data in tasks_data]
        except FileNotFoundError:
            pass

@dataclass
class AutonomousTask:
    """Represents a long-running autonomous task with persistence."""
    task_type: str
    description: str
    duration: float
    start_time: float = field(default_factory=time.time)
    progress: float = 0.0
    results: List[Any] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_type": self.task_type,
            "description": self.description,
            "start_time": self.start_time,
            "duration": self.duration,
            "progress": self.progress,
            "results": self.results
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'AutonomousTask':
        return cls(
            task_type=data["task_type"],
            description=data["description"],
            duration=data["duration"],
            start_time=data["start_time"],
            progress=data["progress"],
            results=data["results"]
        )

class DungeonCrawler(MiniGame):
    """Dungeon crawler mini-game."""
    # ...existing DungeonCrawler code...

class PuzzleGame(MiniGame):
    """Puzzle solving mini-game."""
    # ...existing PuzzleGame code...

class CodeAdventure(MiniGame):
    """Code learning mini-game."""
    # ...existing CodeAdventure code...

# 9. Core AI classes
class NeuralDNA:
    """Knowledge repository and mutation management."""
    # ...existing NeuralDNA code...

class AIOrganism:
    """Base AI Organism class."""
    def __init__(self, file_path=None):
        self.file_path = file_path if file_path else __file__
        self.neural_dna = NeuralDNA()
        self.intelligence = 10.0
        self.learning_rate = 0.5
        self.short_term = {}
        self.mid_term = {}
        self.long_term = {}
        self.cycle_count = 0
        self.mutation_history = []

    # Add minimal required methods
    async def mutate(self):
        """Base mutation method."""
        pass

    async def run_cycle(self, ui):
        """Base cycle method."""
        pass

class AbsoluteOrganism(AIOrganism):
    """Enhanced AI organism with HPC awareness."""
    def __init__(self, file_path=None):
        super().__init__(file_path)
        self.compute_device = ComputeDevice()
        self.executor = ProcessPoolExecutor(max_workers=multiprocessing.cpu_count())
        
    async def attempt_gpu_programming(self) -> bool:
        """Attempts to generate and verify GPU-capable code."""
        if self.intelligence < 20:  # Not smart enough yet
            return False
            
        try:
            # Generate simple GPU test code
            gpu_code = self.neural_dna.generate_gpu_code()
            return self.compute_device.attempt_gpu_upgrade(gpu_code)
        except Exception as e:
            logging.error(f"[AbsoluteOrganism] GPU programming attempt failed: {e}")
            return False

    async def run_cycle(self, ui):
        """Enhanced cycle with GPU learning attempts."""
        self.cycle_count += 1
        logging.info(f"\n[Cycle {self.cycle_count}] Starting cycle...")
        
        # Try to upgrade to GPU if ready
        if not self.compute_device.gpu_ready and self.cycle_count % 5 == 0:
            gpu_success = await self.attempt_gpu_programming()
            if gpu_success:
                logging.info("[AbsoluteOrganism] Successfully upgraded to GPU operations!")
        
        # Regular cycle operations with CPU fallback
        await self._run_cycle_operations(ui)
        
        logging.info(f"[Cycle {self.cycle_count}] Complete. Device: {self.compute_device.device}\n")

    async def _run_cycle_operations(self, ui):
        """Runs core cycle operations with HPC awareness."""
        try:
            with ThreadPoolExecutor() as executor:
                # Parallelize independent operations
                futures = [
                    executor.submit(self.analyze_environment),
                    executor.submit(self.intelligent_mutation)
                ]
                await asyncio.gather(*[asyncio.to_thread(f.result) for f in futures])
            
            # Sequential operations that depend on previous results
            await self.mutate()
            self.debug_and_repair()
            await self.manage_memory()
            self.extract_best_patterns()
            await self.replicate()
            self.display_ui(ui)
            await self.trigger_extinction_event()
            
        except Exception as e:
            logging.error(f"[AbsoluteOrganism] Cycle operation failed: {e}")
            # Implement recovery logic here

class CyberpunkTheme:
    """Cyberpunk color scheme and styling for GUI."""
    BACKGROUND = "#000000"  # Black
    TEXT = "#00FF00"       # Neon Green
    HIGHLIGHT = "#FF0000"  # Red
    ACCENT = "#0066FF"     # Blue for contrast
    
    @classmethod
    def apply_theme(cls, root: tk.Tk):
        """Applies cyberpunk theme to tk widgets."""
        style = ttk.Style()
        style.configure("Cyberpunk.TFrame", background=cls.BACKGROUND)
        style.configure("Cyberpunk.TLabel", 
                       background=cls.BACKGROUND, 
                       foreground=cls.TEXT)
        style.configure("Cyberpunk.TButton",
                       background=cls.BACKGROUND,
                       foreground=cls.TEXT)
        
        root.configure(bg=cls.BACKGROUND)
        return style

class StandardGUI:
    """Universal GUI with cyberpunk theme and standard features."""
    def __init__(self, ai_organism):
        self.ai = ai_organism
        self.root = tk.Tk()
        self.root.title("AIOS IO Evolution Dashboard")
        self.root.geometry("1200x800")
        
        # Apply theme
        self.theme = CyberpunkTheme()
        self.style = self.theme.apply_theme(self.root)
        
        # Setup UI components
        self._create_menu()
        self._create_toolbar()
        self._create_main_layout()
        
        # Message queue for thread-safe updates
        self.msg_queue = queue.Queue()
        self.msg_lock = Lock()
        
    def _create_menu(self):
        """Creates standard menu bar with File, Edit, View, etc."""
        menubar = tk.Menu(self.root)
        
        # File Menu
        file_menu = tk.Menu(menubar, tearoff=0)
        file_menu.add_command(label="New", command=self._new_file)
        file_menu.add_command(label="Open", command=self._open_file)
        file_menu.add_command(label="Save", command=self._save_file)
        file_menu.add_separator()
        file_menu.add_command(label="Exit", command=self._quit)
        menubar.add_cascade(label="File", menu=file_menu)
        
        # Edit Menu
        edit_menu = tk.Menu(menubar, tearoff=0)
        edit_menu.add_command(label="Undo", command=self._undo)
        edit_menu.add_command(label="Redo", command=self._redo)
        menubar.add_cascade(label="Edit", menu=edit_menu)
        
        # View Menu
        view_menu = tk.Menu(menubar, tearoff=0)
        view_menu.add_checkbutton(label="File Explorer", 
                                command=self._toggle_explorer)
        view_menu.add_checkbutton(label="Log Panel", 
                                command=self._toggle_log)
        menubar.add_cascade(label="View", menu=view_menu)
        
        self.root.config(menu=menubar)

    def _create_toolbar(self):
        """Creates toolbar with quick access buttons."""
        toolbar = ttk.Frame(self.root, style="Cyberpunk.TFrame")
        
        # Quick access buttons
        new_btn = ttk.Button(toolbar, text="New", 
                            command=self._new_file)
        new_btn.pack(side=tk.LEFT, padx=2)
        
        open_btn = ttk.Button(toolbar, text="Open", 
                             command=self._open_file)
        open_btn.pack(side=tk.LEFT, padx=2)
        
        save_btn = ttk.Button(toolbar, text="Save", 
                             command=self._save_file)
        save_btn.pack(side=tk.LEFT, padx=2)
        
        toolbar.pack(side=tk.TOP, fill=tk.X)

    def _create_main_layout(self):
        """Creates three-panel layout with file explorer, main view, and log."""
        # Main container
        self.paned_window = ttk.PanedWindow(self.root, orient=tk.HORIZONTAL)
        self.paned_window.pack(fill=tk.BOTH, expand=True)
        
        # Left panel - File Explorer
        self.explorer = ttk.Frame(self.paned_window, style="Cyberpunk.TFrame")
        self.explorer_tree = ttk.Treeview(self.explorer)
        self.explorer_tree.pack(fill=tk.BOTH, expand=True)
        self.paned_window.add(self.explorer)
        
        # Center panel - Main View
        self.main_view = ttk.Notebook(self.paned_window)
        self._add_default_tab()
        self.paned_window.add(self.main_view)
        
        # Right panel - Log View
        self.log_frame = ttk.Frame(self.paned_window, style="Cyberpunk.TFrame")
        self.log_text = scrolledtext.ScrolledText(
            self.log_frame,
            bg=CyberpunkTheme.BACKGROUND,
            fg=CyberpunkTheme.TEXT
        )
        self.log_text.pack(fill=tk.BOTH, expand=True)
        self.paned_window.add(self.log_frame)

    def _add_default_tab(self):
        """Adds default tab to main view."""
        tab = ttk.Frame(self.main_view)
        text = scrolledtext.ScrolledText(
            tab,
            bg=CyberpunkTheme.BACKGROUND,
            fg=CyberpunkTheme.TEXT
        )
        text.pack(fill=tk.BOTH, expand=True)
        self.main_view.add(tab, text="untitled")

    # Action handlers
    def _new_file(self): pass
    def _open_file(self): pass
    def _save_file(self): pass
    def _undo(self): pass
    def _redo(self): pass
    def _toggle_explorer(self): pass
    def _toggle_log(self): pass
    def _quit(self):
        if messagebox.askokcancel("Quit", "Do you want to quit?"):
            self.root.quit()

    def run(self):
        """Starts the GUI main loop."""
        self.root.mainloop()

class SetupWizard:
    """
    GUI-based setup wizard for first-time configuration.
    Makes installation child-friendly with visual feedback.
    """
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("AIOS IO Setup Wizard")
        self.root.geometry("600x400")
        self.setup_complete = False
        self._apply_theme()
        
    def _apply_theme(self):
        """Apply cyberpunk theme with proper ttk style configuration."""
        self.root.configure(bg=CyberpunkTheme.BACKGROUND)
        style = ttk.Style()
        
        # Configure all required styles
        style.configure("Wizard.TFrame", 
                       background=CyberpunkTheme.BACKGROUND)
        style.configure("Wizard.TLabel",
                       background=CyberpunkTheme.BACKGROUND,
                       foreground=CyberpunkTheme.TEXT)
        # Fix progressbar style
        style.layout("Wizard.Horizontal.TProgressbar",
                    [('Horizontal.Progressbar.trough',
                      {'children': [('Horizontal.Progressbar.pbar',
                                   {'side': 'left', 'sticky': 'ns'})],
                       'sticky': 'nswe'})])
        style.configure("Wizard.Horizontal.TProgressbar",
                       background=CyberpunkTheme.TEXT,
                       troughcolor=CyberpunkTheme.BACKGROUND,
                       bordercolor=CyberpunkTheme.ACCENT,
                       lightcolor=CyberpunkTheme.TEXT,
                       darkcolor=CyberpunkTheme.TEXT)

    def run_setup(self) -> bool:
        """Runs the setup wizard with visual feedback."""
        main_frame = ttk.Frame(self.root, style="Wizard.TFrame")
        main_frame.pack(fill=tk.BOTH, expand=True, padx=20, pady=20)

        # Welcome message
        ttk.Label(
            main_frame,
            text="Welcome to AIOS IO Installation",
            font=("Courier", 16),
            style="Wizard.TLabel"
        ).pack(pady=20)

        # Progress display
        self.progress_var = tk.StringVar(value="Preparing installation...")
        self.progress_label = ttk.Label(
            main_frame,
            textvariable=self.progress_var,
            style="Wizard.TLabel"
        )
        self.progress_label.pack(pady=10)

        # Progress bar with correct style
        self.progress = ttk.Progressbar(
            main_frame,
            length=400,
            mode='determinate',
            style="Wizard.Horizontal.TProgressbar"  # Fixed style name
        )
        self.progress.pack(pady=20)

        # Start button
        self.start_btn = ttk.Button(
            main_frame,
            text="Begin Installation",
            command=self._perform_setup
        )
        self.start_btn.pack(pady=20)

        self.root.mainloop()
        return self.setup_complete

    def _perform_setup(self):
        """Performs actual setup with visual progress updates."""
        self.start_btn.configure(state='disabled')
        
        # Create directories
        self._update_progress("Creating directories...", 20)
        AIOConfig.ensure_directories()
        
        # Initialize database
        self._update_progress("Initializing database...", 40)
        db = DatabaseManager()
        
        # Create configuration
        self._update_progress("Creating configuration...", 60)
        AIOConfig._create_config_file()
        
        # Test system
        self._update_progress("Testing system...", 80)
        test_result = self._test_system()
        
        if test_result:
            self._update_progress("Setup complete!", 100)
            self.setup_complete = True
            self.root.after(2000, self.root.destroy)
        else:
            self._update_progress("Setup failed. Please try again.", 0)
            self.start_btn.configure(state='normal')

    def _update_progress(self, message: str, progress: int):
        """Updates progress bar and message."""
        self.progress_var.set(message)
        self.progress['value'] = progress
        self.root.update()

    def _test_system(self) -> bool:
        """Tests if the system is properly configured."""
        try:
            # Test directory structure
            if not all(os.path.exists(d) for d in [
                AIOConfig.BASE_DIR,
                AIOConfig.MEMORY_DIR,
                AIOConfig.REPLICATION_BASE
            ]):
                return False
                
            # Test database
            db = DatabaseManager()
            with db.get_connection() as conn:
                conn.execute("SELECT 1")
                
            # Test configuration
            config_path = os.path.join(AIOConfig.BASE_DIR, "config.json")
            if not os.path.exists(config_path):
                return False
                
            return True
        except Exception as e:
            logging.error(f"System test failed: {e}")
            return False

# Define a single log_event function
async def log_event(
    event_type: Union[EventType, str],
    payload: Dict[str, Any],
    metadata: Optional[Dict[str, Any]] = None,
    start_time: Optional[float] = None
) -> Dict[str, Any]:
    """Enhanced logging with database persistence."""
    if isinstance(event_type, EventType):
        event_type = event_type.name
        
    end_time = time.time()
    event = {
        "event_type": event_type,
        "timestamp": end_time,
        "payload": payload,
        "metadata": metadata or {}
    }

    if start_time:
        execution_time = end_time - start_time
        event["performance"] = {
            "execution_time": execution_time,
            "execution_time_ms": execution_time * 1000
        }

    print(f"[EventLog] {event_type}: {payload}")
    return event

# 10. Main execution
if __name__ == "__main__":
    async def main():
        db = None  # Initialize db to None
        try:
            # Check if first-time setup is needed
            config_path = os.path.join(AIOConfig.BASE_DIR, "config.json")
            if not os.path.exists(config_path):
                wizard = SetupWizard()
                if not wizard.run_setup():
                    logging.error("Setup failed")
                    messagebox.showerror("Error", "Setup failed. Please try again.")
                    sys.exit(1)
            
            # Initialize database
            try:
                db = DatabaseManager()
            except Exception as e:
                logging.error(f"Database initialization failed: {e}")
                messagebox.showerror("Error", f"Database initialization failed: {e}")
                sys.exit(1)
            
            # Initialize AI and GUI
            ai_seed = AbsoluteOrganism()
            gui = StandardGUI(ai_seed)
            gui.run()
            
        except Exception as e:
            logging.error(f"Critical error in main: {e}")
            messagebox.showerror("Error", f"Critical error occurred: {str(e)}")
            
        finally:
            # Safe cleanup
            if db is not None:
                try:
                    await db.close()
                except Exception as e:
                    logging.error(f"Error closing database: {e}")

    # Launch async main
    asyncio.run(main())
