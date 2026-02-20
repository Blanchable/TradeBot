import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../util/logger';

const MODULE = 'storage';
const DATA_DIR = path.resolve(__dirname, '../../../../data');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

export function initDb(dbPath?: string): Database.Database {
  const resolvedPath = dbPath || path.join(DATA_DIR, 'kalshi-bot.db');
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  logger.info(MODULE, `Database opened at ${resolvedPath}`);
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
    logger.info(MODULE, 'Database closed');
  }
}
