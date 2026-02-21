@echo off
:: Builds everything without launching. Use START.bat to build + launch.
cd /d "%~dp0.."
echo Building all packages...
call pnpm --filter @kalshi-bot/shared build && call pnpm --filter @kalshi-bot/backend build && call pnpm --filter @kalshi-bot/desktop build
echo Done.
pause
