import { getDb } from './database';
import {
  Market, Candle, OrderbookTop, Signal, Order, Fill, Position,
  DailyPnl, TradeRecord, OrderStatus
} from '@kalshi-bot/shared';
import { LogEntry } from '../util/logger';

export const MarketRepo = {
  upsert(m: Market): void {
    getDb()
      .prepare(
        `INSERT INTO markets (ticker, event_ticker, title, category, close_time, tick_size,
         volume_24h, liquidity, open_interest, yes_bid, yes_ask, last_price, status, metadata_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(ticker) DO UPDATE SET
           event_ticker=excluded.event_ticker, title=excluded.title, category=excluded.category,
           close_time=excluded.close_time, tick_size=excluded.tick_size, volume_24h=excluded.volume_24h,
           liquidity=excluded.liquidity, open_interest=excluded.open_interest, yes_bid=excluded.yes_bid,
           yes_ask=excluded.yes_ask, last_price=excluded.last_price, status=excluded.status,
           metadata_json=excluded.metadata_json, updated_at=excluded.updated_at`
      )
      .run(
        m.ticker, m.eventTicker, m.title, m.category, m.closeTime,
        m.tickSize, m.volume24h, m.liquidity, m.openInterest,
        m.yesBid, m.yesAsk, m.lastPrice, m.status,
        m.metadata ? JSON.stringify(m.metadata) : null, Date.now()
      );
  },

  getAll(): Market[] {
    const rows: any[] = getDb().prepare('SELECT * FROM markets').all();
    return rows.map(rowToMarket);
  },

  getByTicker(ticker: string): Market | null {
    const row: any = getDb().prepare('SELECT * FROM markets WHERE ticker = ?').get(ticker);
    return row ? rowToMarket(row) : null;
  },
};

function rowToMarket(r: any): Market {
  return {
    ticker: r.ticker,
    eventTicker: r.event_ticker,
    title: r.title,
    category: r.category,
    status: r.status,
    closeTime: r.close_time,
    tickSize: r.tick_size,
    volume24h: r.volume_24h,
    liquidity: r.liquidity,
    openInterest: r.open_interest,
    yesBid: r.yes_bid,
    yesAsk: r.yes_ask,
    lastPrice: r.last_price,
    metadata: r.metadata_json ? JSON.parse(r.metadata_json) : undefined,
  };
}

export const CandleRepo = {
  insert(c: Candle): void {
    getDb()
      .prepare(
        `INSERT OR REPLACE INTO candles (ticker, ts, open, high, low, close, volume)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(c.ticker, c.ts, c.open, c.high, c.low, c.close, c.volume);
  },

  insertMany(candles: Candle[]): void {
    const stmt = getDb().prepare(
      `INSERT OR REPLACE INTO candles (ticker, ts, open, high, low, close, volume)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const insertAll = getDb().transaction((items: Candle[]) => {
      for (const c of items) {
        stmt.run(c.ticker, c.ts, c.open, c.high, c.low, c.close, c.volume);
      }
    });
    insertAll(candles);
  },

  getRange(ticker: string, startTs: number, endTs: number): Candle[] {
    return getDb()
      .prepare('SELECT * FROM candles WHERE ticker = ? AND ts >= ? AND ts <= ? ORDER BY ts')
      .all(ticker, startTs, endTs) as Candle[];
  },

  getRecent(ticker: string, count: number): Candle[] {
    return getDb()
      .prepare('SELECT * FROM candles WHERE ticker = ? ORDER BY ts DESC LIMIT ?')
      .all(ticker, count)
      .reverse() as Candle[];
  },
};

export const OrderbookTopRepo = {
  insert(o: OrderbookTop): void {
    getDb()
      .prepare(
        `INSERT INTO orderbook_top (ticker, ts, yes_bid, yes_ask, depth_bid, depth_ask_est)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(o.ticker, o.ts, o.yesBid, o.yesAsk, o.depthBid, o.depthAskEst);
  },

  getLatest(ticker: string): OrderbookTop | null {
    const row: any = getDb()
      .prepare('SELECT * FROM orderbook_top WHERE ticker = ? ORDER BY ts DESC LIMIT 1')
      .get(ticker);
    if (!row) return null;
    return {
      ticker: row.ticker, ts: row.ts, yesBid: row.yes_bid,
      yesAsk: row.yes_ask, depthBid: row.depth_bid, depthAskEst: row.depth_ask_est,
    };
  },
};

export const SignalRepo = {
  insert(s: Signal): void {
    getDb()
      .prepare(
        `INSERT INTO signals (ticker, ts, signal_type, direction, entry_price, stop_price,
         tp1_price, expected_move_cents, fee_cost_cents, score, features_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        s.ticker, s.ts, s.reason, s.direction, s.entryPrice,
        s.stopPrice, s.tp1Price, s.expectedMoveCents, s.feeCostCents,
        s.score, JSON.stringify(s.features)
      );
  },
};

export const OrderRepo = {
  insert(o: Order): void {
    getDb()
      .prepare(
        `INSERT INTO orders (order_id, client_order_id, ticker, side, action, type, price, qty,
         filled_qty, status, ts_created, ts_updated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        o.orderId, o.clientOrderId || null, o.ticker, o.side, o.action,
        o.type, o.price, o.qty, o.filledQty, o.status, o.tsCreated, o.tsUpdated
      );
  },

  updateStatus(orderId: string, status: OrderStatus, filledQty?: number): void {
    if (filledQty !== undefined) {
      getDb()
        .prepare('UPDATE orders SET status = ?, filled_qty = ?, ts_updated = ? WHERE order_id = ?')
        .run(status, filledQty, Date.now(), orderId);
    } else {
      getDb()
        .prepare('UPDATE orders SET status = ?, ts_updated = ? WHERE order_id = ?')
        .run(status, Date.now(), orderId);
    }
  },

  getOpen(): Order[] {
    return getDb()
      .prepare("SELECT * FROM orders WHERE status IN ('pending', 'open', 'partial')")
      .all()
      .map(rowToOrder);
  },

  getByTicker(ticker: string): Order[] {
    return getDb()
      .prepare('SELECT * FROM orders WHERE ticker = ? ORDER BY ts_created DESC')
      .all(ticker)
      .map(rowToOrder);
  },

  getAll(limit: number = 200): Order[] {
    return getDb()
      .prepare('SELECT * FROM orders ORDER BY ts_created DESC LIMIT ?')
      .all(limit)
      .map(rowToOrder);
  },
};

function rowToOrder(r: any): Order {
  return {
    orderId: r.order_id, clientOrderId: r.client_order_id,
    ticker: r.ticker, side: r.side, action: r.action, type: r.type,
    price: r.price, qty: r.qty, filledQty: r.filled_qty,
    status: r.status, tsCreated: r.ts_created, tsUpdated: r.ts_updated,
  };
}

export const FillRepo = {
  insert(f: Fill): void {
    getDb()
      .prepare(
        `INSERT INTO fills (fill_id, order_id, ticker, side, action, price, qty, fee_cents, ts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(f.fillId, f.orderId, f.ticker, f.side, f.action, f.price, f.qty, f.feeCents, f.ts);
  },

  getByTicker(ticker: string): Fill[] {
    return getDb()
      .prepare('SELECT * FROM fills WHERE ticker = ? ORDER BY ts')
      .all(ticker) as Fill[];
  },
};

export const PositionRepo = {
  upsert(p: Position): void {
    getDb()
      .prepare(
        `INSERT INTO positions (ticker, side, qty, avg_price, current_price, unrealized_pnl,
         realized_pnl, stop_price, tp1_price, tp2_price, entry_ts, tp1_hit, partial_exit_qty)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(ticker) DO UPDATE SET
           side=excluded.side, qty=excluded.qty, avg_price=excluded.avg_price,
           current_price=excluded.current_price, unrealized_pnl=excluded.unrealized_pnl,
           realized_pnl=excluded.realized_pnl, stop_price=excluded.stop_price,
           tp1_price=excluded.tp1_price, tp2_price=excluded.tp2_price,
           tp1_hit=excluded.tp1_hit, partial_exit_qty=excluded.partial_exit_qty`
      )
      .run(
        p.ticker, p.side, p.qty, p.avgPrice, p.currentPrice,
        p.unrealizedPnl, p.realizedPnl, p.stopPrice, p.tp1Price,
        p.tp2Price, p.entryTs, p.tp1Hit ? 1 : 0, p.partialExitQty
      );
  },

  getAll(): Position[] {
    return getDb().prepare('SELECT * FROM positions WHERE qty > 0').all().map(rowToPosition);
  },

  getByTicker(ticker: string): Position | null {
    const row: any = getDb().prepare('SELECT * FROM positions WHERE ticker = ?').get(ticker);
    return row && row.qty > 0 ? rowToPosition(row) : null;
  },

  remove(ticker: string): void {
    getDb().prepare('UPDATE positions SET qty = 0 WHERE ticker = ?').run(ticker);
  },
};

function rowToPosition(r: any): Position {
  return {
    ticker: r.ticker, side: r.side, qty: r.qty, avgPrice: r.avg_price,
    currentPrice: r.current_price, unrealizedPnl: r.unrealized_pnl,
    realizedPnl: r.realized_pnl, stopPrice: r.stop_price,
    tp1Price: r.tp1_price, tp2Price: r.tp2_price, entryTs: r.entry_ts,
    tp1Hit: r.tp1_hit === 1, partialExitQty: r.partial_exit_qty,
  };
}

export const DailyPnlRepo = {
  upsert(d: DailyPnl): void {
    getDb()
      .prepare(
        `INSERT INTO pnl_daily (date, realized, fees, net, trades, wins, losses, max_drawdown)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(date) DO UPDATE SET
           realized=excluded.realized, fees=excluded.fees, net=excluded.net,
           trades=excluded.trades, wins=excluded.wins, losses=excluded.losses,
           max_drawdown=excluded.max_drawdown`
      )
      .run(d.date, d.realized, d.fees, d.net, d.trades, d.wins, d.losses, d.maxDrawdown);
  },

  getToday(): DailyPnl | null {
    const date = new Date().toISOString().slice(0, 10);
    const row: any = getDb().prepare('SELECT * FROM pnl_daily WHERE date = ?').get(date);
    return row || null;
  },

  getRange(start: string, end: string): DailyPnl[] {
    return getDb()
      .prepare('SELECT * FROM pnl_daily WHERE date >= ? AND date <= ? ORDER BY date')
      .all(start, end) as DailyPnl[];
  },
};

export const TradeRecordRepo = {
  insert(t: TradeRecord): void {
    getDb()
      .prepare(
        `INSERT INTO trade_records (id, ticker, side, entry_price, exit_price, qty,
         entry_ts, exit_ts, gross_pnl, fees, net_pnl, entry_reason, exit_reason, r_multiple)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        t.id, t.ticker, t.side, t.entryPrice, t.exitPrice, t.qty,
        t.entryTs, t.exitTs, t.grossPnl, t.fees, t.netPnl,
        t.reason, t.exitReason, t.rMultiple
      );
  },

  getAll(limit: number = 500): TradeRecord[] {
    return getDb()
      .prepare('SELECT * FROM trade_records ORDER BY entry_ts DESC LIMIT ?')
      .all(limit)
      .map(rowToTradeRecord);
  },
};

function rowToTradeRecord(r: any): TradeRecord {
  return {
    id: r.id, ticker: r.ticker, side: r.side, entryPrice: r.entry_price,
    exitPrice: r.exit_price, qty: r.qty, entryTs: r.entry_ts,
    exitTs: r.exit_ts, grossPnl: r.gross_pnl, fees: r.fees,
    netPnl: r.net_pnl, reason: r.entry_reason, exitReason: r.exit_reason,
    rMultiple: r.r_multiple,
  };
}

export const LogRepo = {
  insert(e: LogEntry): void {
    getDb()
      .prepare(
        'INSERT INTO logs (ts, level, module, message, data_json) VALUES (?, ?, ?, ?, ?)'
      )
      .run(e.ts, e.level, e.module, e.message, e.data ? JSON.stringify(e.data) : null);
  },

  getRecent(limit: number = 200, level?: string): any[] {
    if (level) {
      return getDb()
        .prepare('SELECT * FROM logs WHERE level = ? ORDER BY ts DESC LIMIT ?')
        .all(level, limit);
    }
    return getDb()
      .prepare('SELECT * FROM logs ORDER BY ts DESC LIMIT ?')
      .all(limit);
  },
};

export const StoreIndex = {
  MarketRepo, CandleRepo, OrderbookTopRepo, SignalRepo,
  OrderRepo, FillRepo, PositionRepo, DailyPnlRepo, TradeRecordRepo, LogRepo,
};
