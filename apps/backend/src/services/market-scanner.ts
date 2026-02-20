import { Market, MarketScore, AppConfig } from '@kalshi-bot/shared';
import { KalshiRestClient } from '../api/kalshi-rest';
import { MarketScorer } from '../strategy/market-scorer';
import { MarketRepo } from '../storage';
import { logger } from '../util/logger';

const MODULE = 'scanner';

export class MarketScannerService {
  private rest: KalshiRestClient;
  private scorer: MarketScorer;
  private config: AppConfig;
  private interval: NodeJS.Timeout | null = null;
  private trackedTickers: string[] = [];

  constructor(rest: KalshiRestClient, config: AppConfig) {
    this.rest = rest;
    this.config = config;
    this.scorer = new MarketScorer(config.marketUniverse);
  }

  async scan(): Promise<MarketScore[]> {
    logger.debug(MODULE, 'Scanning markets...');
    const allMarkets: Market[] = [];
    let cursor = '';

    do {
      const result = await this.rest.getMarkets({
        status: 'open',
        limit: 200,
        cursor: cursor || undefined,
      });
      allMarkets.push(...result.markets);
      cursor = result.cursor;
    } while (cursor);

    for (const m of allMarkets) {
      MarketRepo.upsert(m);
    }

    const scored = this.scorer.filterAndRank(allMarkets);
    this.trackedTickers = scored.map((s) => s.ticker);

    logger.info(MODULE, `Scan complete: ${allMarkets.length} markets, ${scored.length} tracked`);
    return scored;
  }

  start(): void {
    if (this.interval) return;
    this.scan().catch((err) => logger.error(MODULE, 'Initial scan failed', { error: err.message }));
    this.interval = setInterval(
      () => this.scan().catch((err) => logger.error(MODULE, 'Scan failed', { error: err.message })),
      this.config.marketUniverse.scanIntervalSeconds * 1000
    );
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  getTrackedTickers(): string[] {
    return this.trackedTickers;
  }

  getTrackedScores(): MarketScore[] {
    return this.scorer.getTracked();
  }

  isTracked(ticker: string): boolean {
    return this.scorer.isTracked(ticker);
  }
}
