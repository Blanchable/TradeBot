@echo off
setlocal enabledelayedexpansion
title Kalshi Trend Trader Bot
color 0A
cd /d "%~dp0"

echo.
echo  =========================================
echo   Kalshi Trend Trader Bot
echo  =========================================
echo.

:: ---- Check Node.js ----
where node >nul 2>&1
if !errorlevel! neq 0 (
    echo  Node.js is required but not installed.
    echo.
    echo  Install it from: https://nodejs.org/
    echo  Then double-click START.bat again.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do echo  Node.js %%i

:: ---- Install pnpm if missing ----
where pnpm >nul 2>&1
if !errorlevel! neq 0 (
    echo  Installing pnpm...
    call npm install -g pnpm >nul 2>&1
)

:: ---- Install dependencies ----
if not exist "node_modules" (
    echo  Installing dependencies (first run, takes ~1 min)...
    call pnpm install >nul 2>&1
    if !errorlevel! neq 0 (
        echo  Dependency install failed. Retrying with details...
        call pnpm install
        pause
        exit /b 1
    )
) else (
    echo  Dependencies OK
)

:: ---- Create .env if missing ----
if not exist ".env" (
    copy ".env.example" ".env" >nul 2>&1
    echo  Created .env (configure API keys in the app)
)

:: ---- Create data directory ----
if not exist "data" mkdir data

:: ---- Build everything ----
echo  Building...

call pnpm --filter @kalshi-bot/shared build >nul 2>&1
if !errorlevel! neq 0 (
    echo  [!] Shared build failed, retrying...
    call pnpm --filter @kalshi-bot/shared build
    if !errorlevel! neq 0 ( pause & exit /b 1 )
)

call pnpm --filter @kalshi-bot/backend build >nul 2>&1
if !errorlevel! neq 0 (
    echo  [!] Backend build failed, retrying...
    call pnpm --filter @kalshi-bot/backend build
    if !errorlevel! neq 0 ( pause & exit /b 1 )
)

call pnpm --filter @kalshi-bot/desktop build >nul 2>&1
if !errorlevel! neq 0 (
    echo  [!] Desktop build failed, retrying...
    call pnpm --filter @kalshi-bot/desktop build
    if !errorlevel! neq 0 ( pause & exit /b 1 )
)

echo  Build complete
echo.
echo  =========================================
echo   Launching...
echo  =========================================
echo.

:: ---- Launch Electron directly from source ----
cd /d "%~dp0\apps\desktop"
call npx electron .

:: If electron exits, pause so user can see any errors
echo.
echo  App closed.
pause
exit /b 0
