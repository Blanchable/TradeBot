import { OrderbookTop } from '@kalshi-bot/shared';
import { KalshiRestClient } from '../api/kalshi-rest';
import { OrderbookTopRepo } from '../storage';
import { logger } from '../util/logger';

const MODULE = 'orderbook-snap';

export class OrderbookSnapshotter {
  private rest: KalshiRestClient;
  private lastSnapshot: Map<string, OrderbookTop> = new Map();
  private lastFetchTime: Map<string, number> = new Map();
  private minIntervalMs = 2000;

  constructor(rest: KalshiRestClient) {
    this.rest = rest;
  }

  async snapshot(ticker: string): Promise<OrderbookTop | null> {
    const lastTime = this.lastFetchTime.get(ticker) || 0;
    if (Date.now() - lastTime < this.minIntervalMs) {
      return this.lastSnapshot.get(ticker) || null;
    }

    try {
      const ob = await this.rest.getOrderbook(ticker);
      const yesBid = ob.yesBids.length > 0 ? ob.yesBids[0][0] : 0;
      const yesAsk = ob.yesAsks.length > 0 ? ob.yesAsks[0][0] : 100;
      const depthBid = ob.yesBids.reduce((s, l) => s + l[1], 0);
      const depthAskEst = ob.yesAsks.reduce((s, l) => s + l[1], 0);

      const top: OrderbookTop = {
        ticker,
        ts: Date.now(),
        yesBid,
        yesAsk,
        depthBid,
        depthAskEst,
      };

      this.lastSnapshot.set(ticker, top);
      this.lastFetchTime.set(ticker, Date.now());
      OrderbookTopRepo.insert(top);
      return top;
    } catch (err: any) {
      logger.warn(MODULE, 'Orderbook fetch failed', { ticker, error: err.message });
      return this.lastSnapshot.get(ticker) || null;
    }
  }

  getCached(ticker: string): OrderbookTop | null {
    return this.lastSnapshot.get(ticker) || null;
  }

  updateFromWs(ticker: string, yesBid: number, yesAsk: number): void {
    const top: OrderbookTop = {
      ticker,
      ts: Date.now(),
      yesBid,
      yesAsk,
      depthBid: 0,
      depthAskEst: 0,
    };
    this.lastSnapshot.set(ticker, top);
  }
}
