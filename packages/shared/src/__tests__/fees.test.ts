import {
  computeFeeCentsPerContract,
  computeRoundTripFeeCents,
  minimumMoveCents,
  passesMinimumMove,
} from '../fees';
import { FeeModelConfig } from '../config';

const generalFee: FeeModelConfig = {
  feeSchedule: 'general',
  feeCoefficient: 0.07,
  feeRoundingRule: 'ceil',
  includeFeeInMinimumMove: true,
};

const indexFee: FeeModelConfig = {
  feeSchedule: 'index_discount',
  feeCoefficient: 0.035,
  feeRoundingRule: 'ceil',
  includeFeeInMinimumMove: true,
};

describe('computeFeeCentsPerContract', () => {
  it('computes fee at 50 cents (maximum fee point)', () => {
    // 0.07 * 50 * (1 - 50/100) = 0.07 * 50 * 0.5 = 1.75 -> ceil = 2
    expect(computeFeeCentsPerContract(50, generalFee)).toBe(2);
  });

  it('computes fee at low prices', () => {
    // 0.07 * 10 * (1 - 10/100) = 0.07 * 10 * 0.9 = 0.63 -> ceil = 1
    expect(computeFeeCentsPerContract(10, generalFee)).toBe(1);
  });

  it('computes fee at high prices', () => {
    // 0.07 * 90 * (1 - 90/100) = 0.07 * 90 * 0.1 = 0.63 -> ceil = 1
    expect(computeFeeCentsPerContract(90, generalFee)).toBe(1);
  });

  it('handles boundary at 1 cent', () => {
    // 0.07 * 1 * (1 - 1/100) = 0.07 * 0.99 = 0.0693 -> ceil = 1
    expect(computeFeeCentsPerContract(1, generalFee)).toBe(1);
  });

  it('handles boundary at 99 cents', () => {
    // 0.07 * 99 * (1 - 99/100) = 0.07 * 99 * 0.01 = 0.0693 -> ceil = 1
    expect(computeFeeCentsPerContract(99, generalFee)).toBe(1);
  });

  it('uses index discount coefficient', () => {
    // 0.035 * 50 * 0.5 = 0.875 -> ceil = 1
    expect(computeFeeCentsPerContract(50, indexFee)).toBe(1);
  });

  it('clamps price below 1 to 1', () => {
    expect(computeFeeCentsPerContract(0, generalFee)).toBe(1);
  });

  it('clamps price above 99 to 99', () => {
    expect(computeFeeCentsPerContract(100, generalFee)).toBe(1);
  });
});

describe('computeRoundTripFeeCents', () => {
  it('computes total fees for entry and exit', () => {
    const fee = computeRoundTripFeeCents(40, 55, 10, generalFee);
    const entry = computeFeeCentsPerContract(40, generalFee) * 10;
    const exit = computeFeeCentsPerContract(55, generalFee) * 10;
    expect(fee).toBe(entry + exit);
  });

  it('handles single contract', () => {
    const fee = computeRoundTripFeeCents(50, 60, 1, generalFee);
    expect(fee).toBeGreaterThan(0);
  });
});

describe('minimumMoveCents', () => {
  it('includes fees, spread, and slippage', () => {
    const move = minimumMoveCents(50, 3, 2, generalFee);
    // 2 (entry fee) + 2 (exit fee est) + 3 (spread) + 2 (slippage) = 9
    expect(move).toBe(2 + 2 + 3 + 2);
  });

  it('returns higher value for wider spreads', () => {
    const narrow = minimumMoveCents(50, 2, 1, generalFee);
    const wide = minimumMoveCents(50, 8, 1, generalFee);
    expect(wide).toBeGreaterThan(narrow);
  });
});

describe('passesMinimumMove', () => {
  it('returns true when expected move exceeds minimum', () => {
    expect(passesMinimumMove(15, 50, 2, 1, generalFee)).toBe(true);
  });

  it('returns false when expected move is too small', () => {
    expect(passesMinimumMove(2, 50, 5, 2, generalFee)).toBe(false);
  });

  it('ignores fee check when config says so', () => {
    const noFeeCheck: FeeModelConfig = { ...generalFee, includeFeeInMinimumMove: false };
    expect(passesMinimumMove(1, 50, 10, 5, noFeeCheck)).toBe(true);
  });
});
