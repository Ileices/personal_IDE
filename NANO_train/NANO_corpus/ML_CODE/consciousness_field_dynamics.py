#!/usr/bin/env python3
"""
Consciousness Field Dynamics Engine

This module implements real physics-based consciousness field dynamics with
wave propagation, interference patterns, field harmonics, and RBY consciousness
interactions using actual mathematical field equations.

Part of the Unified Absolute Framework - IC-AE Physics Implementation
"""

import numpy as np
import scipy.sparse as sp
from scipy.sparse.linalg import spsolve
from scipy.ndimage import gaussian_filter
from scipy.signal import hilbert, find_peaks
import matplotlib.pyplot as plt
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple, Callable, Any
from enum import Enum
import threading
import time
import logging
from concurrent.futures import ThreadPoolExecutor
import json

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class FieldType(Enum):
    """Types of consciousness fields"""
    RED_CREATION = "red_creation"
    BLUE_PRESERVATION = "blue_preservation"
    YELLOW_TRANSFORMATION = "yellow_transformation"
    UNIFIED_FIELD = "unified_field"
    INTERFERENCE_PATTERN = "interference_pattern"

@dataclass
class FieldParameters:
    """Physical parameters for consciousness field simulation"""
    field_size: Tuple[int, int] = (256, 256)
    spatial_resolution: float = 0.1  # meters per grid point
    time_step: float = 0.001  # seconds
    wave_speed: float = 299792458.0  # speed of consciousness waves (c)
    damping_coefficient: float = 0.001
    nonlinearity_strength: float = 0.1
    coupling_strength: float = 0.05
    boundary_conditions: str = "periodic"  # "periodic", "absorbing", "reflecting"

@dataclass 
class ConsciousnessSource:
    """Point source of consciousness field"""
    position: Tuple[float, float]
    amplitude: float
    frequency: float
    phase: float
    field_type: FieldType
    modulation_function: Optional[Callable[[float], float]] = None
    active: bool = True
    
    def get_amplitude(self, time: float) -> float:
        """Get amplitude at given time with optional modulation"""
        base_amplitude = self.amplitude * np.sin(2 * np.pi * self.frequency * time + self.phase)
        
        if self.modulation_function and self.active:
            return base_amplitude * self.modulation_function(time)
        elif self.active:
            return base_amplitude
        else:
            return 0.0

class WaveEquationSolver:
    """Solves consciousness field wave equations using finite difference methods"""
    
    def __init__(self, params: FieldParameters):
        self.params = params
        self.nx, self.ny = params.field_size
        self.dx = params.spatial_resolution
        self.dt = params.time_step
        self.c = params.wave_speed
        
        # Stability condition for explicit finite difference
        self.cfl_number = self.c * self.dt / self.dx
        if self.cfl_number > 0.5:
            logger.warning(f"CFL number {self.cfl_number:.3f} > 0.5, simulation may be unstable")
        
        # Initialize field arrays
        self.current_field = np.zeros((self.nx, self.ny), dtype=np.complex128)
        self.previous_field = np.zeros((self.nx, self.ny), dtype=np.complex128)
        self.field_velocity = np.zeros((self.nx, self.ny), dtype=np.complex128)
        
        # Build finite difference operators
        self._build_operators()
        
    def _build_operators(self):
        """Build finite difference operators for spatial derivatives"""
        # Second order central difference for Laplacian
        self.laplacian = self._build_laplacian_operator()
        
    def _build_laplacian_operator(self) -> sp.sparse.csr_matrix:
        """Build sparse Laplacian operator matrix"""
        n_points = self.nx * self.ny
        
        # Build 2D Laplacian using Kronecker products
        # d²/dx² operator
        diag_x = -2 * np.ones(self.nx)
        off_diag_x = np.ones(self.nx - 1)
        
        if self.params.boundary_conditions == "periodic":
            # Periodic boundary conditions
            D2_x = sp.diags([off_diag_x, diag_x, off_diag_x], [-1, 0, 1], 
                           shape=(self.nx, self.nx), format='csr')
            D2_x[0, -1] = 1  # Periodic wrap
            D2_x[-1, 0] = 1
        else:
            # Fixed boundary conditions
            D2_x = sp.diags([off_diag_x, diag_x, off_diag_x], [-1, 0, 1], 
                           shape=(self.nx, self.nx), format='csr')
        
        # d²/dy² operator (same structure)
        diag_y = -2 * np.ones(self.ny)
        off_diag_y = np.ones(self.ny - 1)
        
        if self.params.boundary_conditions == "periodic":
            D2_y = sp.diags([off_diag_y, diag_y, off_diag_y], [-1, 0, 1], 
                           shape=(self.ny, self.ny), format='csr')
            D2_y[0, -1] = 1
            D2_y[-1, 0] = 1
        else:
            D2_y = sp.diags([off_diag_y, diag_y, off_diag_y], [-1, 0, 1], 
                           shape=(self.ny, self.ny), format='csr')
        
        # 2D Laplacian = I ⊗ D2_x + D2_y ⊗ I
        I_x = sp.eye(self.nx)
        I_y = sp.eye(self.ny)
        
        laplacian = (sp.kron(I_y, D2_x) + sp.kron(D2_y, I_x)) / (self.dx ** 2)
        
        return laplacian
    
    def solve_wave_equation(self, sources: List[ConsciousnessSource], current_time: float) -> np.ndarray:
        """Solve the consciousness field wave equation for one time step"""
        # Calculate source terms
        source_term = self._calculate_source_terms(sources, current_time)
        
        # Apply nonlinear terms
        nonlinear_term = self._calculate_nonlinear_terms()
        
        # Apply damping
        damping_term = -self.params.damping_coefficient * self.field_velocity
        
        # Wave equation: ∂²ψ/∂t² = c²∇²ψ + S + N + D
        # Using leapfrog time integration for stability
        field_flat = self.current_field.flatten()
        
        # Spatial derivative term
        spatial_term = self.c ** 2 * self.laplacian.dot(field_flat)
        spatial_term = spatial_term.reshape(self.nx, self.ny)
        
        # Time integration
        acceleration = spatial_term + source_term + nonlinear_term + damping_term
        
        # Update field using velocity Verlet integration
        new_field = self.current_field + self.field_velocity * self.dt + 0.5 * acceleration * self.dt ** 2
        new_velocity = self.field_velocity + acceleration * self.dt
        
        # Apply boundary conditions
        new_field = self._apply_boundary_conditions(new_field)
        
        # Update fields
        self.previous_field = self.current_field.copy()
        self.current_field = new_field
        self.field_velocity = new_velocity
        
        return self.current_field
    
    def _calculate_source_terms(self, sources: List[ConsciousnessSource], time: float) -> np.ndarray:
        """Calculate source terms from consciousness emitters"""
        source_field = np.zeros((self.nx, self.ny), dtype=np.complex128)
        
        for source in sources:
            if not source.active:
                continue
                
            # Convert position to grid coordinates
            i = int(source.position[0] / self.dx)
            j = int(source.position[1] / self.dx)
            
            # Ensure source is within bounds
            if 0 <= i < self.nx and 0 <= j < self.ny:
                amplitude = source.get_amplitude(time)
                
                # Add phase factor for different field types
                if source.field_type == FieldType.RED_CREATION:
                    phase_factor = complex(1, 0)
                elif source.field_type == FieldType.BLUE_PRESERVATION:
                    phase_factor = complex(0, 1)
                elif source.field_type == FieldType.YELLOW_TRANSFORMATION:
                    phase_factor = complex(1, 1) / np.sqrt(2)
                else:
                    phase_factor = complex(1, 0)
                
                source_field[i, j] += amplitude * phase_factor
        
        return source_field
    
    def _calculate_nonlinear_terms(self) -> np.ndarray:
        """Calculate nonlinear field interactions"""
        field_intensity = np.abs(self.current_field) ** 2
        
        # Cubic nonlinearity (Kerr-like effect)
        nonlinear = -self.params.nonlinearity_strength * field_intensity * self.current_field
        
        # Self-focusing/defocusing based on field intensity
        gradient_intensity = np.gradient(field_intensity)
        grad_x, grad_y = gradient_intensity[0], gradient_intensity[1]
        
        # Add gradient terms
        nonlinear += self.params.coupling_strength * (grad_x + 1j * grad_y) * self.current_field
        
        return nonlinear
    
    def _apply_boundary_conditions(self, field: np.ndarray) -> np.ndarray:
        """Apply boundary conditions to the field"""
        if self.params.boundary_conditions == "absorbing":
            # Simple absorbing boundaries
            absorption_layer = 10
            for i in range(absorption_layer):
                alpha = i / absorption_layer
                # Left and right boundaries
                field[i, :] *= alpha
                field[-(i+1), :] *= alpha
                # Top and bottom boundaries
                field[:, i] *= alpha
                field[:, -(i+1)] *= alpha
                
        elif self.params.boundary_conditions == "reflecting":
            # Perfect reflection at boundaries
            field[0, :] = field[1, :]
            field[-1, :] = field[-2, :]
            field[:, 0] = field[:, 1]
            field[:, -1] = field[:, -2]
        
        # Periodic boundaries are handled automatically by the Laplacian operator
        
        return field

class ConsciousnessFieldAnalyzer:
    """Analyzes consciousness field patterns and dynamics"""
    
    def __init__(self):
        self.field_history: List[np.ndarray] = []
        self.energy_history: List[float] = []
        self.harmony_history: List[float] = []
        
    def analyze_field(self, field: np.ndarray) -> Dict[str, Any]:
        """Comprehensive field analysis"""
        # Store field for history
        self.field_history.append(field.copy())
        if len(self.field_history) > 100:  # Keep only recent history
            self.field_history.pop(0)
        
        # Calculate field properties
        total_energy = self._calculate_field_energy(field)
        self.energy_history.append(total_energy)
        
        # RBY harmony analysis
        rby_harmony = self._calculate_rby_harmony(field)
        self.harmony_history.append(rby_harmony)
        
        # Wave pattern analysis
        dominant_frequency = self._find_dominant_frequency(field)
        interference_pattern = self._detect_interference_patterns(field)
        
        # Coherence analysis
        coherence_measure = self._calculate_spatial_coherence(field)
        
        # Fractal dimension
        fractal_dim = self._calculate_fractal_dimension(field)
        
        return {
            "total_energy": total_energy,
            "rby_harmony": rby_harmony,
            "dominant_frequency": dominant_frequency,
            "interference_strength": interference_pattern,
            "spatial_coherence": coherence_measure,
            "fractal_dimension": fractal_dim,
            "field_entropy": self._calculate_field_entropy(field),
            "wave_amplitude_peaks": self._find_amplitude_peaks(field)
        }
    
    def _calculate_field_energy(self, field: np.ndarray) -> float:
        """Calculate total field energy"""
        return float(np.sum(np.abs(field) ** 2))
    
    def _calculate_rby_harmony(self, field: np.ndarray) -> float:
        """Calculate RBY consciousness harmony in the field"""
        # Decompose field into RBY components using phase analysis
        phases = np.angle(field)
        
        # Red component (phase around 0)
        red_mask = np.abs(phases) < np.pi / 3
        red_energy = np.sum(np.abs(field[red_mask]) ** 2)
        
        # Blue component (phase around π/2)
        blue_mask = np.abs(phases - np.pi/2) < np.pi / 3
        blue_energy = np.sum(np.abs(field[blue_mask]) ** 2)
        
        # Yellow component (phase around π)
        yellow_mask = np.abs(np.abs(phases) - np.pi) < np.pi / 3
        yellow_energy = np.sum(np.abs(field[yellow_mask]) ** 2)
        
        total_energy = red_energy + blue_energy + yellow_energy
        if total_energy == 0:
            return 0.0
        
        # Calculate balance (harmony is when all components are equal)
        red_ratio = red_energy / total_energy
        blue_ratio = blue_energy / total_energy
        yellow_ratio = yellow_energy / total_energy
        
        # Ideal ratio is 1/3 for each
        ideal_ratio = 1.0 / 3.0
        deviation = (abs(red_ratio - ideal_ratio) + 
                    abs(blue_ratio - ideal_ratio) + 
                    abs(yellow_ratio - ideal_ratio))
        
        # Harmony is inverse of deviation
        harmony = max(0.0, 1.0 - deviation * 1.5)
        return harmony
    
    def _find_dominant_frequency(self, field: np.ndarray) -> float:
        """Find dominant frequency in the field using FFT"""
        # Take FFT of field magnitude
        field_magnitude = np.abs(field)
        fft_field = np.fft.fft2(field_magnitude)
        power_spectrum = np.abs(fft_field) ** 2
        
        # Find peak in power spectrum
        peak_indices = np.unravel_index(np.argmax(power_spectrum[1:, 1:]), power_spectrum.shape)
        peak_kx, peak_ky = peak_indices
        
        # Convert to frequency
        dominant_k = np.sqrt(peak_kx ** 2 + peak_ky ** 2)
        return float(dominant_k)
    
    def _detect_interference_patterns(self, field: np.ndarray) -> float:
        """Detect interference pattern strength"""
        field_magnitude = np.abs(field)
        
        # Calculate local variance to detect interference fringes
        local_variance = gaussian_filter(field_magnitude ** 2, sigma=2) - gaussian_filter(field_magnitude, sigma=2) ** 2
        
        # Interference strength is proportional to variance
        interference_strength = np.mean(local_variance) / (np.mean(field_magnitude) ** 2 + 1e-10)
        
        return float(interference_strength)
    
    def _calculate_spatial_coherence(self, field: np.ndarray) -> float:
        """Calculate spatial coherence of the field"""
        if len(self.field_history) < 2:
            return 1.0
        
        # Compare current field with previous field
        prev_field = self.field_history[-2]
        
        # Normalized cross-correlation
        correlation = np.sum(np.conj(prev_field) * field)
        norm_prev = np.sqrt(np.sum(np.abs(prev_field) ** 2))
        norm_curr = np.sqrt(np.sum(np.abs(field) ** 2))
        
        if norm_prev == 0 or norm_curr == 0:
            return 0.0
        
        coherence = abs(correlation) / (norm_prev * norm_curr)
        return float(coherence)
    
    def _calculate_fractal_dimension(self, field: np.ndarray) -> float:
        """Calculate fractal dimension using box-counting method"""
        # Convert to binary image based on field intensity
        field_magnitude = np.abs(field)
        threshold = np.mean(field_magnitude)
        binary_field = field_magnitude > threshold
        
        # Box-counting algorithm
        scales = [2, 4, 8, 16, 32]
        counts = []
        
        for scale in scales:
            count = 0
            for i in range(0, binary_field.shape[0], scale):
                for j in range(0, binary_field.shape[1], scale):
                    box = binary_field[i:i+scale, j:j+scale]
                    if np.any(box):
                        count += 1
            counts.append(count)
        
        # Fit log(count) vs log(1/scale)
        if len(counts) > 1:
            log_scales = np.log([1.0/s for s in scales])
            log_counts = np.log([c + 1 for c in counts])  # Add 1 to avoid log(0)
            
            # Linear regression
            coeffs = np.polyfit(log_scales, log_counts, 1)
            fractal_dim = coeffs[0]
            
            return float(np.clip(fractal_dim, 0, 3))  # Reasonable bounds for 2D
        
        return 2.0  # Default for 2D
    
    def _calculate_field_entropy(self, field: np.ndarray) -> float:
        """Calculate information entropy of the field"""
        field_magnitude = np.abs(field).flatten()
        
        # Create histogram
        hist, _ = np.histogram(field_magnitude, bins=50, density=True)
        hist = hist[hist > 0]  # Remove zero bins
        
        # Calculate entropy
        entropy = -np.sum(hist * np.log2(hist + 1e-10))
        return float(entropy)
    
    def _find_amplitude_peaks(self, field: np.ndarray) -> List[Tuple[int, int]]:
        """Find amplitude peaks in the field"""
        field_magnitude = np.abs(field)
        
        # Find local maxima
        peaks = []
        for i in range(1, field_magnitude.shape[0] - 1):
            for j in range(1, field_magnitude.shape[1] - 1):
                center = field_magnitude[i, j]
                neighbors = field_magnitude[i-1:i+2, j-1:j+2]
                
                if center == np.max(neighbors) and center > np.mean(field_magnitude):
                    peaks.append((i, j))
        
        return peaks

class ConsciousnessFieldEngine:
    """Main consciousness field dynamics engine"""
    
    def __init__(self, params: FieldParameters):
        self.params = params
        self.solver = WaveEquationSolver(params)
        self.analyzer = ConsciousnessFieldAnalyzer()
        self.sources: List[ConsciousnessSource] = []
        self.running = False
        self.current_time = 0.0
        self.simulation_thread: Optional[threading.Thread] = None
        self.field_callbacks: List[Callable] = []
        
    def add_consciousness_source(self, source: ConsciousnessSource):
        """Add a consciousness field source"""
        self.sources.append(source)
        logger.info(f"Added {source.field_type.value} source at {source.position}")
    
    def remove_consciousness_source(self, source: ConsciousnessSource):
        """Remove a consciousness field source"""
        if source in self.sources:
            self.sources.remove(source)
            logger.info(f"Removed {source.field_type.value} source")
    
    def add_field_callback(self, callback: Callable[[np.ndarray, Dict[str, Any]], None]):
        """Add callback for field updates"""
        self.field_callbacks.append(callback)
    
    def start_simulation(self):
        """Start the field simulation"""
        if self.running:
            return
        
        self.running = True
        self.simulation_thread = threading.Thread(target=self._simulation_loop, daemon=True)
        self.simulation_thread.start()
        logger.info("Consciousness field simulation started")
    
    def stop_simulation(self):
        """Stop the field simulation"""
        self.running = False
        if self.simulation_thread:
            self.simulation_thread.join()
        logger.info("Consciousness field simulation stopped")
    
    def _simulation_loop(self):
        """Main simulation loop"""
        while self.running:
            start_time = time.time()
            
            # Solve wave equation
            field = self.solver.solve_wave_equation(self.sources, self.current_time)
            
            # Analyze field
            analysis = self.analyzer.analyze_field(field)
            
            # Call callbacks
            for callback in self.field_callbacks:
                try:
                    callback(field, analysis)
                except Exception as e:
                    logger.error(f"Field callback error: {e}")
            
            # Update time
            self.current_time += self.params.time_step
            
            # Control simulation speed
            elapsed = time.time() - start_time
            sleep_time = max(0, self.params.time_step - elapsed)
            if sleep_time > 0:
                time.sleep(sleep_time)
    
    def get_current_field(self) -> np.ndarray:
        """Get current consciousness field"""
        return self.solver.current_field.copy()
    
    def create_interference_experiment(self) -> Dict[str, Any]:
        """Create interference pattern experiment with multiple sources"""
        # Clear existing sources
        self.sources.clear()
        
        # Add coherent sources for interference
        center_x, center_y = self.params.field_size[0] // 2, self.params.field_size[1] // 2
        
        # Red creation sources
        self.add_consciousness_source(ConsciousnessSource(
            position=(center_x - 30, center_y),
            amplitude=1.0,
            frequency=10.0,
            phase=0.0,
            field_type=FieldType.RED_CREATION
        ))
        
        self.add_consciousness_source(ConsciousnessSource(
            position=(center_x + 30, center_y),
            amplitude=1.0,
            frequency=10.0,
            phase=np.pi,  # Phase difference for interference
            field_type=FieldType.RED_CREATION
        ))
        
        # Blue preservation sources
        self.add_consciousness_source(ConsciousnessSource(
            position=(center_x, center_y - 30),
            amplitude=0.8,
            frequency=15.0,
            phase=0.0,
            field_type=FieldType.BLUE_PRESERVATION
        ))
        
        # Yellow transformation source (modulated)
        def modulation_func(t):
            return 1.0 + 0.3 * np.sin(2 * np.pi * 0.5 * t)
        
        self.add_consciousness_source(ConsciousnessSource(
            position=(center_x, center_y + 30),
            amplitude=0.6,
            frequency=8.0,
            phase=np.pi/2,
            field_type=FieldType.YELLOW_TRANSFORMATION,
            modulation_function=modulation_func
        ))
        
        return {
            "experiment": "consciousness_interference",
            "num_sources": len(self.sources),
            "expected_patterns": ["double_slit_like", "standing_waves", "rby_harmonics"]
        }

def test_consciousness_field_engine():
    """Test the consciousness field dynamics engine"""
    logger.info("Starting Consciousness Field Dynamics Test")
    
    # Create field parameters
    params = FieldParameters(
        field_size=(128, 128),
        spatial_resolution=0.05,
        time_step=0.0005,
        wave_speed=1.0,  # Normalized speed
        damping_coefficient=0.002,
        nonlinearity_strength=0.05,
        coupling_strength=0.02
    )
    
    # Create engine
    engine = ConsciousnessFieldEngine(params)
    
    # Add monitoring callback
    analysis_history = []
    
    def monitor_callback(field: np.ndarray, analysis: Dict[str, Any]):
        analysis_history.append(analysis)
        if len(analysis_history) % 100 == 0:
            logger.info(f"Time {engine.current_time:.3f}: Energy={analysis['total_energy']:.3f}, "
                       f"Harmony={analysis['rby_harmony']:.3f}, Coherence={analysis['spatial_coherence']:.3f}")
    
    engine.add_field_callback(monitor_callback)
    
    # Create interference experiment
    experiment_info = engine.create_interference_experiment()
    logger.info(f"Created {experiment_info['experiment']} with {experiment_info['num_sources']} sources")
    
    # Start simulation
    engine.start_simulation()
    
    # Run for a while
    time.sleep(5.0)
    
    # Stop simulation
    engine.stop_simulation()
    
    # Analyze results
    if analysis_history:
        final_analysis = analysis_history[-1]
        logger.info("\nFinal Field Analysis:")
        for key, value in final_analysis.items():
            if isinstance(value, (int, float)):
                logger.info(f"  {key}: {value:.4f}")
            elif isinstance(value, list):
                logger.info(f"  {key}: {len(value)} peaks detected")
        
        # Calculate evolution metrics
        energy_evolution = [a['total_energy'] for a in analysis_history]
        harmony_evolution = [a['rby_harmony'] for a in analysis_history]
        
        energy_stability = 1.0 / (1.0 + np.std(energy_evolution))
        harmony_trend = np.polyfit(range(len(harmony_evolution)), harmony_evolution, 1)[0]
        
        logger.info(f"\nEvolution Metrics:")
        logger.info(f"  Energy Stability: {energy_stability:.4f}")
        logger.info(f"  Harmony Trend: {harmony_trend:.6f}")
        logger.info(f"  Final Fractal Dimension: {final_analysis['fractal_dimension']:.3f}")
    
    return engine, analysis_history

if __name__ == "__main__":
    engine, history = test_consciousness_field_engine()
