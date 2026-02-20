import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { loadConfig } from './util/config-loader';
import { logger } from './util/logger';
import { initDb, closeDb } from './storage/database';
import { runMigrations } from './storage/migrate';
import { Orchestrator } from './services/orchestrator';

const MODULE = 'main';

async function main(): Promise<void> {
  logger.info(MODULE, 'Kalshi Trend Trader Bot starting...');

  const config = loadConfig();
  logger.setLevel(config.telemetry.logLevel);
  logger.info(MODULE, `Environment: ${config.kalshi.env}`);

  initDb();
  runMigrations();
  logger.info(MODULE, 'Database initialized');

  const orchestrator = new Orchestrator(config);

  process.on('SIGINT', async () => {
    logger.info(MODULE, 'Shutting down...');
    await orchestrator.stop();
    closeDb();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info(MODULE, 'Shutting down...');
    await orchestrator.stop();
    closeDb();
    process.exit(0);
  });

  // Export orchestrator for IPC access from Electron
  (global as any).__orchestrator = orchestrator;

  logger.info(MODULE, 'Backend ready. Use GUI or API to start trading.');
}

main().catch((err) => {
  logger.error(MODULE, 'Fatal error', { error: err.message, stack: err.stack });
  process.exit(1);
});

export { Orchestrator } from './services/orchestrator';
