@echo off
title Cloudflare Tunnel - Port 8000
cd /d "%~dp0"
echo ===================================================
echo Starting Cloudflare Tunnel to expose port 8000...
echo Check the URL below ending with .trycloudflare.com
echo ===================================================
cloudflared.exe tunnel --url http://127.0.0.1:8000
pause
