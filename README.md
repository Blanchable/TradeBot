# Kalshi Trend Trader Bot

A production-grade trend-following trading bot for [Kalshi](https://kalshi.com) prediction markets. Enters with limit orders, exits via take-profit and stop-loss logic, and is operated via a desktop GUI.

**This bot can lose money. Start with demo mode, backtest, then run small.**

## Architecture

- **Backend**: Node.js + TypeScript with WebSocket/REST Kalshi clients, SQLite storage
- **Desktop GUI**: Electron + React + TypeScript
- **Shared**: Common types, config schemas, fee calculations
- **Strategy**: Trend-following with EMA crossover, breakout detection, ATR-based stops
- **Risk**: Position sizing, daily loss limits, category exposure, cooldowns
- **Execution**: Limit orders only, synthetic stops, cancel/replace cycles

## Quick Start (Windows)

**Double-click `START.bat`** -- that's it. It installs dependencies, builds everything, and launches the GUI. API keys are configured inside the app.

Requires [Node.js](https://nodejs.org/) to be installed first.

## Quick Start (Mac/Linux)

```bash
pnpm install
pnpm --filter @kalshi-bot/shared build
pnpm --filter @kalshi-bot/backend build
pnpm --filter @kalshi-bot/desktop build
cd apps/desktop && npx electron .
```

## Project Structure

```
/
├── apps/
│   ├── backend/          # Trading engine, API clients, strategy, risk
│   │   └── src/
│   │       ├── api/      # Kalshi REST client
│   │       ├── ws/       # Kalshi WebSocket client
│   │       ├── data/     # Candle builder, orderbook, trade tape
│   │       ├── strategy/ # Signals, indicators, market scoring
│   │       ├── risk/     # Risk engine, sizing, guardrails
│   │       ├── exec/     # Execution engine, order lifecycle
│   │       ├── portfolio/ # Positions, PnL, fees
│   │       ├── backtest/ # Historical simulation
│   │       ├── services/ # Orchestrator, scanner, health checks
│   │       ├── storage/  # SQLite models, migrations
│   │       └── util/     # Config, logging, math
│   └── desktop/          # Electron + React GUI
│       └── src/
│           ├── main/     # Electron main process
│           ├── preload/  # Context bridge
│           └── renderer/ # React UI components
├── packages/
│   └── shared/           # Types, config schema, fee model
├── scripts/
│   ├── setup.bat         # Windows setup wizard
│   ├── run-dev.bat       # Quick dev launcher
│   └── build.bat         # Production build
├── config/
│   ├── default.json      # Default configuration
│   ├── dev.json          # Development overrides
│   └── prod.json         # Production overrides
└── data/                 # Runtime data (gitignored)
```

## Strategy Overview

The bot uses a **trend-following** approach:

1. **Market Scanner** selects optimal markets by volume, liquidity, spread, and open interest
2. **Signal Generator** detects breakouts confirmed by EMA crossovers and tape activity
3. **Risk Engine** sizes positions based on ATR-derived stop distances
4. **Execution Engine** enters with limit orders and manages the order lifecycle
5. **Exit Logic**: Take-profit at 1R (partial), trailing stop after, time-stop, and hard stop-loss

### What This Bot Does NOT Do

- No market making or spread capture
- No arbitrage between markets
- No holding to settlement for edge
- All trades aim to enter and exit before settlement

## Risk Controls

| Parameter | Default | Description |
|-----------|---------|-------------|
| bankrollUSD | $1,000 | Total capital allocation |
| maxRiskPerTradeUSD | $25 | Maximum loss per trade |
| maxDailyLossUSD | $100 | Daily loss limit (disables trading) |
| maxConcurrentPositions | 5 | Maximum simultaneous positions |
| cooldownAfterStopSeconds | 300 | Wait time after a stop loss |
| timeStopMinutes | 60 | Exit if not profitable enough |

## Fee Model

Kalshi fee formula: `fee = ceil(coefficient * price * (1 - price/100))`

Every trade entry must pass a minimum-move threshold that covers:
- Entry + exit fees
- Spread cost
- Estimated slippage

## GUI Features

- **Dashboard**: Equity curve, P&L metrics, trade history
- **Positions**: Live positions with stop/target levels, close buttons
- **Orders**: Open/filled/canceled orders with cancel controls
- **Markets**: Tracked markets with scores, spreads, volume
- **Settings**: Editable configuration with risk confirmation gates
- **Logs**: Filterable log viewer with export

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start backend + GUI in dev mode |
| `pnpm backend:dev` | Start backend only |
| `pnpm desktop:dev` | Start GUI only |
| `pnpm build` | Production build |
| `pnpm test` | Run all tests |
| `pnpm db:migrate` | Initialize/migrate database |

## Safety Features

- **Kill Switch**: Create `data/KILL_SWITCH` file to immediately disable entries
- **Flatten All**: GUI button to cancel all orders and exit all positions
- **Safe Mode**: Reduces position sizes and applies stricter filters
- **Disconnect Handling**: Auto-flatten or pause on WebSocket disconnect
- **Price Anomaly Detection**: Pauses ticker on suspicious price jumps

## Configuration

Configuration is loaded in layers: `default.json` → `{env}.json` → `user-overrides.json` → `.env`

Edit via the GUI Settings panel, or directly edit config files.

## License

Private - All rights reserved.
