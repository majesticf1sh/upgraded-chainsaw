@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo   Bundling Multi-Part Player Data for GitHub
echo ============================================================
echo.

node bundle_chunks.js

echo.
pause
