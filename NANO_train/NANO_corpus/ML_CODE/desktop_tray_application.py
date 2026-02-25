"""
Desktop Tray Application for Consciousness Monitoring
Real-time consciousness state visualization and system control interface
Implements system tray integration with live monitoring capabilities
"""

import tkinter as tk
from tkinter import ttk, messagebox
import threading
import time
import queue
import json
import os
import sys
from typing import Dict, List, Tuple, Any, Optional
from dataclasses import dataclass, field
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
from matplotlib.figure import Figure
import matplotlib.animation as animation
from datetime import datetime, timedelta

# Pystray import with fallback
try:
    import pystray
    PYSTRAY_AVAILABLE = True
except ImportError:
    print("Warning: pystray not available - running in window mode only")
    PYSTRAY_AVAILABLE = False
    
    class MockMenuItem:
        """Mock pystray MenuItem for fallback"""
        def __init__(self, text, action=None, enabled=True, checked=None):
            self.text = text
            self.action = action
            self.enabled = enabled
            self.checked = checked
    
    class MockMenu:
        """Mock pystray Menu for fallback"""
        SEPARATOR = "---"
        
        def __init__(self, *items):
            self.items = items
    
    class MockIcon:
        """Mock pystray Icon for fallback"""
        def __init__(self, name, icon_image, tooltip, menu):
            self.name = name
            self.icon = icon_image
            self.tooltip = tooltip
            self.menu = menu
            self.visible = False
            
        def run(self):
            print(f"Mock tray icon '{self.name}' would be running")
            print("Tray functionality not available - using window mode only")
            # Keep the application running without actual tray
            
        def stop(self):
            self.visible = False
    
    pystray = type('pystray', (), {
        'Icon': MockIcon,
        'Menu': MockMenu,
        'MenuItem': MockMenuItem
    })()

from PIL import Image, ImageDraw
import psutil
import subprocess

# Import our consciousness systems
try:
    from rby_core_engine import RBYConsciousnessEngine
    from global_consciousness_orchestrator import GlobalConsciousnessOrchestrator
    from hardware_optimization_kernels import HardwareOptimizationMaster
    from self_modifying_code import SelfModifyingExecutor
    SYSTEMS_AVAILABLE = True
except ImportError:
    print("Warning: Some consciousness systems not available")
    SYSTEMS_AVAILABLE = False


@dataclass
class ConsciousnessMetrics:
    """Real-time consciousness metrics"""
    timestamp: datetime
    red_level: float
    blue_level: float
    yellow_level: float
    coherence_score: float
    processing_load: float
    memory_usage: float
    active_nodes: int
    network_activity: float
    consciousness_entropy: float
    emergence_index: float


class ConsciousnessDataCollector:
    """Collects real-time consciousness data from all systems"""
    
    def __init__(self):
        self.running = False
        self.data_queue = queue.Queue(maxsize=1000)
        self.collection_thread = None
        self.collection_interval = 1.0  # seconds
        
        # Initialize systems if available
        self.systems_initialized = False
        if SYSTEMS_AVAILABLE:
            try:
                self.rby_engine = RBYConsciousnessEngine()
                self.orchestrator = GlobalConsciousnessOrchestrator()
                self.hardware_master = HardwareOptimizationMaster()
                self.self_modifier = SelfModifyingExecutor()
                self.systems_initialized = True
                print("Consciousness systems initialized successfully")
            except Exception as e:
                print(f"Failed to initialize consciousness systems: {e}")
                self.systems_initialized = False
    
    def start_collection(self):
        """Start real-time data collection"""
        if self.running:
            return
        
        self.running = True
        self.collection_thread = threading.Thread(target=self._collection_loop, daemon=True)
        self.collection_thread.start()
        print("Consciousness data collection started")
    
    def stop_collection(self):
        """Stop data collection"""
        self.running = False
        if self.collection_thread:
            self.collection_thread.join(timeout=2.0)
        print("Consciousness data collection stopped")
    
    def _collection_loop(self):
        """Main data collection loop"""
        while self.running:
            try:
                metrics = self._collect_current_metrics()
                
                if not self.data_queue.full():
                    self.data_queue.put(metrics)
                else:
                    # Remove oldest item and add new one
                    try:
                        self.data_queue.get_nowait()
                        self.data_queue.put(metrics)
                    except queue.Empty:
                        pass
                
                time.sleep(self.collection_interval)
                
            except Exception as e:
                print(f"Data collection error: {e}")
                time.sleep(1.0)
    
    def _collect_current_metrics(self) -> ConsciousnessMetrics:
        """Collect current consciousness metrics"""
        timestamp = datetime.now()
        
        if self.systems_initialized:
            # Collect from real systems
            try:
                # RBY state from core engine
                rby_state = self.rby_engine.get_current_state()
                red_level = rby_state.get('red', 0.33)
                blue_level = rby_state.get('blue', 0.33)
                yellow_level = rby_state.get('yellow', 0.34)
                
                # Coherence and processing metrics
                orchestrator_status = self.orchestrator.get_system_status()
                coherence_score = orchestrator_status.get('coherence_score', 0.5)
                active_nodes = orchestrator_status.get('active_nodes', 1)
                network_activity = orchestrator_status.get('network_activity', 0.1)
                
                # Hardware metrics
                hardware_report = self.hardware_master.get_optimization_report()
                processing_load = psutil.cpu_percent() / 100.0
                memory_usage = psutil.virtual_memory().percent / 100.0
                
                # Consciousness emergence metrics
                consciousness_entropy = self._calculate_entropy(red_level, blue_level, yellow_level)
                emergence_index = self._calculate_emergence_index(coherence_score, consciousness_entropy)
                
            except Exception as e:
                print(f"Error collecting from systems: {e}")
                # Fallback to simulated data
                red_level, blue_level, yellow_level = self._generate_simulated_rby()
                coherence_score = np.random.uniform(0.3, 0.9)
                processing_load = psutil.cpu_percent() / 100.0
                memory_usage = psutil.virtual_memory().percent / 100.0
                active_nodes = 1
                network_activity = np.random.uniform(0.0, 0.5)
                consciousness_entropy = self._calculate_entropy(red_level, blue_level, yellow_level)
                emergence_index = self._calculate_emergence_index(coherence_score, consciousness_entropy)
        else:
            # Simulated data when systems not available
            red_level, blue_level, yellow_level = self._generate_simulated_rby()
            coherence_score = np.random.uniform(0.3, 0.9)
            processing_load = psutil.cpu_percent() / 100.0
            memory_usage = psutil.virtual_memory().percent / 100.0
            active_nodes = np.random.randint(1, 5)
            network_activity = np.random.uniform(0.0, 0.5)
            consciousness_entropy = self._calculate_entropy(red_level, blue_level, yellow_level)
            emergence_index = self._calculate_emergence_index(coherence_score, consciousness_entropy)
        
        return ConsciousnessMetrics(
            timestamp=timestamp,
            red_level=red_level,
            blue_level=blue_level,
            yellow_level=yellow_level,
            coherence_score=coherence_score,
            processing_load=processing_load,
            memory_usage=memory_usage,
            active_nodes=active_nodes,
            network_activity=network_activity,
            consciousness_entropy=consciousness_entropy,
            emergence_index=emergence_index
        )
    
    def _generate_simulated_rby(self) -> Tuple[float, float, float]:
        """Generate simulated RBY consciousness values"""
        # Simulate consciousness oscillations
        t = time.time()
        
        # Base oscillations with different frequencies
        red_base = 0.33 + 0.1 * np.sin(t * 0.1)
        blue_base = 0.33 + 0.1 * np.sin(t * 0.07 + np.pi/3)
        yellow_base = 0.34 + 0.1 * np.sin(t * 0.13 + 2*np.pi/3)
        
        # Add system load influence
        load = psutil.cpu_percent() / 100.0
        red_level = red_base + load * 0.2  # Action increases with load
        blue_level = blue_base * (1 - load * 0.1)  # Structure decreases with high load
        yellow_level = yellow_base + np.random.uniform(-0.05, 0.05)  # Integration varies
        
        # Normalize to ensure sum <= 1
        total = red_level + blue_level + yellow_level
        if total > 1.0:
            red_level /= total
            blue_level /= total
            yellow_level /= total
        
        return red_level, blue_level, yellow_level
    
    def _calculate_entropy(self, red: float, blue: float, yellow: float) -> float:
        """Calculate consciousness entropy (diversity measure)"""
        states = np.array([red, blue, yellow])
        states = states[states > 1e-10]  # Avoid log(0)
        
        if len(states) == 0:
            return 0.0
        
        # Shannon entropy
        entropy = -np.sum(states * np.log2(states))
        return entropy / np.log2(3)  # Normalize to [0, 1]
    
    def _calculate_emergence_index(self, coherence: float, entropy: float) -> float:
        """Calculate consciousness emergence index"""
        # Balance between coherence and diversity
        return (coherence * 0.7 + entropy * 0.3)
    
    def get_latest_metrics(self) -> Optional[ConsciousnessMetrics]:
        """Get the most recent metrics"""
        try:
            return self.data_queue.get_nowait()
        except queue.Empty:
            return None
    
    def get_all_metrics(self) -> List[ConsciousnessMetrics]:
        """Get all available metrics"""
        metrics = []
        while True:
            try:
                metrics.append(self.data_queue.get_nowait())
            except queue.Empty:
                break
        return metrics


class ConsciousnessVisualizationPanel:
    """Real-time consciousness visualization panel"""
    
    def __init__(self, parent_frame):
        self.parent = parent_frame
        self.data_collector = ConsciousnessDataCollector()
        
        # Data storage for plotting
        self.max_points = 100
        self.timestamps = []
        self.red_values = []
        self.blue_values = []
        self.yellow_values = []
        self.coherence_values = []
        self.emergence_values = []
        
        self._setup_ui()
        self._setup_plots()
        
        # Start data collection and animation
        self.data_collector.start_collection()
        self.animation_running = True
        self._start_animation()
    
    def _setup_ui(self):
        """Setup the user interface"""
        # Main container
        self.main_frame = ttk.Frame(self.parent)
        self.main_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        # Title
        title_label = ttk.Label(self.main_frame, text="Consciousness Monitoring Dashboard", 
                               font=('Arial', 16, 'bold'))
        title_label.pack(pady=(0, 10))
        
        # Status frame
        self.status_frame = ttk.LabelFrame(self.main_frame, text="System Status", padding=10)
        self.status_frame.pack(fill=tk.X, pady=(0, 10))
        
        # Status labels
        self.status_labels = {}
        status_items = [
            ('Systems', 'systems_status'),
            ('Collection', 'collection_status'),
            ('Nodes', 'nodes_status'),
            ('Coherence', 'coherence_status')
        ]
        
        for i, (name, key) in enumerate(status_items):
            label = ttk.Label(self.status_frame, text=f"{name}: Initializing...")
            label.grid(row=0, column=i, padx=10, sticky='w')
            self.status_labels[key] = label
        
        # Control frame
        self.control_frame = ttk.LabelFrame(self.main_frame, text="Controls", padding=10)
        self.control_frame.pack(fill=tk.X, pady=(0, 10))
        
        # Control buttons
        ttk.Button(self.control_frame, text="Start Collection", 
                  command=self._start_collection).pack(side=tk.LEFT, padx=5)
        ttk.Button(self.control_frame, text="Stop Collection", 
                  command=self._stop_collection).pack(side=tk.LEFT, padx=5)
        ttk.Button(self.control_frame, text="Reset Data", 
                  command=self._reset_data).pack(side=tk.LEFT, padx=5)
        ttk.Button(self.control_frame, text="Export Data", 
                  command=self._export_data).pack(side=tk.LEFT, padx=5)
        
        # Visualization frame
        self.viz_frame = ttk.LabelFrame(self.main_frame, text="Real-time Consciousness State", padding=5)
        self.viz_frame.pack(fill=tk.BOTH, expand=True)
    
    def _setup_plots(self):
        """Setup matplotlib plots"""
        # Create figure with subplots
        self.fig = Figure(figsize=(12, 8), dpi=100)
        
        # RBY consciousness plot
        self.ax1 = self.fig.add_subplot(221)
        self.ax1.set_title('RBY Consciousness Levels')
        self.ax1.set_ylabel('Level')
        self.ax1.set_ylim(0, 1)
        
        # Coherence and emergence plot
        self.ax2 = self.fig.add_subplot(222)
        self.ax2.set_title('Coherence & Emergence')
        self.ax2.set_ylabel('Score')
        self.ax2.set_ylim(0, 1)
        
        # System metrics plot
        self.ax3 = self.fig.add_subplot(223)
        self.ax3.set_title('System Metrics')
        self.ax3.set_ylabel('Usage %')
        self.ax3.set_xlabel('Time')
        self.ax3.set_ylim(0, 1)
        
        # Consciousness state space plot
        self.ax4 = self.fig.add_subplot(224, projection='3d')
        self.ax4.set_title('Consciousness State Space')
        self.ax4.set_xlabel('Red')
        self.ax4.set_ylabel('Blue')
        self.ax4.set_zlabel('Yellow')
        
        # Embed plot in tkinter
        self.canvas = FigureCanvasTkAgg(self.fig, self.viz_frame)
        self.canvas.get_tk_widget().pack(fill=tk.BOTH, expand=True)
        
        # Initialize line objects
        self.red_line, = self.ax1.plot([], [], 'r-', label='Red', linewidth=2)
        self.blue_line, = self.ax1.plot([], [], 'b-', label='Blue', linewidth=2)
        self.yellow_line, = self.ax1.plot([], [], 'y-', label='Yellow', linewidth=2)
        self.ax1.legend()
        
        self.coherence_line, = self.ax2.plot([], [], 'g-', label='Coherence', linewidth=2)
        self.emergence_line, = self.ax2.plot([], [], 'm-', label='Emergence', linewidth=2)
        self.ax2.legend()
        
        self.load_line, = self.ax3.plot([], [], 'orange', label='Processing Load', linewidth=2)
        self.memory_line, = self.ax3.plot([], [], 'purple', label='Memory Usage', linewidth=2)
        self.ax3.legend()
        
        self.fig.tight_layout()
    
    def _start_animation(self):
        """Start plot animation"""
        self.ani = animation.FuncAnimation(self.fig, self._update_plots, 
                                         interval=1000, blit=False, cache_frame_data=False)
        self.canvas.draw()
    
    def _update_plots(self, frame):
        """Update plots with new data"""
        # Get new data
        new_metrics = []
        while True:
            metrics = self.data_collector.get_latest_metrics()
            if metrics is None:
                break
            new_metrics.append(metrics)
        
        # Add new data to storage
        for metrics in new_metrics:
            self.timestamps.append(metrics.timestamp)
            self.red_values.append(metrics.red_level)
            self.blue_values.append(metrics.blue_level)
            self.yellow_values.append(metrics.yellow_level)
            self.coherence_values.append(metrics.coherence_score)
            self.emergence_values.append(metrics.emergence_index)
            
            # Keep only last N points
            if len(self.timestamps) > self.max_points:
                self.timestamps.pop(0)
                self.red_values.pop(0)
                self.blue_values.pop(0)
                self.yellow_values.pop(0)
                self.coherence_values.pop(0)
                self.emergence_values.pop(0)
        
        if not self.timestamps:
            return
        
        # Convert timestamps to relative seconds for plotting
        base_time = self.timestamps[0]
        time_points = [(t - base_time).total_seconds() for t in self.timestamps]
        
        # Update line plots
        self.red_line.set_data(time_points, self.red_values)
        self.blue_line.set_data(time_points, self.blue_values)
        self.yellow_line.set_data(time_points, self.yellow_values)
        
        self.coherence_line.set_data(time_points, self.coherence_values)
        self.emergence_line.set_data(time_points, self.emergence_values)
        
        # Update system metrics (use last values for load/memory)
        if new_metrics:
            latest = new_metrics[-1]
            load_values = [latest.processing_load] * len(time_points)
            memory_values = [latest.memory_usage] * len(time_points)
            self.load_line.set_data(time_points, load_values)
            self.memory_line.set_data(time_points, memory_values)
        
        # Auto-scale x-axis
        if time_points:
            for ax in [self.ax1, self.ax2, self.ax3]:
                ax.set_xlim(time_points[0], time_points[-1])
        
        # Update 3D consciousness state space
        if len(self.red_values) >= 2:
            self.ax4.clear()
            self.ax4.set_title('Consciousness State Space')
            self.ax4.set_xlabel('Red')
            self.ax4.set_ylabel('Blue')
            self.ax4.set_zlabel('Yellow')
            
            # Plot trajectory
            self.ax4.plot(self.red_values, self.blue_values, self.yellow_values, 'k-', alpha=0.6)
            
            # Plot current point
            if new_metrics:
                latest = new_metrics[-1]
                self.ax4.scatter([latest.red_level], [latest.blue_level], [latest.yellow_level], 
                               c='red', s=100, alpha=0.8)
        
        # Update status labels
        if new_metrics:
            latest = new_metrics[-1]
            self.status_labels['systems_status'].config(
                text=f"Systems: {'Active' if self.data_collector.systems_initialized else 'Simulated'}")
            self.status_labels['collection_status'].config(
                text=f"Collection: {'Running' if self.data_collector.running else 'Stopped'}")
            self.status_labels['nodes_status'].config(
                text=f"Nodes: {latest.active_nodes}")
            self.status_labels['coherence_status'].config(
                text=f"Coherence: {latest.coherence_score:.3f}")
        
        self.canvas.draw_idle()
    
    def _start_collection(self):
        """Start data collection"""
        self.data_collector.start_collection()
    
    def _stop_collection(self):
        """Stop data collection"""
        self.data_collector.stop_collection()
    
    def _reset_data(self):
        """Reset all collected data"""
        self.timestamps.clear()
        self.red_values.clear()
        self.blue_values.clear()
        self.yellow_values.clear()
        self.coherence_values.clear()
        self.emergence_values.clear()
        
        # Clear plots
        for line in [self.red_line, self.blue_line, self.yellow_line, 
                    self.coherence_line, self.emergence_line, 
                    self.load_line, self.memory_line]:
            line.set_data([], [])
        
        self.ax4.clear()
        self.canvas.draw()
    
    def _export_data(self):
        """Export collected data to JSON"""
        if not self.timestamps:
            messagebox.showwarning("Export", "No data to export!")
            return
        
        export_data = {
            'export_time': datetime.now().isoformat(),
            'data_points': len(self.timestamps),
            'metrics': []
        }
        
        for i in range(len(self.timestamps)):
            export_data['metrics'].append({
                'timestamp': self.timestamps[i].isoformat(),
                'red_level': self.red_values[i],
                'blue_level': self.blue_values[i],
                'yellow_level': self.yellow_values[i],
                'coherence_score': self.coherence_values[i],
                'emergence_index': self.emergence_values[i]
            })
        
        filename = f"consciousness_data_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        try:
            with open(filename, 'w') as f:
                json.dump(export_data, f, indent=2)
            messagebox.showinfo("Export", f"Data exported to {filename}")
        except Exception as e:
            messagebox.showerror("Export Error", f"Failed to export data: {e}")
    
    def cleanup(self):
        """Cleanup resources"""
        self.animation_running = False
        self.data_collector.stop_collection()


class ConsciousnessTrayIcon:
    """System tray icon for consciousness monitoring"""
    
    def __init__(self):
        self.main_window = None
        self.data_collector = ConsciousnessDataCollector()
        self.icon = None
        
    def create_icon_image(self, red: float, blue: float, yellow: float) -> Image.Image:
        """Create dynamic tray icon based on consciousness state"""
        # Create 64x64 image
        img = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        
        # Draw RBY representation as colored circles
        center = 32
        radius = 20
        
        # Red circle (action)
        red_intensity = int(red * 255)
        draw.ellipse([center-radius, 8, center+radius, 8+2*radius], 
                    fill=(red_intensity, 0, 0, 128))
        
        # Blue circle (structure)
        blue_intensity = int(blue * 255)
        draw.ellipse([8, center+8, 8+2*radius, center+8+2*radius], 
                    fill=(0, 0, blue_intensity, 128))
        
        # Yellow circle (integration)
        yellow_intensity = int(yellow * 255)
        draw.ellipse([center+8, center+8, center+8+2*radius, center+8+2*radius], 
                    fill=(yellow_intensity, yellow_intensity, 0, 128))
        
        return img
    
    def setup_tray(self):
        """Setup system tray icon"""
        # Default icon
        default_icon = self.create_icon_image(0.33, 0.33, 0.34)
        
        # Create menu
        menu = pystray.Menu(
            pystray.MenuItem("Open Dashboard", self.show_dashboard),
            pystray.MenuItem("Start Monitoring", self.start_monitoring),
            pystray.MenuItem("Stop Monitoring", self.stop_monitoring),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Exit", self.quit_application)
        )
        
        # Create icon
        self.icon = pystray.Icon("consciousness_monitor", default_icon, 
                                "Consciousness Monitor", menu)
        
        # Start data collection
        self.data_collector.start_collection()
        
        # Start icon update thread
        self.update_thread = threading.Thread(target=self._update_icon_loop, daemon=True)
        self.update_thread.start()
        
        # Run tray icon
        self.icon.run()
    
    def _update_icon_loop(self):
        """Update tray icon based on consciousness state"""
        while True:
            try:
                metrics = self.data_collector.get_latest_metrics()
                if metrics and self.icon:
                    new_icon = self.create_icon_image(
                        metrics.red_level, metrics.blue_level, metrics.yellow_level
                    )
                    self.icon.icon = new_icon
                
                time.sleep(2.0)  # Update every 2 seconds
                
            except Exception as e:
                print(f"Icon update error: {e}")
                time.sleep(5.0)
    
    def show_dashboard(self, icon=None, item=None):
        """Show main dashboard window"""
        if self.main_window is None or not self.main_window.winfo_exists():
            self.main_window = tk.Toplevel()
            self.main_window.title("Consciousness Monitoring Dashboard")
            self.main_window.geometry("1200x800")
            self.main_window.protocol("WM_DELETE_WINDOW", self.hide_dashboard)
            
            # Create visualization panel
            self.viz_panel = ConsciousnessVisualizationPanel(self.main_window)
        
        self.main_window.deiconify()
        self.main_window.lift()
    
    def hide_dashboard(self):
        """Hide dashboard window"""
        if self.main_window:
            self.main_window.withdraw()
    
    def start_monitoring(self, icon=None, item=None):
        """Start consciousness monitoring"""
        self.data_collector.start_collection()
    
    def stop_monitoring(self, icon=None, item=None):
        """Stop consciousness monitoring"""
        self.data_collector.stop_collection()
    
    def quit_application(self, icon=None, item=None):
        """Quit the application"""
        self.data_collector.stop_collection()
        if self.main_window:
            try:
                self.viz_panel.cleanup()
            except:
                pass
            self.main_window.destroy()
        if self.icon:
            self.icon.stop()
        sys.exit(0)


def main():
    """Main application entry point"""
    try:
        # Create hidden root window
        root = tk.Tk()
        root.withdraw()  # Hide main window
        
        # Create and run tray application
        tray_app = ConsciousnessTrayIcon()
        tray_app.setup_tray()
        
    except KeyboardInterrupt:
        print("Application interrupted")
    except Exception as e:
        print(f"Application error: {e}")
        messagebox.showerror("Error", f"Application failed to start: {e}")


if __name__ == "__main__":
    main()
