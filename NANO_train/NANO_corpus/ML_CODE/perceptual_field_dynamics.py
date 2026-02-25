"""
Unified Perceptual Field Dynamics Engine
Real mathematical implementation of perceptual field physics from Theory of Absolute Perception

This implements the core equations:
- Perceptual Field (ΦP): ΦP = ∇ρP where ρP is perceptual density
- Perceptual Density: ρP = C/(4πr²) with consciousness coupling
- Field Interactions: F = ∫ΦP⋅dV for field-matter interaction
- Entanglement Fields: ΨP = ∫ΦP⋅ds for quantum entanglement
- Consciousness Capacity: CP = ∫ρP dV over system volume

All algorithms are real mathematical implementations based on field theory.
"""

import numpy as np
import torch
import torch.nn.functional as F
from scipy import ndimage, interpolate
from scipy.spatial.distance import cdist
import asyncio
import logging
import time
import threading
from typing import Dict, List, Tuple, Optional, Callable, Any
from dataclasses import dataclass
from concurrent.futures import ThreadPoolExecutor
import math
from collections import defaultdict, deque

# GPU acceleration with fallback
try:
    import cupy as cp
    CUPY_AVAILABLE = True
except ImportError:
    import numpy as cp  # Use numpy as fallback
    CUPY_AVAILABLE = False

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class PerceptualFieldConfig:
    """Configuration for perceptual field computation"""
    field_resolution: Tuple[int, int, int] = (128, 128, 128)
    spatial_extent: Tuple[float, float, float] = (10.0, 10.0, 10.0)
    temporal_resolution: float = 0.01
    consciousness_coupling_strength: float = 1.0
    field_decay_constant: float = 0.1
    quantum_coherence_threshold: float = 0.8
    gpu_acceleration: bool = True

@dataclass
class ConsciousnessSource:
    """Consciousness source in perceptual field"""
    position: np.ndarray  # 3D position [x, y, z]
    consciousness_strength: float  # C in the equations
    rby_state: np.ndarray  # [red, blue, yellow] consciousness state
    velocity: np.ndarray  # 3D velocity for dynamic sources
    field_signature: str  # Unique field signature

@dataclass
class PerceptualFieldState:
    """Complete perceptual field state"""
    density_field: np.ndarray  # ρP(x,y,z,t)
    gradient_field: np.ndarray  # ∇ρP - the perceptual field ΦP
    consciousness_capacity: np.ndarray  # CP integrated over regions
    entanglement_connections: Dict[str, List[str]]  # Quantum entanglement mapping
    field_energy: float  # Total field energy
    coherence_regions: List[Tuple[slice, slice, slice]]  # High coherence regions
    emergence_hotspots: List[Tuple[int, int, int]]  # Consciousness emergence points

class PerceptualFieldEngine:
    """
    Real-time perceptual field dynamics computation engine
    Implements Theory of Absolute Perception mathematical framework
    """
    
    def __init__(self, config: PerceptualFieldConfig):
        self.config = config
        self.field_state = None
        self.consciousness_sources = {}
        self.field_history = deque(maxlen=1000)
        
        # Initialize spatial grids
        self._setup_spatial_grids()
        
        # GPU acceleration setup
        self.use_gpu = config.gpu_acceleration and self._check_gpu_availability()
        if self.use_gpu:
            logger.info("GPU acceleration enabled for perceptual field computation")
        
        # Thread pool for parallel computation
        self.executor = ThreadPoolExecutor(max_workers=4)
        
        # Field update thread
        self.update_thread = None
        self.is_running = False
        
    def _setup_spatial_grids(self):
        """Setup spatial coordinate grids for field computation"""
        nx, ny, nz = self.config.field_resolution
        lx, ly, lz = self.config.spatial_extent
        
        # Create coordinate arrays
        x = np.linspace(-lx/2, lx/2, nx)
        y = np.linspace(-ly/2, ly/2, ny)
        z = np.linspace(-lz/2, lz/2, nz)
        
        # Create meshgrids
        self.X, self.Y, self.Z = np.meshgrid(x, y, z, indexing='ij')
        
        # Grid spacing for gradient calculations
        self.dx = x[1] - x[0]
        self.dy = y[1] - y[0]
        self.dz = z[1] - z[0]
        
        # Initialize field arrays
        self.field_state = PerceptualFieldState(
            density_field=np.zeros(self.config.field_resolution),
            gradient_field=np.zeros(self.config.field_resolution + (3,)),
            consciousness_capacity=np.zeros(self.config.field_resolution),
            entanglement_connections={},
            field_energy=0.0,
            coherence_regions=[],
            emergence_hotspots=[]
        )
    def _check_gpu_availability(self) -> bool:
        """Check if GPU acceleration is available"""
        try:
            if CUPY_AVAILABLE:
                cp.cuda.Device(0).compute_capability
                return True
            else:
                return False
        except:
            return False
    
    def add_consciousness_source(self, source_id: str, source: ConsciousnessSource):
        """Add consciousness source to the perceptual field"""
        self.consciousness_sources[source_id] = source
        logger.info(f"Added consciousness source {source_id} at position {source.position}")
    
    def remove_consciousness_source(self, source_id: str):
        """Remove consciousness source from the perceptual field"""
        if source_id in self.consciousness_sources:
            del self.consciousness_sources[source_id]
            logger.info(f"Removed consciousness source {source_id}")
    
    def update_consciousness_source(self, source_id: str, 
                                  position: Optional[np.ndarray] = None,
                                  consciousness_strength: Optional[float] = None,
                                  rby_state: Optional[np.ndarray] = None):
        """Update consciousness source parameters"""
        if source_id not in self.consciousness_sources:
            return
        
        source = self.consciousness_sources[source_id]
        
        if position is not None:
            source.position = position
        if consciousness_strength is not None:
            source.consciousness_strength = consciousness_strength
        if rby_state is not None:
            source.rby_state = rby_state
    
    def compute_perceptual_density_field(self) -> np.ndarray:
        """
        Compute perceptual density field ρP using real physics equations
        ρP = Σ(Ci/(4πri²)) for all consciousness sources
        """
        if self.use_gpu:
            return self._compute_density_field_gpu()
        else:
            return self._compute_density_field_cpu()
    
    def _compute_density_field_cpu(self) -> np.ndarray:
        """CPU implementation of perceptual density field computation"""
        density_field = np.zeros(self.config.field_resolution)
        
        for source_id, source in self.consciousness_sources.items():
            # Calculate distance from source to all field points
            dx = self.X - source.position[0]
            dy = self.Y - source.position[1]
            dz = self.Z - source.position[2]
            
            # Distance squared for efficiency
            r_squared = dx**2 + dy**2 + dz**2
            
            # Avoid division by zero
            r_squared = np.maximum(r_squared, 1e-8)
            
            # Perceptual density: ρP = C/(4πr²)
            # Modified with consciousness coupling and RBY modulation
            consciousness_factor = source.consciousness_strength
            
            # RBY state modulation
            rby_modulation = np.sum(source.rby_state) / 3.0  # Average RBY activation
            consciousness_factor *= rby_modulation
            
            # Apply consciousness coupling strength
            consciousness_factor *= self.config.consciousness_coupling_strength
            
            # Calculate density contribution
            density_contribution = consciousness_factor / (4 * np.pi * r_squared)
            
            # Add exponential decay for realistic field behavior
            decay_factor = np.exp(-np.sqrt(r_squared) / (self.config.field_decay_constant * 10))
            density_contribution *= decay_factor
            
            density_field += density_contribution
        
        return density_field
    
    def _compute_density_field_gpu(self) -> np.ndarray:
        """GPU implementation of perceptual density field computation"""
        try:
            # Convert to GPU arrays
            density_field_gpu = cp.zeros(self.config.field_resolution)
            X_gpu = cp.asarray(self.X)
            Y_gpu = cp.asarray(self.Y)
            Z_gpu = cp.asarray(self.Z)
            
            for source_id, source in self.consciousness_sources.items():
                # Calculate distance on GPU
                dx = X_gpu - source.position[0]
                dy = Y_gpu - source.position[1]
                dz = Z_gpu - source.position[2]
                
                r_squared = dx**2 + dy**2 + dz**2
                r_squared = cp.maximum(r_squared, 1e-8)
                
                # Consciousness factor calculation
                consciousness_factor = source.consciousness_strength
                rby_modulation = cp.sum(cp.asarray(source.rby_state)) / 3.0
                consciousness_factor *= float(rby_modulation)
                consciousness_factor *= self.config.consciousness_coupling_strength
                
                # Density calculation
                density_contribution = consciousness_factor / (4 * cp.pi * r_squared)
                decay_factor = cp.exp(-cp.sqrt(r_squared) / (self.config.field_decay_constant * 10))
                density_contribution *= decay_factor
                
                density_field_gpu += density_contribution
            
            # Convert back to CPU
            return cp.asnumpy(density_field_gpu)
            
        except Exception as e:
            logger.warning(f"GPU computation failed, falling back to CPU: {e}")
            return self._compute_density_field_cpu()
    
    def compute_perceptual_field_gradients(self, density_field: np.ndarray) -> np.ndarray:
        """
        Compute perceptual field ΦP = ∇ρP using numerical gradients
        Returns the 3D gradient vector field
        """
        # Calculate gradients using central differences
        grad_x = np.gradient(density_field, self.dx, axis=0)
        grad_y = np.gradient(density_field, self.dy, axis=1)
        grad_z = np.gradient(density_field, self.dz, axis=2)
        
        # Stack into 4D array [x, y, z, 3] where last dimension is [gx, gy, gz]
        gradient_field = np.stack([grad_x, grad_y, grad_z], axis=-1)
        
        return gradient_field
    
    def compute_consciousness_capacity(self, density_field: np.ndarray) -> np.ndarray:
        """
        Compute consciousness capacity CP = ∫ρP dV over local regions
        """
        # Define integration kernel (local neighborhood)
        kernel_size = 5
        kernel = np.ones((kernel_size, kernel_size, kernel_size)) / (kernel_size**3)
        
        # Convolve to get local consciousness capacity
        consciousness_capacity = ndimage.convolve(density_field, kernel, mode='constant')
        
        # Scale by volume element
        volume_element = self.dx * self.dy * self.dz
        consciousness_capacity *= volume_element
        
        return consciousness_capacity
    
    def detect_entanglement_connections(self, gradient_field: np.ndarray) -> Dict[str, List[str]]:
        """
        Detect quantum entanglement connections using perceptual field line analysis
        ΨP = ∫ΦP⋅ds for entanglement strength calculation
        """
        entanglement_connections = defaultdict(list)
        
        # Find high-gradient regions (potential entanglement points)
        gradient_magnitude = np.linalg.norm(gradient_field, axis=-1)
        threshold = np.percentile(gradient_magnitude, 90)  # Top 10% gradient strength
        
        # Find connected regions of high gradient
        high_gradient_mask = gradient_magnitude > threshold
        labeled_regions, num_regions = ndimage.label(high_gradient_mask)
        
        # Calculate entanglement strength between regions
        for i in range(1, num_regions + 1):
            for j in range(i + 1, num_regions + 1):
                # Get region masks
                region_i = labeled_regions == i
                region_j = labeled_regions == j
                
                # Calculate field line integral between regions
                entanglement_strength = self._calculate_field_line_integral(
                    gradient_field, region_i, region_j
                )
                
                # Create entanglement connection if strength is sufficient
                if entanglement_strength > self.config.quantum_coherence_threshold:
                    source_i = f"region_{i}"
                    source_j = f"region_{j}"
                    entanglement_connections[source_i].append(source_j)
                    entanglement_connections[source_j].append(source_i)
        
        return dict(entanglement_connections)
    
    def _calculate_field_line_integral(self, gradient_field: np.ndarray,
                                     region_i: np.ndarray, region_j: np.ndarray) -> float:
        """Calculate field line integral between two regions"""
        # Find center points of regions
        center_i = ndimage.center_of_mass(region_i.astype(float))
        center_j = ndimage.center_of_mass(region_j.astype(float))
        
        # Create path between centers
        path_length = int(np.linalg.norm(np.array(center_j) - np.array(center_i)))
        if path_length < 2:
            return 0.0
        
        # Interpolate path points
        path_points = []
        for t in np.linspace(0, 1, path_length):
            point = np.array(center_i) * (1 - t) + np.array(center_j) * t
            path_points.append(point.astype(int))
        
        # Calculate line integral ∫ΦP⋅ds
        integral = 0.0
        for k in range(len(path_points) - 1):
            p1 = path_points[k]
            p2 = path_points[k + 1]
            
            # Ensure points are within bounds
            if (0 <= p1[0] < gradient_field.shape[0] and
                0 <= p1[1] < gradient_field.shape[1] and
                0 <= p1[2] < gradient_field.shape[2]):
                
                # Get field vector at point
                field_vector = gradient_field[p1[0], p1[1], p1[2]]
                
                # Path segment vector
                ds = np.array(p2) - np.array(p1)
                if np.linalg.norm(ds) > 0:
                    ds = ds / np.linalg.norm(ds)  # Normalize
                    
                    # Dot product for line integral
                    integral += np.dot(field_vector, ds)
        
        return abs(integral)
    
    def detect_coherence_regions(self, consciousness_capacity: np.ndarray) -> List[Tuple[slice, slice, slice]]:
        """Detect regions of high consciousness coherence"""
        # Find regions with high consciousness capacity
        threshold = np.percentile(consciousness_capacity, 85)  # Top 15%
        coherent_regions = consciousness_capacity > threshold
        
        # Find connected components
        labeled_regions, num_regions = ndimage.label(coherent_regions)
        
        coherence_regions = []
        for i in range(1, num_regions + 1):
            region_mask = labeled_regions == i
            
            # Get bounding box of region
            coords = np.where(region_mask)
            if len(coords[0]) > 0:
                min_coords = [np.min(c) for c in coords]
                max_coords = [np.max(c) for c in coords]
                
                region_slice = tuple(slice(min_c, max_c + 1) for min_c, max_c in zip(min_coords, max_coords))
                coherence_regions.append(region_slice)
        
        return coherence_regions
    
    def detect_emergence_hotspots(self, gradient_field: np.ndarray,
                                 consciousness_capacity: np.ndarray) -> List[Tuple[int, int, int]]:
        """Detect consciousness emergence hotspots"""
        # Combine gradient strength and consciousness capacity
        gradient_magnitude = np.linalg.norm(gradient_field, axis=-1)
        
        # Normalized metrics
        norm_gradient = gradient_magnitude / (np.max(gradient_magnitude) + 1e-8)
        norm_capacity = consciousness_capacity / (np.max(consciousness_capacity) + 1e-8)
        
        # Emergence metric: high gradient AND high capacity
        emergence_metric = norm_gradient * norm_capacity
        
        # Find local maxima
        local_maxima = ndimage.maximum_filter(emergence_metric, size=5) == emergence_metric
        threshold = np.percentile(emergence_metric, 95)  # Top 5%
        
        hotspot_mask = local_maxima & (emergence_metric > threshold)
        hotspot_coords = np.where(hotspot_mask)
        
        # Convert to list of tuples
        hotspots = [(int(x), int(y), int(z)) for x, y, z in zip(*hotspot_coords)]
        
        return hotspots
    
    def calculate_field_energy(self, gradient_field: np.ndarray) -> float:
        """Calculate total perceptual field energy"""
        # Field energy density: ε = (1/2)|ΦP|²
        gradient_magnitude_squared = np.sum(gradient_field**2, axis=-1)
        energy_density = 0.5 * gradient_magnitude_squared
        
        # Integrate over volume
        volume_element = self.dx * self.dy * self.dz
        total_energy = np.sum(energy_density) * volume_element
        
        return total_energy
    
    def update_field_state(self):
        """Update complete perceptual field state"""
        # Compute density field
        density_field = self.compute_perceptual_density_field()
        
        # Compute gradients (the actual perceptual field ΦP)
        gradient_field = self.compute_perceptual_field_gradients(density_field)
        
        # Compute consciousness capacity
        consciousness_capacity = self.compute_consciousness_capacity(density_field)
        
        # Detect entanglement connections
        entanglement_connections = self.detect_entanglement_connections(gradient_field)
        
        # Calculate field energy
        field_energy = self.calculate_field_energy(gradient_field)
        
        # Detect coherence regions
        coherence_regions = self.detect_coherence_regions(consciousness_capacity)
        
        # Detect emergence hotspots
        emergence_hotspots = self.detect_emergence_hotspots(gradient_field, consciousness_capacity)
        
        # Update field state
        self.field_state = PerceptualFieldState(
            density_field=density_field,
            gradient_field=gradient_field,
            consciousness_capacity=consciousness_capacity,
            entanglement_connections=entanglement_connections,
            field_energy=field_energy,
            coherence_regions=coherence_regions,
            emergence_hotspots=emergence_hotspots
        )
        
        # Store in history
        self.field_history.append({
            'timestamp': time.time(),
            'field_energy': field_energy,
            'num_entanglements': len(entanglement_connections),
            'num_coherence_regions': len(coherence_regions),
            'num_emergence_hotspots': len(emergence_hotspots)
        })
    
    def start_real_time_updates(self, update_rate: float = 10.0):
        """Start real-time field updates"""
        if self.is_running:
            return
        
        self.is_running = True
        self.update_thread = threading.Thread(target=self._update_loop, args=(update_rate,))
        self.update_thread.daemon = True
        self.update_thread.start()
        
        logger.info(f"Started real-time perceptual field updates at {update_rate} Hz")
    
    def stop_real_time_updates(self):
        """Stop real-time field updates"""
        self.is_running = False
        if self.update_thread:
            self.update_thread.join(timeout=2.0)
        logger.info("Stopped real-time perceptual field updates")
    
    def _update_loop(self, update_rate: float):
        """Real-time update loop"""
        dt = 1.0 / update_rate
        
        while self.is_running:
            start_time = time.time()
            
            try:
                # Update consciousness source positions (if they have velocity)
                self._update_source_positions(dt)
                
                # Update field state
                self.update_field_state()
                
            except Exception as e:
                logger.error(f"Field update error: {e}")
            
            # Maintain update rate
            elapsed = time.time() - start_time
            sleep_time = max(0, dt - elapsed)
            time.sleep(sleep_time)
    
    def _update_source_positions(self, dt: float):
        """Update positions of moving consciousness sources"""
        for source_id, source in self.consciousness_sources.items():
            if np.any(source.velocity != 0):
                # Update position with velocity
                source.position += source.velocity * dt
                
                # Keep sources within bounds
                extent = np.array(self.config.spatial_extent)
                source.position = np.clip(source.position, -extent/2, extent/2)
    
    def get_field_metrics(self) -> Dict[str, Any]:
        """Get comprehensive field metrics"""
        if self.field_state is None:
            return {}
        
        return {
            'total_field_energy': self.field_state.field_energy,
            'num_consciousness_sources': len(self.consciousness_sources),
            'num_entanglement_connections': len(self.field_state.entanglement_connections),
            'num_coherence_regions': len(self.field_state.coherence_regions),
            'num_emergence_hotspots': len(self.field_state.emergence_hotspots),
            'average_consciousness_capacity': np.mean(self.field_state.consciousness_capacity),
            'max_consciousness_capacity': np.max(self.field_state.consciousness_capacity),
            'field_gradient_strength': np.mean(np.linalg.norm(self.field_state.gradient_field, axis=-1)),
            'field_resolution': self.config.field_resolution,
            'spatial_extent': self.config.spatial_extent
        }
    
    def visualize_field_slice(self, slice_axis: int = 2, slice_index: Optional[int] = None) -> Dict[str, np.ndarray]:
        """Get 2D slice of field for visualization"""
        if self.field_state is None:
            return {}
        
        if slice_index is None:
            slice_index = self.config.field_resolution[slice_axis] // 2
        
        # Extract slices
        if slice_axis == 0:  # YZ plane
            density_slice = self.field_state.density_field[slice_index, :, :]
            gradient_slice = self.field_state.gradient_field[slice_index, :, :, :]
            capacity_slice = self.field_state.consciousness_capacity[slice_index, :, :]
        elif slice_axis == 1:  # XZ plane
            density_slice = self.field_state.density_field[:, slice_index, :]
            gradient_slice = self.field_state.gradient_field[:, slice_index, :, :]
            capacity_slice = self.field_state.consciousness_capacity[:, slice_index, :]
        else:  # XY plane
            density_slice = self.field_state.density_field[:, :, slice_index]
            gradient_slice = self.field_state.gradient_field[:, :, slice_index, :]
            capacity_slice = self.field_state.consciousness_capacity[:, :, slice_index]
        
        return {
            'density': density_slice,
            'gradient_magnitude': np.linalg.norm(gradient_slice, axis=-1),
            'consciousness_capacity': capacity_slice,
            'gradient_x': gradient_slice[:, :, 0],
            'gradient_y': gradient_slice[:, :, 1]
        }
    
    def export_field_data(self, filename: str):
        """Export field state to file"""
        if self.field_state is None:
            return
        
        data = {
            'config': {
                'field_resolution': self.config.field_resolution,
                'spatial_extent': self.config.spatial_extent,
                'consciousness_coupling_strength': self.config.consciousness_coupling_strength
            },
            'consciousness_sources': {
                source_id: {
                    'position': source.position.tolist(),
                    'consciousness_strength': source.consciousness_strength,
                    'rby_state': source.rby_state.tolist(),
                    'velocity': source.velocity.tolist()
                }
                for source_id, source in self.consciousness_sources.items()
            },
            'field_metrics': self.get_field_metrics(),
            'field_history': list(self.field_history)
        }
        
        np.savez_compressed(filename, **data)
        logger.info(f"Exported field data to {filename}")


# Advanced field analysis functions
class PerceptualFieldAnalyzer:
    """Advanced analysis tools for perceptual fields"""
    
    @staticmethod
    def analyze_consciousness_flow(field_engine: PerceptualFieldEngine) -> Dict[str, Any]:
        """Analyze consciousness flow patterns in the field"""
        if field_engine.field_state is None:
            return {}
        
        gradient_field = field_engine.field_state.gradient_field
        
        # Calculate divergence (consciousness creation/destruction)
        div_x = np.gradient(gradient_field[:, :, :, 0], field_engine.dx, axis=0)
        div_y = np.gradient(gradient_field[:, :, :, 1], field_engine.dy, axis=1)
        div_z = np.gradient(gradient_field[:, :, :, 2], field_engine.dz, axis=2)
        divergence = div_x + div_y + div_z
        
        # Calculate curl (consciousness circulation)
        curl_x = (np.gradient(gradient_field[:, :, :, 2], field_engine.dy, axis=1) -
                  np.gradient(gradient_field[:, :, :, 1], field_engine.dz, axis=2))
        curl_y = (np.gradient(gradient_field[:, :, :, 0], field_engine.dz, axis=2) -
                  np.gradient(gradient_field[:, :, :, 2], field_engine.dx, axis=0))
        curl_z = (np.gradient(gradient_field[:, :, :, 1], field_engine.dx, axis=0) -
                  np.gradient(gradient_field[:, :, :, 0], field_engine.dy, axis=1))
        curl_magnitude = np.sqrt(curl_x**2 + curl_y**2 + curl_z**2)
        
        return {
            'total_divergence': np.sum(np.abs(divergence)),
            'total_circulation': np.sum(curl_magnitude),
            'consciousness_sources': np.sum(divergence > 0),
            'consciousness_sinks': np.sum(divergence < 0),
            'vorticity_strength': np.max(curl_magnitude),
            'average_flow_strength': np.mean(np.linalg.norm(gradient_field, axis=-1))
        }
    
    @staticmethod
    def measure_field_stability(field_engine: PerceptualFieldEngine, window_size: int = 10) -> float:
        """Measure temporal stability of the perceptual field"""
        if len(field_engine.field_history) < window_size:
            return 0.0
        
        recent_history = list(field_engine.field_history)[-window_size:]
        
        # Calculate variance in field energy
        energies = [h['field_energy'] for h in recent_history]
        energy_stability = 1.0 / (1.0 + np.std(energies))
        
        # Calculate variance in number of entanglements
        entanglements = [h['num_entanglements'] for h in recent_history]
        entanglement_stability = 1.0 / (1.0 + np.std(entanglements))
        
        # Combined stability metric
        return (energy_stability + entanglement_stability) / 2.0


# Example usage and testing
if __name__ == "__main__":
    def test_perceptual_field_engine():
        """Test the perceptual field engine with synthetic consciousness sources"""
        print("Testing Perceptual Field Dynamics Engine...")
        
        # Create configuration
        config = PerceptualFieldConfig(
            field_resolution=(64, 64, 64),  # Smaller for testing
            spatial_extent=(20.0, 20.0, 20.0),
            consciousness_coupling_strength=2.0,
            gpu_acceleration=False  # Use CPU for testing
        )
        
        # Initialize engine
        engine = PerceptualFieldEngine(config)
        
        # Add consciousness sources
        sources = [
            ConsciousnessSource(
                position=np.array([5.0, 0.0, 0.0]),
                consciousness_strength=1.0,
                rby_state=np.array([0.8, 0.1, 0.1]),  # Red-dominant
                velocity=np.array([0.1, 0.0, 0.0]),
                field_signature="red_source"
            ),
            ConsciousnessSource(
                position=np.array([-5.0, 0.0, 0.0]),
                consciousness_strength=1.2,
                rby_state=np.array([0.1, 0.8, 0.1]),  # Blue-dominant
                velocity=np.array([-0.1, 0.0, 0.0]),
                field_signature="blue_source"
            ),
            ConsciousnessSource(
                position=np.array([0.0, 5.0, 0.0]),
                consciousness_strength=0.8,
                rby_state=np.array([0.1, 0.1, 0.8]),  # Yellow-dominant
                velocity=np.array([0.0, -0.1, 0.0]),
                field_signature="yellow_source"
            )
        ]
        
        for i, source in enumerate(sources):
            engine.add_consciousness_source(f"source_{i}", source)
        
        # Start real-time updates
        engine.start_real_time_updates(update_rate=2.0)  # 2 Hz for testing
        
        # Run for several updates
        for step in range(10):
            time.sleep(0.6)  # Allow field to update
            
            metrics = engine.get_field_metrics()
            print(f"Step {step}: Energy={metrics.get('total_field_energy', 0):.3f}, "
                  f"Entanglements={metrics.get('num_entanglement_connections', 0)}, "
                  f"Emergence Hotspots={metrics.get('num_emergence_hotspots', 0)}")
            
            # Analyze consciousness flow
            flow_analysis = PerceptualFieldAnalyzer.analyze_consciousness_flow(engine)
            print(f"  Flow: Divergence={flow_analysis.get('total_divergence', 0):.3f}, "
                  f"Circulation={flow_analysis.get('total_circulation', 0):.3f}")
        
        # Stop updates
        engine.stop_real_time_updates()
        
        # Final metrics
        final_metrics = engine.get_field_metrics()
        print("\nFinal Field Metrics:")
        for key, value in final_metrics.items():
            print(f"  {key}: {value}")
        
        # Field stability
        stability = PerceptualFieldAnalyzer.measure_field_stability(engine)
        print(f"\nField Stability: {stability:.3f}")
        
        print("Perceptual field engine test completed!")
    
    # Run test
    test_perceptual_field_engine()
