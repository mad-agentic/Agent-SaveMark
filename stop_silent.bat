@echo off
setlocal EnableExtensions

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "RUNTIME_DIR=%ROOT%\.runtime"
set "BACKEND_PID_FILE=%RUNTIME_DIR%\backend.pid"
set "FRONTEND_PID_FILE=%RUNTIME_DIR%\frontend.pid"

echo ==========================================================
echo   Agent-SaveMark silent stopper
echo ==========================================================
echo.

call :stopByPidFile "%BACKEND_PID_FILE%" "Backend"
call :stopByPidFile "%FRONTEND_PID_FILE%" "Frontend"

call :stopByPort 4040 "Backend"
call :stopByPort 4041 "Frontend"

echo.
echo Done.
goto :eof

:stopByPidFile
set "PID_FILE=%~1"
set "SERVICE_NAME=%~2"

if not exist "%PID_FILE%" (
  echo [INFO] %SERVICE_NAME% PID file not found: %PID_FILE%
  exit /b 0
)

set "PID="
for /f "usebackq delims=" %%p in ("%PID_FILE%") do set "PID=%%p"

if not defined PID (
  echo [WARN] %SERVICE_NAME% PID file is empty: %PID_FILE%
  del /q "%PID_FILE%" >nul 2>nul
  exit /b 0
)

tasklist /FI "PID eq %PID%" | findstr /R /C:" %PID% " >nul
if errorlevel 1 (
  echo [INFO] %SERVICE_NAME% PID %PID% is not running.
  del /q "%PID_FILE%" >nul 2>nul
  exit /b 0
)

taskkill /PID %PID% /T /F >nul 2>nul
if errorlevel 1 (
  echo [WARN] Failed to stop %SERVICE_NAME% PID %PID%.
) else (
  echo [OK] Stopped %SERVICE_NAME% PID %PID%.
)
del /q "%PID_FILE%" >nul 2>nul
exit /b 0

:stopByPort
set "TARGET_PORT=%~1"
set "SERVICE_NAME=%~2"
set "FOUND=0"

for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":%TARGET_PORT% .*LISTENING"') do (
  set "FOUND=1"
  call :killPid %%p "%SERVICE_NAME%" "%TARGET_PORT%"
)

if "%FOUND%"=="0" (
  echo [INFO] No LISTENING process found on port %TARGET_PORT%.
)
exit /b 0

:killPid
set "KILL_PID=%~1"
set "SERVICE_NAME=%~2"
set "TARGET_PORT=%~3"

taskkill /PID %KILL_PID% /T /F >nul 2>nul
if errorlevel 1 (
  echo [WARN] Could not stop %SERVICE_NAME% on port %TARGET_PORT% ^(PID %KILL_PID%^).
) else (
  echo [OK] Stopped %SERVICE_NAME% on port %TARGET_PORT% ^(PID %KILL_PID%^).
)
exit /b 0
