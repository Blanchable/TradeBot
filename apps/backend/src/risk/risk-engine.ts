import {
  AppConfig, RiskConfig, FeeModelConfig, Signal, Position,
  DailyPnl, computeFeeCentsPerContract,
} from '@kalshi-bot/shared';
import { PositionRepo, DailyPnlRepo } from '../storage';
import { logger } from '../util/logger';

const MODULE = 'risk';

export interface SizingResult {
  approved: boolean;
  contracts: number;
  reason?: string;
}

export interface RiskCheckResult {
  passed: boolean;
  reason?: string;
}

export class RiskEngine {
  private config: RiskConfig;
  private feeConfig: FeeModelConfig;
  private cooldowns: Map<string, number> = new Map();
  private categoryExposure: Map<string, number> = new Map();

  constructor(config: AppConfig) {
    this.config = config.risk;
    this.feeConfig = config.feeModel;
  }

  updateConfig(config: AppConfig): void {
    this.config = config.risk;
    this.feeConfig = config.feeModel;
  }

  checkEntry(signal: Signal, marketCategory: string): RiskCheckResult {
    const positions = PositionRepo.getAll();

    if (positions.length >= this.config.maxConcurrentPositions) {
      return { passed: false, reason: 'Max concurrent positions reached' };
    }

    const existingPos = PositionRepo.getByTicker(signal.ticker);
    if (existingPos) {
      return { passed: false, reason: 'Already have position in this ticker' };
    }

    const cooldownUntil = this.cooldowns.get(signal.ticker) || 0;
    if (Date.now() < cooldownUntil) {
      return { passed: false, reason: 'Ticker on cooldown after stop' };
    }

    const dailyPnl = DailyPnlRepo.getToday();
    if (dailyPnl && dailyPnl.net <= -this.config.maxDailyLossUSD * 100) {
      return { passed: false, reason: 'Daily loss limit reached' };
    }

    const catExposure = this.categoryExposure.get(marketCategory) || 0;
    if (catExposure >= this.config.maxExposurePerCategoryUSD * 100) {
      return { passed: false, reason: 'Category exposure limit reached' };
    }

    return { passed: true };
  }

  computeSize(signal: Signal): SizingResult {
    const stopDistanceCents = Math.abs(signal.entryPrice - signal.stopPrice);
    if (stopDistanceCents <= 0) {
      return { approved: false, contracts: 0, reason: 'Invalid stop distance' };
    }

    const stopLossDollarsPerContract = stopDistanceCents / 100;
    const maxRiskDollars = this.config.maxRiskPerTradeUSD;
    let contracts = Math.floor(maxRiskDollars / stopLossDollarsPerContract);

    contracts = Math.max(this.config.minContracts, contracts);
    contracts = Math.min(this.config.maxContracts, contracts);

    const totalExposureCents = signal.entryPrice * contracts;
    if (totalExposureCents / 100 > this.config.bankrollUSD * 0.5) {
      contracts = Math.floor((this.config.bankrollUSD * 0.5 * 100) / signal.entryPrice);
    }

    if (contracts < this.config.minContracts) {
      return { approved: false, contracts: 0, reason: 'Size too small after limits' };
    }

    return { approved: true, contracts };
  }

  computePartialExitQty(totalQty: number): number {
    return Math.max(1, Math.floor(totalQty * (this.config.partialTakePercent / 100)));
  }

  shouldTimeStop(position: Position, currentPrice: number): boolean {
    const elapsed = (Date.now() - position.entryTs) / 60000;
    if (elapsed < this.config.timeStopMinutes) return false;

    const stopDist = Math.abs(position.avgPrice - position.stopPrice);
    const minRequired = stopDist * 0.3;
    const pnlPerContract =
      position.side === 'yes'
        ? currentPrice - position.avgPrice
        : position.avgPrice - currentPrice;

    return pnlPerContract < minRequired;
  }

  computeTrailingStop(position: Position, bestPrice: number): number {
    const atrEstimate = Math.abs(position.tp1Price - position.avgPrice);
    const trailDistance = atrEstimate * this.config.trailStopAtrMultiplier;

    if (position.side === 'yes') {
      return Math.max(position.stopPrice, bestPrice - trailDistance);
    } else {
      return Math.min(position.stopPrice, bestPrice + trailDistance);
    }
  }

  registerStopHit(ticker: string): void {
    this.cooldowns.set(ticker, Date.now() + this.config.cooldownAfterStopSeconds * 1000);
    logger.info(MODULE, 'Cooldown set after stop', {
      ticker,
      cooldownSeconds: this.config.cooldownAfterStopSeconds,
    });
  }

  updateCategoryExposure(positions: Position[], categoryMap: Map<string, string>): void {
    this.categoryExposure.clear();
    for (const pos of positions) {
      const cat = categoryMap.get(pos.ticker) || 'unknown';
      const exposure = pos.qty * pos.avgPrice;
      this.categoryExposure.set(cat, (this.categoryExposure.get(cat) || 0) + exposure);
    }
  }

  isDailyLossLimitHit(): boolean {
    const daily = DailyPnlRepo.getToday();
    if (!daily) return false;
    return daily.net <= -this.config.maxDailyLossUSD * 100;
  }

  shouldFlattenOnDailyLoss(): boolean {
    return this.config.flattenOnDailyLossHit && this.isDailyLossLimitHit();
  }
}
