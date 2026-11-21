@echo off
setlocal
powershell.exe -NoProfile -File "%~dp0Start.ps1" -OpenBrowser
if errorlevel 1 (
  pause
  exit /b 1
)
exit /b 0
