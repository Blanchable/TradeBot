@echo off
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
if errorlevel 1 goto :nonode
for /f "tokens=*" %%i in ('node -v') do echo  Node.js %%i
goto :hasnode

:nonode
echo  Node.js is required but not installed.
echo  Install it from: https://nodejs.org/
echo  Then double-click START.bat again.
pause
exit /b 1

:hasnode

:: ---- Install pnpm if missing ----
where pnpm >nul 2>&1
if errorlevel 1 (
    echo  Installing pnpm...
    call npm install -g pnpm
)

:: ---- Install dependencies if needed ----
if not exist "node_modules" (
    echo  Installing dependencies, first run takes ~1 min...
    call pnpm install
    if errorlevel 1 goto :fail
)
echo  Dependencies OK

:: ---- Create .env if missing ----
if not exist ".env" copy ".env.example" ".env" >nul 2>&1

:: ---- Create data directory ----
if not exist "data" mkdir data

:: ---- Build shared ----
echo  Building shared...
call pnpm --filter @kalshi-bot/shared build
if errorlevel 1 goto :fail

:: ---- Build backend ----
echo  Building backend...
call pnpm --filter @kalshi-bot/backend build
if errorlevel 1 goto :fail

:: ---- Build desktop ----
echo  Building desktop...
call pnpm --filter @kalshi-bot/desktop build
if errorlevel 1 goto :fail

echo.
echo  =========================================
echo   Launching app...
echo  =========================================
echo.

:: ---- Launch ----
cd /d "%~dp0apps\desktop"
call npx electron .

echo.
echo  App closed.
pause
exit /b 0

:fail
echo.
echo  =========================================
echo   Build failed. Check the errors above.
echo  =========================================
pause
exit /b 1
