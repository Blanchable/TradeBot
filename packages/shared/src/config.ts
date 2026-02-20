import { z } from 'zod';

export const KalshiConnectionSchema = z.object({
  env: z.enum(['demo', 'prod']).default('demo'),
  restBaseUrl: z.string().default('https://demo-api.kalshi.co/trade-api/v2'),
  wsUrl: z.string().default('wss://demo-api.kalshi.co/trade-api/ws/v2'),
  apiKeyId: z.string().min(1),
  apiPrivateKey: z.string().min(1),
});

export const MarketUniverseSchema = z.object({
  marketStatusFilter: z.literal('open').default('open'),
  minVolume24h: z.number().min(0).default(100),
  minLiquidity: z.number().min(0).default(500),
  minOpenInterest: z.number().min(0).default(50),
  maxSpreadCents: z.number().min(1).default(8),
  excludeMVE: z.boolean().default(true),
  maxMarketsTracked: z.number().min(1).max(100).default(20),
  scanIntervalSeconds: z.number().min(10).default(60),
  minMinutesToClose: z.number().min(1).default(30),
  hysteresisDropFactor: z.number().min(0).max(1).default(0.7),
});

export const StrategySchema = z.object({
  candleIntervalSeconds: z.number().min(10).default(60),
  breakoutLookbackMinutes: z.number().min(5).default(45),
  emaFast: z.number().min(2).default(9),
  emaSlow: z.number().min(3).default(21),
  atrPeriod: z.number().min(2).default(14),
  atrStopMultiplier: z.number().min(0.5).default(1.5),
  tapeConfirmWindowMinutes: z.number().min(1).default(5),
  tapeConfirmMultiplier: z.number().min(1).default(2.0),
  minExpectedMoveCents: z.number().min(1).default(5),
  signalCooldownSeconds: z.number().min(0).default(120),
  breakoutBufferCents: z.number().min(0).default(1),
});

export const ExecutionSchema = z.object({
  orderTypeEntry: z.literal('limit').default('limit'),
  orderTypeExit: z.enum(['limit', 'market']).default('limit'),
  entryPatienceSeconds: z.number().min(5).default(30),
  cancelReplaceMaxCycles: z.number().min(1).default(3),
  maxSlippageCents: z.number().min(0).default(2),
  rejectOnSpreadWidenCents: z.number().min(1).default(10),
  flattenOnDisconnect: z.boolean().default(true),
  emergencyMarketOrderEnabled: z.boolean().default(false),
});

export const RiskSchema = z.object({
  bankrollUSD: z.number().min(10).default(1000),
  maxRiskPerTradeUSD: z.number().min(1).default(25),
  maxDailyLossUSD: z.number().min(1).default(100),
  maxConcurrentPositions: z.number().min(1).default(5),
  maxExposurePerCategoryUSD: z.number().min(1).default(200),
  cooldownAfterStopSeconds: z.number().min(0).default(300),
  timeStopMinutes: z.number().min(1).default(60),
  minRMultipleForPartial: z.number().min(0.5).default(1.0),
  partialTakePercent: z.number().min(10).max(90).default(50),
  trailStopAtrMultiplier: z.number().min(0.5).default(1.2),
  minContracts: z.number().min(1).default(1),
  maxContracts: z.number().min(1).default(100),
  flattenOnDailyLossHit: z.boolean().default(false),
});

export const FeeModelSchema = z.object({
  feeSchedule: z.enum(['general', 'index_discount']).default('general'),
  feeCoefficient: z.number().min(0).default(0.07),
  feeRoundingRule: z.literal('ceil').default('ceil'),
  includeFeeInMinimumMove: z.boolean().default(true),
});

export const TelemetrySchema = z.object({
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  persistLogsToDB: z.boolean().default(true),
  exportDailyCSV: z.boolean().default(true),
});

export const AppConfigSchema = z.object({
  kalshi: KalshiConnectionSchema,
  marketUniverse: MarketUniverseSchema,
  strategy: StrategySchema,
  execution: ExecutionSchema,
  risk: RiskSchema,
  feeModel: FeeModelSchema,
  telemetry: TelemetrySchema,
});

export type KalshiConnection = z.infer<typeof KalshiConnectionSchema>;
export type MarketUniverse = z.infer<typeof MarketUniverseSchema>;
export type StrategyConfig = z.infer<typeof StrategySchema>;
export type ExecutionConfig = z.infer<typeof ExecutionSchema>;
export type RiskConfig = z.infer<typeof RiskSchema>;
export type FeeModelConfig = z.infer<typeof FeeModelSchema>;
export type TelemetryConfig = z.infer<typeof TelemetrySchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;

export function getDefaultConfig(): AppConfig {
  return AppConfigSchema.parse({
    kalshi: {
      env: 'demo',
      restBaseUrl: 'https://demo-api.kalshi.co/trade-api/v2',
      wsUrl: 'wss://demo-api.kalshi.co/trade-api/ws/v2',
      apiKeyId: '',
      apiPrivateKey: '',
    },
    marketUniverse: {},
    strategy: {},
    execution: {},
    risk: {},
    feeModel: {},
    telemetry: {},
  });
}
