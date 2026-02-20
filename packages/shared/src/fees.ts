import { FeeModelConfig } from './config';

/**
 * Kalshi fee formula (general): fee_per_contract = ceil(coefficient * price * (1 - price/100)) cents
 * Price in cents 1-99.
 */
export function computeFeeCentsPerContract(
  priceCents: number,
  config: FeeModelConfig
): number {
  const p = Math.max(1, Math.min(99, priceCents));
  const raw = config.feeCoefficient * p * (1 - p / 100);
  return Math.ceil(raw);
}

export function computeRoundTripFeeCents(
  entryPriceCents: number,
  exitPriceCents: number,
  qty: number,
  config: FeeModelConfig
): number {
  const entryFee = computeFeeCentsPerContract(entryPriceCents, config) * qty;
  const exitFee = computeFeeCentsPerContract(exitPriceCents, config) * qty;
  return entryFee + exitFee;
}

export function minimumMoveCents(
  entryPriceCents: number,
  spreadCents: number,
  slippageCents: number,
  config: FeeModelConfig
): number {
  const entryFee = computeFeeCentsPerContract(entryPriceCents, config);
  const exitEstimateFee = computeFeeCentsPerContract(entryPriceCents, config);
  const totalFeeDrag = entryFee + exitEstimateFee;
  return totalFeeDrag + spreadCents + slippageCents;
}

export function passesMinimumMove(
  expectedMoveCents: number,
  entryPriceCents: number,
  spreadCents: number,
  slippageCents: number,
  config: FeeModelConfig
): boolean {
  if (!config.includeFeeInMinimumMove) return expectedMoveCents > 0;
  return expectedMoveCents >= minimumMoveCents(entryPriceCents, spreadCents, slippageCents, config);
}
