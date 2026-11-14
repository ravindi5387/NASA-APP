@echo off
setlocal
cd /d "%~dp0"
echo Galaxy Divers - starting FastAPI + astronomy analysis backend...
where py >nul 2>nul
if errorlevel 1 (
  echo Python Launcher was not found. Install Python 3.14 or 3.13 from python.org.
  pause
  exit /b 1
)
if not exist ".venv\Scripts\python.exe" (
  py -3.14 -m venv .venv 2>nul
  if errorlevel 1 py -3.13 -m venv .venv 2>nul
  if errorlevel 1 (
    echo Could not create the virtual environment. Check installed Python versions with: py --list
    pause
    exit /b 1
  )
)
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
if errorlevel 1 (
  echo Backend dependencies failed. Read the error above.
  pause
  exit /b 1
)
.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
pause
