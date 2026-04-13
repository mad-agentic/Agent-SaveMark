@echo off
setlocal EnableExtensions

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "FRONTEND_DIR=%ROOT%\frontend"
set "DATA_DIR=%ROOT%\data"
set "DATA_DIR_URL=%DATA_DIR:\=/%"
set "DB_URL=sqlite:///%DATA_DIR_URL%/Agent-SaveMark.db"
set "RUNTIME_DIR=%ROOT%\.runtime"
cd /d "%ROOT%"

echo ==========================================================
echo   Agent-SaveMark silent starter
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
  echo [0/5] Creating data directory at %DATA_DIR% ...
  mkdir "%DATA_DIR%"
  if errorlevel 1 goto :failed
)

if not exist "%RUNTIME_DIR%" (
  mkdir "%RUNTIME_DIR%"
  if errorlevel 1 goto :failed
)

echo [1/5] Sync backend dependencies (uv sync --all-extras)...
call uv sync --all-extras
if errorlevel 1 goto :failed

if exist ".env.example" if not exist ".env" (
  echo [2/5] Creating .env from .env.example...
  copy /Y ".env.example" ".env" >nul
) else (
  echo [2/5] Keeping existing .env
)

echo [3/5] Install frontend dependencies (pnpm install)...
pushd "frontend"
call pnpm install
if errorlevel 1 (
  popd
  goto :failed
)
popd

echo [4/5] Checking running ports...
set "BACKEND_PORT_BUSY="
set "FRONTEND_PORT_BUSY="
netstat -ano | findstr /R /C:":4040 .*LISTENING" >nul && set "BACKEND_PORT_BUSY=1"
netstat -ano | findstr /R /C:":5173 .*LISTENING" >nul && set "FRONTEND_PORT_BUSY=1"

echo [5/5] Starting services in background (no extra terminal windows)...

if defined BACKEND_PORT_BUSY (
  echo [INFO] Port 4040 is already in use. Skipping backend start.
) else (
  if /I "%AUTH_MODE%"=="multi" (
    echo [INFO] Auth mode override: multi
    for /f %%i in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "$env:FDP_STORAGE__BASE_PATH='%DATA_DIR%'; $env:FDP_DATABASE__URL='%DB_URL%'; $env:FDP_AUTH__MODE='multi'; $p=Start-Process -FilePath 'uv' -ArgumentList @('run','uvicorn','fourdpocket.main:app','--port','4040') -WorkingDirectory '%ROOT%' -WindowStyle Hidden -RedirectStandardOutput '%RUNTIME_DIR%\backend.log' -RedirectStandardError '%RUNTIME_DIR%\backend.err.log' -PassThru; $p.Id"') do set "BACKEND_PID=%%i"
  ) else (
    if /I "%AUTH_MODE%"=="single" (
      echo [INFO] Auth mode override: single
      for /f %%i in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "$env:FDP_STORAGE__BASE_PATH='%DATA_DIR%'; $env:FDP_DATABASE__URL='%DB_URL%'; $env:FDP_AUTH__MODE='single'; $p=Start-Process -FilePath 'uv' -ArgumentList @('run','uvicorn','fourdpocket.main:app','--port','4040') -WorkingDirectory '%ROOT%' -WindowStyle Hidden -RedirectStandardOutput '%RUNTIME_DIR%\backend.log' -RedirectStandardError '%RUNTIME_DIR%\backend.err.log' -PassThru; $p.Id"') do set "BACKEND_PID=%%i"
    ) else (
      echo [INFO] Auth mode: from .env (no override)
      for /f %%i in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "$env:FDP_STORAGE__BASE_PATH='%DATA_DIR%'; $env:FDP_DATABASE__URL='%DB_URL%'; Remove-Item Env:FDP_AUTH__MODE -ErrorAction SilentlyContinue; $p=Start-Process -FilePath 'uv' -ArgumentList @('run','uvicorn','fourdpocket.main:app','--port','4040') -WorkingDirectory '%ROOT%' -WindowStyle Hidden -RedirectStandardOutput '%RUNTIME_DIR%\backend.log' -RedirectStandardError '%RUNTIME_DIR%\backend.err.log' -PassThru; $p.Id"') do set "BACKEND_PID=%%i"
    )
  )
  if defined BACKEND_PID (
    > "%RUNTIME_DIR%\backend.pid" echo %BACKEND_PID%
    echo [OK] Backend started. PID=%BACKEND_PID%
  )
)

if defined FRONTEND_PORT_BUSY (
  echo [INFO] Port 5173 is already in use. Skipping frontend start.
) else (
  for /f %%i in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "$p=Start-Process -FilePath 'pnpm' -ArgumentList @('dev') -WorkingDirectory '%FRONTEND_DIR%' -WindowStyle Hidden -RedirectStandardOutput '%RUNTIME_DIR%\frontend.log' -RedirectStandardError '%RUNTIME_DIR%\frontend.err.log' -PassThru; $p.Id"') do set "FRONTEND_PID=%%i"
  if defined FRONTEND_PID (
    > "%RUNTIME_DIR%\frontend.pid" echo %FRONTEND_PID%
    echo [OK] Frontend started. PID=%FRONTEND_PID%
  )
)

echo.
echo Logs:
echo   - %RUNTIME_DIR%\backend.log
echo   - %RUNTIME_DIR%\backend.err.log
echo   - %RUNTIME_DIR%\frontend.log
echo   - %RUNTIME_DIR%\frontend.err.log
echo.
echo Opening app URLs...
start "" "http://localhost:4040"
start "" "http://localhost:5173"
echo.
echo Done. Running in background.
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
echo   start_silent.bat          ^(auth mode from .env^)
echo   start_silent.bat single   ^(force single-user mode^)
echo   start_silent.bat multi    ^(force multi-user mode^)
echo.
echo Behavior:
echo   - Starts backend/frontend in background
echo   - Does not open extra terminal windows
echo   - Writes logs and pid files in .runtime\
exit /b 0
