import { ema, atr, rollingHigh, rollingLow, slope, median, clamp } from '../util/math';

describe('ema', () => {
  it('returns first value as initial EMA', () => {
    const result = ema([10, 12, 14], 3);
    expect(result[0]).toBe(10);
  });

  it('produces correct length output', () => {
    const result = ema([10, 11, 12, 13, 14], 3);
    expect(result).toHaveLength(5);
  });

  it('tracks upward trend', () => {
    const result = ema([10, 20, 30, 40, 50], 3);
    for (let i = 1; i < result.length; i++) {
      expect(result[i]).toBeGreaterThan(result[i - 1]);
    }
  });

  it('handles empty input', () => {
    expect(ema([], 3)).toHaveLength(0);
  });
});

describe('atr', () => {
  it('computes ATR for simple data', () => {
    const highs = [12, 14, 13, 15, 16];
    const lows = [10, 11, 10, 12, 13];
    const closes = [11, 13, 12, 14, 15];
    const result = atr(highs, lows, closes, 3);

    expect(result).toHaveLength(5);
    expect(result[0]).toBe(2); // first TR: 12-10 = 2
    result.forEach((v) => expect(v).toBeGreaterThan(0));
  });

  it('handles single candle', () => {
    const result = atr([15], [10], [12], 14);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(5);
  });
});

describe('rollingHigh', () => {
  it('computes rolling maximum', () => {
    const result = rollingHigh([3, 5, 2, 8, 1], 3);
    expect(result[0]).toBe(3);
    expect(result[1]).toBe(5);
    expect(result[2]).toBe(5);
    expect(result[3]).toBe(8);
    expect(result[4]).toBe(8);
  });
});

describe('rollingLow', () => {
  it('computes rolling minimum', () => {
    const result = rollingLow([3, 5, 2, 8, 1], 3);
    expect(result[0]).toBe(3);
    expect(result[1]).toBe(3);
    expect(result[2]).toBe(2);
    expect(result[3]).toBe(2);
    expect(result[4]).toBe(1);
  });
});

describe('slope', () => {
  it('returns positive slope for rising values', () => {
    expect(slope([10, 12, 14, 16], 3)).toBe(4);
  });

  it('returns negative slope for falling values', () => {
    expect(slope([16, 14, 12, 10], 3)).toBe(-4);
  });

  it('returns 0 for single value', () => {
    expect(slope([5], 3)).toBe(0);
  });
});

describe('median', () => {
  it('computes median of odd count', () => {
    expect(median([3, 1, 5])).toBe(3);
  });

  it('computes median of even count', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('returns 0 for empty', () => {
    expect(median([])).toBe(0);
  });
});

describe('clamp', () => {
  it('clamps below minimum', () => {
    expect(clamp(-5, 0, 100)).toBe(0);
  });

  it('clamps above maximum', () => {
    expect(clamp(150, 0, 100)).toBe(100);
  });

  it('passes through valid values', () => {
    expect(clamp(50, 0, 100)).toBe(50);
  });
});
