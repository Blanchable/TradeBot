import { v4 as uuid } from 'uuid';
import {
  Position, Signal, Fill, DailyPnl, TradeRecord,
  OrderSide, computeFeeCentsPerContract, FeeModelConfig,
} from '@kalshi-bot/shared';
import { PositionRepo, DailyPnlRepo, TradeRecordRepo, FillRepo } from '../storage';
import { logger } from '../util/logger';

const MODULE = 'portfolio';

export class PortfolioManager {
  private feeConfig: FeeModelConfig;
  private positions: Map<string, Position> = new Map();

  constructor(feeConfig: FeeModelConfig) {
    this.feeConfig = feeConfig;
    this.loadPositions();
  }

  private loadPositions(): void {
    const dbPositions = PositionRepo.getAll();
    for (const p of dbPositions) {
      this.positions.set(p.ticker, p);
    }
  }

  openPosition(signal: Signal, side: OrderSide, qty: number, fillPrice: number): Position {
    const position: Position = {
      ticker: signal.ticker,
      side,
      qty,
      avgPrice: fillPrice,
      currentPrice: fillPrice,
      unrealizedPnl: 0,
      realizedPnl: 0,
      stopPrice: signal.stopPrice,
      tp1Price: signal.tp1Price,
      tp2Price: signal.tp2Price || 0,
      entryTs: Date.now(),
      tp1Hit: false,
      partialExitQty: 0,
    };

    this.positions.set(signal.ticker, position);
    PositionRepo.upsert(position);
    logger.info(MODULE, 'Position opened', { ticker: signal.ticker, side, qty, price: fillPrice });
    return position;
  }

  closePartial(ticker: string, qty: number, exitPrice: number, reason: string): void {
    const pos = this.positions.get(ticker);
    if (!pos) return;

    const feeCents = computeFeeCentsPerContract(exitPrice, this.feeConfig) * qty;
    const grossPnl =
      pos.side === 'yes'
        ? (exitPrice - pos.avgPrice) * qty
        : (pos.avgPrice - exitPrice) * qty;

    pos.realizedPnl += grossPnl - feeCents;
    pos.qty -= qty;
    pos.partialExitQty += qty;

    if (pos.qty <= 0) {
      this.closePosition(ticker, exitPrice, reason);
      return;
    }

    PositionRepo.upsert(pos);
    this.updateDailyPnl(grossPnl, feeCents, false);
    logger.info(MODULE, 'Partial exit', { ticker, qty, exitPrice, reason });
  }

  closePosition(ticker: string, exitPrice: number, reason: string): void {
    const pos = this.positions.get(ticker);
    if (!pos) return;

    const remainingQty = pos.qty;
    const feeCents = computeFeeCentsPerContract(exitPrice, this.feeConfig) * remainingQty;
    const grossPnl =
      pos.side === 'yes'
        ? (exitPrice - pos.avgPrice) * remainingQty
        : (pos.avgPrice - exitPrice) * remainingQty;

    const entryFeeCents = computeFeeCentsPerContract(pos.avgPrice, this.feeConfig) * (remainingQty + pos.partialExitQty);
    const totalFees = feeCents + entryFeeCents;

    const netPnl = grossPnl - feeCents;
    const stopDist = Math.abs(pos.avgPrice - pos.stopPrice);
    const rMultiple = stopDist > 0 ? grossPnl / (stopDist * remainingQty) : 0;

    const record: TradeRecord = {
      id: uuid(),
      ticker,
      side: pos.side,
      entryPrice: pos.avgPrice,
      exitPrice,
      qty: remainingQty + pos.partialExitQty,
      entryTs: pos.entryTs,
      exitTs: Date.now(),
      grossPnl,
      fees: totalFees,
      netPnl,
      reason: 'breakout_up',
      exitReason: reason as any,
      rMultiple,
    };

    TradeRecordRepo.insert(record);
    this.updateDailyPnl(grossPnl, feeCents, netPnl > 0);

    pos.qty = 0;
    PositionRepo.upsert(pos);
    this.positions.delete(ticker);

    logger.info(MODULE, 'Position closed', {
      ticker, exitPrice, reason, netPnl: netPnl / 100,
    });
  }

  updatePrice(ticker: string, price: number): void {
    const pos = this.positions.get(ticker);
    if (!pos) return;

    pos.currentPrice = price;
    pos.unrealizedPnl =
      pos.side === 'yes'
        ? (price - pos.avgPrice) * pos.qty
        : (pos.avgPrice - price) * pos.qty;
  }

  markTp1Hit(ticker: string): void {
    const pos = this.positions.get(ticker);
    if (!pos) return;
    pos.tp1Hit = true;
    PositionRepo.upsert(pos);
  }

  updateStopPrice(ticker: string, newStop: number): void {
    const pos = this.positions.get(ticker);
    if (!pos) return;
    pos.stopPrice = newStop;
    PositionRepo.upsert(pos);
  }

  getPosition(ticker: string): Position | null {
    return this.positions.get(ticker) || null;
  }

  getAllPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  getOpenCount(): number {
    return this.positions.size;
  }

  private updateDailyPnl(grossPnl: number, fees: number, isWin: boolean): void {
    const date = new Date().toISOString().slice(0, 10);
    let daily = DailyPnlRepo.getToday();

    if (!daily) {
      daily = {
        date,
        realized: 0,
        fees: 0,
        net: 0,
        trades: 0,
        wins: 0,
        losses: 0,
        maxDrawdown: 0,
      };
    }

    daily.realized += grossPnl;
    daily.fees += fees;
    daily.net = daily.realized - daily.fees;
    daily.trades++;
    if (isWin) daily.wins++;
    else daily.losses++;
    daily.maxDrawdown = Math.min(daily.maxDrawdown, daily.net);

    DailyPnlRepo.upsert(daily);
  }
}
