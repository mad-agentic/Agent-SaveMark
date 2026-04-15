@echo off
setlocal EnableExtensions

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "FRONTEND_DIR=%ROOT%\frontend"
set "DATA_DIR=%ROOT%\data"
set "DATA_DIR_URL=%DATA_DIR:\=/%"
set "DB_URL=sqlite:///%DATA_DIR_URL%/Agent-SaveMark.db"
cd /d "%ROOT%"

echo ==========================================================
echo   Agent-SaveMark one-click starter
echo ==========================================================
echo.

if /I "%~1"=="--help" goto :help
if /I "%~1"=="/help" goto :help

set "AUTH_MODE=auto"
if /I "%~1"=="single" set "AUTH_MODE=single"
if /I "%~1"=="multi" set "AUTH_MODE=multi"

echo [INFO] Using env file: %ROOT%\.env

call :checkCommand uv "Install uv first: https://docs.astral.sh/uv/getting-started/installation/"
if errorlevel 1 exit /b 1

call :checkCommand node "Install Node.js 18+ first: https://nodejs.org/"
if errorlevel 1 exit /b 1

call :checkCommand pnpm "Install pnpm first: npm install -g pnpm"
if errorlevel 1 exit /b 1

if not exist "%DATA_DIR%" (
  echo [0/4] Creating data directory at %DATA_DIR% ...
  mkdir "%DATA_DIR%"
  if errorlevel 1 goto :failed
)

echo [1/4] Sync backend dependencies (uv sync --all-extras)...
call uv sync --all-extras
if errorlevel 1 goto :failed

if exist ".env.example" if not exist ".env" (
  echo [2/4] Creating .env from .env.example...
  copy /Y ".env.example" ".env" >nul
) else (
  echo [2/4] Keeping existing .env
)

echo [3/4] Install frontend dependencies (pnpm install)...
pushd "frontend"
call pnpm install
if errorlevel 1 (
  popd
  goto :failed
)
popd

echo [4/4] Starting services in two new terminals...
echo.

set "BACKEND_COMMAND=%ROOT%\.venv\Scripts\python.exe -m uvicorn fourdpocket.main:app --port 4040"
if /I "%AUTH_MODE%"=="multi" goto :start_backend_multi
if /I "%AUTH_MODE%"=="single" goto :start_backend_single
goto :start_backend_auto

:start_backend_multi
echo Running BACKEND in multi-user mode (override).
  start "Agent-SaveMark Backend" /D "%ROOT%" cmd /k "set FDP_STORAGE__BASE_PATH=%DATA_DIR%&&set FDP_DATABASE__URL=%DB_URL%&&set FDP_AUTH__MODE=multi&&%BACKEND_COMMAND%"
goto :start_frontend

:start_backend_single
echo Running BACKEND in single-user mode (override).
start "Agent-SaveMark Backend" /D "%ROOT%" cmd /k "set FDP_STORAGE__BASE_PATH=%DATA_DIR%&&set FDP_DATABASE__URL=%DB_URL%&&set FDP_AUTH__MODE=single&&%BACKEND_COMMAND%"
goto :start_frontend

:start_backend_auto
echo Running BACKEND with auth mode from .env.
start "Agent-SaveMark Backend" /D "%ROOT%" cmd /k "set FDP_STORAGE__BASE_PATH=%DATA_DIR%&&set FDP_DATABASE__URL=%DB_URL%&&%BACKEND_COMMAND%"

:start_frontend

start "Agent-SaveMark Frontend" /D "%FRONTEND_DIR%" cmd /k "pnpm dev"

echo Opening app URLs...
start "" "http://localhost:4040"
start "" "http://localhost:4041"

echo.
echo Done. Keep both terminal windows open while developing.
echo.
echo Tips:
echo   - Auth mode from .env: start.bat
echo   - Force single mode:  start.bat single
echo   - Force multi mode:   start.bat multi
goto :eof

:checkCommand
where %~1 >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Missing required command: %~1
  echo         %~2
  exit /b 1
)
exit /b 0

:failed
echo.
echo [ERROR] Setup failed. See logs above.
exit /b 1

:help
echo Usage:
echo   start.bat          ^(auth mode from .env^)
echo   start.bat single   ^(force single-user mode^)
echo   start.bat multi    ^(force multi-user mode^)
exit /b 0
