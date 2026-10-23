@echo off
title ZTab Startup
echo Starting ZTab. The first launch or a source update may take several seconds to build the web app.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Start-ZTab.ps1"
if errorlevel 1 (
  echo Startup failed. See the logs in output\launcher.
  pause
)
