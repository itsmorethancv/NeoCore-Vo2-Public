@echo off
setlocal

cd /d "%~dp0"

echo [1/7] Checking Python launcher...
set "PYTHON_CMD="
where py >nul 2>nul
if %errorlevel%==0 (
  set "PYTHON_CMD=py -3"
) else (
  where python >nul 2>nul
  if %errorlevel%==0 (
    set "PYTHON_CMD=python"
  )
  where winget >nul 2>nul
  if %errorlevel%==0 (
    echo Python 3 not found. Installing with winget...
    winget install -e --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements
    if errorlevel 1 (
      echo Failed to install Python 3 with winget.
      exit /b 1
    )
    where py >nul 2>nul
    if %errorlevel%==0 (
      set "PYTHON_CMD=py -3"
    ) else (
      where python >nul 2>nul
      if %errorlevel%==0 (
        set "PYTHON_CMD=python"
      )
    )
  )
)

if not defined PYTHON_CMD (
  echo Python 3 was not found and could not be installed automatically.
  echo Install Python 3 or enable winget, then rerun this script.
  exit /b 1
)

echo [2/7] Creating Python virtual environment if needed...
if not exist "python\venv\Scripts\python.exe" (
  %PYTHON_CMD% -m venv python\venv
  if errorlevel 1 (
    echo Failed to create python virtual environment.
    exit /b 1
  )
)

echo [3/7] Installing Python dependencies...
call "python\venv\Scripts\python.exe" -m pip install --upgrade pip
if errorlevel 1 (
  echo Failed to upgrade pip.
  exit /b 1
)

call "python\venv\Scripts\python.exe" -m pip install -r python\requirements.txt
if errorlevel 1 (
  echo Failed to install Python dependencies.
  exit /b 1
)

echo [4/7] Checking Node.js and npm...
where node >nul 2>nul
set "HAS_NODE=%errorlevel%"
where npm >nul 2>nul
set "HAS_NPM=%errorlevel%"

if not "%HAS_NODE%"=="0" (
  if not "%HAS_NPM%"=="0" (
    where winget >nul 2>nul
    if %errorlevel%==0 (
      echo Node.js and npm not found. Installing with winget...
      winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
      if errorlevel 1 (
        echo Failed to install Node.js with winget.
        exit /b 1
      )
      call refreshenv >nul 2>nul
    ) else (
      echo Node.js and npm were not found and winget is unavailable.
      echo Install Node.js LTS manually, then rerun this script.
      exit /b 1
    )
  )
)

where node >nul 2>nul
if not %errorlevel%==0 (
  echo Node.js is still not available after installation.
  echo Open a new terminal and rerun initialize.bat.
  exit /b 1
)

where npm >nul 2>nul
if not %errorlevel%==0 (
  echo npm is still not available after installation.
  echo Open a new terminal and rerun initialize.bat.
  exit /b 1
)

echo [5/7] Installing Node dependencies...
call npm install
if errorlevel 1 (
  echo Failed to install Node dependencies.
  exit /b 1
)

echo [6/7] Verifying local runtime...
call "python\venv\Scripts\python.exe" -m py_compile python\main.py
if errorlevel 1 (
  echo Python backend verification failed.
  exit /b 1
)

echo [7/7] Launching NeoCore...
call npm start
exit /b %errorlevel%
