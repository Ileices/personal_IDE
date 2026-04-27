# File copied by Ultimate Auto-Rebuilder Script Gatherer
# Original: C:\Users\lokee\Documents\FirstBorne\Stage\porting\Egg_Ileices\Egg_Ileices\aios_system_integrator.py
# Copy Date: 2025-06-13 02:25:30
# Original Size: 6237 bytes

import os
import sys
import time
import importlib
import threading
from datetime import datetime

# Import local modules
import ml_file_generator
import system_indexer
import lecture_mode
import ml_processor

class AIOSIOIntegrator:
    """Integrates all components of the AIOS IO system and manages their lifecycle."""
    
    def __init__(self, memory, base_dir="AIOS_IO"):
        """Initialize the integrator with the memory and base directory."""
        self.memory = memory
        self.base_dir = base_dir
        self.excretion_dir = os.path.join(base_dir, "Excretions")
        
        # Create all necessary directories
        os.makedirs(self.base_dir, exist_ok=True)
        os.makedirs(self.excretion_dir, exist_ok=True)
        
        # Initialize components
        self.ml_generator = None
        self.ml_processor = None
        self.system_indexer = None
        self.lecture_module = None
        
        # Initialize status
        self.status = {
            "initialized": False,
            "system_indexed": False,
            "apm_created": False,
            "lecture_mode_active": False,
            "ml_files_generated": 0,
            "error_count": 0
        }
    
    def initialize(self):
        """Initialize all components of the system."""
        try:
            print("AIOS IO Integrator: Initializing system...")
            
            # Initialize ML file generator
            self.ml_generator = ml_file_generator.MLFileGenerator(self.base_dir)
            
            # Initialize ML processor
            self.ml_processor = ml_processor.MLProcessor(self.ml_generator, self.base_dir)
            
            # Initialize system indexer
            self.system_indexer = system_indexer.SystemIndexer(self.base_dir)
            
            # Initialize lecture mode
            self.lecture_module = lecture_mode.LectureMode(self.memory, self.base_dir)
            
            self.status["initialized"] = True
            print("AIOS IO Integrator: System initialization complete.")
            
            return True
        except Exception as e:
            print(f"AIOS IO Integrator: Error during initialization: {str(e)}")
            self.status["error_count"] += 1
            return False
    
    def index_system(self):
        """Index the computer system."""
        if not self.status["initialized"]:
            print("AIOS IO Integrator: Cannot index system, not initialized.")
            return False
        
        try:
            print("AIOS IO Integrator: Starting system indexing...")
            
            # Check for admin access
            is_admin = self.system_indexer._check_admin()
            if not is_admin:
                print("AIOS IO Integrator: Running without administrator privileges.")
                
                # Try to request admin access
                admin_requested = self.system_indexer.request_admin_access()
                if admin_requested:
                    print("AIOS IO Integrator: Admin access requested. Program may restart with elevated privileges.")
            
            # Get basic system info
            system_info = self.system_indexer.get_system_info()
            print(f"AIOS IO Integrator: System identified as {system_info.get('platform', 'Unknown')}")
            
            # Start indexing drives in a background thread
            index_thread = threading.Thread(target=self._background_indexing)
            index_thread.daemon = True
            index_thread.start()
            
            self.status["apm_created"] = True
            return True
        except Exception as e:
            print(f"AIOS IO Integrator: Error during system indexing: {str(e)}")
            self.status["error_count"] += 1
            return False
    
    def _background_indexing(self):
        """Background thread for indexing the system."""
        try:
            # Get drive information
            drives = self.system_indexer.get_drive_info()
            print(f"AIOS IO Integrator: Found {len(drives)} drives/mount points.")
            
            # Index each drive with limited depth to avoid excessive scanning
            max_depth = 2  # Limit depth for initial scan
            
            # Create a summary file for indexing progress
            summary = self.system_indexer.index_system(max_depth)
            
            self.status["system_indexed"] = True
            print("AIOS IO Integrator: Background system indexing complete.")
        except Exception as e:
            print(f"AIOS IO Integrator: Error in background indexing: {str(e)}")
            self.status["error_count"] += 1
    
    def process_chatbot_interaction(self, user_input, ai_response):
        """Process a chatbot interaction and generate ML files for it."""
        try:
            # Generate ML files for this interaction
            result = self.ml_processor.process_chatbot_input(user_input, ai_response)
            
            if result:
                self.status["ml_files_generated"] += 3  # One for each component
                return True
            return False
        except Exception as e:
            print(f"AIOS IO Integrator: Error processing chatbot interaction: {str(e)}")
            self.status["error_count"] += 1
            return False
    
    def process_lecture_input(self, user_input):
        """Process input through the lecture mode if applicable."""
        if not self.lecture_module:
            return None
        
        # Detect if this is a lecture mode command
        command_type = self.lecture_module.detect_lecture_command(user_input)
        
        if command_type:
            # This is a lecture mode input
            response = self.lecture_module.process_lecture_input(user_input, command_type)
            self.status["lecture_mode_active"] = self.lecture_module.is_lecture_mode_active()
            return response
        
        return None
    
    def get_status(self):
        """Get the current status of the integrator."""
        return self.status.copy()
