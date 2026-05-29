@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT=C:\ChaikaUA\mobile-app-short"
cd /d "%ROOT%" || (
  echo Cannot open project folder: %ROOT%
  pause
  exit /b 1
)

chcp 65001 >nul
node scripts\ship-menu.mjs %*

set "EXIT_CODE=%ERRORLEVEL%"
echo.
pause
exit /b %EXIT_CODE%
