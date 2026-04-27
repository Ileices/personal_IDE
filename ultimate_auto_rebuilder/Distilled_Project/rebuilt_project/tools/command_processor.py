from typing import Dict
from typing import Tuple
# File copied by Ultimate Auto-Rebuilder Script Gatherer
# Original: C:\Users\lokee\Documents\FirstBorne\Stage\porting\Egg_Ileices\Egg_Ileices\command_processor.py
# Copy Date: 2025-06-13 02:25:31
# Original Size: 14904 bytes

#!/usr/bin/env python3
"""
AIOS IO Command Processor

This module processes direct commands and system instructions for the
AIOS IO system, providing a command interface for controlling and
interacting with the system directly.
"""

import os
import sys
import json
import time
import re
from datetime import datetime

def detect_direct_command(input_text):
    """
    Detect if the user input contains a direct command instruction.
    
    Args:
        input_text: The user input text
        
    Returns:
        The content to repeat if a command is detected, otherwise None
    """
    input_lower = input_text.lower()
    
    # Check for "Say X" pattern
    say_patterns = [
        # Pattern: Say "X"
        r'say\s+["\'](.+?)["\']',
        # Pattern: Repeat "X"
        r'repeat\s+["\'](.+?)["\']',
        # Pattern: Tell me "X"
        r'tell\s+me\s+["\'](.+?)["\']',
        # Pattern: Say X (without quotes)
        r'say\s+(.+)',
        # Pattern: Repeat X (without quotes)
        r'repeat\s+(.+)',
        # Pattern: Tell me X (without quotes)
        r'tell\s+me\s+(.+)'
    ]
    
    for pattern in say_patterns:
        match = re.search(pattern, input_text, re.IGNORECASE)
        if match:
            return match.group(1)
    
    return None

def safe_json_loads(file_path):
    """
    Safely load JSON file with error correction.
    
    Args:
        file_path: Path to the JSON file
        
    Returns:
        Loaded JSON data or empty dict if loading fails
    """
    try:
        with open(file_path, 'r') as f:
            content = f.read()
        
        # Try to parse JSON directly first
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            # Fix common JSON issues
            
            # 1. Fix trailing commas
            content = re.sub(r',\s*}', '}', content)
            content = re.sub(r',\s*]', ']', content)
            
            # 2. Fix unbalanced brackets
            open_braces = content.count('{')
            close_braces = content.count('}')
            open_brackets = content.count('[')
            close_brackets = content.count(']')
            
            # Add missing closing braces
            if open_braces > close_braces:
                content += '}' * (open_braces - close_braces)
                
            # Add missing closing brackets
            if open_brackets > close_brackets:
                content += ']' * (open_brackets - close_brackets)
                
            # Try parsing again
            try:
                return json.loads(content)
            except json.JSONDecodeError as e:
                print(f"Error parsing JSON: {e}")
                return {}
    except Exception as e:
        print(f"Error reading file {file_path}: {e}")
        return {}

def process_system_commands(user_input, memory):
    """
    Process system-level commands.
    
    Args:
        user_input: The user input text
        memory: The system memory
        
    Returns:
        (was_command, response): Tuple indicating if input was a system command
                                and the response if it was
    """
    input_lower = user_input.lower().strip()
    
    # Help command
    if input_lower == "help" or input_lower == "commands":
        command_help = """
AIOS IO Command Reference:
-------------------------
help - Show this help message
status - Show system status
memory - Show memory usage statistics
save - Save current memory to disk
load <file> - Load memory from a file
debug mode on/off - Enable/disable debug mode
search memory for 'term' - Search memory for a specific term
clear - Clear the console screen
"""
        return True, command_help
    
    # Status command
    elif input_lower == "status":
        # Compute memory stats
        concepts_count = len(memory.get("concepts", {}))
        history_count = len(memory.get("history", []))
        
        # Get learning framework stats
        test_cycles = len(memory.get("learning_framework", {}).get("test_cycles", {}))
        try_cycles = len(memory.get("learning_framework", {}).get("try_cycles", {}))
        learn_cycles = len(memory.get("learning_framework", {}).get("learn_cycles", {}))
        
        # Format the status message
        status = f"""
System Status:
------------
Concepts: {concepts_count}
History entries: {history_count}
Test Cycles: {test_cycles}
Try Cycles: {try_cycles}
Learn Cycles: {learn_cycles}
"""
        return True, status
    
    # Memory command
    elif input_lower == "memory" or input_lower == "memory stats":
        # Count elements in each memory section
        memory_sections = {}
        total_size = 0
        
        for key, value in memory.items():
            if isinstance(value, dict):
                memory_sections[key] = len(value)
                total_size += len(value)
            elif isinstance(value, list):
                memory_sections[key] = len(value)
                total_size += len(value)
            else:
                memory_sections[key] = 1
                total_size += 1
        
        # Format the memory report
        memory_report = f"""
Memory Report:
------------
Total Items: {total_size}

Section Breakdown:
"""
        for section, count in memory_sections.items():
            memory_report += f"  {section}: {count}\n"
            
        return True, memory_report
    
    # Not a system command
    return False, None

def handle_action_commands(user_input, memory):
    """
    Process action commands that perform operations.
    
    Args:
        user_input: The user input text
        memory: The system memory
        
    Returns:
        (was_action, response): Tuple indicating if input was an action command
                              and the response if it was
    """
    input_lower = user_input.lower()
    
    # Search memory command
    search_match = re.search(r'search\s+memory\s+for\s+[\'"](.+?)[\'"]', input_lower)
    if search_match:
        search_term = search_match.group(1).lower()
        results = []
        
        # Search in concepts
        for key, value in memory.get("concepts", {}).items():
            if search_term in key.lower() or (isinstance(value, str) and search_term in value.lower()):
                results.append(f"concept: {key}: {value}")
        
        # Search in history
        for entry in memory.get("history", []):
            if "input" in entry and search_term in entry["input"].lower():
                results.append(f"history: {entry['input']}")
        
        # Format the search results
        if results:
            search_results = f"Found {len(results)} results for '{search_term}':\n" + "\n".join(results[:10])
            if len(results) > 10:
                search_results += f"\n...and {len(results) - 10} more."
        else:
            search_results = f"No results found for '{search_term}'"
            
        return True, search_results
    
    # Debug mode command
    elif "debug mode" in input_lower:
        if "debug mode on" in input_lower:
            # Enable debug mode
            memory["debug_mode"] = True
            return True, "Debug mode activated. Additional information will be displayed."
        elif "debug mode off" in input_lower:
            # Disable debug mode
            memory["debug_mode"] = False
            return True, "Debug mode deactivated."
    
    # Clear command
    elif input_lower == "clear":
        # Clear the console screen
        os.system('cls' if os.name == 'nt' else 'clear')
        return True, "Screen cleared."
    
    # Not an action command
    return False, None

def extract_command_type(user_input):
    """
    Extract the type of command from the user input.
    
    Args:
        user_input: The user input text
        
    Returns:
        Command type string
    """
    input_lower = user_input.lower()
    
    # Check if this is a direct command
    if detect_direct_command(user_input):
        return "DIRECT"
    
    # Check if this is a system command
    system_commands = ["help", "status", "memory", "save", "load", "debug"]
    if any(cmd in input_lower for cmd in system_commands):
        return "SYSTEM"
    
    # Check if this is an action command
    action_indicators = ["search", "clear", "execute", "run"]
    if any(indicator in input_lower for indicator in action_indicators):
        return "ACTION"
    
    # Otherwise it's a regular input
    return "REGULAR"

def process_command(user_input, memory):
    """
    Process a user command and execute appropriate action.
    
    Args:
        user_input: The user input text
        memory: The system memory
        
    Returns:
        (response, command_executed): Response and whether a command was executed
    """
    # First check if this is a direct command to repeat something
    direct_command = detect_direct_command(user_input)
    if direct_command:
        return direct_command, True
    
    # Check if this is a system command
    was_system, system_response = process_system_commands(user_input, memory)
    if was_system:
        return system_response, True
    
    # Check if this is an action command
    was_action, action_response = handle_action_commands(user_input, memory)
    if was_action:
        return action_response, True
    
    # Not a command
    return None, False

# Add this function to ensure Law of Three compliance
def validate_command_pattern(command_data, tier_system):
    """
    Validate command data against Law of Three tiers.
    
    Args:
        command_data: Command data to validate
        tier_system: Dictionary containing TIER_ONE, TIER_TWO, TIER_THREE constants
        
    Returns:
        Validated command data that follows Law of Three
    """
    if not isinstance(command_data, dict):
        return command_data
        
    # Apply the Law of Three constraints
    result = {}
    
    for key, value in command_data.items():
        if isinstance(value, list):
            # Enforce maximum items based on Law of Three tiers
            if len(value) > tier_system.get("TIER_THREE", 27):
                # Keep only TIER_THREE (27) items
                result[key] = value[:tier_system.get("TIER_THREE", 27)]
            elif len(value) > tier_system.get("TIER_TWO", 9):
                # Structure into nested groups of 9 (TIER_TWO)
                grouped = [value[i:i+tier_system.get("TIER_TWO", 9)] 
                          for i in range(0, len(value), tier_system.get("TIER_TWO", 9))]
                result[key] = grouped[:tier_system.get("TIER_ONE", 3)]
            else:
                result[key] = value
        elif isinstance(value, dict):
            # Apply recursively to dictionaries
            result[key] = validate_command_pattern(value, tier_system)
        else:
            # Keep other values as is
            result[key] = value
    
    return result

# Integration helper for launch scripts
def integrate_command_processor(target_module):
    """
    Integrate the command processor with a target module.
    
    Args:
        target_module: The module to integrate with
        
    Returns:
        bool: True if integration was successful
    """
    try:
        # Export main functions to target module
        function_list = [
            'detect_direct_command',
            'extract_command_type',
            'process_command',
            'safe_json_loads',
            'process_system_commands',
            'handle_action_commands'
        ]
        
        # Export helper functions too, keep them private with underscore prefix
        helper_functions = [
            '_generate_help_text',
            '_generate_status_report',
            '_generate_memory_report',
            '_search_memory',
            '_export_memory'
        ]
        
        # Add main functions
        for func_name in function_list:
            setattr(target_module, func_name, globals()[func_name])
        
        # Add helper functions
        for func_name in helper_functions:
            setattr(target_module, func_name, globals()[func_name])
            
        # Add Law of Three validation
        if hasattr(target_module, 'TIER_ONE') and hasattr(target_module, 'TIER_TWO') and hasattr(target_module, 'TIER_THREE'):
            tier_system = {
                "TIER_ONE": target_module.TIER_ONE,
                "TIER_TWO": target_module.TIER_TWO,
                "TIER_THREE": target_module.TIER_THREE
            }
        else:
            # Default Law of Three values
            tier_system = {
                "TIER_ONE": 3,
                "TIER_TWO": 9,
                "TIER_THREE": 27
            }
        
        # Add the validation function
        setattr(target_module, 'validate_command_pattern', 
                lambda cmd_data: validate_command_pattern(cmd_data, tier_system))
        
        return True
    except Exception as e:
        print(f"Error integrating command processor: {e}")
        return False

if __name__ == "__main__":
    # Demonstrate basic functionality
    test_inputs = [
        'Say "Hello, world!"',
        'Repeat this is a test',
        'Tell me "The sky is blue"',
        'What is the meaning of life?',
        'You should analyze this input',
        'You need to remember this fact'
    ]
    
    print("Command Processor Module Test")
    print("=" * 40)
    
    for input_text in test_inputs:
        cmd_type = extract_command_type(input_text)
        cmd_content = detect_direct_command(input_text)
        
        print(f"Input: '{input_text}'")
        print(f"Command Type: {cmd_type}")
        print(f"Command Content: {cmd_content}")
        print("-" * 30)
    
    # Additional demonstration for system commands
    print("\nSystem Command Examples:")
    print("-" * 30)
    sample_memory = {
        "history": [{"input": "test input 1"}, {"input": "tell me about apples"}],
        "concepts": {"apple": "a fruit", "knowledge": "understanding of information"},
        "learning_framework": {"test_cycles": {}, "try_cycles": {}, "learn_cycles": {}}
    }
    
    system_commands = ["help", "status", "memory"]
    for cmd in system_commands:
        was_cmd, response = process_system_commands(cmd, sample_memory)
        print(f"Command: '{cmd}'")
        print(f"Response: {'Command recognized' if was_cmd else 'Not a system command'}")
        print("-" * 30)
