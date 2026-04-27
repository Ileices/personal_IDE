@echo off
REM ═══════════════════════════════════════════════════════════════════
REM   ILEICES HPC — One-Click Auto Setup
REM   Double-click this file on any machine to set everything up.
REM ═══════════════════════════════════════════════════════════════════
title Ileices HPC Auto Setup
color 0A
echo.
echo  ╔══════════════════════════════════════════════════╗
echo  ║     ILEICES HPC — Automated Setup Installer     ║
echo  ╚══════════════════════════════════════════════════╝
echo.

REM ── Determine our directory (where this .bat lives) ──
cd /d "%~dp0"
echo  Working directory: %CD%
echo.

REM ── Find Python ──
REM Try common locations in order of preference
set "PYTHON="

REM Check if venv already exists (re-run scenario)
if exist ".venv\Scripts\python.exe" (
    set "PYTHON=%CD%\.venv\Scripts\python.exe"
    echo  [OK] Found existing venv Python: %PYTHON%
    goto :found_python
)

REM Check PATH
where python >nul 2>&1
if %errorlevel%==0 (
    for /f "delims=" %%i in ('where python 2^>nul') do (
        set "PYTHON=%%i"
        goto :check_python_version
    )
)

REM Check py launcher (Windows Python Launcher)
where py >nul 2>&1
if %errorlevel%==0 (
    set "PYTHON=py -3"
    echo  [OK] Found Python via py launcher
    goto :found_python
)

REM Check common install locations
for %%P in (
    "%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python310\python.exe"
    "C:\Python313\python.exe"
    "C:\Python312\python.exe"
    "C:\Python311\python.exe"
    "C:\Python310\python.exe"
) do (
    if exist %%P (
        set "PYTHON=%%~P"
        echo  [OK] Found Python at: %%~P
        goto :found_python
    )
)

REM Nothing found
echo.
echo  [FAIL] Python 3.10+ not found on this machine.
echo.
echo  Please install Python from https://www.python.org/downloads/
echo  Make sure to check "Add Python to PATH" during installation.
echo.
pause
exit /b 1

:check_python_version
echo  [OK] Found Python at: %PYTHON%

:found_python
echo.

REM ── Launch the real installer ──
echo  Launching automated setup...
echo  ════════════════════════════════════════════════════════
echo.

REM Use the found Python to run auto_setup.py
if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" "%~dp0auto_setup.py"
) else (
    %PYTHON% "%~dp0auto_setup.py"
)

echo.
if %errorlevel%==0 (
    echo  ╔══════════════════════════════════════════════════╗
    echo  ║          SETUP COMPLETED SUCCESSFULLY            ║
    echo  ╚══════════════════════════════════════════════════╝
) else (
    echo  ╔══════════════════════════════════════════════════╗
    echo  ║      SETUP ENCOUNTERED ERRORS - CHECK LOG       ║
    echo  ╚══════════════════════════════════════════════════╝
    echo.
    echo  Check the log file: ileices_setup.log
)
echo.
pause
