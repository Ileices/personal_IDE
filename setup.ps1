# ============================================
# Personal IDE — Setup Script (Windows PowerShell)
#
# Usage:  .\setup.ps1
# Or:     powershell -ExecutionPolicy Bypass -File setup.ps1
# ============================================
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  Personal IDE - Setup" -ForegroundColor Cyan
Write-Host "  ===================" -ForegroundColor Cyan
Write-Host ""

# Check Node.js
try {
    $nodeVersion = (node --version 2>&1)
    $nodeMajor = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
    if ($nodeMajor -lt 20) {
        Write-Host "X  Node.js $nodeVersion is too old. Please install Node.js 20+." -ForegroundColor Red
        Write-Host "   Download: https://nodejs.org/" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "OK Node.js $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "X  Node.js not found. Please install Node.js 20+ from https://nodejs.org/" -ForegroundColor Red
    exit 1
}

# Check/install pnpm
try {
    $pnpmVersion = (pnpm --version 2>&1)
    Write-Host "OK pnpm $pnpmVersion" -ForegroundColor Green
} catch {
    Write-Host ".. pnpm not found. Installing..." -ForegroundColor Yellow
    npm install -g pnpm
    $pnpmVersion = (pnpm --version 2>&1)
    Write-Host "OK pnpm $pnpmVersion installed" -ForegroundColor Green
}

# Run the full setup script
Write-Host ""
node scripts/setup.js
