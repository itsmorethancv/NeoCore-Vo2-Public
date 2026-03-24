@echo off
setlocal

cd /d "%~dp0"

where npm >nul 2>nul
if not %errorlevel%==0 (
  echo npm was not found. Install Node.js or run initialize.bat first.
  exit /b 1
)

call npm start
exit /b %errorlevel%
