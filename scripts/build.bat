@echo off
setlocal enabledelayedexpansion

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
if !errorlevel! neq 0 (
    echo [FAIL] Shared build failed
    pause
    exit /b 1
)

echo [2/4] Building backend...
call pnpm --filter @kalshi-bot/backend build
if !errorlevel! neq 0 (
    echo [FAIL] Backend build failed
    pause
    exit /b 1
)

echo [3/4] Building desktop app...
call pnpm --filter @kalshi-bot/desktop build
if !errorlevel! neq 0 (
    echo [FAIL] Desktop build failed
    pause
    exit /b 1
)

echo [4/4] Creating Windows installer...
echo.

:: Disable code signing - not needed for personal use
set "CSC_IDENTITY_AUTO_DISCOVERY=false"
set "WIN_CSC_LINK="
set "WIN_CSC_KEY_PASSWORD="

:: Clear stale winCodeSign cache that causes symlink errors
if exist "%LOCALAPPDATA%\electron-builder\Cache\winCodeSign" (
    echo Clearing winCodeSign cache to avoid symlink errors...
    rmdir /s /q "%LOCALAPPDATA%\electron-builder\Cache\winCodeSign" 2>nul
)

cd /d "%ROOT%\apps\desktop"
call npx electron-builder --win --config.win.signAndEditExecutable=false
if !errorlevel! neq 0 (
    echo.
    echo [WARN] Installer build failed. Trying portable-only build...
    call npx electron-builder --win portable --config.win.signAndEditExecutable=false
    if !errorlevel! neq 0 (
        echo.
        echo [INFO] Packaged build failed, but you can still run directly:
        echo        cd apps\desktop ^&^& npx electron .
        echo.
        echo [INFO] Or use dev mode:
        echo        pnpm dev
        echo.
        pause
        exit /b 1
    )
)

echo.
echo  =============================================
echo   Build Complete!
echo  =============================================
echo.
echo  Output located in: apps\desktop\release\
echo.
echo  You can also run directly without an installer:
echo    cd apps\desktop ^&^& npx electron .
echo.
pause
exit /b 0
