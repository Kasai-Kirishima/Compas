@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PORT=8000
where node >nul 2>nul
if not errorlevel 1 goto use_node
where py >nul 2>nul
if not errorlevel 1 goto use_py
where python >nul 2>nul
if not errorlevel 1 goto use_python
echo Не найден Node.js или Python. Установите Node.js 18+ либо Python 3.
pause
exit /b 1

:use_node
start "КОМПАС Онлайн — локальный сервер" /min cmd /c "node start-server.mjs"
goto open_browser
:use_py
start "КОМПАС Онлайн — локальный сервер" /min cmd /c "py -3 -m http.server 8000 --bind 127.0.0.1"
goto open_browser
:use_python
start "КОМПАС Онлайн — локальный сервер" /min cmd /c "python -m http.server 8000 --bind 127.0.0.1"
goto open_browser
:open_browser
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8000/"
echo Приложение открыто в браузере.
echo Не закрывайте процесс локального сервера, пока работает редактор.
pause
