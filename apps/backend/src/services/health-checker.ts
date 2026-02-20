import * as fs from 'fs';
import * as path from 'path';
import { HealthStatus, BotState, KILL_SWITCH_FILE } from '@kalshi-bot/shared';
import { KalshiWsClient } from '../ws/kalshi-ws';
import { KalshiRestClient } from '../api/kalshi-rest';
import { logger } from '../util/logger';

const MODULE = 'health';
const DATA_DIR = path.resolve(__dirname, '../../../../data');

export interface HealthCheckConfig {
  wsStaleThresholdMs: number;
  restCheckIntervalMs: number;
  candleStaleThresholdMs: number;
  priceAnomalyThresholdCents: number;
}

const DEFAULT_HEALTH_CONFIG: HealthCheckConfig = {
  wsStaleThresholdMs: 30000,
  restCheckIntervalMs: 30000,
  candleStaleThresholdMs: 180000,
  priceAnomalyThresholdCents: 15,
};

export class HealthChecker {
  private ws: KalshiWsClient;
  private rest: KalshiRestClient;
  private config: HealthCheckConfig;
  private lastRestCheck = 0;
  private restAlive = false;
  private startTime = Date.now();
  private lastPrices: Map<string, number> = new Map();
  private anomalyTickers: Set<string> = new Set();
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(
    ws: KalshiWsClient,
    rest: KalshiRestClient,
    config?: Partial<HealthCheckConfig>
  ) {
    this.ws = ws;
    this.rest = rest;
    this.config = { ...DEFAULT_HEALTH_CONFIG, ...config };
  }

  start(): void {
    if (this.checkInterval) return;
    this.checkInterval = setInterval(() => this.checkRest(), this.config.restCheckIntervalMs);
    this.checkRest();
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  private async checkRest(): Promise<void> {
    try {
      this.restAlive = await this.rest.healthCheck();
      this.lastRestCheck = Date.now();
    } catch {
      this.restAlive = false;
    }
  }

  isWsHealthy(): boolean {
    if (!this.ws.connected) return false;
    const elapsed = Date.now() - this.ws.lastHeartbeatTs;
    return elapsed < this.config.wsStaleThresholdMs;
  }

  isRestHealthy(): boolean {
    return this.restAlive && (Date.now() - this.lastRestCheck) < this.config.restCheckIntervalMs * 3;
  }

  isKillSwitchActive(): boolean {
    const ksPath = path.join(DATA_DIR, KILL_SWITCH_FILE);
    return fs.existsSync(ksPath);
  }

  activateKillSwitch(): void {
    const ksPath = path.join(DATA_DIR, KILL_SWITCH_FILE);
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(ksPath, `Kill switch activated at ${new Date().toISOString()}`);
    logger.warn(MODULE, 'Kill switch activated');
  }

  deactivateKillSwitch(): void {
    const ksPath = path.join(DATA_DIR, KILL_SWITCH_FILE);
    if (fs.existsSync(ksPath)) {
      fs.unlinkSync(ksPath);
      logger.info(MODULE, 'Kill switch deactivated');
    }
  }

  checkPriceAnomaly(ticker: string, price: number): boolean {
    const lastPrice = this.lastPrices.get(ticker);
    this.lastPrices.set(ticker, price);

    if (lastPrice === undefined) return false;

    const jump = Math.abs(price - lastPrice);
    if (jump > this.config.priceAnomalyThresholdCents) {
      this.anomalyTickers.add(ticker);
      logger.warn(MODULE, 'Price anomaly detected', {
        ticker, lastPrice, newPrice: price, jump,
      });
      return true;
    }

    this.anomalyTickers.delete(ticker);
    return false;
  }

  isTickerPaused(ticker: string): boolean {
    return this.anomalyTickers.has(ticker);
  }

  clearAnomaly(ticker: string): void {
    this.anomalyTickers.delete(ticker);
  }

  getStatus(botState: BotState): HealthStatus {
    return {
      wsConnected: this.ws.connected,
      restAlive: this.restAlive,
      lastWsHeartbeat: this.ws.lastHeartbeatTs,
      lastRestCheck: this.lastRestCheck,
      staleDataTickers: Array.from(this.anomalyTickers),
      killSwitchActive: this.isKillSwitchActive(),
      botState,
      uptime: (Date.now() - this.startTime) / 1000,
    };
  }
}
