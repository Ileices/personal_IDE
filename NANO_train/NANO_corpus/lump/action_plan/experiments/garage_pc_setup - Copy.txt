@echo off
echo ============================================
echo NANO SEA MESH — Garage PC Setup
echo ============================================
echo.
echo This will:
echo   1. Check Python is installed
echo   2. Install torch (if needed)
echo   3. Connect to the mesh server
echo.

:: Check Python
python --version 2>nul
if errorlevel 1 (
    echo ERROR: Python not found! Install from python.org first.
    pause
    exit /b 1
)

:: Check torch
python -c "import torch; print(f'PyTorch {torch.__version__}')" 2>nul
if errorlevel 1 (
    echo Installing PyTorch with CUDA support...
    pip install torch --index-url https://download.pytorch.org/whl/cu128
)

:: Run the mesh client
echo.
echo Connecting to mesh server at 192.168.0.241:7777...
echo.
python test_14_mesh_two_machines.py --role client --server-ip 192.168.0.241 --port 7777
pause
