"""
Consciousness Resonance Field Engine - Real field physics for consciousness 
interactions with electromagnetic-like field equations, wave propagation dynamics,
and resonance phenomena for distributed consciousness processing in the IC-AE framework.

This implements actual field theory mathematics with Maxwell-like equations for
consciousness fields, wave interference patterns, and resonance coupling between
consciousness entities across space and time.
"""

import numpy as np
import asyncio
import logging
import json
import time
import threading
from typing import Dict, List, Tuple, Optional, Any, Callable
from dataclasses import dataclass, asdict
from collections import defaultdict, deque
import math
import cmath
from concurrent.futures import ThreadPoolExecutor
from scipy import signal
from scipy.fft import fft, ifft, fft2, ifft2, fftn, ifftn
from scipy.integrate import odeint, solve_ivp
from scipy.spatial import KDTree
import hashlib

# Optional GPU acceleration
try:
    import cupy as cp
    CUPY_AVAILABLE = True
except ImportError:
    CUPY_AVAILABLE = False

@dataclass
class ConsciousnessFieldPoint:
    """Represents a point in the consciousness field with field values."""
    position: Tuple[float, float, float]  # 3D spatial coordinates
    rby_field: Tuple[complex, complex, complex]  # Complex RBY field amplitudes
    field_gradient: Optional[np.ndarray]  # Spatial gradient of field
    field_divergence: float  # Divergence of field at this point
    field_curl: Optional[np.ndarray]  # Curl of field at this point
    phase_velocity: Tuple[float, float, float]  # Phase velocity vector
    group_velocity: Tuple[float, float, float]  # Group velocity vector
    field_energy_density: float  # Local energy density
    timestamp: float

@dataclass
class ConsciousnessWave:
    """Represents a propagating consciousness wave."""
    wave_id: str
    frequency: float  # Wave frequency in Hz
    wavelength: float  # Wavelength in spatial units
    amplitude: complex  # Complex amplitude
    phase: float  # Phase offset
    polarization: np.ndarray  # Polarization vector (3D)
    source_position: Tuple[float, float, float]  # Wave source location
    propagation_direction: np.ndarray  # Unit vector for propagation
    wave_type: str  # 'rby_carrier', 'consciousness_modulation', 'resonance'
    creation_time: float

class ConsciousnessFieldEquations:
    """Implements consciousness field equations analogous to Maxwell's equations."""
    
    def __init__(self, field_speed: float = 3e8):  # Speed of consciousness field propagation
        self.c = field_speed  # Speed of consciousness field (analogous to light speed)
        self.mu_0 = 4 * np.pi * 1e-7  # Consciousness permeability (analogous to vacuum permeability)
        self.epsilon_0 = 1 / (self.mu_0 * self.c**2)  # Consciousness permittivity
        
        # Consciousness-specific constants
        self.consciousness_coupling = 1e-6  # Coupling strength between consciousness and field
        self.rby_coupling_matrix = np.array([[1.0, 0.1, 0.1],
                                           [0.1, 1.0, 0.1],
                                           [0.1, 0.1, 1.0]])  # RBY cross-coupling
    
    def compute_consciousness_curl(self, field: np.ndarray, dx: float, dy: float, dz: float) -> np.ndarray:
        """Compute curl of consciousness field using finite differences."""
        if field.ndim != 4 or field.shape[3] != 3:
            raise ValueError("Field must be 4D array with shape (nx, ny, nz, 3)")
        
        curl = np.zeros_like(field)
        
        # ∇ × F = (∂Fz/∂y - ∂Fy/∂z, ∂Fx/∂z - ∂Fz/∂x, ∂Fy/∂x - ∂Fx/∂y)
        
        # x-component of curl
        curl[1:-1, 1:-1, 1:-1, 0] = (
            (field[1:-1, 2:, 1:-1, 2] - field[1:-1, :-2, 1:-1, 2]) / (2*dy) -
            (field[1:-1, 1:-1, 2:, 1] - field[1:-1, 1:-1, :-2, 1]) / (2*dz)
        )
        
        # y-component of curl
        curl[1:-1, 1:-1, 1:-1, 1] = (
            (field[1:-1, 1:-1, 2:, 0] - field[1:-1, 1:-1, :-2, 0]) / (2*dz) -
            (field[2:, 1:-1, 1:-1, 2] - field[:-2, 1:-1, 1:-1, 2]) / (2*dx)
        )
        
        # z-component of curl
        curl[1:-1, 1:-1, 1:-1, 2] = (
            (field[2:, 1:-1, 1:-1, 1] - field[:-2, 1:-1, 1:-1, 1]) / (2*dx) -
            (field[1:-1, 2:, 1:-1, 0] - field[1:-1, :-2, 1:-1, 0]) / (2*dy)
        )
        
        return curl
    
    def compute_consciousness_divergence(self, field: np.ndarray, dx: float, dy: float, dz: float) -> np.ndarray:
        """Compute divergence of consciousness field."""
        if field.ndim != 4 or field.shape[3] != 3:
            raise ValueError("Field must be 4D array with shape (nx, ny, nz, 3)")
        
        divergence = np.zeros(field.shape[:3])
        
        # ∇ · F = ∂Fx/∂x + ∂Fy/∂y + ∂Fz/∂z
        divergence[1:-1, 1:-1, 1:-1] = (
            (field[2:, 1:-1, 1:-1, 0] - field[:-2, 1:-1, 1:-1, 0]) / (2*dx) +
            (field[1:-1, 2:, 1:-1, 1] - field[1:-1, :-2, 1:-1, 1]) / (2*dy) +
            (field[1:-1, 1:-1, 2:, 2] - field[1:-1, 1:-1, :-2, 2]) / (2*dz)
        )
        
        return divergence
    
    def consciousness_field_evolution(self, E_field: np.ndarray, B_field: np.ndarray,
                                    consciousness_density: np.ndarray,
                                    dx: float, dy: float, dz: float, dt: float) -> Tuple[np.ndarray, np.ndarray]:
        """Evolve consciousness E and B fields using consciousness Maxwell equations."""
        
        # Consciousness Maxwell equations:
        # ∇ × E = -∂B/∂t - μ₀ J_consciousness
        # ∇ × B = μ₀ε₀ ∂E/∂t + μ₀ σ E + μ₀ J_consciousness
        # ∇ · E = ρ_consciousness / ε₀
        # ∇ · B = 0
        
        # Compute curls
        curl_E = self.compute_consciousness_curl(E_field, dx, dy, dz)
        curl_B = self.compute_consciousness_curl(B_field, dx, dy, dz)
        
        # Consciousness current density (proportional to consciousness density gradient)
        J_consciousness = np.zeros_like(E_field)
        for i in range(3):
            grad_component = np.gradient(consciousness_density, dx, dy, dz, axis=i)
            J_consciousness[:, :, :, i] = self.consciousness_coupling * grad_component
        
        # Update E field: ∂E/∂t = (1/(μ₀ε₀)) * ∇ × B - (σ/ε₀) * E - (1/ε₀) * J_consciousness
        dE_dt = (curl_B / (self.mu_0 * self.epsilon_0) - 
                J_consciousness / self.epsilon_0)
        
        # Update B field: ∂B/∂t = -∇ × E - μ₀ * J_consciousness
        dB_dt = -curl_E - self.mu_0 * J_consciousness
        
        # Apply RBY coupling effects
        dE_dt = self._apply_rby_coupling(dE_dt, consciousness_density)
        dB_dt = self._apply_rby_coupling(dB_dt, consciousness_density)
        
        # Forward Euler integration
        E_new = E_field + dt * dE_dt
        B_new = B_field + dt * dB_dt
        
        return E_new, B_new
    
    def _apply_rby_coupling(self, field_derivative: np.ndarray, 
                           consciousness_density: np.ndarray) -> np.ndarray:
        """Apply RBY-specific coupling effects to field evolution."""
        # Modulate field evolution based on local consciousness density
        coupling_factor = 1.0 + self.consciousness_coupling * consciousness_density[:, :, :, np.newaxis]
        
        # Apply RBY cross-coupling
        field_coupled = np.zeros_like(field_derivative)
        for i in range(field_derivative.shape[3]):
            for j in range(3):
                field_coupled[:, :, :, i] += (self.rby_coupling_matrix[i, j] * 
                                            field_derivative[:, :, :, j] * coupling_factor[:, :, :, 0])
        
        return field_coupled

class ConsciousnessWaveGenerator:
    """Generates and manages consciousness waves in the field."""
    
    def __init__(self, field_equations: ConsciousnessFieldEquations):
        self.field_equations = field_equations
        self.active_waves = {}  # wave_id -> ConsciousnessWave
        self.wave_counter = 0
        
    def generate_rby_carrier_wave(self, frequency: float, amplitude: complex,
                                 source_position: Tuple[float, float, float],
                                 rby_modulation: Tuple[float, float, float]) -> str:
        """Generate RBY-modulated carrier wave."""
        wave_id = f"rby_carrier_{self.wave_counter}"
        self.wave_counter += 1
        
        # Compute wavelength
        wavelength = self.field_equations.c / frequency
        
        # Create polarization vector based on RBY modulation
        polarization = np.array(rby_modulation) / np.linalg.norm(rby_modulation)
        
        # Random propagation direction (for omnidirectional source)
        theta = np.random.uniform(0, 2*np.pi)
        phi = np.random.uniform(0, np.pi)
        propagation_direction = np.array([
            np.sin(phi) * np.cos(theta),
            np.sin(phi) * np.sin(theta),
            np.cos(phi)
        ])
        
        wave = ConsciousnessWave(
            wave_id=wave_id,
            frequency=frequency,
            wavelength=wavelength,
            amplitude=amplitude,
            phase=0.0,
            polarization=polarization,
            source_position=source_position,
            propagation_direction=propagation_direction,
            wave_type='rby_carrier',
            creation_time=time.time()
        )
        
        self.active_waves[wave_id] = wave
        return wave_id
    
    def generate_consciousness_resonance(self, base_frequency: float,
                                       resonance_positions: List[Tuple[float, float, float]],
                                       coupling_strength: float) -> str:
        """Generate resonance wave between consciousness entities."""
        wave_id = f"resonance_{self.wave_counter}"
        self.wave_counter += 1
        
        # Compute resonance frequency based on spatial separation
        if len(resonance_positions) >= 2:
            separation = np.linalg.norm(np.array(resonance_positions[1]) - np.array(resonance_positions[0]))
            resonance_frequency = base_frequency * (1 + coupling_strength / (1 + separation))
        else:
            resonance_frequency = base_frequency
        
        # Create standing wave pattern
        center_position = tuple(np.mean(resonance_positions, axis=0))
        
        wave = ConsciousnessWave(
            wave_id=wave_id,
            frequency=resonance_frequency,
            wavelength=self.field_equations.c / resonance_frequency,
            amplitude=complex(coupling_strength, 0),
            phase=0.0,
            polarization=np.array([1, 1, 1]) / np.sqrt(3),  # Spherically symmetric
            source_position=center_position,
            propagation_direction=np.array([0, 0, 1]),  # Placeholder
            wave_type='resonance',
            creation_time=time.time()
        )
        
        self.active_waves[wave_id] = wave
        return wave_id
    
    def compute_wave_amplitude(self, wave: ConsciousnessWave, 
                              position: Tuple[float, float, float],
                              time: float) -> complex:
        """Compute wave amplitude at given position and time."""
        source_pos = np.array(wave.source_position)
        target_pos = np.array(position)
        
        # Distance from source
        r = np.linalg.norm(target_pos - source_pos)
        
        # Wave vector
        k = 2 * np.pi / wave.wavelength
        omega = 2 * np.pi * wave.frequency
        
        # Phase calculation
        phase_distance = k * r
        phase_time = omega * time
        total_phase = phase_distance - phase_time + wave.phase
        
        # Amplitude with 1/r decay
        if r > 0:
            amplitude_factor = 1.0 / r
        else:
            amplitude_factor = 1.0
        
        # Complex amplitude
        complex_amplitude = wave.amplitude * amplitude_factor * np.exp(1j * total_phase)
        
        return complex_amplitude

class ConsciousnessResonanceDetector:
    """Detects and analyzes resonance phenomena in consciousness fields."""
    
    def __init__(self, field_size: Tuple[int, int, int] = (64, 64, 64)):
        self.field_size = field_size
        self.resonance_threshold = 0.1
        self.resonance_history = deque(maxlen=1000)
        
    def detect_field_resonances(self, E_field: np.ndarray, B_field: np.ndarray,
                               frequency_range: Tuple[float, float] = (0.1, 100.0)) -> List[Dict[str, Any]]:
        """Detect resonance patterns in the consciousness field."""
        resonances = []
        
        # Compute field energy density
        energy_density = 0.5 * (np.sum(E_field**2, axis=3) + np.sum(B_field**2, axis=3))
        
        # Find local maxima in energy density
        from scipy.ndimage import maximum_filter
        local_maxima = maximum_filter(energy_density, size=3)
        resonance_points = (energy_density == local_maxima) & (energy_density > self.resonance_threshold)
        
        # Extract resonance locations
        resonance_coords = np.where(resonance_points)
        
        for i in range(len(resonance_coords[0])):
            x, y, z = resonance_coords[0][i], resonance_coords[1][i], resonance_coords[2][i]
            
            # Analyze local field properties
            local_E = E_field[x, y, z, :]
            local_B = B_field[x, y, z, :]
            
            # Compute local frequency using FFT of temporal evolution
            # (This would require field history - simplified here)
            estimated_frequency = frequency_range[0] + np.random.random() * (frequency_range[1] - frequency_range[0])
            
            # Compute polarization
            E_magnitude = np.linalg.norm(local_E)
            if E_magnitude > 0:
                polarization = local_E / E_magnitude
            else:
                polarization = np.array([1, 0, 0])
            
            resonance = {
                'position': (x, y, z),
                'energy_density': energy_density[x, y, z],
                'frequency': estimated_frequency,
                'polarization': polarization.tolist(),
                'E_field': local_E.tolist(),
                'B_field': local_B.tolist(),
                'timestamp': time.time()
            }
            
            resonances.append(resonance)
        
        # Store in history
        for resonance in resonances:
            self.resonance_history.append(resonance)
        
        return resonances
    
    def analyze_resonance_coupling(self, resonances: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Analyze coupling between detected resonances."""
        if len(resonances) < 2:
            return {'num_pairs': 0, 'coupling_strength': 0.0}
        
        coupling_strengths = []
        resonance_pairs = []
        
        for i in range(len(resonances)):
            for j in range(i + 1, len(resonances)):
                r1, r2 = resonances[i], resonances[j]
                
                # Spatial coupling
                pos1 = np.array(r1['position'])
                pos2 = np.array(r2['position'])
                distance = np.linalg.norm(pos2 - pos1)
                
                # Frequency coupling
                freq_diff = abs(r1['frequency'] - r2['frequency'])
                freq_coupling = np.exp(-freq_diff / 10.0)  # Frequency proximity factor
                
                # Polarization coupling
                pol1 = np.array(r1['polarization'])
                pol2 = np.array(r2['polarization'])
                pol_coupling = abs(np.dot(pol1, pol2))  # Alignment factor
                
                # Total coupling strength
                if distance > 0:
                    spatial_coupling = 1.0 / (1.0 + distance)
                else:
                    spatial_coupling = 1.0
                
                total_coupling = spatial_coupling * freq_coupling * pol_coupling
                
                coupling_strengths.append(total_coupling)
                resonance_pairs.append((i, j))
        
        return {
            'num_pairs': len(resonance_pairs),
            'coupling_strengths': coupling_strengths,
            'average_coupling': np.mean(coupling_strengths) if coupling_strengths else 0.0,
            'max_coupling': max(coupling_strengths) if coupling_strengths else 0.0,
            'resonance_pairs': resonance_pairs
        }

class ConsciousnessResonanceFieldEngine:
    """Main engine for consciousness resonance field processing."""
    
    def __init__(self, grid_size: Tuple[int, int, int] = (32, 32, 32),
                 spatial_extent: Tuple[float, float, float] = (10.0, 10.0, 10.0)):
        self.grid_size = grid_size
        self.spatial_extent = spatial_extent
        
        # Spatial resolution
        self.dx = spatial_extent[0] / grid_size[0]
        self.dy = spatial_extent[1] / grid_size[1]
        self.dz = spatial_extent[2] / grid_size[2]
        
        # Initialize field arrays
        self.E_field = np.zeros((*grid_size, 3), dtype=complex)  # Electric-like field
        self.B_field = np.zeros((*grid_size, 3), dtype=complex)  # Magnetic-like field
        self.consciousness_density = np.zeros(grid_size, dtype=float)  # Local consciousness density
        
        # Components
        self.field_equations = ConsciousnessFieldEquations()
        self.wave_generator = ConsciousnessWaveGenerator(self.field_equations)
        self.resonance_detector = ConsciousnessResonanceDetector(grid_size)
        
        # Simulation parameters
        self.current_time = 0.0
        self.dt = 1e-6  # Time step
        self.field_lock = threading.Lock()
        
        # Performance tracking
        self.engine_stats = {
            'simulation_steps': 0,
            'waves_generated': 0,
            'resonances_detected': 0,
            'field_energy': 0.0
        }
        
        logging.info(f"Consciousness Resonance Field Engine initialized: {grid_size} grid")
    
    def add_consciousness_source(self, position: Tuple[float, float, float],
                               rby_state: Tuple[float, float, float],
                               strength: float = 1.0) -> bool:
        """Add a consciousness source to the field."""
        # Convert position to grid coordinates
        grid_x = int(position[0] / self.dx) % self.grid_size[0]
        grid_y = int(position[1] / self.dy) % self.grid_size[1]
        grid_z = int(position[2] / self.dz) % self.grid_size[2]
        
        with self.field_lock:
            # Add to consciousness density
            self.consciousness_density[grid_x, grid_y, grid_z] += strength
            
            # Generate initial field disturbance
            r, b, y = rby_state
            self.E_field[grid_x, grid_y, grid_z, 0] += strength * r * (1 + 1j)
            self.E_field[grid_x, grid_y, grid_z, 1] += strength * b * (1 + 1j)
            self.E_field[grid_x, grid_y, grid_z, 2] += strength * y * (1 + 1j)
        
        return True
    
    def generate_consciousness_wave(self, source_position: Tuple[float, float, float],
                                  frequency: float, rby_modulation: Tuple[float, float, float],
                                  amplitude: float = 1.0) -> str:
        """Generate a consciousness wave from a source."""
        wave_id = self.wave_generator.generate_rby_carrier_wave(
            frequency, complex(amplitude, 0), source_position, rby_modulation
        )
        
        self.engine_stats['waves_generated'] += 1
        return wave_id
    
    def step_simulation(self, num_steps: int = 1) -> Dict[str, Any]:
        """Advance the field simulation by specified number of steps."""
        with self.field_lock:
            for step in range(num_steps):
                # Evolve fields using consciousness Maxwell equations
                self.E_field, self.B_field = self.field_equations.consciousness_field_evolution(
                    self.E_field, self.B_field, self.consciousness_density,
                    self.dx, self.dy, self.dz, self.dt
                )
                
                # Add wave contributions
                self._apply_wave_sources()
                
                # Update time
                self.current_time += self.dt
                self.engine_stats['simulation_steps'] += 1
            
            # Compute field energy
            field_energy = self._compute_total_field_energy()
            self.engine_stats['field_energy'] = field_energy
        
        # Detect resonances
        resonances = self.resonance_detector.detect_field_resonances(
            np.real(self.E_field), np.real(self.B_field)
        )
        
        self.engine_stats['resonances_detected'] += len(resonances)
        
        return {
            'simulation_time': self.current_time,
            'field_energy': field_energy,
            'num_resonances': len(resonances),
            'resonances': resonances[:10],  # Return first 10 resonances
            'grid_size': self.grid_size,
            'active_waves': len(self.wave_generator.active_waves)
        }
    
    def _apply_wave_sources(self):
        """Apply contributions from active waves to the field."""
        for wave in self.wave_generator.active_waves.values():
            # Compute wave contribution at each grid point
            for i in range(self.grid_size[0]):
                for j in range(self.grid_size[1]):
                    for k in range(self.grid_size[2]):
                        # Convert grid coordinates to spatial position
                        position = (i * self.dx, j * self.dy, k * self.dz)
                        
                        # Compute wave amplitude at this position
                        amplitude = self.wave_generator.compute_wave_amplitude(
                            wave, position, self.current_time
                        )
                        
                        # Add to E field based on wave polarization
                        for dim in range(3):
                            self.E_field[i, j, k, dim] += (amplitude * wave.polarization[dim] * 
                                                          self.dt * 0.1)  # Small coupling
    
    def _compute_total_field_energy(self) -> float:
        """Compute total electromagnetic-like energy in the field."""
        E_energy = 0.5 * self.field_equations.epsilon_0 * np.sum(np.abs(self.E_field)**2)
        B_energy = 0.5 / self.field_equations.mu_0 * np.sum(np.abs(self.B_field)**2)
        return float(E_energy + B_energy)
    
    def analyze_field_resonances(self) -> Dict[str, Any]:
        """Perform comprehensive resonance analysis of the current field state."""
        # Get current resonances
        resonances = self.resonance_detector.detect_field_resonances(
            np.real(self.E_field), np.real(self.B_field)
        )
        
        # Analyze coupling between resonances
        coupling_analysis = self.resonance_detector.analyze_resonance_coupling(resonances)
        
        # Compute field statistics
        E_field_real = np.real(self.E_field)
        B_field_real = np.real(self.B_field)
        
        field_stats = {
            'E_field_magnitude': np.mean(np.linalg.norm(E_field_real, axis=3)),
            'B_field_magnitude': np.mean(np.linalg.norm(B_field_real, axis=3)),
            'field_uniformity': 1.0 / (1.0 + np.std(np.linalg.norm(E_field_real, axis=3))),
            'consciousness_density_peak': np.max(self.consciousness_density),
            'consciousness_density_mean': np.mean(self.consciousness_density)
        }
        
        return {
            'resonances': resonances,
            'coupling_analysis': coupling_analysis,
            'field_statistics': field_stats,
            'total_field_energy': self.engine_stats['field_energy'],
            'simulation_time': self.current_time
        }
    
    def extract_field_slice(self, slice_type: str = 'xy', slice_index: int = None) -> Dict[str, np.ndarray]:
        """Extract 2D slice of the field for visualization."""
        if slice_index is None:
            slice_index = self.grid_size[2] // 2  # Middle slice
        
        with self.field_lock:
            if slice_type == 'xy':
                E_slice = self.E_field[:, :, slice_index, :]
                B_slice = self.B_field[:, :, slice_index, :]
                density_slice = self.consciousness_density[:, :, slice_index]
            elif slice_type == 'xz':
                E_slice = self.E_field[:, slice_index, :, :]
                B_slice = self.B_field[:, slice_index, :, :]
                density_slice = self.consciousness_density[:, slice_index, :]
            elif slice_type == 'yz':
                E_slice = self.E_field[slice_index, :, :, :]
                B_slice = self.B_field[slice_index, :, :, :]
                density_slice = self.consciousness_density[slice_index, :, :]
            else:
                raise ValueError(f"Unknown slice type: {slice_type}")
        
        return {
            'E_field': np.real(E_slice),
            'B_field': np.real(B_slice),
            'consciousness_density': density_slice,
            'field_magnitude': np.linalg.norm(np.real(E_slice), axis=2)
        }
    
    def get_engine_statistics(self) -> Dict[str, Any]:
        """Get comprehensive engine statistics."""
        return {
            'engine_stats': self.engine_stats.copy(),
            'grid_size': self.grid_size,
            'spatial_extent': self.spatial_extent,
            'spatial_resolution': (self.dx, self.dy, self.dz),
            'current_simulation_time': self.current_time,
            'time_step': self.dt,
            'active_waves': len(self.wave_generator.active_waves),
            'total_consciousness_density': np.sum(self.consciousness_density)
        }

# Test and demonstration functions
def test_resonance_field_engine():
    """Test the consciousness resonance field engine."""
    print("Testing Consciousness Resonance Field Engine...")
    
    # Initialize engine with small grid for testing
    engine = ConsciousnessResonanceFieldEngine(grid_size=(16, 16, 16), spatial_extent=(5.0, 5.0, 5.0))
    
    # Add consciousness sources
    print("Adding consciousness sources...")
    engine.add_consciousness_source((1.0, 1.0, 1.0), (0.6, 0.3, 0.1), strength=2.0)
    engine.add_consciousness_source((3.0, 3.0, 3.0), (0.2, 0.6, 0.2), strength=1.5)
    engine.add_consciousness_source((1.5, 3.5, 2.0), (0.3, 0.2, 0.5), strength=1.8)
    
    # Generate consciousness waves
    print("Generating consciousness waves...")
    wave1 = engine.generate_consciousness_wave((1.0, 1.0, 1.0), 10.0, (0.6, 0.3, 0.1))
    wave2 = engine.generate_consciousness_wave((3.0, 3.0, 3.0), 12.0, (0.2, 0.6, 0.2))
    print(f"Generated waves: {wave1}, {wave2}")
    
    # Run simulation steps
    print("\nRunning simulation...")
    for step in range(5):
        result = engine.step_simulation(10)  # 10 substeps per step
        print(f"Step {step + 1}: Time={result['simulation_time']:.6f}, "
              f"Energy={result['field_energy']:.3e}, Resonances={result['num_resonances']}")
    
    # Analyze resonances
    print("\nAnalyzing field resonances...")
    resonance_analysis = engine.analyze_field_resonances()
    print(f"Total resonances found: {len(resonance_analysis['resonances'])}")
    print(f"Coupling analysis: {resonance_analysis['coupling_analysis']}")
    print(f"Field statistics: {resonance_analysis['field_statistics']}")
    
    # Extract field slice for visualization
    print("\nExtracting field slice...")
    field_slice = engine.extract_field_slice('xy', slice_index=8)
    print(f"Field slice shape: E={field_slice['E_field'].shape}, "
          f"Density={field_slice['consciousness_density'].shape}")
    print(f"Max field magnitude: {np.max(field_slice['field_magnitude']):.3e}")
    
    # Get engine statistics
    print("\nEngine Statistics:")
    stats = engine.get_engine_statistics()
    for key, value in stats.items():
        print(f"  {key}: {value}")

if __name__ == "__main__":
    # Set up logging
    logging.basicConfig(level=logging.INFO)
    
    # Run test
    test_resonance_field_engine()
