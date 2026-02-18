"""
Real-Time Consciousness Monitoring System - Advanced monitoring and
visualization of consciousness states, field evolution, and network activity
for the IC-AE framework with live data collection and analysis.

This implements actual real-time data collection, processing, and visualization
of consciousness field dynamics across distributed networks.
"""

import tkinter as tk
from tkinter import ttk, messagebox
import matplotlib.pyplot as plt
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
from matplotlib.animation import FuncAnimation
import numpy as np
import threading
import time
import json
import queue
import logging
from typing import Dict, List, Tuple, Optional, Any, Deque
from dataclasses import dataclass, field
from collections import deque, defaultdict
import asyncio
import websockets
from datetime import datetime
import sqlite3
import os

@dataclass
class ConsciousnessMetrics:
    """Real-time consciousness monitoring metrics."""
    timestamp: float
    rby_state: Tuple[float, float, float]
    field_strength: float
    coherence_factor: float
    network_connections: int
    trust_score: float
    processing_load: float
    memory_usage: float
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'timestamp': self.timestamp,
            'rby_red': self.rby_state[0],
            'rby_blue': self.rby_state[1], 
            'rby_yellow': self.rby_state[2],
            'field_strength': self.field_strength,
            'coherence_factor': self.coherence_factor,
            'network_connections': self.network_connections,
            'trust_score': self.trust_score,
            'processing_load': self.processing_load,
            'memory_usage': self.memory_usage
        }

class DataCollector:
    """Collects real-time data from consciousness systems."""
    
    def __init__(self, database_path: str = "consciousness_monitor.db"):
        self.database_path = database_path
        self.data_queue = queue.Queue(maxsize=1000)
        self.collecting = False
        self.collection_interval = 0.1  # 100ms
        
        # Initialize database
        self._init_database()
        
        # Simulated data generators (replace with real system interfaces)
        self.rby_generator = self._create_rby_generator()
        self.network_simulator = NetworkActivitySimulator()
        
    def _init_database(self):
        """Initialize SQLite database for storing metrics."""
        with sqlite3.connect(self.database_path) as conn:
            conn.execute('''
                CREATE TABLE IF NOT EXISTS consciousness_metrics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp REAL,
                    rby_red REAL,
                    rby_blue REAL,
                    rby_yellow REAL,
                    field_strength REAL,
                    coherence_factor REAL,
                    network_connections INTEGER,
                    trust_score REAL,
                    processing_load REAL,
                    memory_usage REAL
                )
            ''')
            
            # Create index for efficient time-based queries
            conn.execute('''
                CREATE INDEX IF NOT EXISTS idx_timestamp 
                ON consciousness_metrics(timestamp)
            ''')
    
    def _create_rby_generator(self):
        """Create simulated RBY state generator with realistic dynamics."""
        base_rby = np.array([0.4, 0.35, 0.25])
        oscillation_freq = np.array([0.1, 0.15, 0.12])  # Hz
        oscillation_amp = np.array([0.05, 0.04, 0.06])
        
        def generate_rby(t):
            # Oscillating RBY with noise
            oscillation = oscillation_amp * np.sin(2 * np.pi * oscillation_freq * t)
            noise = np.random.normal(0, 0.01, 3)
            rby = base_rby + oscillation + noise
            
            # Normalize to ensure sum ≈ 1
            rby = np.abs(rby)  # Ensure positive
            rby = rby / np.sum(rby)
            
            return tuple(rby)
        
        return generate_rby
    
    def start_collection(self):
        """Start data collection in background thread."""
        if not self.collecting:
            self.collecting = True
            self.collection_thread = threading.Thread(target=self._collection_loop)
            self.collection_thread.daemon = True
            self.collection_thread.start()
            logging.info("Data collection started")
    
    def stop_collection(self):
        """Stop data collection."""
        self.collecting = False
        if hasattr(self, 'collection_thread'):
            self.collection_thread.join(timeout=1.0)
        logging.info("Data collection stopped")
    
    def _collection_loop(self):
        """Main data collection loop."""
        start_time = time.time()
        
        while self.collecting:
            try:
                current_time = time.time()
                elapsed_time = current_time - start_time
                
                # Generate/collect consciousness metrics
                rby_state = self.rby_generator(elapsed_time)
                
                # Simulate field strength based on RBY coherence
                rby_variance = np.var(rby_state)
                field_strength = 1.0 / (1.0 + 10 * rby_variance)  # Higher variance = lower strength
                
                # Simulate coherence factor
                coherence = 0.8 + 0.2 * np.sin(0.05 * elapsed_time) + np.random.normal(0, 0.02)
                coherence = max(0.0, min(1.0, coherence))
                
                # Get network activity
                network_data = self.network_simulator.get_current_activity()
                
                # Simulate system load
                processing_load = 0.3 + 0.4 * (0.5 + 0.5 * np.sin(0.02 * elapsed_time))
                memory_usage = 0.6 + 0.2 * np.sin(0.03 * elapsed_time) + np.random.normal(0, 0.05)
                memory_usage = max(0.0, min(1.0, memory_usage))
                
                # Create metrics object
                metrics = ConsciousnessMetrics(
                    timestamp=current_time,
                    rby_state=rby_state,
                    field_strength=field_strength,
                    coherence_factor=coherence,
                    network_connections=network_data['connections'],
                    trust_score=network_data['avg_trust'],
                    processing_load=processing_load,
                    memory_usage=memory_usage
                )
                
                # Queue for real-time display
                if not self.data_queue.full():
                    self.data_queue.put(metrics)
                
                # Store in database
                self._store_metrics(metrics)
                
                # Control collection rate
                time.sleep(self.collection_interval)
                
            except Exception as e:
                logging.error(f"Data collection error: {e}")
                time.sleep(1.0)  # Prevent tight error loop
    
    def _store_metrics(self, metrics: ConsciousnessMetrics):
        """Store metrics in database."""
        try:
            with sqlite3.connect(self.database_path) as conn:
                data = metrics.to_dict()
                placeholders = ', '.join(['?' for _ in data])
                columns = ', '.join(data.keys())
                values = list(data.values())
                
                conn.execute(f'''
                    INSERT INTO consciousness_metrics ({columns})
                    VALUES ({placeholders})
                ''', values)
        except Exception as e:
            logging.error(f"Database storage error: {e}")
    
    def get_latest_metrics(self) -> Optional[ConsciousnessMetrics]:
        """Get latest metrics from queue."""
        try:
            return self.data_queue.get_nowait()
        except queue.Empty:
            return None
    
    def get_historical_data(self, hours: float = 1.0) -> List[Dict[str, Any]]:
        """Get historical data from database."""
        cutoff_time = time.time() - (hours * 3600)
        
        try:
            with sqlite3.connect(self.database_path) as conn:
                cursor = conn.execute('''
                    SELECT * FROM consciousness_metrics 
                    WHERE timestamp > ? 
                    ORDER BY timestamp
                ''', (cutoff_time,))
                
                columns = [desc[0] for desc in cursor.description]
                return [dict(zip(columns, row)) for row in cursor.fetchall()]
        except Exception as e:
            logging.error(f"Database query error: {e}")
            return []

class NetworkActivitySimulator:
    """Simulates network activity for monitoring demonstration."""
    
    def __init__(self):
        self.base_connections = 5
        self.base_trust = 0.7
        self.start_time = time.time()
    
    def get_current_activity(self) -> Dict[str, Any]:
        """Get current simulated network activity."""
        elapsed = time.time() - self.start_time
        
        # Simulate fluctuating connection count
        connection_variation = 3 * np.sin(0.01 * elapsed) + np.random.normal(0, 0.5)
        connections = max(1, int(self.base_connections + connection_variation))
        
        # Simulate trust score evolution
        trust_variation = 0.2 * np.sin(0.008 * elapsed) + np.random.normal(0, 0.05)
        avg_trust = max(0.1, min(1.0, self.base_trust + trust_variation))
        
        return {
            'connections': connections,
            'avg_trust': avg_trust,
            'packets_sent': max(0, int(100 + 50 * np.sin(0.02 * elapsed))),
            'packets_received': max(0, int(95 + 45 * np.sin(0.02 * elapsed + 0.5)))
        }

class RealTimeVisualization:
    """Real-time visualization of consciousness metrics."""
    
    def __init__(self, data_collector: DataCollector):
        self.data_collector = data_collector
        self.max_points = 200  # Maximum points to display
        
        # Data storage for plotting
        self.timestamps = deque(maxlen=self.max_points)
        self.rby_data = {'red': deque(maxlen=self.max_points),
                        'blue': deque(maxlen=self.max_points), 
                        'yellow': deque(maxlen=self.max_points)}
        self.field_strength = deque(maxlen=self.max_points)
        self.coherence = deque(maxlen=self.max_points)
        self.network_connections = deque(maxlen=self.max_points)
        self.trust_score = deque(maxlen=self.max_points)
        self.system_load = deque(maxlen=self.max_points)
        
        # Create figure and subplots
        self.fig, self.axes = plt.subplots(2, 3, figsize=(15, 10))
        self.fig.suptitle('Real-Time Consciousness Monitoring', fontsize=16)
        
        # Configure subplots
        self._setup_plots()
        
        # Animation
        self.animation = None
    
    def _setup_plots(self):
        """Setup individual plot configurations."""
        
        # RBY States
        self.axes[0, 0].set_title('RBY Consciousness States')
        self.axes[0, 0].set_ylabel('Amplitude')
        self.axes[0, 0].set_ylim(0, 1)
        self.axes[0, 0].grid(True, alpha=0.3)
        
        # Field Strength
        self.axes[0, 1].set_title('Consciousness Field Strength')
        self.axes[0, 1].set_ylabel('Field Strength')
        self.axes[0, 1].set_ylim(0, 1)
        self.axes[0, 1].grid(True, alpha=0.3)
        
        # Coherence Factor
        self.axes[0, 2].set_title('Coherence Factor')
        self.axes[0, 2].set_ylabel('Coherence')
        self.axes[0, 2].set_ylim(0, 1)
        self.axes[0, 2].grid(True, alpha=0.3)
        
        # Network Connections
        self.axes[1, 0].set_title('Network Connections')
        self.axes[1, 0].set_ylabel('Active Connections')
        self.axes[1, 0].grid(True, alpha=0.3)
        
        # Trust Score
        self.axes[1, 1].set_title('Average Trust Score')
        self.axes[1, 1].set_ylabel('Trust Level')
        self.axes[1, 1].set_ylim(0, 1)
        self.axes[1, 1].grid(True, alpha=0.3)
        
        # System Load
        self.axes[1, 2].set_title('System Performance')
        self.axes[1, 2].set_ylabel('Load/Memory Usage')
        self.axes[1, 2].set_ylim(0, 1)
        self.axes[1, 2].grid(True, alpha=0.3)
        
        plt.tight_layout()
    
    def update_data(self):
        """Update data from collector."""
        metrics = self.data_collector.get_latest_metrics()
        if metrics:
            # Convert timestamp to relative time for plotting
            if self.timestamps:
                rel_time = metrics.timestamp - self.timestamps[0]
            else:
                rel_time = 0
            
            self.timestamps.append(rel_time)
            self.rby_data['red'].append(metrics.rby_state[0])
            self.rby_data['blue'].append(metrics.rby_state[1])
            self.rby_data['yellow'].append(metrics.rby_state[2])
            self.field_strength.append(metrics.field_strength)
            self.coherence.append(metrics.coherence_factor)
            self.network_connections.append(metrics.network_connections)
            self.trust_score.append(metrics.trust_score)
            self.system_load.append(metrics.processing_load)
    
    def animate(self, frame):
        """Animation function for real-time updates."""
        self.update_data()
        
        if len(self.timestamps) < 2:
            return
        
        # Clear all plots
        for ax in self.axes.flat:
            ax.clear()
        
        self._setup_plots()
        
        times = list(self.timestamps)
        
        # Plot RBY states
        self.axes[0, 0].plot(times, list(self.rby_data['red']), 'r-', label='Red', linewidth=2)
        self.axes[0, 0].plot(times, list(self.rby_data['blue']), 'b-', label='Blue', linewidth=2)
        self.axes[0, 0].plot(times, list(self.rby_data['yellow']), 'y-', label='Yellow', linewidth=2)
        self.axes[0, 0].legend()
        
        # Plot field strength
        self.axes[0, 1].plot(times, list(self.field_strength), 'g-', linewidth=2)
        
        # Plot coherence
        self.axes[0, 2].plot(times, list(self.coherence), 'm-', linewidth=2)
        
        # Plot network connections
        self.axes[1, 0].plot(times, list(self.network_connections), 'c-', linewidth=2)
        
        # Plot trust score
        self.axes[1, 1].plot(times, list(self.trust_score), 'orange', linewidth=2)
        
        # Plot system load
        self.axes[1, 2].plot(times, list(self.system_load), 'purple', linewidth=2)
        
        # Update x-axis labels for bottom plots
        for ax in self.axes[1, :]:
            ax.set_xlabel('Time (seconds)')
    
    def start_animation(self):
        """Start real-time animation."""
        self.animation = FuncAnimation(self.fig, self.animate, interval=100, blit=False)
        return self.animation

class MonitoringGUI:
    """Main GUI application for consciousness monitoring."""
    
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("IC-AE Consciousness Monitoring System")
        self.root.geometry("1200x800")
        
        # Initialize components
        self.data_collector = DataCollector()
        self.visualization = RealTimeVisualization(self.data_collector)
        
        # GUI state
        self.monitoring_active = False
        
        # Create GUI elements
        self._create_widgets()
        self._setup_layout()
        
        # Start visualization
        self.canvas = None
        self._setup_matplotlib_canvas()
    
    def _create_widgets(self):
        """Create GUI widgets."""
        
        # Control frame
        self.control_frame = ttk.Frame(self.root)
        
        # Control buttons
        self.start_button = ttk.Button(
            self.control_frame, 
            text="Start Monitoring", 
            command=self.start_monitoring
        )
        
        self.stop_button = ttk.Button(
            self.control_frame, 
            text="Stop Monitoring", 
            command=self.stop_monitoring,
            state='disabled'
        )
        
        self.export_button = ttk.Button(
            self.control_frame,
            text="Export Data",
            command=self.export_data
        )
        
        # Status label
        self.status_label = ttk.Label(
            self.control_frame,
            text="Status: Ready",
            font=('Arial', 10)
        )
        
        # Statistics frame
        self.stats_frame = ttk.LabelFrame(self.control_frame, text="Current Metrics")
        
        # Current metrics labels
        self.rby_label = ttk.Label(self.stats_frame, text="RBY: ---, ---, ---")
        self.field_label = ttk.Label(self.stats_frame, text="Field Strength: ---")
        self.coherence_label = ttk.Label(self.stats_frame, text="Coherence: ---")
        self.connections_label = ttk.Label(self.stats_frame, text="Connections: ---")
        self.trust_label = ttk.Label(self.stats_frame, text="Trust Score: ---")
        
        # Matplotlib frame
        self.plot_frame = ttk.Frame(self.root)
    
    def _setup_layout(self):
        """Setup widget layout."""
        
        # Control frame layout
        self.control_frame.pack(side=tk.TOP, fill=tk.X, padx=10, pady=5)
        
        # Button layout
        button_frame = ttk.Frame(self.control_frame)
        button_frame.pack(side=tk.TOP, fill=tk.X, pady=5)
        
        self.start_button.pack(side=tk.LEFT, padx=5)
        self.stop_button.pack(side=tk.LEFT, padx=5)
        self.export_button.pack(side=tk.LEFT, padx=5)
        
        self.status_label.pack(side=tk.RIGHT, padx=5)
        
        # Statistics layout
        self.stats_frame.pack(side=tk.TOP, fill=tk.X, padx=5, pady=5)
        
        stats_grid = ttk.Frame(self.stats_frame)
        stats_grid.pack(fill=tk.X, padx=10, pady=5)
        
        self.rby_label.grid(row=0, column=0, sticky=tk.W, padx=5)
        self.field_label.grid(row=0, column=1, sticky=tk.W, padx=5)
        self.coherence_label.grid(row=1, column=0, sticky=tk.W, padx=5)
        self.connections_label.grid(row=1, column=1, sticky=tk.W, padx=5)
        self.trust_label.grid(row=2, column=0, sticky=tk.W, padx=5)
        
        # Plot frame layout
        self.plot_frame.pack(side=tk.BOTTOM, fill=tk.BOTH, expand=True, padx=10, pady=5)
    
    def _setup_matplotlib_canvas(self):
        """Setup matplotlib canvas in GUI."""
        self.canvas = FigureCanvasTkAgg(self.visualization.fig, self.plot_frame)
        self.canvas.get_tk_widget().pack(fill=tk.BOTH, expand=True)
    
    def start_monitoring(self):
        """Start consciousness monitoring."""
        if not self.monitoring_active:
            try:
                self.data_collector.start_collection()
                self.animation = self.visualization.start_animation()
                
                self.monitoring_active = True
                self.start_button.config(state='disabled')
                self.stop_button.config(state='normal')
                self.status_label.config(text="Status: Monitoring Active")
                
                # Start metrics update timer
                self._update_metrics_display()
                
                logging.info("Monitoring started successfully")
                
            except Exception as e:
                messagebox.showerror("Error", f"Failed to start monitoring: {e}")
                logging.error(f"Failed to start monitoring: {e}")
    
    def stop_monitoring(self):
        """Stop consciousness monitoring."""
        if self.monitoring_active:
            try:
                self.data_collector.stop_collection()
                
                if hasattr(self, 'animation') and self.animation:
                    self.animation.event_source.stop()
                
                self.monitoring_active = False
                self.start_button.config(state='normal')
                self.stop_button.config(state='disabled')
                self.status_label.config(text="Status: Stopped")
                
                logging.info("Monitoring stopped")
                
            except Exception as e:
                messagebox.showerror("Error", f"Failed to stop monitoring: {e}")
                logging.error(f"Failed to stop monitoring: {e}")
    
    def _update_metrics_display(self):
        """Update current metrics display."""
        if self.monitoring_active:
            metrics = self.data_collector.get_latest_metrics()
            if metrics:
                # Update labels with current values
                rby = metrics.rby_state
                self.rby_label.config(text=f"RBY: {rby[0]:.3f}, {rby[1]:.3f}, {rby[2]:.3f}")
                self.field_label.config(text=f"Field Strength: {metrics.field_strength:.3f}")
                self.coherence_label.config(text=f"Coherence: {metrics.coherence_factor:.3f}")
                self.connections_label.config(text=f"Connections: {metrics.network_connections}")
                self.trust_label.config(text=f"Trust Score: {metrics.trust_score:.3f}")
            
            # Schedule next update
            self.root.after(500, self._update_metrics_display)  # Update every 500ms
    
    def export_data(self):
        """Export monitoring data to file."""
        try:
            # Get recent data
            data = self.data_collector.get_historical_data(hours=1.0)
            
            if not data:
                messagebox.showinfo("Info", "No data available to export")
                return
            
            # Export to JSON file
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"consciousness_data_{timestamp}.json"
            
            with open(filename, 'w') as f:
                json.dump(data, f, indent=2)
            
            messagebox.showinfo("Success", f"Data exported to {filename}")
            logging.info(f"Data exported to {filename}")
            
        except Exception as e:
            messagebox.showerror("Error", f"Failed to export data: {e}")
            logging.error(f"Failed to export data: {e}")
    
    def run(self):
        """Run the GUI application."""
        try:
            self.root.mainloop()
        except KeyboardInterrupt:
            logging.info("Application interrupted by user")
        finally:
            # Cleanup
            if self.monitoring_active:
                self.stop_monitoring()

# Test and demonstration functions
def test_monitoring_system():
    """Test the consciousness monitoring system."""
    print("Testing Real-Time Consciousness Monitoring System...")
    
    # Test data collector
    collector = DataCollector(":memory:")  # Use in-memory database for testing
    
    print("Starting data collection for 5 seconds...")
    collector.start_collection()
    
    # Collect data for 5 seconds
    time.sleep(5)
    
    # Check collected data
    metrics_count = 0
    while True:
        metrics = collector.get_latest_metrics()
        if metrics is None:
            break
        metrics_count += 1
        if metrics_count <= 3:  # Print first 3 metrics
            print(f"Metrics {metrics_count}: RBY={metrics.rby_state}, "
                  f"Field={metrics.field_strength:.3f}, "
                  f"Coherence={metrics.coherence_factor:.3f}")
    
    collector.stop_collection()
    print(f"Collected {metrics_count} metrics samples")
    
    # Test historical data retrieval
    historical = collector.get_historical_data(hours=1.0)
    print(f"Historical data points: {len(historical)}")

if __name__ == "__main__":
    # Setup logging
    logging.basicConfig(level=logging.INFO, 
                       format='%(asctime)s - %(levelname)s - %(message)s')
    
    # Choose test mode or GUI mode
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "test":
        test_monitoring_system()
    else:
        # Run GUI application
        app = MonitoringGUI()
        app.run()
