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
    logger.info(MODULE, 'Scanning markets...');
    const allMarkets: Market[] = [];
    let cursor = '';
    let pages = 0;

    try {
      do {
        const result = await this.rest.getMarkets({
          status: 'open',
          limit: 200,
          cursor: cursor || undefined,
        });
        allMarkets.push(...result.markets);
        cursor = result.cursor;
        pages++;
        if (pages > 20) break;
      } while (cursor);
    } catch (err: any) {
      logger.error(MODULE, `Market fetch failed: ${err.message}`);
      return this.scorer.getTracked();
    }

    // Log sample data from first few markets
    if (allMarkets.length > 0) {
      const sample = allMarkets[0];
      logger.info(MODULE, `Fetched ${allMarkets.length} markets (${pages} pages). Sample:`, {
        ticker: sample.ticker,
        status: sample.status,
        yesBid: sample.yesBid,
        yesAsk: sample.yesAsk,
        volume24h: sample.volume24h,
        openInterest: sample.openInterest,
        closeTime: sample.closeTime,
      });

      // Count markets with actual price data
      const withPrices = allMarkets.filter((m) => m.yesBid > 0 && m.yesAsk > 0);
      const withVolume = allMarkets.filter((m) => m.volume24h > 0);
      const withOI = allMarkets.filter((m) => m.openInterest > 0);
      logger.info(MODULE, `Data quality: ${withPrices.length} with prices, ${withVolume.length} with volume, ${withOI.length} with OI`);
    } else {
      logger.warn(MODULE, 'No markets returned from API');
    }

    for (const m of allMarkets) {
      MarketRepo.upsert(m);
    }

    const scored = this.scorer.filterAndRank(allMarkets);
    this.trackedTickers = scored.map((s) => s.ticker);

    logger.info(MODULE, `Scan result: ${allMarkets.length} total -> ${scored.length} tracked`);
    if (scored.length > 0) {
      logger.info(MODULE, `Top market: ${scored[0].ticker} score=${scored[0].score.toFixed(2)} spread=${scored[0].spreadCents}c vol=${scored[0].volume24h}`);
    }

    return scored;
  }

  start(): void {
    if (this.interval) return;
    this.scan().catch((err) => logger.error(MODULE, `Initial scan failed: ${err.message}`));
    this.interval = setInterval(
      () => this.scan().catch((err) => logger.error(MODULE, `Scan failed: ${err.message}`)),
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
