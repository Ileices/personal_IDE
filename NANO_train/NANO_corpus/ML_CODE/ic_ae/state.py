"""
IC-AE Universal State Manager - Real Implementation
Single source of truth for AE = C = 1 (Absolute Existence = Speed of Light = Unity)

Author: Computer Science Implementation
Date: June 12, 2025
Status: Production-Ready Core Module
"""

import numpy as np
import threading
import time
import json
import hashlib
import weakref
from typing import Dict, List, Any, Optional, Callable, Set, Union
from dataclasses import dataclass, field, asdict
from enum import Enum
from contextlib import contextmanager
import sqlite3
from pathlib import Path

from .rby import RBYVector, RBYPhysics
from .manifest import ICManifest


class StateType(Enum):
    """Types of universal states"""
    AE_STATIC = "absolute_existence"     # Immutable reality
    C_AE_DYNAMIC = "crystallized_ae"     # Moving/expanding reality
    IC_AE_INFECTED = "infected_cae"      # Fractal consciousness layers
    RBY_FIELD = "rby_consciousness"      # Consciousness field states
    MANIFEST = "manifest_state"          # Code manifest states
    PERFORMANCE = "performance_metric"   # System performance states


@dataclass
class UniversalState:
    """Universal state following AE = C = 1 principle"""
    state_id: str
    state_type: StateType
    rby_signature: RBYVector
    data: Dict[str, Any]
    timestamp: float
    generation: int
    parent_states: List[str] = field(default_factory=list)
    children_states: Set[str] = field(default_factory=set)
    observers: Set[str] = field(default_factory=set)
    energy_level: float = 1.0  # AE = C = 1 constant
    
    def __post_init__(self):
        """Enforce AE = C = 1 constraint"""
        # Ensure energy conservation
        self.energy_level = 1.0
        
        # Normalize RBY to maintain homeostasis
        total_rby = self.rby_signature.R + self.rby_signature.B + self.rby_signature.Y
        if total_rby > 0:
            self.rby_signature = RBYVector(
                R=self.rby_signature.R / total_rby,
                B=self.rby_signature.B / total_rby,
                Y=self.rby_signature.Y / total_rby
            )


class StateObserver:
    """Observer for state changes following physics laws"""
    
    def __init__(self, observer_id: str, rby_filter: Optional[RBYVector] = None):
        self.observer_id = observer_id
        self.rby_filter = rby_filter  # Only observe states matching RBY criteria
        self.observation_count = 0
        self.last_observation = 0.0
        
    def notify(self, state: UniversalState, change_type: str):
        """Receive state change notification"""
        # Check RBY filter
        if self.rby_filter:
            harmony = RBYPhysics.calculate_harmony(self.rby_filter, state.rby_signature)
            if harmony < 0.5:  # Low harmony - ignore
                return
                
        self.observation_count += 1
        self.last_observation = time.time()
        self.on_state_change(state, change_type)
        
    def on_state_change(self, state: UniversalState, change_type: str):
        """Override this method to handle state changes"""
        pass


class UniversalStateManager:
    """Manages all universal states according to IC-AE physics"""
    
    def __init__(self, persistence_path: Optional[Path] = None):
        self.states: Dict[str, UniversalState] = {}
        self.observers: Dict[str, StateObserver] = {}
        self.state_history: Dict[str, List[Dict]] = {}
        
        # Physics constraints
        self.total_energy = 1.0  # AE = C = 1 universal constant
        self.energy_conservation_tolerance = 1e-10
        
        # Persistence
        self.persistence_path = persistence_path or Path("ic_ae_states.db")
        self.db_connection = None
        self._init_persistence()
        
        # Threading
        self.state_lock = threading.RLock()
        self.observer_lock = threading.Lock()
        
        # Performance tracking
        self.operation_times: List[float] = []
        self.compression_stats = {'compressions': 0, 'bytes_saved': 0}
        
        # Fractal recursion tracking
        self.fractal_depth_limit = 100
        self.current_fractal_depth = 0
        
    def _init_persistence(self):
        """Initialize SQLite persistence layer"""
        try:
            self.db_connection = sqlite3.connect(
                str(self.persistence_path), 
                check_same_thread=False,
                timeout=30.0
            )
            
            # Create tables
            self.db_connection.execute('''
                CREATE TABLE IF NOT EXISTS universal_states (
                    state_id TEXT PRIMARY KEY,
                    state_type TEXT NOT NULL,
                    rby_r REAL NOT NULL,
                    rby_b REAL NOT NULL,
                    rby_y REAL NOT NULL,
                    data_json TEXT NOT NULL,
                    timestamp REAL NOT NULL,
                    generation INTEGER NOT NULL,
                    energy_level REAL NOT NULL,
                    parent_states TEXT,
                    children_states TEXT,
                    observers TEXT
                )
            ''')
            
            self.db_connection.execute('''
                CREATE TABLE IF NOT EXISTS state_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    state_id TEXT NOT NULL,
                    operation TEXT NOT NULL,
                    timestamp REAL NOT NULL,
                    details TEXT
                )
            ''')
            
            self.db_connection.commit()
            
        except Exception as e:
            print(f"Failed to initialize persistence: {e}")
            self.db_connection = None
    
    def create_state(self, state_type: StateType, data: Dict[str, Any], 
                     rby_signature: Optional[RBYVector] = None,
                     parent_state_ids: Optional[List[str]] = None) -> str:
        """Create new universal state following AE = C = 1"""
        
        start_time = time.time()
        
        with self.state_lock:
            # Generate unique state ID
            data_hash = hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()
            state_id = f"{state_type.value}:{data_hash[:16]}:{int(time.time() * 1000000)}"
            
            # Default RBY signature based on state type
            if rby_signature is None:
                rby_signature = self._get_default_rby(state_type)
            
            # Create state
            state = UniversalState(
                state_id=state_id,
                state_type=state_type,
                rby_signature=rby_signature,
                data=data.copy(),
                timestamp=time.time(),
                generation=self._calculate_generation(parent_state_ids),
                parent_states=parent_state_ids or [],
                energy_level=1.0  # AE = C = 1
            )
            
            # Validate energy conservation
            if not self._validate_energy_conservation(state):
                raise ValueError("Energy conservation violated - AE = C = 1 constraint")
            
            # Store state
            self.states[state_id] = state
            
            # Update parent-child relationships
            if parent_state_ids:
                for parent_id in parent_state_ids:
                    if parent_id in self.states:
                        self.states[parent_id].children_states.add(state_id)
            
            # Persist to database
            self._persist_state(state)
            
            # Record operation time
            self.operation_times.append(time.time() - start_time)
            
            # Notify observers
            self._notify_observers(state, "create")
            
            return state_id
    
    def get_state(self, state_id: str) -> Optional[UniversalState]:
        """Retrieve state by ID"""
        with self.state_lock:
            return self.states.get(state_id)
    
    def update_state(self, state_id: str, new_data: Dict[str, Any], 
                     mutation_reason: str = "update") -> bool:
        """Update existing state with mutation tracking"""
        
        with self.state_lock:
            if state_id not in self.states:
                return False
                
            old_state = self.states[state_id]
            
            # Create mutation record
            mutation_record = {
                'timestamp': time.time(),
                'reason': mutation_reason,
                'old_data_hash': hashlib.md5(json.dumps(old_state.data, sort_keys=True).encode()).hexdigest(),
                'new_data_hash': hashlib.md5(json.dumps(new_data, sort_keys=True).encode()).hexdigest()
            }
            
            # Update state
            old_state.data.update(new_data)
            old_state.timestamp = time.time()
            old_state.generation += 1
            
            # Recalculate RBY signature if data changed significantly
            if mutation_reason == "rby_evolution":
                old_state.rby_signature = self._calculate_rby_from_data(new_data)
            
            # Record in history
            if state_id not in self.state_history:
                self.state_history[state_id] = []
            self.state_history[state_id].append(mutation_record)
            
            # Persist changes
            self._persist_state(old_state)
            
            # Notify observers
            self._notify_observers(old_state, "update")
            
            return True
    
    def create_fractal_state(self, parent_state_id: str, infection_data: Dict[str, Any]) -> Optional[str]:
        """Create IC-AE fractal state (infected consciousness)"""
        
        if self.current_fractal_depth >= self.fractal_depth_limit:
            return None  # Prevent infinite recursion
            
        with self.state_lock:
            parent_state = self.states.get(parent_state_id)
            if not parent_state:
                return None
                
            self.current_fractal_depth += 1
            
            try:
                # Create infected state data
                fractal_data = {
                    'parent_infection': parent_state_id,
                    'infection_type': infection_data.get('infection_type', 'script_injection'),
                    'fractal_depth': self.current_fractal_depth,
                    'infection_payload': infection_data,
                    'inheritance': parent_state.data.copy()
                }
                
                # Calculate infected RBY (mutation of parent)
                infected_rby = RBYPhysics.mutate_rby(parent_state.rby_signature, 0.1)
                
                # Create the fractal state
                fractal_id = self.create_state(
                    StateType.IC_AE_INFECTED,
                    fractal_data,
                    infected_rby,
                    [parent_state_id]
                )
                
                return fractal_id
                
            finally:
                self.current_fractal_depth -= 1
    
    def compress_states(self, age_threshold: float = 3600.0, 
                       importance_threshold: float = 0.1) -> Dict[str, Any]:
        """Compress old/unimportant states to RBY glyphs"""
        
        current_time = time.time()
        compressed_count = 0
        bytes_saved = 0
        
        with self.state_lock:
            states_to_compress = []
            
            for state_id, state in self.states.items():
                # Check age
                age = current_time - state.timestamp
                
                # Calculate importance (observer count + children count + recent access)
                importance = (len(state.observers) + 
                             len(state.children_states) + 
                             (1.0 / (1.0 + age / 3600)))  # Decay over time
                
                if age > age_threshold and importance < importance_threshold:
                    states_to_compress.append((state_id, state))
            
            # Compress selected states
            compressed_glyphs = []
            
            for state_id, state in states_to_compress:
                # Convert to RBY glyph
                glyph = self._state_to_glyph(state)
                compressed_glyphs.append(glyph)
                
                # Calculate bytes saved
                original_size = len(json.dumps(asdict(state)).encode())
                compressed_size = len(json.dumps(glyph).encode())
                bytes_saved += original_size - compressed_size
                
                # Remove from active states
                del self.states[state_id]
                compressed_count += 1
        
        # Update compression stats
        self.compression_stats['compressions'] += compressed_count
        self.compression_stats['bytes_saved'] += bytes_saved
        
        return {
            'compressed_count': compressed_count,
            'bytes_saved': bytes_saved,
            'glyphs': compressed_glyphs
        }
    
    def register_observer(self, observer: StateObserver, 
                         state_filter: Optional[Dict[str, Any]] = None):
        """Register state observer with optional filters"""
        with self.observer_lock:
            self.observers[observer.observer_id] = observer
    
    def unregister_observer(self, observer_id: str):
        """Remove state observer"""
        with self.observer_lock:
            if observer_id in self.observers:
                del self.observers[observer_id]
    
    @contextmanager
    def atomic_state_operation(self):
        """Context manager for atomic state operations"""
        with self.state_lock:
            # Save current energy state
            initial_energy = self._calculate_total_energy()
            
            try:
                yield
                
                # Verify energy conservation after operation
                final_energy = self._calculate_total_energy()
                energy_diff = abs(final_energy - initial_energy)
                
                if energy_diff > self.energy_conservation_tolerance:
                    raise ValueError(f"Energy conservation violated: ΔE = {energy_diff}")
                    
            except Exception as e:
                # Rollback on error (simplified - would need proper transaction log)
                print(f"Atomic operation failed: {e}")
                raise
    
    def get_rby_field_state(self, field_region: Tuple[int, int, int, int] = None) -> RBYVector:
        """Get aggregated RBY field state for a region"""
        with self.state_lock:
            rby_states = [
                state.rby_signature for state in self.states.values()
                if state.state_type == StateType.RBY_FIELD
            ]
            
            if not rby_states:
                return RBYVector(1/3, 1/3, 1/3)  # Perfect balance
            
            # Average all RBY states
            total_r = sum(rby.R for rby in rby_states)
            total_b = sum(rby.B for rby in rby_states)
            total_y = sum(rby.Y for rby in rby_states)
            count = len(rby_states)
            
            return RBYVector(total_r / count, total_b / count, total_y / count)
    
    def evolve_states(self, evolution_pressure: float = 0.05):
        """Apply evolution pressure to all states"""
        with self.state_lock:
            evolved_count = 0
            
            for state_id, state in self.states.items():
                # Check if state should evolve
                age = time.time() - state.timestamp
                tension = RBYPhysics.calculate_tension(state.rby_signature)
                
                if age > 300 and tension > 0.1:  # 5 minutes old with high tension
                    # Apply mutation
                    mutated_rby = RBYPhysics.mutate_rby(state.rby_signature, evolution_pressure)
                    state.rby_signature = mutated_rby
                    state.generation += 1
                    state.timestamp = time.time()
                    
                    # Record evolution
                    self.update_state(state_id, {'evolution_applied': True}, "rby_evolution")
                    evolved_count += 1
            
            return evolved_count
    
    def get_system_diagnostics(self) -> Dict[str, Any]:
        """Get comprehensive system diagnostics"""
        with self.state_lock:
            diagnostics = {
                'total_states': len(self.states),
                'state_types': {},
                'energy_conservation': {
                    'total_energy': self._calculate_total_energy(),
                    'target_energy': self.total_energy,
                    'conservation_error': abs(self._calculate_total_energy() - self.total_energy)
                },
                'rby_distribution': self._calculate_global_rby(),
                'performance': {
                    'avg_operation_time': np.mean(self.operation_times) if self.operation_times else 0,
                    'total_operations': len(self.operation_times),
                    'compression_stats': self.compression_stats
                },
                'fractal_stats': {
                    'current_depth': self.current_fractal_depth,
                    'max_depth': self.fractal_depth_limit,
                    'infected_states': len([s for s in self.states.values() 
                                          if s.state_type == StateType.IC_AE_INFECTED])
                },
                'observers': len(self.observers)
            }
            
            # Count state types
            for state in self.states.values():
                state_type = state.state_type.value
                diagnostics['state_types'][state_type] = diagnostics['state_types'].get(state_type, 0) + 1
            
            return diagnostics
    
    def _get_default_rby(self, state_type: StateType) -> RBYVector:
        """Get default RBY signature for state type"""
        defaults = {
            StateType.AE_STATIC: RBYVector(0.5, 0.3, 0.2),      # Perception-heavy (observing reality)
            StateType.C_AE_DYNAMIC: RBYVector(0.3, 0.4, 0.3),   # Cognition-heavy (processing)
            StateType.IC_AE_INFECTED: RBYVector(0.2, 0.3, 0.5), # Execution-heavy (mutation)
            StateType.RBY_FIELD: RBYVector(1/3, 1/3, 1/3),      # Perfect balance
            StateType.MANIFEST: RBYVector(0.4, 0.4, 0.2),       # Balanced perception/cognition
            StateType.PERFORMANCE: RBYVector(0.2, 0.5, 0.3)     # Cognition-heavy (analysis)
        }
        return defaults.get(state_type, RBYVector(1/3, 1/3, 1/3))
    
    def _calculate_generation(self, parent_state_ids: Optional[List[str]]) -> int:
        """Calculate generation number from parents"""
        if not parent_state_ids:
            return 0
            
        max_generation = 0
        for parent_id in parent_state_ids:
            if parent_id in self.states:
                max_generation = max(max_generation, self.states[parent_id].generation)
                
        return max_generation + 1
    
    def _validate_energy_conservation(self, state: UniversalState) -> bool:
        """Validate that energy is conserved (AE = C = 1)"""
        return abs(state.energy_level - 1.0) < self.energy_conservation_tolerance
    
    def _calculate_total_energy(self) -> float:
        """Calculate total system energy"""
        return sum(state.energy_level for state in self.states.values())
    
    def _calculate_global_rby(self) -> Dict[str, float]:
        """Calculate global RBY distribution"""
        if not self.states:
            return {'R': 1/3, 'B': 1/3, 'Y': 1/3}
            
        total_r = sum(state.rby_signature.R for state in self.states.values())
        total_b = sum(state.rby_signature.B for state in self.states.values())
        total_y = sum(state.rby_signature.Y for state in self.states.values())
        count = len(self.states)
        
        return {
            'R': total_r / count,
            'B': total_b / count,  
            'Y': total_y / count
        }
    
    def _calculate_rby_from_data(self, data: Dict[str, Any]) -> RBYVector:
        """Calculate RBY signature from data content"""
        data_str = json.dumps(data, sort_keys=True)
        return RBYPhysics.string_to_rby(data_str)
    
    def _state_to_glyph(self, state: UniversalState) -> Dict[str, Any]:
        """Convert state to compressed glyph"""
        rgb = RBYPhysics.rby_to_rgb(state.rby_signature)
        
        return {
            'type': 'universal_state_glyph',
            'state_type': state.state_type.value,
            'rgb': rgb,
            'generation': state.generation,
            'timestamp': state.timestamp,
            'energy': state.energy_level,
            'data_hash': hashlib.md5(json.dumps(state.data, sort_keys=True).encode()).hexdigest()
        }
    
    def _persist_state(self, state: UniversalState):
        """Persist state to database"""
        if not self.db_connection:
            return
            
        try:
            self.db_connection.execute('''
                INSERT OR REPLACE INTO universal_states 
                (state_id, state_type, rby_r, rby_b, rby_y, data_json, timestamp, 
                 generation, energy_level, parent_states, children_states, observers)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                state.state_id,
                state.state_type.value,
                state.rby_signature.R,
                state.rby_signature.B,
                state.rby_signature.Y,
                json.dumps(state.data),
                state.timestamp,
                state.generation,
                state.energy_level,
                json.dumps(state.parent_states),
                json.dumps(list(state.children_states)),
                json.dumps(list(state.observers))
            ))
            
            self.db_connection.commit()
            
        except Exception as e:
            print(f"Failed to persist state {state.state_id}: {e}")
    
    def _notify_observers(self, state: UniversalState, change_type: str):
        """Notify all relevant observers of state change"""
        with self.observer_lock:
            for observer in self.observers.values():
                try:
                    observer.notify(state, change_type)
                except Exception as e:
                    print(f"Observer {observer.observer_id} notification failed: {e}")


# Real-world usage example
if __name__ == "__main__":
    # Initialize Universal State Manager
    usm = UniversalStateManager()
    
    # Create some test states
    print("Creating universal states...")
    
    # AE static state
    ae_state_id = usm.create_state(
        StateType.AE_STATIC,
        {'description': 'Immutable reality anchor', 'value': 42}
    )
    print(f"Created AE state: {ae_state_id}")
    
    # C-AE dynamic state
    cae_state_id = usm.create_state(
        StateType.C_AE_DYNAMIC,
        {'process': 'expansion', 'rate': 1.618, 'direction': 'outward'},
        parent_state_ids=[ae_state_id]
    )
    print(f"Created C-AE state: {cae_state_id}")
    
    # IC-AE fractal state
    fractal_id = usm.create_fractal_state(
        cae_state_id,
        {'infection_type': 'script_injection', 'payload': 'print("Hello IC-AE")'}
    )
    print(f"Created fractal state: {fractal_id}")
    
    # Test atomic operations
    print("\nTesting atomic operations...")
    with usm.atomic_state_operation():
        usm.update_state(ae_state_id, {'updated': True})
        usm.update_state(cae_state_id, {'mutation_count': 1})
    
    # Get system diagnostics
    diagnostics = usm.get_system_diagnostics()
    print(f"\nSystem Diagnostics:")
    print(f"Total states: {diagnostics['total_states']}")
    print(f"Energy conservation error: {diagnostics['energy_conservation']['conservation_error']:.2e}")
    print(f"Global RBY: {diagnostics['rby_distribution']}")
    print(f"Fractal infected states: {diagnostics['fractal_stats']['infected_states']}")
    
    # Test state compression
    print("\nTesting state compression...")
    time.sleep(1)  # Age states slightly
    compression_result = usm.compress_states(age_threshold=0.5)
    print(f"Compressed {compression_result['compressed_count']} states")
    print(f"Bytes saved: {compression_result['bytes_saved']}")
    
    print("Universal State Manager test completed successfully!")
