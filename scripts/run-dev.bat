@echo off
setlocal

:: Kalshi Trend Trader Bot - Dev Launcher
:: Starts backend and desktop app in dev mode

title Kalshi Trend Trader Bot - Dev Mode
color 0B

set "ROOT=%~dp0.."

echo.
echo  =============================================
echo   Kalshi Trend Trader Bot - Dev Mode
echo  =============================================
echo.

cd /d "%ROOT%"

:: Check if dependencies are installed
if not exist "%ROOT%\node_modules" (
    echo [!] Dependencies not installed. Run setup.bat first.
    pause
    exit /b 1
)

echo Starting backend...
start "Kalshi Bot Backend" cmd /c "cd /d "%ROOT%" && pnpm backend:dev"

echo Waiting for backend to initialize...
timeout /t 3 /nobreak >nul

echo Starting desktop app...
start "Kalshi Bot Desktop" cmd /c "cd /d "%ROOT%" && pnpm desktop:dev"

echo.
echo  Both services starting. Check the opened windows.
echo  Press any key to close this launcher (services will keep running).
echo.
pause
exit /b 0
