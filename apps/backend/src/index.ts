import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

const ROOT = path.resolve(__dirname, '../../..');
dotenv.config({ path: path.join(ROOT, '.env') });

// Support KALSHI_PRIVATE_KEY_PATH from .env
if (process.env.KALSHI_PRIVATE_KEY_PATH && fs.existsSync(process.env.KALSHI_PRIVATE_KEY_PATH)) {
  process.env.KALSHI_API_PRIVATE_KEY = fs.readFileSync(process.env.KALSHI_PRIVATE_KEY_PATH, 'utf-8').trim();
}

import { loadConfig } from './util/config-loader';
import { logger } from './util/logger';
import { initDb, closeDb } from './storage/database';
import { runMigrations } from './storage/migrate';
import { Orchestrator } from './services/orchestrator';
import {
  PositionRepo, OrderRepo, DailyPnlRepo, TradeRecordRepo, LogRepo, MarketRepo,
} from './storage/repositories';

const MODULE = 'main';

let orchestrator: Orchestrator | null = null;

function sendToParent(msg: any): void {
  if (process.send) {
    process.send(msg);
  }
}

function broadcastState(): void {
  if (!orchestrator) return;
  sendToParent({
    type: 'state',
    data: {
      botState: orchestrator.getState(),
      health: orchestrator.getHealthStatus(),
      positions: orchestrator.getPositions(),
    },
  });
}

async function handleCommand(msg: any): Promise<void> {
  if (!msg || !msg.type) return;

  logger.debug(MODULE, `IPC command: ${msg.type}`);

  switch (msg.type) {
    case 'start':
      if (orchestrator) await orchestrator.start();
      break;
    case 'pause':
      if (orchestrator) await orchestrator.pause();
      break;
    case 'resume':
      if (orchestrator) await orchestrator.resume();
      break;
    case 'stop':
      if (orchestrator) await orchestrator.stop();
      break;
    case 'flatten':
      if (orchestrator) await orchestrator.flatten();
      break;
    case 'safe-mode':
      if (orchestrator) orchestrator.toggleSafeMode();
      break;

    case 'get-state':
      sendToParent({
        type: 'state',
        data: {
          botState: orchestrator?.getState() || 'INIT',
          health: orchestrator?.getHealthStatus() || {},
          positions: orchestrator?.getPositions() || [],
        },
      });
      break;

    case 'get-positions':
      sendToParent({ type: 'positions', data: orchestrator?.getPositions() || [] });
      break;

    case 'get-orders':
      try {
        sendToParent({ type: 'orders', data: OrderRepo.getAll(100) });
      } catch { sendToParent({ type: 'orders', data: [] }); }
      break;

    case 'get-markets':
      try {
        sendToParent({ type: 'markets', data: MarketRepo.getAll().slice(0, 50) });
      } catch { sendToParent({ type: 'markets', data: [] }); }
      break;

    case 'get-trades':
      try {
        sendToParent({ type: 'trades', data: TradeRecordRepo.getAll(200) });
      } catch { sendToParent({ type: 'trades', data: [] }); }
      break;

    case 'get-pnl':
      try {
        const today = new Date().toISOString().slice(0, 10);
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
        sendToParent({ type: 'pnl', data: DailyPnlRepo.getRange(weekAgo, today) });
      } catch { sendToParent({ type: 'pnl', data: [] }); }
      break;

    case 'get-logs':
      try {
        sendToParent({ type: 'logs', data: LogRepo.getRecent(200) });
      } catch { sendToParent({ type: 'logs', data: [] }); }
      break;
  }
}

async function main(): Promise<void> {
  logger.info(MODULE, 'Kalshi Trend Trader Bot starting...');
  logger.info(MODULE, `Process PID: ${process.pid}, Parent PID: ${process.ppid}`);
  logger.info(MODULE, `IPC available: ${!!process.send}`);

  let config;
  try {
    config = loadConfig();
  } catch (err: any) {
    logger.error(MODULE, `Config load failed: ${err.message}`);
    sendToParent({ type: 'error', data: `Config load failed: ${err.message}` });
    // Use absolute minimum defaults to at least start
    const { AppConfigSchema } = require('@kalshi-bot/shared');
    config = AppConfigSchema.parse({
      kalshi: { env: 'demo', restBaseUrl: 'https://demo-api.kalshi.co/trade-api/v2', wsUrl: 'wss://demo-api.kalshi.co/trade-api/ws/v2', apiKeyId: 'none', apiPrivateKey: 'none' },
    });
  }

  logger.setLevel(config.telemetry.logLevel);
  logger.info(MODULE, `Environment: ${config.kalshi.env}`);
  logger.info(MODULE, `API Key: ${config.kalshi.apiKeyId ? config.kalshi.apiKeyId.slice(0, 8) + '...' : '(not set)'}`);

  try {
    initDb();
    runMigrations();
    logger.info(MODULE, 'Database initialized');
  } catch (err: any) {
    logger.error(MODULE, `Database init failed: ${err.message}`);
    sendToParent({ type: 'error', data: `Database init failed: ${err.message}` });
  }

  orchestrator = new Orchestrator(config);

  // Forward orchestrator events to parent
  orchestrator.on('stateChange', () => broadcastState());
  orchestrator.on('signal', (signal) => sendToParent({ type: 'signal', data: signal }));
  orchestrator.on('positionUpdate', () => broadcastState());

  // Periodically send state to parent
  setInterval(() => broadcastState(), 3000);

  // Listen for commands from Electron main process
  process.on('message', (msg: any) => {
    handleCommand(msg).catch((err) => {
      logger.error(MODULE, `Command failed: ${err.message}`);
    });
  });

  process.on('SIGINT', async () => {
    logger.info(MODULE, 'Shutting down...');
    if (orchestrator) await orchestrator.stop();
    closeDb();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info(MODULE, 'Shutting down...');
    if (orchestrator) await orchestrator.stop();
    closeDb();
    process.exit(0);
  });

  sendToParent({ type: 'ready' });
  logger.info(MODULE, 'Backend ready, waiting for commands.');
}

main().catch((err) => {
  logger.error(MODULE, 'Fatal error', { error: err.message, stack: err.stack });
  sendToParent({ type: 'error', data: err.message });
  process.exit(1);
});

export { Orchestrator } from './services/orchestrator';
