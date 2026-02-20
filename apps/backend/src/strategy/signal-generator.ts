import {
  Signal, SignalDirection, SignalReason, Candle,
  StrategyConfig, FeeModelConfig, AppConfig,
} from '@kalshi-bot/shared';
import { computeFeeCentsPerContract, passesMinimumMove } from '@kalshi-bot/shared';
import { computeIndicators, IndicatorSet } from './indicators';
import { TradeTape } from '../data/trade-tape';
import { logger } from '../util/logger';

const MODULE = 'signal-gen';

interface SignalContext {
  ticker: string;
  candles: Candle[];
  spreadCents: number;
  tapeMetrics: { recentToBaselineRatio: number };
  config: AppConfig;
}

export class SignalGenerator {
  private lastSignalTime: Map<string, number> = new Map();
  private lastSignalDirection: Map<string, SignalDirection> = new Map();

  evaluate(ctx: SignalContext): Signal | null {
    const { ticker, candles, spreadCents, tapeMetrics, config } = ctx;
    const { strategy, feeModel, execution } = config;

    if (candles.length < strategy.emaSlow + 5) return null;

    const breakoutLookback = Math.floor(strategy.breakoutLookbackMinutes / (strategy.candleIntervalSeconds / 60));
    const indicators = computeIndicators(candles, {
      emaFastPeriod: strategy.emaFast,
      emaSlowPeriod: strategy.emaSlow,
      atrPeriod: strategy.atrPeriod,
      breakoutLookback,
    });

    if (this.isOnCooldown(ticker, strategy.signalCooldownSeconds)) return null;

    const longYes = this.checkLongYes(ticker, indicators, tapeMetrics, spreadCents, config);
    if (longYes) return longYes;

    const longNo = this.checkLongNo(ticker, indicators, tapeMetrics, spreadCents, config);
    if (longNo) return longNo;

    return null;
  }

  private checkLongYes(
    ticker: string,
    ind: IndicatorSet,
    tape: { recentToBaselineRatio: number },
    spreadCents: number,
    config: AppConfig
  ): Signal | null {
    const { strategy, feeModel, execution } = config;
    const n = ind.emaFast.length - 1;
    if (n < 1) return null;

    const close = ind.lastClose;
    const prevRollingHigh = ind.rollingHigh[n - 1];
    const breakoutUp = close > prevRollingHigh + strategy.breakoutBufferCents;
    const emaFastAboveSlow = ind.emaFast[n] > ind.emaSlow[n];
    const slopePositive = ind.emaFastSlope > 0;
    const tapeConfirm = tape.recentToBaselineRatio >= strategy.tapeConfirmMultiplier;
    const atrConfirm = ind.atrRising;

    if (!breakoutUp) return null;
    if (!emaFastAboveSlow || !slopePositive) return null;
    if (!tapeConfirm && !atrConfirm) return null;
    if (spreadCents > config.marketUniverse.maxSpreadCents) return null;

    const stopDistance = ind.currentATR * strategy.atrStopMultiplier;
    const entryPrice = close;
    const stopPrice = Math.max(1, entryPrice - stopDistance);
    const tp1Price = Math.min(99, entryPrice + stopDistance);
    const expectedMove = stopDistance;

    if (
      !passesMinimumMove(
        expectedMove,
        entryPrice,
        spreadCents,
        execution.maxSlippageCents,
        feeModel
      )
    ) {
      return null;
    }

    const feeCost =
      computeFeeCentsPerContract(entryPrice, feeModel) +
      computeFeeCentsPerContract(tp1Price, feeModel);

    this.recordSignal(ticker, 'long_yes');

    return {
      ticker,
      ts: Date.now(),
      direction: 'long_yes',
      reason: 'breakout_up',
      entryPrice,
      stopPrice,
      tp1Price,
      tp2Price: undefined,
      expectedMoveCents: expectedMove,
      feeCostCents: feeCost,
      score: expectedMove - feeCost,
      features: {
        close,
        emaFast: ind.emaFast[n],
        emaSlow: ind.emaSlow[n],
        atr: ind.currentATR,
        emaFastSlope: ind.emaFastSlope,
        tapeRatio: tape.recentToBaselineRatio,
        spread: spreadCents,
      },
    };
  }

  private checkLongNo(
    ticker: string,
    ind: IndicatorSet,
    tape: { recentToBaselineRatio: number },
    spreadCents: number,
    config: AppConfig
  ): Signal | null {
    const { strategy, feeModel, execution } = config;
    const n = ind.emaFast.length - 1;
    if (n < 1) return null;

    const close = ind.lastClose;
    const prevRollingLow = ind.rollingLow[n - 1];
    const breakoutDown = close < prevRollingLow - strategy.breakoutBufferCents;
    const emaFastBelowSlow = ind.emaFast[n] < ind.emaSlow[n];
    const slopeNegative = ind.emaFastSlope < 0;
    const tapeConfirm = tape.recentToBaselineRatio >= strategy.tapeConfirmMultiplier;
    const atrConfirm = ind.atrRising;

    if (!breakoutDown) return null;
    if (!emaFastBelowSlow || !slopeNegative) return null;
    if (!tapeConfirm && !atrConfirm) return null;
    if (spreadCents > config.marketUniverse.maxSpreadCents) return null;

    const stopDistance = ind.currentATR * strategy.atrStopMultiplier;
    const yesEquivEntry = close;
    const entryNoCents = 100 - close;
    const stopPrice = Math.min(99, close + stopDistance);
    const tp1Price = Math.max(1, close - stopDistance);
    const expectedMove = stopDistance;

    if (
      !passesMinimumMove(
        expectedMove,
        entryNoCents,
        spreadCents,
        execution.maxSlippageCents,
        feeModel
      )
    ) {
      return null;
    }

    const feeCost =
      computeFeeCentsPerContract(entryNoCents, feeModel) +
      computeFeeCentsPerContract(100 - tp1Price, feeModel);

    this.recordSignal(ticker, 'long_no');

    return {
      ticker,
      ts: Date.now(),
      direction: 'long_no',
      reason: 'breakout_down',
      entryPrice: close,
      stopPrice,
      tp1Price,
      tp2Price: undefined,
      expectedMoveCents: expectedMove,
      feeCostCents: feeCost,
      score: expectedMove - feeCost,
      features: {
        close,
        emaFast: ind.emaFast[n],
        emaSlow: ind.emaSlow[n],
        atr: ind.currentATR,
        emaFastSlope: ind.emaFastSlope,
        tapeRatio: tape.recentToBaselineRatio,
        spread: spreadCents,
      },
    };
  }

  private isOnCooldown(ticker: string, cooldownSec: number): boolean {
    const last = this.lastSignalTime.get(ticker);
    if (!last) return false;
    return Date.now() - last < cooldownSec * 1000;
  }

  private recordSignal(ticker: string, direction: SignalDirection): void {
    this.lastSignalTime.set(ticker, Date.now());
    this.lastSignalDirection.set(ticker, direction);
  }
}
