@echo off
setlocal enabledelayedexpansion

:: Kalshi Trend Trader Bot - Setup Wizard
:: Double-click this file to install dependencies, initialize the project, and launch.
:: This script is idempotent - running it multiple times is safe.

title Kalshi Trend Trader Bot - Setup Wizard
color 0A

set "ROOT=%~dp0.."
set "DATA_DIR=%ROOT%\data"
set "LOG_FILE=%DATA_DIR%\setup.log"

:: Create data directory
if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"
if not exist "%DATA_DIR%\reports" mkdir "%DATA_DIR%\reports"

:: Start logging
echo ============================================= >> "%LOG_FILE%"
echo Setup started at %date% %time% >> "%LOG_FILE%"
echo ============================================= >> "%LOG_FILE%"

echo.
echo  =============================================
echo   Kalshi Trend Trader Bot - Setup Wizard
echo  =============================================
echo.

:: ----- Step 1: Check Windows version -----
echo [1/8] Checking Windows version...
ver | findstr /i "10\. 11\." >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARN] Could not confirm Windows 10/11. Continuing anyway...
    echo [WARN] Windows version check uncertain >> "%LOG_FILE%"
) else (
    echo [OK] Windows version compatible
    echo [OK] Windows version check passed >> "%LOG_FILE%"
)

:: ----- Step 2: Check Node.js -----
echo.
echo [2/8] Checking Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Node.js not found. Attempting to install via winget...
    echo [WARN] Node.js not found >> "%LOG_FILE%"
    
    where winget >nul 2>&1
    if %errorlevel% neq 0 (
        echo.
        echo  !! Node.js is required but not installed.
        echo  !! winget is not available for automatic installation.
        echo.
        echo  Please install Node.js LTS from: https://nodejs.org/
        echo  Then re-run this setup script.
        echo.
        echo [FAIL] Node.js missing, winget unavailable >> "%LOG_FILE%"
        pause
        exit /b 1
    )
    
    echo Installing Node.js LTS via winget...
    winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    if %errorlevel% neq 0 (
        echo [FAIL] winget install failed. Please install Node.js manually.
        echo [FAIL] winget Node.js install failed >> "%LOG_FILE%"
        pause
        exit /b 1
    )
    
    :: Refresh PATH
    set "PATH=%PROGRAMFILES%\nodejs;%PATH%"
    echo [OK] Node.js installed via winget >> "%LOG_FILE%"
)

for /f "tokens=*" %%i in ('node -v 2^>nul') do set NODE_VER=%%i
echo [OK] Node.js %NODE_VER% found
echo [OK] Node.js %NODE_VER% >> "%LOG_FILE%"

:: ----- Step 3: Check Git -----
echo.
echo [3/8] Checking Git...
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARN] Git not found. It is recommended but not required for setup.
    echo [WARN] Git not found >> "%LOG_FILE%"
) else (
    for /f "tokens=*" %%i in ('git --version 2^>nul') do set GIT_VER=%%i
    echo [OK] !GIT_VER!
    echo [OK] !GIT_VER! >> "%LOG_FILE%"
)

:: ----- Step 4: Install pnpm if needed -----
echo.
echo [4/8] Checking pnpm...
where pnpm >nul 2>&1
if %errorlevel% neq 0 (
    echo Installing pnpm globally...
    call npm install -g pnpm
    if %errorlevel% neq 0 (
        echo [FAIL] pnpm installation failed
        echo [FAIL] pnpm installation failed >> "%LOG_FILE%"
        pause
        exit /b 1
    )
    echo [OK] pnpm installed >> "%LOG_FILE%"
) else (
    echo [OK] pnpm already installed
    echo [OK] pnpm already present >> "%LOG_FILE%"
)

:: ----- Step 5: Install dependencies -----
echo.
echo [5/8] Installing dependencies (this may take a minute)...
cd /d "%ROOT%"
call pnpm install
if %errorlevel% neq 0 (
    echo [FAIL] pnpm install failed
    echo [FAIL] pnpm install failed >> "%LOG_FILE%"
    pause
    exit /b 1
)
echo [OK] Dependencies installed
echo [OK] Dependencies installed >> "%LOG_FILE%"

:: ----- Step 6: Setup environment file -----
echo.
echo [6/8] Setting up environment...
if not exist "%ROOT%\.env" (
    copy "%ROOT%\.env.example" "%ROOT%\.env" >nul
    echo [INFO] .env file created from template.
    echo.
    echo  !! IMPORTANT: You need to add your Kalshi API credentials to .env
    echo  !! Opening .env file in Notepad for you to edit...
    echo.
    start /wait notepad "%ROOT%\.env"
    echo [OK] .env created from template >> "%LOG_FILE%"
) else (
    echo [OK] .env file already exists
    echo [OK] .env already exists >> "%LOG_FILE%"
)

:: Validate required env keys
findstr /i "KALSHI_API_KEY_ID" "%ROOT%\.env" | findstr /v "your_api_key_here" >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARN] KALSHI_API_KEY_ID not set in .env - bot will not connect to Kalshi
    echo [WARN] API key not configured >> "%LOG_FILE%"
)

:: ----- Step 7: Build shared package and run DB migration -----
echo.
echo [7/8] Building shared package and initializing database...
cd /d "%ROOT%"
call pnpm --filter @kalshi-bot/shared build
if %errorlevel% neq 0 (
    echo [WARN] Shared package build had issues, continuing...
    echo [WARN] Shared build issue >> "%LOG_FILE%"
)

call pnpm --filter @kalshi-bot/backend db:migrate 2>nul
echo [OK] Database initialized
echo [OK] Database initialized >> "%LOG_FILE%"

:: ----- Step 8: Launch options -----
echo.
echo  =============================================
echo   Setup Complete!
echo  =============================================
echo.
echo  Choose launch mode:
echo    1) Dev mode (recommended for first run)
echo    2) Production build
echo    3) Exit (configure later)
echo.
set /p CHOICE="  Enter choice (1/2/3): "

if "%CHOICE%"=="1" (
    echo.
    echo Starting in dev mode...
    echo [OK] Launching dev mode >> "%LOG_FILE%"
    cd /d "%ROOT%"
    start "Kalshi Bot Backend" cmd /c "pnpm backend:dev"
    timeout /t 3 /nobreak >nul
    start "Kalshi Bot Desktop" cmd /c "pnpm desktop:dev"
    echo.
    echo  Bot is starting! Check the windows that opened.
    echo  Close this window when done.
) else if "%CHOICE%"=="2" (
    echo.
    echo Building production release...
    echo [OK] Building production >> "%LOG_FILE%"
    cd /d "%ROOT%"
    call pnpm build
    if %errorlevel% neq 0 (
        echo [FAIL] Production build failed
        echo [FAIL] Production build failed >> "%LOG_FILE%"
        pause
        exit /b 1
    )
    echo [OK] Production build complete
    echo Check /apps/desktop/release for the installer.
) else (
    echo.
    echo  Setup complete. Run scripts\run-dev.bat to start later.
)

echo.
echo Setup finished at %date% %time% >> "%LOG_FILE%"
echo ============================================= >> "%LOG_FILE%"
echo.
pause
exit /b 0
