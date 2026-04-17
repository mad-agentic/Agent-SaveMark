@echo off
title Agent-SaveMark + Cloudflare Tunnel

echo Starting Agent-SaveMark server...
start "Agent-SaveMark Server" cmd /k "cd /d %~dp0 && uv run uvicorn agentpocket.main:app --host 0.0.0.0 --port 4040"

echo Waiting for server to start...
timeout /t 5 /nobreak > nul

echo Starting Cloudflare Tunnel...
start "Cloudflare Tunnel" cmd /k "cloudflared tunnel --url http://localhost:4040"

echo.
echo Both windows opened!
echo Check the "Cloudflare Tunnel" window for your public URL.
pause
