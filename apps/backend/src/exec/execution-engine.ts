import { v4 as uuid } from 'uuid';
import {
  Signal, Order, Position, OrderSide, OrderAction, OrderStatus,
  AppConfig, ExecutionConfig, computeFeeCentsPerContract,
} from '@kalshi-bot/shared';
import { KalshiRestClient } from '../api/kalshi-rest';
import { OrderbookSnapshotter } from '../data/orderbook-snapshotter';
import { RiskEngine } from '../risk/risk-engine';
import { OrderRepo, FillRepo, PositionRepo, TradeRecordRepo } from '../storage';
import { logger } from '../util/logger';

const MODULE = 'exec';

interface PendingEntry {
  signal: Signal;
  orderId: string;
  qty: number;
  replaceCycles: number;
  startTime: number;
}

export class ExecutionEngine {
  private rest: KalshiRestClient;
  private obSnap: OrderbookSnapshotter;
  private risk: RiskEngine;
  private config: ExecutionConfig;
  private fullConfig: AppConfig;
  private pendingEntries: Map<string, PendingEntry> = new Map();
  private monitorInterval: NodeJS.Timeout | null = null;
  private bestPrices: Map<string, number> = new Map();

  constructor(
    rest: KalshiRestClient,
    obSnap: OrderbookSnapshotter,
    risk: RiskEngine,
    config: AppConfig
  ) {
    this.rest = rest;
    this.obSnap = obSnap;
    this.risk = risk;
    this.config = config.execution;
    this.fullConfig = config;
  }

  updateConfig(config: AppConfig): void {
    this.config = config.execution;
    this.fullConfig = config;
  }

  async executeEntry(signal: Signal, contracts: number): Promise<string | null> {
    const ob = await this.obSnap.snapshot(signal.ticker);
    if (!ob) {
      logger.warn(MODULE, 'No orderbook data for entry', { ticker: signal.ticker });
      return null;
    }

    const spread = ob.yesAsk - ob.yesBid;
    if (spread > this.config.rejectOnSpreadWidenCents) {
      logger.warn(MODULE, 'Spread too wide for entry', { ticker: signal.ticker, spread });
      return null;
    }

    let entryPrice: number;
    let side: OrderSide;
    let action: OrderAction = 'buy';

    if (signal.direction === 'long_yes') {
      side = 'yes';
      entryPrice = Math.min(signal.entryPrice, ob.yesAsk);
    } else {
      side = 'no';
      entryPrice = 100 - signal.entryPrice;
    }

    const clientOrderId = uuid();

    try {
      const result = await this.rest.placeOrder({
        ticker: signal.ticker,
        side,
        action,
        type: 'limit',
        count: contracts,
        yesPrice: side === 'yes' ? entryPrice : undefined,
        noPrice: side === 'no' ? entryPrice : undefined,
        clientOrderId,
      });

      const order: Order = {
        orderId: result.orderId,
        ticker: signal.ticker,
        side,
        action,
        type: 'limit',
        price: entryPrice,
        qty: contracts,
        filledQty: 0,
        status: result.status as OrderStatus,
        clientOrderId,
        tsCreated: Date.now(),
        tsUpdated: Date.now(),
      };

      OrderRepo.insert(order);

      this.pendingEntries.set(signal.ticker, {
        signal,
        orderId: result.orderId,
        qty: contracts,
        replaceCycles: 0,
        startTime: Date.now(),
      });

      logger.info(MODULE, 'Entry order placed', {
        ticker: signal.ticker, side, price: entryPrice, qty: contracts,
      });

      return result.orderId;
    } catch (err: any) {
      logger.error(MODULE, 'Entry order failed', { ticker: signal.ticker, error: err.message });
      return null;
    }
  }

  async executeExit(
    position: Position,
    price: number,
    qty: number,
    reason: string
  ): Promise<string | null> {
    const side: OrderSide = position.side;
    const action: OrderAction = 'sell';

    try {
      const result = await this.rest.placeOrder({
        ticker: position.ticker,
        side,
        action,
        type: 'limit',
        count: qty,
        yesPrice: side === 'yes' ? price : undefined,
        noPrice: side === 'no' ? price : undefined,
      });

      const order: Order = {
        orderId: result.orderId,
        ticker: position.ticker,
        side,
        action,
        type: 'limit',
        price,
        qty,
        filledQty: 0,
        status: result.status as OrderStatus,
        tsCreated: Date.now(),
        tsUpdated: Date.now(),
      };

      OrderRepo.insert(order);
      logger.info(MODULE, `Exit order placed (${reason})`, {
        ticker: position.ticker, price, qty,
      });

      return result.orderId;
    } catch (err: any) {
      logger.error(MODULE, 'Exit order failed', { ticker: position.ticker, error: err.message });
      return null;
    }
  }

  async flattenAll(): Promise<void> {
    logger.info(MODULE, 'FLATTEN ALL initiated');

    const openOrders = OrderRepo.getOpen();
    for (const order of openOrders) {
      await this.rest.cancelOrder(order.orderId);
      OrderRepo.updateStatus(order.orderId, 'canceled');
    }

    const positions = PositionRepo.getAll();
    for (const pos of positions) {
      const ob = this.obSnap.getCached(pos.ticker);
      let exitPrice: number;

      if (pos.side === 'yes') {
        exitPrice = ob ? Math.max(1, ob.yesBid - 1) : Math.max(1, pos.currentPrice - 2);
      } else {
        exitPrice = ob ? Math.min(99, 100 - ob.yesAsk - 1) : Math.max(1, 100 - pos.currentPrice - 2);
      }

      await this.executeExit(pos, exitPrice, pos.qty, 'flatten');
    }
  }

  async cancelAndReplaceStale(): Promise<void> {
    for (const [ticker, pending] of this.pendingEntries) {
      const elapsed = (Date.now() - pending.startTime) / 1000;

      if (elapsed > this.config.entryPatienceSeconds) {
        if (pending.replaceCycles >= this.config.cancelReplaceMaxCycles) {
          await this.rest.cancelOrder(pending.orderId);
          OrderRepo.updateStatus(pending.orderId, 'canceled');
          this.pendingEntries.delete(ticker);
          logger.info(MODULE, 'Entry canceled after max cycles', { ticker });
          continue;
        }

        await this.rest.cancelOrder(pending.orderId);
        OrderRepo.updateStatus(pending.orderId, 'canceled');

        const ob = await this.obSnap.snapshot(ticker);
        if (ob) {
          const newPrice =
            pending.signal.direction === 'long_yes'
              ? Math.min(pending.signal.entryPrice + pending.replaceCycles + 1, ob.yesAsk)
              : Math.min(100 - pending.signal.entryPrice + pending.replaceCycles + 1, 100 - ob.yesBid);

          const result = await this.rest.placeOrder({
            ticker,
            side: pending.signal.direction === 'long_yes' ? 'yes' : 'no',
            action: 'buy',
            type: 'limit',
            count: pending.qty,
            yesPrice: pending.signal.direction === 'long_yes' ? newPrice : undefined,
            noPrice: pending.signal.direction === 'long_no' ? newPrice : undefined,
          });

          pending.orderId = result.orderId;
          pending.replaceCycles++;
          pending.startTime = Date.now();
          logger.info(MODULE, 'Entry replaced', { ticker, cycle: pending.replaceCycles });
        }
      }
    }
  }

  updateBestPrice(ticker: string, price: number): void {
    const current = this.bestPrices.get(ticker) || 0;
    const pos = PositionRepo.getByTicker(ticker);
    if (!pos) return;

    if (pos.side === 'yes' && price > current) {
      this.bestPrices.set(ticker, price);
    } else if (pos.side === 'no' && (current === 0 || price < current)) {
      this.bestPrices.set(ticker, price);
    }
  }

  getBestPrice(ticker: string): number {
    return this.bestPrices.get(ticker) || 0;
  }

  onFill(orderId: string, ticker: string, filledQty: number, price: number): void {
    OrderRepo.updateStatus(orderId, filledQty > 0 ? 'partial' : 'filled', filledQty);

    const pending = this.pendingEntries.get(ticker);
    if (pending && pending.orderId === orderId) {
      this.pendingEntries.delete(ticker);
    }

    logger.info(MODULE, 'Fill received', { orderId, ticker, filledQty, price });
  }

  clearPendingEntry(ticker: string): void {
    this.pendingEntries.delete(ticker);
    this.bestPrices.delete(ticker);
  }

  getPendingEntries(): Map<string, PendingEntry> {
    return this.pendingEntries;
  }
}
