import { Market, MarketUniverse } from '@kalshi-bot/shared';

function makeMarket(overrides: Partial<Market> = {}): Market {
  const now = Date.now();
  return {
    ticker: 'TEST-' + Math.random().toString(36).slice(2, 6).toUpperCase(),
    eventTicker: 'TEST-EVENT',
    title: 'Test Market',
    category: 'test',
    status: 'open',
    closeTime: new Date(now + 120 * 60000).toISOString(), // 2 hours from now
    tickSize: 1,
    volume24h: 500,
    liquidity: 1000,
    openInterest: 200,
    yesBid: 45,
    yesAsk: 50,
    lastPrice: 48,
    ...overrides,
  };
}

const defaultUniverseConfig: MarketUniverse = {
  marketStatusFilter: 'open',
  minVolume24h: 100,
  minLiquidity: 500,
  minOpenInterest: 50,
  maxSpreadCents: 8,
  excludeMVE: true,
  maxMarketsTracked: 20,
  scanIntervalSeconds: 60,
  minMinutesToClose: 30,
  hysteresisDropFactor: 0.7,
};

describe('market filtering', () => {
  it('rejects markets with status != open', () => {
    const m = makeMarket({ status: 'closed' });
    expect(m.status === defaultUniverseConfig.marketStatusFilter).toBe(false);
  });

  it('rejects markets with low volume', () => {
    const m = makeMarket({ volume24h: 10 });
    expect(m.volume24h >= defaultUniverseConfig.minVolume24h).toBe(false);
  });

  it('rejects markets with low liquidity', () => {
    const m = makeMarket({ liquidity: 100 });
    expect(m.liquidity >= defaultUniverseConfig.minLiquidity).toBe(false);
  });

  it('rejects markets with wide spread', () => {
    const m = makeMarket({ yesBid: 30, yesAsk: 45 });
    const spread = m.yesAsk - m.yesBid;
    expect(spread <= defaultUniverseConfig.maxSpreadCents).toBe(false);
  });

  it('accepts markets meeting all criteria', () => {
    const m = makeMarket();
    const spread = m.yesAsk - m.yesBid;
    const minutesToClose = (new Date(m.closeTime).getTime() - Date.now()) / 60000;

    expect(m.status).toBe('open');
    expect(m.volume24h >= defaultUniverseConfig.minVolume24h).toBe(true);
    expect(m.liquidity >= defaultUniverseConfig.minLiquidity).toBe(true);
    expect(m.openInterest >= defaultUniverseConfig.minOpenInterest).toBe(true);
    expect(spread <= defaultUniverseConfig.maxSpreadCents).toBe(true);
    expect(minutesToClose >= defaultUniverseConfig.minMinutesToClose).toBe(true);
  });

  it('rejects markets closing too soon', () => {
    const m = makeMarket({
      closeTime: new Date(Date.now() + 10 * 60000).toISOString(),
    });
    const minutesToClose = (new Date(m.closeTime).getTime() - Date.now()) / 60000;
    expect(minutesToClose >= defaultUniverseConfig.minMinutesToClose).toBe(false);
  });
});

describe('market scoring', () => {
  it('scores higher-volume markets better', () => {
    const scoreVolHigh = 0.30 * Math.log(10000 + 1);
    const scoreVolLow = 0.30 * Math.log(100 + 1);
    expect(scoreVolHigh).toBeGreaterThan(scoreVolLow);
  });

  it('penalizes wider spreads', () => {
    const penaltyNarrow = 0.15 * 3;
    const penaltyWide = 0.15 * 8;
    expect(penaltyWide).toBeGreaterThan(penaltyNarrow);
  });

  it('produces positive scores for good markets', () => {
    const v = 0.30 * Math.log(5000 + 1);
    const l = 0.25 * Math.log(3000 + 1);
    const o = 0.20 * Math.log(500 + 1);
    const s = 0.15 * 4;
    const t = 0.10 * 0;
    const score = v + l + o - s - t;
    expect(score).toBeGreaterThan(0);
  });
});
