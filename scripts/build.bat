@echo off
setlocal

:: Kalshi Trend Trader Bot - Production Build
:: Builds the project and creates a Windows installer

title Kalshi Trend Trader Bot - Build
color 0E

set "ROOT=%~dp0.."

echo.
echo  =============================================
echo   Kalshi Trend Trader Bot - Production Build
echo  =============================================
echo.

cd /d "%ROOT%"

:: Check dependencies
if not exist "%ROOT%\node_modules" (
    echo [!] Dependencies not installed. Run setup.bat first.
    pause
    exit /b 1
)

echo [1/4] Building shared package...
call pnpm --filter @kalshi-bot/shared build
if %errorlevel% neq 0 (
    echo [FAIL] Shared build failed
    pause
    exit /b 1
)

echo [2/4] Building backend...
call pnpm --filter @kalshi-bot/backend build
if %errorlevel% neq 0 (
    echo [FAIL] Backend build failed
    pause
    exit /b 1
)

echo [3/4] Building desktop app...
call pnpm --filter @kalshi-bot/desktop build
if %errorlevel% neq 0 (
    echo [FAIL] Desktop build failed
    pause
    exit /b 1
)

echo [4/4] Creating Windows installer...
cd /d "%ROOT%\apps\desktop"
call npx electron-builder --win
if %errorlevel% neq 0 (
    echo [FAIL] Installer creation failed
    pause
    exit /b 1
)

echo.
echo  =============================================
echo   Build Complete!
echo  =============================================
echo.
echo  Installer located in: apps\desktop\release\
echo.
pause
exit /b 0
