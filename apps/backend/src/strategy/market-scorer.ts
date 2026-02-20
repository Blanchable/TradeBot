import { Market, MarketScore, MarketUniverse } from '@kalshi-bot/shared';
import { logger } from '../util/logger';

const MODULE = 'market-scorer';

const SCORE_WEIGHTS = {
  volume: 0.30,
  liquidity: 0.25,
  openInterest: 0.20,
  spreadPenalty: 0.15,
  timePenalty: 0.10,
};

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

    const scored: MarketScore[] = filtered.map((m) => {
      const spreadCents = m.yesAsk - m.yesBid;
      const now = Date.now();
      const closeMs = new Date(m.closeTime).getTime();
      const minutesToClose = Math.max(0, (closeMs - now) / 60000);

      const score = this.computeScore(m.volume24h, m.liquidity, m.openInterest, spreadCents, minutesToClose);

      return {
        ticker: m.ticker,
        score,
        volume24h: m.volume24h,
        liquidity: m.liquidity,
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
    if (m.status !== this.config.marketStatusFilter) return false;
    if (m.volume24h < this.config.minVolume24h) return false;
    if (m.liquidity < this.config.minLiquidity) return false;
    if (m.openInterest < this.config.minOpenInterest) return false;

    const spread = m.yesAsk - m.yesBid;
    if (spread > this.config.maxSpreadCents) return false;

    const closeMs = new Date(m.closeTime).getTime();
    const minutesToClose = (closeMs - Date.now()) / 60000;
    if (minutesToClose < this.config.minMinutesToClose) return false;

    return true;
  }

  private computeScore(
    volume: number,
    liquidity: number,
    oi: number,
    spread: number,
    minutesToClose: number
  ): number {
    const v = SCORE_WEIGHTS.volume * Math.log(volume + 1);
    const l = SCORE_WEIGHTS.liquidity * Math.log(liquidity + 1);
    const o = SCORE_WEIGHTS.openInterest * Math.log(oi + 1);
    const s = SCORE_WEIGHTS.spreadPenalty * spread;
    const t = SCORE_WEIGHTS.timePenalty * (minutesToClose < 60 ? (60 - minutesToClose) / 60 : 0);
    return v + l + o - s - t;
  }

  private applyHysteresis(newTop: MarketScore[]): void {
    const newTickers = new Set(newTop.map((m) => m.ticker));

    for (const ms of newTop) {
      this.trackedMarkets.set(ms.ticker, ms);
    }

    for (const [ticker, existing] of this.trackedMarkets) {
      if (newTickers.has(ticker)) continue;
      const threshold = existing.score * this.config.hysteresisDropFactor;
      if (existing.score < threshold || existing.minutesToClose < 5) {
        this.trackedMarkets.delete(ticker);
        logger.debug(MODULE, 'Dropped market', { ticker });
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
