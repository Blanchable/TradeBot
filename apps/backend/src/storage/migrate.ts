import { initDb, getDb, closeDb } from './database';
import { logger } from '../util/logger';

const MODULE = 'migrate';

const MIGRATIONS: Array<{ version: number; sql: string }> = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS markets (
        ticker TEXT PRIMARY KEY,
        event_ticker TEXT,
        title TEXT,
        category TEXT,
        close_time TEXT,
        tick_size REAL DEFAULT 1,
        volume_24h REAL DEFAULT 0,
        liquidity REAL DEFAULT 0,
        open_interest REAL DEFAULT 0,
        yes_bid REAL DEFAULT 0,
        yes_ask REAL DEFAULT 0,
        last_price REAL DEFAULT 0,
        status TEXT DEFAULT 'open',
        metadata_json TEXT,
        updated_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS candles (
        ticker TEXT NOT NULL,
        ts INTEGER NOT NULL,
        open REAL NOT NULL,
        high REAL NOT NULL,
        low REAL NOT NULL,
        close REAL NOT NULL,
        volume REAL DEFAULT 0,
        PRIMARY KEY (ticker, ts)
      );

      CREATE TABLE IF NOT EXISTS orderbook_top (
        ticker TEXT NOT NULL,
        ts INTEGER NOT NULL,
        yes_bid REAL,
        yes_ask REAL,
        depth_bid REAL DEFAULT 0,
        depth_ask_est REAL DEFAULT 0,
        PRIMARY KEY (ticker, ts)
      );

      CREATE TABLE IF NOT EXISTS signals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticker TEXT NOT NULL,
        ts INTEGER NOT NULL,
        signal_type TEXT NOT NULL,
        direction TEXT NOT NULL,
        entry_price REAL,
        stop_price REAL,
        tp1_price REAL,
        expected_move_cents REAL,
        fee_cost_cents REAL,
        score REAL,
        features_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_signals_ticker_ts ON signals(ticker, ts);

      CREATE TABLE IF NOT EXISTS orders (
        order_id TEXT PRIMARY KEY,
        client_order_id TEXT,
        ticker TEXT NOT NULL,
        side TEXT NOT NULL,
        action TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'limit',
        price REAL NOT NULL,
        qty INTEGER NOT NULL,
        filled_qty INTEGER DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        ts_created INTEGER NOT NULL,
        ts_updated INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_orders_ticker ON orders(ticker);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

      CREATE TABLE IF NOT EXISTS fills (
        fill_id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        ticker TEXT NOT NULL,
        side TEXT NOT NULL,
        action TEXT NOT NULL,
        price REAL NOT NULL,
        qty INTEGER NOT NULL,
        fee_cents REAL DEFAULT 0,
        ts INTEGER NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(order_id)
      );
      CREATE INDEX IF NOT EXISTS idx_fills_ticker ON fills(ticker);

      CREATE TABLE IF NOT EXISTS positions (
        ticker TEXT PRIMARY KEY,
        side TEXT NOT NULL,
        qty INTEGER NOT NULL DEFAULT 0,
        avg_price REAL NOT NULL DEFAULT 0,
        current_price REAL DEFAULT 0,
        unrealized_pnl REAL DEFAULT 0,
        realized_pnl REAL DEFAULT 0,
        stop_price REAL DEFAULT 0,
        tp1_price REAL DEFAULT 0,
        tp2_price REAL DEFAULT 0,
        entry_ts INTEGER,
        tp1_hit INTEGER DEFAULT 0,
        partial_exit_qty INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS pnl_daily (
        date TEXT PRIMARY KEY,
        realized REAL DEFAULT 0,
        fees REAL DEFAULT 0,
        net REAL DEFAULT 0,
        trades INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        max_drawdown REAL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        level TEXT NOT NULL,
        module TEXT NOT NULL,
        message TEXT NOT NULL,
        data_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs(ts);
      CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);

      CREATE TABLE IF NOT EXISTS trade_records (
        id TEXT PRIMARY KEY,
        ticker TEXT NOT NULL,
        side TEXT NOT NULL,
        entry_price REAL NOT NULL,
        exit_price REAL,
        qty INTEGER NOT NULL,
        entry_ts INTEGER NOT NULL,
        exit_ts INTEGER,
        gross_pnl REAL DEFAULT 0,
        fees REAL DEFAULT 0,
        net_pnl REAL DEFAULT 0,
        entry_reason TEXT,
        exit_reason TEXT,
        r_multiple REAL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_trade_records_ticker ON trade_records(ticker);

      CREATE TABLE IF NOT EXISTS migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
    `,
  },
];

export function runMigrations(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const applied = new Set(
    db
      .prepare('SELECT version FROM migrations')
      .all()
      .map((r: any) => r.version)
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    logger.info(MODULE, `Applying migration v${migration.version}`);
    db.exec(migration.sql);
    db.prepare('INSERT INTO migrations (version, applied_at) VALUES (?, ?)').run(
      migration.version,
      Date.now()
    );
    logger.info(MODULE, `Migration v${migration.version} applied`);
  }
}

if (require.main === module) {
  initDb();
  runMigrations();
  closeDb();
  console.log('Migrations complete.');
}
