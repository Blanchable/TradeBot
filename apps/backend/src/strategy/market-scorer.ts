import { Market, MarketScore, MarketUniverse } from '@kalshi-bot/shared';
import { logger } from '../util/logger';

const MODULE = 'market-scorer';

export class MarketScorer {
  private config: MarketUniverse;
  private trackedMarkets: Map<string, MarketScore> = new Map();

  constructor(config: MarketUniverse) {
    this.config = config;
  }

  updateConfig(config: MarketUniverse): void {
    this.config = config;
  }

  filterAndRank(markets: Market[]): MarketScore[] {
    const filtered = markets.filter((m) => this.passesFilters(m));
    logger.debug(MODULE, `Filtered ${filtered.length} / ${markets.length} markets`);

    const scored: MarketScore[] = filtered.map((m) => {
      const spreadCents = (m.yesAsk && m.yesBid) ? m.yesAsk - m.yesBid : 99;
      const closeMs = new Date(m.closeTime).getTime();
      const minutesToClose = Math.max(0, (closeMs - Date.now()) / 60000);
      const score = this.computeScore(m.volume24h, m.openInterest, spreadCents, minutesToClose);

      return {
        ticker: m.ticker,
        score,
        volume24h: m.volume24h,
        liquidity: m.volume24h,
        openInterest: m.openInterest,
        spreadCents,
        minutesToClose,
      };
    });

    scored.sort((a, b) => b.score - a.score);
    const topN = scored.slice(0, this.config.maxMarketsTracked);
    this.applyHysteresis(topN);

    return Array.from(this.trackedMarkets.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, this.config.maxMarketsTracked);
  }

  private passesFilters(m: Market): boolean {
    if (m.status !== 'open') return false;

    // Must have actual bid/ask prices
    if (!m.yesBid || !m.yesAsk || m.yesBid <= 0 || m.yesAsk <= 0) return false;

    if (m.volume24h < this.config.minVolume24h) return false;
    if (m.openInterest < this.config.minOpenInterest) return false;

    // Liquidity field is deprecated in Kalshi API (returns 0).
    // Skip liquidity filter -- use volume as proxy instead.

    const spread = m.yesAsk - m.yesBid;
    if (spread <= 0 || spread > this.config.maxSpreadCents) return false;

    const closeMs = new Date(m.closeTime).getTime();
    const minutesToClose = (closeMs - Date.now()) / 60000;
    if (minutesToClose < this.config.minMinutesToClose) return false;

    return true;
  }

  private computeScore(
    volume: number,
    oi: number,
    spread: number,
    minutesToClose: number
  ): number {
    // Score: higher volume and OI is better, wider spread is worse
    const v = 0.45 * Math.log(volume + 1);
    const o = 0.30 * Math.log(oi + 1);
    const s = 0.15 * spread;
    const t = 0.10 * (minutesToClose < 60 ? (60 - minutesToClose) / 60 : 0);
    return Math.max(0, v + o - s - t);
  }

  private applyHysteresis(newTop: MarketScore[]): void {
    const newTickers = new Set(newTop.map((m) => m.ticker));
    for (const ms of newTop) {
      this.trackedMarkets.set(ms.ticker, ms);
    }
    for (const [ticker, existing] of this.trackedMarkets) {
      if (newTickers.has(ticker)) continue;
      if (existing.score < 0.5 || existing.minutesToClose < 5) {
        this.trackedMarkets.delete(ticker);
      }
    }
  }

  getTracked(): MarketScore[] {
    return Array.from(this.trackedMarkets.values()).sort((a, b) => b.score - a.score);
  }

  isTracked(ticker: string): boolean {
    return this.trackedMarkets.has(ticker);
  }
}
