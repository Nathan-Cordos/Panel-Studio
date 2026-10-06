@echo off
cd /d "%~dp0"
start "" "http://127.0.0.1:3741"
node --env-file-if-exists=.env server.mjs
pause
