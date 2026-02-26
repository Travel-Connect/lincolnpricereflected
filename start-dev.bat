@echo off
echo ========================================
echo Lincoln Price Reflected - Starting...
echo ========================================
echo.

:: Change directory to project root
echo [1/5] Changing directory...
cd /d "%~dp0"
if errorlevel 1 (
    echo       ERROR: Could not change directory!
    pause
    exit /b 1
)
echo       Current: %cd%
echo       Done.
echo.

:: Kill process using port 4001
echo [2/5] Checking for existing process on port 4001...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":4001.*LISTENING"') do (
    echo       Found process PID: %%a - killing...
    taskkill /PID %%a /F >nul 2>&1
)
echo       Done.
echo.

:: Clean up Next.js dev lock (stale lock from previous crash)
echo [3/5] Cleaning up Next.js lock...
if exist "apps\web\.next\dev\lock" (
    del /f /q "apps\web\.next\dev\lock" >nul 2>&1
    echo       Removed stale lock file.
) else (
    echo       No stale lock.
)
echo       Done.
echo.

:: Check node_modules
echo [4/5] Checking node_modules...
if not exist "node_modules" (
    echo       ERROR: node_modules not found!
    echo       Please run 'npm install' first.
    pause
    exit /b 1
)
if not exist "apps\web\node_modules" (
    echo       ERROR: apps\web\node_modules not found!
    echo       Please run 'npm install' first.
    pause
    exit /b 1
)
echo       Found node_modules.
echo       Done.
echo.

:: Start Runner in a separate window
echo [5/5] Starting Runner (polling mode)...
start "Lincoln Runner" cmd /k "cd /d %~dp0 && npx tsx apps/runner/src/main.ts --poll --keep-browser"
echo       Runner started in separate window.
echo.

:: Open browser after delay (using VBScript for hidden execution)
echo Opening browser in 8 seconds...
echo WScript.Sleep 8000 > "%temp%\openLincoln.vbs"
echo CreateObject("WScript.Shell").Run "http://localhost:4001", 1, False >> "%temp%\openLincoln.vbs"
start "" wscript //nologo "%temp%\openLincoln.vbs"
echo       Browser will open automatically.
echo.

echo ========================================
echo Web UI:  http://localhost:4001
echo Runner:  polling mode (separate window)
echo Press Ctrl+C to stop the web server
echo ========================================
echo.

cd /d "%~dp0apps\web"
call npx next dev -p 4001

echo.
echo ========================================
echo Web server stopped.
echo ========================================
pause
