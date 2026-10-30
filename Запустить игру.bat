@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Сначала установите Node.js LTS с https://nodejs.org/
  echo После установки снова откройте этот файл.
  pause
  exit /b 1
)
echo Откройте в браузере http://localhost:3000 после запуска сервера.
node server.mjs
pause
