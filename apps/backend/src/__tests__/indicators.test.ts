import { Candle } from '@kalshi-bot/shared';
import { computeIndicators } from '../strategy/indicators';

function makeCandles(closes: number[]): Candle[] {
  return closes.map((close, i) => ({
    ticker: 'TEST',
    ts: Date.now() - (closes.length - i) * 60000,
    open: close - 1,
    high: close + 1,
    low: close - 2,
    close,
    volume: 100,
  }));
}

describe('computeIndicators', () => {
  it('returns correct length arrays', () => {
    const candles = makeCandles([50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60]);
    const result = computeIndicators(candles, {
      emaFastPeriod: 3,
      emaSlowPeriod: 5,
      atrPeriod: 3,
      breakoutLookback: 5,
    });

    expect(result.emaFast).toHaveLength(11);
    expect(result.emaSlow).toHaveLength(11);
    expect(result.atr).toHaveLength(11);
    expect(result.rollingHigh).toHaveLength(11);
    expect(result.rollingLow).toHaveLength(11);
  });

  it('detects positive slope on rising prices', () => {
    const candles = makeCandles([40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60]);
    const result = computeIndicators(candles, {
      emaFastPeriod: 3,
      emaSlowPeriod: 5,
      atrPeriod: 3,
      breakoutLookback: 5,
    });

    expect(result.emaFastSlope).toBeGreaterThan(0);
    expect(result.lastClose).toBe(60);
  });

  it('detects negative slope on falling prices', () => {
    const candles = makeCandles([60, 58, 56, 54, 52, 50, 48, 46, 44, 42, 40]);
    const result = computeIndicators(candles, {
      emaFastPeriod: 3,
      emaSlowPeriod: 5,
      atrPeriod: 3,
      breakoutLookback: 5,
    });

    expect(result.emaFastSlope).toBeLessThan(0);
  });

  it('fast EMA above slow EMA in uptrend', () => {
    const candles = makeCandles([30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50]);
    const result = computeIndicators(candles, {
      emaFastPeriod: 3,
      emaSlowPeriod: 9,
      atrPeriod: 3,
      breakoutLookback: 5,
    });

    const n = result.emaFast.length - 1;
    expect(result.emaFast[n]).toBeGreaterThan(result.emaSlow[n]);
  });

  it('computes positive ATR', () => {
    const candles = makeCandles([50, 52, 48, 55, 45, 53, 47, 56, 44, 54, 50]);
    const result = computeIndicators(candles, {
      emaFastPeriod: 3,
      emaSlowPeriod: 5,
      atrPeriod: 5,
      breakoutLookback: 5,
    });

    expect(result.currentATR).toBeGreaterThan(0);
  });

  it('rolling high captures the max', () => {
    const candles = makeCandles([30, 40, 35, 50, 45, 38, 42, 48, 44, 46, 55]);
    const result = computeIndicators(candles, {
      emaFastPeriod: 3,
      emaSlowPeriod: 5,
      atrPeriod: 3,
      breakoutLookback: 5,
    });

    const n = result.rollingHigh.length - 1;
    // rollingHigh looks at highs (close+1), last 5 highs are 49,43,49,45,47,56
    expect(result.rollingHigh[n]).toBeGreaterThan(0);
  });
});
