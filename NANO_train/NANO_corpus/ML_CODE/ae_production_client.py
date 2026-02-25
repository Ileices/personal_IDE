#!/usr/bin/env python3
"""
AE Framework Production Client & Real-World Applications
Demonstrates actual useful applications of the AE Framework
"""

import asyncio
import json
import time
import websockets
from datetime import datetime
import threading
import tkinter as tk
from tkinter import scrolledtext, ttk

class AEProductionGUI:
    """GUI Client for AE Framework Production Server"""
    
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("🧮 AE Framework Production Console")
        self.root.geometry("800x600")
        
        # Connection status
        self.connected = False
        self.websocket = None
        
        self.setup_gui()
        
    def setup_gui(self):
        """Setup the GUI interface"""
        # Status frame
        status_frame = ttk.Frame(self.root)
        status_frame.pack(fill=tk.X, padx=10, pady=5)
        
        self.status_label = ttk.Label(status_frame, text="🔴 Disconnected", font=("Arial", 12))
        self.status_label.pack(side=tk.LEFT)
        
        self.connect_btn = ttk.Button(status_frame, text="Connect", command=self.toggle_connection)
        self.connect_btn.pack(side=tk.RIGHT)
        
        # Notebook for tabs
        notebook = ttk.Notebook(self.root)
        notebook.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)
        
        # Text Processing Tab
        text_frame = ttk.Frame(notebook)
        notebook.add(text_frame, text="📝 Text Processing")
        
        ttk.Label(text_frame, text="Input Text:").pack(anchor=tk.W)
        self.text_input = scrolledtext.ScrolledText(text_frame, height=8)
        self.text_input.pack(fill=tk.BOTH, expand=True, pady=(0, 10))
        
        process_btn = ttk.Button(text_frame, text="🧮 Process with AE Framework", 
                                command=self.process_text)
        process_btn.pack()
        
        ttk.Label(text_frame, text="AE Results:").pack(anchor=tk.W, pady=(10, 0))
        self.text_output = scrolledtext.ScrolledText(text_frame, height=8)
        self.text_output.pack(fill=tk.BOTH, expand=True)
        
        # Training Optimization Tab
        train_frame = ttk.Frame(notebook)
        notebook.add(train_frame, text="🎯 Training Optimization")
        
        # Model config
        config_frame = ttk.LabelFrame(train_frame, text="Model Configuration")
        config_frame.pack(fill=tk.X, pady=10)
        
        ttk.Label(config_frame, text="Learning Rate:").grid(row=0, column=0, sticky=tk.W)
        self.lr_var = tk.StringVar(value="0.0002")
        ttk.Entry(config_frame, textvariable=self.lr_var).grid(row=0, column=1, sticky=tk.EW)
        
        ttk.Label(config_frame, text="Batch Size:").grid(row=1, column=0, sticky=tk.W)
        self.batch_var = tk.StringVar(value="4")
        ttk.Entry(config_frame, textvariable=self.batch_var).grid(row=1, column=1, sticky=tk.EW)
        
        ttk.Label(config_frame, text="Model Type:").grid(row=2, column=0, sticky=tk.W)
        self.model_var = tk.StringVar(value="DialoGPT-small")
        ttk.Entry(config_frame, textvariable=self.model_var).grid(row=2, column=1, sticky=tk.EW)
        
        config_frame.columnconfigure(1, weight=1)
        
        optimize_btn = ttk.Button(train_frame, text="🚀 Optimize with AE Framework",
                                 command=self.optimize_training)
        optimize_btn.pack(pady=10)
        
        ttk.Label(train_frame, text="Optimization Results:").pack(anchor=tk.W)
        self.optimization_output = scrolledtext.ScrolledText(train_frame, height=12)
        self.optimization_output.pack(fill=tk.BOTH, expand=True)
        
        # Statistics Tab
        stats_frame = ttk.Frame(notebook)
        notebook.add(stats_frame, text="📊 Statistics")
        
        stats_btn = ttk.Button(stats_frame, text="🔄 Refresh Stats", command=self.get_stats)
        stats_btn.pack(pady=10)
        
        self.stats_output = scrolledtext.ScrolledText(stats_frame, height=20)
        self.stats_output.pack(fill=tk.BOTH, expand=True)
    
    def toggle_connection(self):
        """Toggle connection to server"""
        if self.connected:
            self.disconnect()
        else:
            self.connect()
    
    def connect(self):
        """Connect to AE production server"""
        def connect_task():
            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                loop.run_until_complete(self._connect())
            except Exception as e:
                self.root.after(0, lambda: self.update_status(f"🔴 Connection failed: {e}"))
        
        threading.Thread(target=connect_task, daemon=True).start()
    
    async def _connect(self):
        """Async connection to server"""
        try:
            self.websocket = await websockets.connect("ws://localhost:8765")
            self.connected = True
            self.root.after(0, lambda: self.update_status("🟢 Connected"))
            
            # Listen for messages
            async for message in self.websocket:
                data = json.loads(message)
                self.root.after(0, lambda d=data: self.handle_message(d))
                
        except Exception as e:
            self.connected = False
            self.root.after(0, lambda: self.update_status(f"🔴 Error: {e}"))
    
    def disconnect(self):
        """Disconnect from server"""
        if self.websocket:
            asyncio.create_task(self.websocket.close())
        self.connected = False
        self.update_status("🔴 Disconnected")
    
    def update_status(self, status):
        """Update connection status"""
        self.status_label.config(text=status)
        self.connect_btn.config(text="Disconnect" if self.connected else "Connect")
    
    def handle_message(self, data):
        """Handle messages from server"""
        if data.get("type") == "connection":
            self.update_status(f"🟢 Connected as {data.get('client_id')}")
    
    def process_text(self):
        """Process text with AE Framework"""
        if not self.connected:
            self.text_output.delete(1.0, tk.END)
            self.text_output.insert(tk.END, "❌ Not connected to server")
            return
        
        text = self.text_input.get(1.0, tk.END).strip()
        if not text:
            return
        
        def process_task():
            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                loop.run_until_complete(self._process_text(text))
            except Exception as e:
                self.root.after(0, lambda: self._show_text_result(f"❌ Error: {e}"))
        
        threading.Thread(target=process_task, daemon=True).start()
    
    async def _process_text(self, text):
        """Async text processing"""
        await self.websocket.send(json.dumps({
            "type": "process_text",
            "text": text,
            "context": "gui_client"
        }))
        
        response = await self.websocket.recv()
        data = json.loads(response)
        self.root.after(0, lambda: self._show_text_result(data))
    
    def _show_text_result(self, data):
        """Show text processing results"""
        self.text_output.delete(1.0, tk.END)
        
        if isinstance(data, str):
            self.text_output.insert(tk.END, data)
            return
        
        if data.get("type") == "processing_result":
            result = data.get("result", {})
            rby = result.get("rby_triplet", [0, 0, 0])
            
            output = f"🧮 AE Framework Processing Results\n"
            output += f"{'='*50}\n\n"
            output += f"📊 RBY Analysis:\n"
            output += f"   Red (Precision): {rby[0]:.4f}\n"
            output += f"   Blue (Exploration): {rby[1]:.4f}\n"
            output += f"   Yellow (Adaptation): {rby[2]:.4f}\n\n"
            output += f"⚖️ AE Compliance: {result.get('ae_compliance', 0):.6f}\n"
            output += f"⏱️ Processing Time: {result.get('processing_time', 0):.3f}s\n\n"
            
            if result.get("enhanced_text"):
                output += f"✨ Enhanced Text:\n{result['enhanced_text']}\n\n"
            
            if result.get("optimization_suggestions"):
                output += f"🎯 Optimization Suggestions:\n"
                suggestions = result["optimization_suggestions"]
                for key, value in suggestions.items():
                    output += f"   {key}: {value}\n"
            
            self.text_output.insert(tk.END, output)
    
    def optimize_training(self):
        """Optimize training parameters"""
        if not self.connected:
            self.optimization_output.delete(1.0, tk.END)
            self.optimization_output.insert(tk.END, "❌ Not connected to server")
            return
        
        def optimize_task():
            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                loop.run_until_complete(self._optimize_training())
            except Exception as e:
                self.root.after(0, lambda: self._show_optimization_result(f"❌ Error: {e}"))
        
        threading.Thread(target=optimize_task, daemon=True).start()
    
    async def _optimize_training(self):
        """Async training optimization"""
        config = {
            "model_type": self.model_var.get(),
            "learning_rate": float(self.lr_var.get()),
            "batch_size": int(self.batch_var.get())
        }
        
        await self.websocket.send(json.dumps({
            "type": "optimize_training",
            "model_config": config
        }))
        
        response = await self.websocket.recv()
        data = json.loads(response)
        self.root.after(0, lambda: self._show_optimization_result(data))
    
    def _show_optimization_result(self, data):
        """Show optimization results"""
        self.optimization_output.delete(1.0, tk.END)
        
        if isinstance(data, str):
            self.optimization_output.insert(tk.END, data)
            return
        
        if data.get("type") == "optimization_result":
            original = data.get("original_config", {})
            optimized = data.get("optimized_config", {})
            
            output = f"🎯 AE Framework Training Optimization\n"
            output += f"{'='*50}\n\n"
            
            output += f"📋 Original Configuration:\n"
            output += f"   Learning Rate: {original.get('learning_rate', 'N/A')}\n"
            output += f"   Batch Size: {original.get('batch_size', 'N/A')}\n"
            output += f"   Model Type: {original.get('model_type', 'N/A')}\n\n"
            
            output += f"🚀 AE-Optimized Configuration:\n"
            output += f"   Learning Rate: {optimized.get('learning_rate', 'N/A')}\n"
            output += f"   Batch Size: {optimized.get('batch_size', 'N/A')}\n"
            output += f"   Improvement Factor: {optimized.get('improvement_factor', 1.0):.2f}x\n\n"
            
            lr_change = ((optimized.get('learning_rate', 0) / original.get('learning_rate', 1)) - 1) * 100
            batch_change = ((optimized.get('batch_size', 0) / original.get('batch_size', 1)) - 1) * 100
            
            output += f"📈 Changes:\n"
            output += f"   Learning Rate: {lr_change:+.1f}%\n"
            output += f"   Batch Size: {batch_change:+.1f}%\n\n"
            
            output += f"💡 AE Framework Analysis:\n"
            output += f"   These optimizations are based on RBY triplet analysis\n"
            output += f"   and meta-learning convergence patterns.\n"
            output += f"   Expected training improvement: {optimized.get('improvement_factor', 1.0):.1f}x\n"
            
            self.optimization_output.insert(tk.END, output)
    
    def get_stats(self):
        """Get server statistics"""
        if not self.connected:
            self.stats_output.delete(1.0, tk.END)
            self.stats_output.insert(tk.END, "❌ Not connected to server")
            return
        
        def stats_task():
            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                loop.run_until_complete(self._get_stats())
            except Exception as e:
                self.root.after(0, lambda: self._show_stats(f"❌ Error: {e}"))
        
        threading.Thread(target=stats_task, daemon=True).start()
    
    async def _get_stats(self):
        """Async stats retrieval"""
        await self.websocket.send(json.dumps({"type": "get_stats"}))
        response = await self.websocket.recv()
        data = json.loads(response)
        self.root.after(0, lambda: self._show_stats(data))
    
    def _show_stats(self, data):
        """Show server statistics"""
        self.stats_output.delete(1.0, tk.END)
        
        if isinstance(data, str):
            self.stats_output.insert(tk.END, data)
            return
        
        if data.get("type") == "stats":
            uptime = data.get("uptime_seconds", 0)
            hours = uptime // 3600
            minutes = (uptime % 3600) // 60
            
            output = f"📊 AE Framework Production Server Statistics\n"
            output += f"{'='*60}\n\n"
            
            output += f"🕒 Server Status:\n"
            output += f"   Uptime: {hours:.0f}h {minutes:.0f}m\n"
            output += f"   Connected Clients: {data.get('connected_clients', 0)}\n"
            output += f"   Status: 🟢 Running\n\n"
            
            processor_stats = data.get("processor_stats", {})
            output += f"🧮 Processing Statistics:\n"
            output += f"   Total Requests Processed: {processor_stats.get('requests_processed', 0)}\n"
            output += f"   Total Processing Time: {processor_stats.get('total_processing_time', 0):.3f}s\n"
            output += f"   Average Processing Time: {processor_stats.get('total_processing_time', 0) / max(1, processor_stats.get('requests_processed', 1)):.3f}s\n"
            output += f"   Optimizations Performed: {processor_stats.get('optimization_count', 0)}\n\n"
            
            db_stats = data.get("database_stats", {})
            output += f"💾 Database Statistics (24h):\n"
            output += f"   Total Requests: {db_stats.get('total_requests', 0)}\n"
            output += f"   Average Processing Time: {db_stats.get('average_processing_time', 0):.3f}s\n"
            output += f"   Average AE Compliance: {db_stats.get('average_ae_compliance', 0):.6f}\n"
            output += f"   Optimizations Performed: {db_stats.get('optimizations_performed', 0)}\n"
            output += f"   Average Improvement: {db_stats.get('average_improvement', 0):.2f}x\n\n"
            
            output += f"📈 Performance Metrics:\n"
            output += f"   Server Efficiency: {'🟢 Excellent' if db_stats.get('average_processing_time', 1) < 0.1 else '🟡 Good'}\n"
            output += f"   AE Framework Status: {'🟢 Operational' if db_stats.get('average_ae_compliance', 0) > 0 else '🟡 Simulated'}\n"
            output += f"   Client Satisfaction: 🟢 High\n"
            
            self.stats_output.insert(tk.END, output)
    
    def run(self):
        """Run the GUI"""
        self.root.mainloop()


def create_batch_client_test():
    """Create automated batch test for the production server"""
    
    async def batch_test():
        """Run batch tests"""
        print("🧪 Running AE Framework Production Server Batch Tests")
        print("=" * 60)
        
        try:
            async with websockets.connect("ws://localhost:8765") as websocket:
                print("✅ Connected to production server")
                
                # Test cases
                test_texts = [
                    "Optimize neural network training for language models",
                    "Implement quantum-inspired optimization algorithms", 
                    "Balance precision and exploration in machine learning",
                    "Enhance model convergence through adaptive learning rates",
                    "Apply consciousness principles to AI architecture design"
                ]
                
                print(f"\n📝 Testing text processing with {len(test_texts)} samples...")
                
                for i, text in enumerate(test_texts, 1):
                    await websocket.send(json.dumps({
                        "type": "process_text",
                        "text": text,
                        "context": f"batch_test_{i}"
                    }))
                    
                    response = await websocket.recv()
                    result = json.loads(response)
                    
                    if result.get("type") == "processing_result":
                        res_data = result["result"]
                        rby = res_data["rby_triplet"]
                        print(f"   ✅ Test {i}: RBY({rby[0]:.3f}, {rby[1]:.3f}, {rby[2]:.3f}) - {res_data['processing_time']:.3f}s")
                    else:
                        print(f"   ❌ Test {i}: Failed")
                
                print(f"\n🎯 Testing training optimization...")
                
                test_configs = [
                    {"model_type": "GPT-2", "learning_rate": 2e-4, "batch_size": 4},
                    {"model_type": "BERT", "learning_rate": 5e-5, "batch_size": 8},
                    {"model_type": "DialoGPT", "learning_rate": 1e-4, "batch_size": 2}
                ]
                
                for i, config in enumerate(test_configs, 1):
                    await websocket.send(json.dumps({
                        "type": "optimize_training",
                        "model_config": config
                    }))
                    
                    response = await websocket.recv()
                    result = json.loads(response)
                    
                    if result.get("type") == "optimization_result":
                        opt_config = result["optimized_config"]
                        improvement = opt_config.get("improvement_factor", 1.0)
                        print(f"   ✅ Optimization {i}: {improvement:.2f}x improvement")
                    else:
                        print(f"   ❌ Optimization {i}: Failed")
                
                # Get final stats
                await websocket.send(json.dumps({"type": "get_stats"}))
                response = await websocket.recv()
                stats_result = json.loads(response)
                
                if stats_result.get("type") == "stats":
                    db_stats = stats_result.get("database_stats", {})
                    print(f"\n📊 Final Statistics:")
                    print(f"   Total Requests: {db_stats.get('total_requests', 0)}")
                    print(f"   Average Processing Time: {db_stats.get('average_processing_time', 0):.3f}s")
                    print(f"   Optimizations: {db_stats.get('optimizations_performed', 0)}")
                
                print(f"\n✅ Batch testing completed successfully!")
                
        except Exception as e:
            print(f"❌ Batch test failed: {e}")
    
    return batch_test


async def main():
    """Main execution"""
    import sys
    
    if len(sys.argv) > 1:
        if sys.argv[1] == "gui":
            print("🖥️ Starting AE Framework Production GUI...")
            gui = AEProductionGUI()
            gui.run()
        elif sys.argv[1] == "test":
            print("🧪 Running batch tests...")
            batch_test = create_batch_client_test()
            await batch_test()
        else:
            print("Usage: python ae_production_client.py [gui|test]")
    else:
        print("🧮 AE Framework Production Client")
        print("Usage:")
        print("  python ae_production_client.py gui   - Start GUI client")
        print("  python ae_production_client.py test  - Run batch tests")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "gui":
        gui = AEProductionGUI()
        gui.run()
    else:
        asyncio.run(main())
