import { Candle, StrategyConfig } from '@kalshi-bot/shared';
import { CandleRepo } from '../storage';
import { logger } from '../util/logger';

const MODULE = 'candle-builder';

interface PendingCandle {
  ticker: string;
  openTs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export class CandleBuilder {
  private intervalMs: number;
  private pending: Map<string, PendingCandle> = new Map();
  private inMemory: Map<string, Candle[]> = new Map();
  private maxInMemory = 500;

  constructor(config: StrategyConfig) {
    this.intervalMs = config.candleIntervalSeconds * 1000;
  }

  onTrade(ticker: string, price: number, qty: number, ts: number): Candle | null {
    const bucketTs = Math.floor(ts / this.intervalMs) * this.intervalMs;

    let pending = this.pending.get(ticker);

    if (!pending || pending.openTs !== bucketTs) {
      if (pending) {
        const completed = this.finalize(pending);
        this.pushInMemory(completed);
        CandleRepo.insert(completed);
        logger.debug(MODULE, 'Candle closed', { ticker, ts: completed.ts });
      }
      pending = {
        ticker,
        openTs: bucketTs,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: qty,
      };
      this.pending.set(ticker, pending);
      return null;
    }

    pending.high = Math.max(pending.high, price);
    pending.low = Math.min(pending.low, price);
    pending.close = price;
    pending.volume += qty;

    return null;
  }

  flushAll(): Candle[] {
    const candles: Candle[] = [];
    for (const [, pending] of this.pending) {
      const c = this.finalize(pending);
      this.pushInMemory(c);
      CandleRepo.insert(c);
      candles.push(c);
    }
    this.pending.clear();
    return candles;
  }

  getRecentCandles(ticker: string, count: number): Candle[] {
    const mem = this.inMemory.get(ticker) || [];
    if (mem.length >= count) {
      return mem.slice(-count);
    }
    const dbCandles = CandleRepo.getRecent(ticker, count);
    return dbCandles;
  }

  loadHistorical(ticker: string, candles: Candle[]): void {
    CandleRepo.insertMany(candles);
    const mem = this.inMemory.get(ticker) || [];
    this.inMemory.set(ticker, [...mem, ...candles].slice(-this.maxInMemory));
  }

  private finalize(p: PendingCandle): Candle {
    return {
      ticker: p.ticker,
      ts: p.openTs,
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
      volume: p.volume,
    };
  }

  private pushInMemory(candle: Candle): void {
    const arr = this.inMemory.get(candle.ticker) || [];
    arr.push(candle);
    if (arr.length > this.maxInMemory) arr.shift();
    this.inMemory.set(candle.ticker, arr);
  }
}
