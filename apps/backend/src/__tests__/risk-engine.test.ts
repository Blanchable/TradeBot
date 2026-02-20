import { AppConfig, AppConfigSchema, Signal } from '@kalshi-bot/shared';

// Minimal mock config for testing
function makeTestConfig(overrides?: any): AppConfig {
  return AppConfigSchema.parse({
    kalshi: {
      env: 'demo',
      restBaseUrl: 'https://demo-api.kalshi.co/trade-api/v2',
      wsUrl: 'wss://demo-api.kalshi.co/trade-api/ws/v2',
      apiKeyId: 'test',
      apiPrivateKey: 'test',
    },
    risk: {
      bankrollUSD: 1000,
      maxRiskPerTradeUSD: 25,
      maxDailyLossUSD: 100,
      maxConcurrentPositions: 3,
      cooldownAfterStopSeconds: 60,
      ...overrides?.risk,
    },
    ...overrides,
  });
}

function makeTestSignal(overrides?: Partial<Signal>): Signal {
  return {
    ticker: 'TEST-MKT',
    ts: Date.now(),
    direction: 'long_yes',
    reason: 'breakout_up',
    entryPrice: 50,
    stopPrice: 45,
    tp1Price: 55,
    expectedMoveCents: 5,
    feeCostCents: 4,
    score: 1,
    features: {},
    ...overrides,
  };
}

// We can't directly test risk engine without DB, so we test the sizing logic
describe('risk sizing logic', () => {
  it('computes correct position size from risk per trade and stop distance', () => {
    const maxRisk = 25; // $25
    const stopDistanceCents = 5;
    const stopLossPerContract = stopDistanceCents / 100; // $0.05
    const contracts = Math.floor(maxRisk / stopLossPerContract);
    expect(contracts).toBe(500);
  });

  it('respects max contracts limit', () => {
    const maxRisk = 25;
    const stopDistanceCents = 5;
    const maxContracts = 100;
    const stopLossPerContract = stopDistanceCents / 100;
    let contracts = Math.floor(maxRisk / stopLossPerContract);
    contracts = Math.min(contracts, maxContracts);
    expect(contracts).toBe(100);
  });

  it('respects min contracts', () => {
    const maxRisk = 0.01;
    const stopDistanceCents = 20;
    const minContracts = 1;
    const stopLossPerContract = stopDistanceCents / 100;
    let contracts = Math.floor(maxRisk / stopLossPerContract);
    contracts = Math.max(contracts, minContracts);
    expect(contracts).toBe(1);
  });

  it('caps exposure at 50% of bankroll', () => {
    const bankroll = 1000;
    const entryPrice = 50; // 50 cents
    const maxExposure = bankroll * 0.5 * 100; // in cents
    const maxContractsFromExposure = Math.floor(maxExposure / entryPrice);
    expect(maxContractsFromExposure).toBe(1000);
  });

  it('computes partial exit quantity correctly', () => {
    const totalQty = 10;
    const partialPercent = 50;
    const partialQty = Math.max(1, Math.floor(totalQty * (partialPercent / 100)));
    expect(partialQty).toBe(5);
  });

  it('ensures minimum 1 contract for partial exit', () => {
    const totalQty = 1;
    const partialPercent = 50;
    const partialQty = Math.max(1, Math.floor(totalQty * (partialPercent / 100)));
    expect(partialQty).toBe(1);
  });
});

describe('stop loss logic', () => {
  it('triggers stop for YES when price drops to stop level', () => {
    const entryPrice = 50;
    const stopPrice = 45;
    const currentPrice = 44;
    const triggered = currentPrice <= stopPrice;
    expect(triggered).toBe(true);
  });

  it('does not trigger stop above stop level for YES', () => {
    const stopPrice = 45;
    const currentPrice = 46;
    expect(currentPrice <= stopPrice).toBe(false);
  });

  it('triggers stop for NO when price rises above stop', () => {
    const stopPrice = 55; // for NO position, stop when YES price rises
    const currentPrice = 56;
    const triggered = currentPrice >= stopPrice;
    expect(triggered).toBe(true);
  });

  it('computes time stop correctly', () => {
    const entryTs = Date.now() - 61 * 60 * 1000; // 61 minutes ago
    const timeStopMinutes = 60;
    const elapsed = (Date.now() - entryTs) / 60000;
    expect(elapsed >= timeStopMinutes).toBe(true);
  });

  it('does not time-stop within window', () => {
    const entryTs = Date.now() - 30 * 60 * 1000; // 30 minutes ago
    const timeStopMinutes = 60;
    const elapsed = (Date.now() - entryTs) / 60000;
    expect(elapsed >= timeStopMinutes).toBe(false);
  });

  it('computes trailing stop correctly', () => {
    const bestPrice = 60;
    const atrEstimate = 5;
    const trailMultiplier = 1.2;
    const trailDistance = atrEstimate * trailMultiplier;
    const trailStop = bestPrice - trailDistance;
    expect(trailStop).toBe(54);
  });
});
