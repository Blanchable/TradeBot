/**
 * Exponential Moving Average computed over a series of values.
 * Returns the EMA for each element (same length as input).
 */
export function ema(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const result: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    result.push(values[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

/**
 * Average True Range over candle data.
 * Returns an ATR value for each candle (first `period` values are approximations).
 */
export function atr(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number
): number[] {
  if (highs.length === 0) return [];

  const trs: number[] = [highs[0] - lows[0]];
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trs.push(tr);
  }

  const result: number[] = [];
  let sum = 0;
  for (let i = 0; i < trs.length; i++) {
    if (i < period) {
      sum += trs[i];
      result.push(sum / (i + 1));
    } else {
      const prev = result[i - 1];
      result.push((prev * (period - 1) + trs[i]) / period);
    }
  }
  return result;
}

export function rollingHigh(values: number[], lookback: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - lookback + 1);
    let max = values[start];
    for (let j = start + 1; j <= i; j++) {
      if (values[j] > max) max = values[j];
    }
    result.push(max);
  }
  return result;
}

export function rollingLow(values: number[], lookback: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - lookback + 1);
    let min = values[start];
    for (let j = start + 1; j <= i; j++) {
      if (values[j] < min) min = values[j];
    }
    result.push(min);
  }
  return result;
}

export function slope(values: number[], lookback: number = 3): number {
  if (values.length < 2) return 0;
  const n = Math.min(lookback, values.length);
  const recent = values.slice(-n);
  const first = recent[0];
  const last = recent[recent.length - 1];
  return last - first;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
