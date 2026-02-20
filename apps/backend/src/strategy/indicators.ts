import { Candle } from '@kalshi-bot/shared';
import * as math from '../util/math';

export interface IndicatorSet {
  emaFast: number[];
  emaSlow: number[];
  atr: number[];
  rollingHigh: number[];
  rollingLow: number[];
  emaFastSlope: number;
  emaSlowSlope: number;
  atrRising: boolean;
  currentATR: number;
  lastClose: number;
}

export function computeIndicators(
  candles: Candle[],
  params: {
    emaFastPeriod: number;
    emaSlowPeriod: number;
    atrPeriod: number;
    breakoutLookback: number;
  }
): IndicatorSet {
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  const emaFast = math.ema(closes, params.emaFastPeriod);
  const emaSlow = math.ema(closes, params.emaSlowPeriod);
  const atrValues = math.atr(highs, lows, closes, params.atrPeriod);
  const rHigh = math.rollingHigh(highs, params.breakoutLookback);
  const rLow = math.rollingLow(lows, params.breakoutLookback);

  const emaFastSlope = math.slope(emaFast, 3);
  const emaSlowSlope = math.slope(emaSlow, 3);

  const currentATR = atrValues.length > 0 ? atrValues[atrValues.length - 1] : 0;
  const prevATR = atrValues.length > 1 ? atrValues[atrValues.length - 2] : 0;
  const atrRising = currentATR > prevATR;

  const lastClose = closes.length > 0 ? closes[closes.length - 1] : 0;

  return {
    emaFast,
    emaSlow,
    atr: atrValues,
    rollingHigh: rHigh,
    rollingLow: rLow,
    emaFastSlope,
    emaSlowSlope,
    atrRising,
    currentATR,
    lastClose,
  };
}
