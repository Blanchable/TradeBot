import { StrategyConfig } from '@kalshi-bot/shared';
import { median } from '../util/math';

interface TradePrint {
  ticker: string;
  price: number;
  qty: number;
  ts: number;
  takerSide: string;
}

interface TapeMetrics {
  tradesPerMinute: number;
  volumePerMinute: number;
  recentToBaselineRatio: number;
}

export class TradeTape {
  private tapeWindow: Map<string, TradePrint[]> = new Map();
  private baselineMinutes: number;
  private windowMinutes: number;
  private maxTradesPerTicker = 5000;

  constructor(config: StrategyConfig) {
    this.windowMinutes = config.tapeConfirmWindowMinutes;
    this.baselineMinutes = Math.max(30, config.breakoutLookbackMinutes);
  }

  record(ticker: string, price: number, qty: number, ts: number, takerSide: string): void {
    let tape = this.tapeWindow.get(ticker);
    if (!tape) {
      tape = [];
      this.tapeWindow.set(ticker, tape);
    }
    tape.push({ ticker, price, qty, ts, takerSide });
    if (tape.length > this.maxTradesPerTicker) {
      tape.splice(0, tape.length - this.maxTradesPerTicker);
    }
  }

  getMetrics(ticker: string, now?: number): TapeMetrics {
    const tape = this.tapeWindow.get(ticker) || [];
    const currentTime = now || Date.now();
    const windowMs = this.windowMinutes * 60 * 1000;
    const baselineMs = this.baselineMinutes * 60 * 1000;

    const recentTrades = tape.filter((t) => currentTime - t.ts <= windowMs);
    const baselineTrades = tape.filter(
      (t) => currentTime - t.ts <= baselineMs && currentTime - t.ts > windowMs
    );

    const recentVolume = recentTrades.reduce((sum, t) => sum + t.qty, 0);
    const recentCount = recentTrades.length;

    const tradesPerMinute = recentCount / Math.max(1, this.windowMinutes);
    const volumePerMinute = recentVolume / Math.max(1, this.windowMinutes);

    const baselineMinuteCount = Math.max(1, (this.baselineMinutes - this.windowMinutes));
    const baselineVolumePerMinute =
      baselineTrades.length > 0
        ? baselineTrades.reduce((sum, t) => sum + t.qty, 0) / baselineMinuteCount
        : 1;

    const recentToBaselineRatio = volumePerMinute / Math.max(1, baselineVolumePerMinute);

    return { tradesPerMinute, volumePerMinute, recentToBaselineRatio };
  }

  prune(ticker: string, olderThanMs: number): void {
    const tape = this.tapeWindow.get(ticker);
    if (!tape) return;
    const cutoff = Date.now() - olderThanMs;
    const filtered = tape.filter((t) => t.ts >= cutoff);
    this.tapeWindow.set(ticker, filtered);
  }
}
