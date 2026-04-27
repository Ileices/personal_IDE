# File copied by Ultimate Auto-Rebuilder Script Gatherer
# Original: C:\Users\lokee\Documents\FirstBorne\Stage\porting\Egg_Ileices\Egg_Ileices\Sperm_Ileices\Sperm_Ileices\system_initialization.py
# Copy Date: 2025-06-13 02:25:37
# Original Size: 3166 bytes

import os
import sys
import time
import threading
from datetime import datetime

def initialize_aios_io_system(base_dir="AIOS_IO", memory=None):
    """Initialize the AIOS IO system with all components."""
    print(f"AIOS IO: Initializing system at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Create base directory structure
    os.makedirs(base_dir, exist_ok=True)
    excretion_dir = os.path.join(base_dir, "Excretions")
    os.makedirs(excretion_dir, exist_ok=True)
    
    # Create ML directories
    red_ml_dir = os.path.join(excretion_dir, "Red_ML")
    blue_ml_dir = os.path.join(excretion_dir, "Blue_ML")
    yellow_ml_dir = os.path.join(excretion_dir, "Yellow_ML")
    ml_files_dir = os.path.join(excretion_dir, "ML_Files")
    
    for directory in [red_ml_dir, blue_ml_dir, yellow_ml_dir, ml_files_dir]:
        os.makedirs(directory, exist_ok=True)
    
    # Create Apical Pulse of the Membrane directory
    apm_dir = os.path.join(base_dir, "Apical_Pulse_of_the_Membrane")
    os.makedirs(apm_dir, exist_ok=True)
    
    # Create Lecture directory
    lecture_dir = os.path.join(excretion_dir, "Lectures")
    os.makedirs(lecture_dir, exist_ok=True)
    
    # Initialize the integrator
    try:
        from aios_system_integrator import AIOSIOIntegrator
        integrator = AIOSIOIntegrator(memory or {}, base_dir)
        initialized = integrator.initialize()
        
        if initialized:
            # Start system indexing in background
            indexing_thread = threading.Thread(target=integrator.index_system)
            indexing_thread.daemon = True
            indexing_thread.start()
            
            return integrator
        else:
            print("AIOS IO: Failed to initialize system integrator.")
            return None
    except Exception as e:
        print(f"AIOS IO: Error during system initialization: {str(e)}")
        import traceback
        traceback.print_exc()
        return None

def monitor_system_status(integrator, interval=60):
    """Monitor the system status at regular intervals."""
    
    def monitor_loop():
        while True:
            try:
                status = integrator.get_status()
                print(f"\nAIOS IO System Status ({datetime.now().strftime('%Y-%m-%d %H:%M:%S')}):")
                print(f"- Initialized: {status['initialized']}")
                print(f"- System Indexed: {status['system_indexed']}")
                print(f"- APM Created: {status['apm_created']}")
                print(f"- ML Files Generated: {status['ml_files_generated']}")
                print(f"- Lecture Mode Active: {status['lecture_mode_active']}")
                print(f"- Error Count: {status['error_count']}")
                
                time.sleep(interval)
            except Exception as e:
                print(f"Error in monitor loop: {str(e)}")
                time.sleep(interval * 2)  # Wait longer after an error
    
    monitor_thread = threading.Thread(target=monitor_loop)
    monitor_thread.daemon = True
    monitor_thread.start()
    
    return monitor_thread
