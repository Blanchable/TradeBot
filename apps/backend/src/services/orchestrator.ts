import EventEmitter from 'eventemitter3';
import * as fs from 'fs';
import * as path from 'path';
import {
  BotState, AppConfig, BOT_STATE_TRANSITIONS, KILL_SWITCH_FILE,
  Signal, Position,
} from '@kalshi-bot/shared';
import { KalshiRestClient } from '../api/kalshi-rest';
import { KalshiWsClient } from '../ws/kalshi-ws';
import { CandleBuilder } from '../data/candle-builder';
import { TradeTape } from '../data/trade-tape';
import { OrderbookSnapshotter } from '../data/orderbook-snapshotter';
import { SignalGenerator } from '../strategy/signal-generator';
import { MarketScannerService } from './market-scanner';
import { RiskEngine } from '../risk/risk-engine';
import { ExecutionEngine } from '../exec/execution-engine';
import { PortfolioManager } from '../portfolio/portfolio-manager';
import { PositionRepo, MarketRepo, DailyPnlRepo, SignalRepo, LogRepo } from '../storage';
import { logger, LogEntry } from '../util/logger';

const MODULE = 'orchestrator';
const DATA_DIR = path.resolve(__dirname, '../../../../data');

export interface OrchestratorEvents {
  stateChange: (state: BotState) => void;
  signal: (signal: Signal) => void;
  positionUpdate: (positions: Position[]) => void;
  error: (error: Error) => void;
}

export class Orchestrator extends EventEmitter<OrchestratorEvents> {
  private state: BotState = 'INIT';
  private config: AppConfig;
  private rest: KalshiRestClient;
  private ws: KalshiWsClient;
  private scanner: MarketScannerService;
  private candleBuilder: CandleBuilder;
  private tradeTape: TradeTape;
  private obSnap: OrderbookSnapshotter;
  private signalGen: SignalGenerator;
  private risk: RiskEngine;
  private exec: ExecutionEngine;
  private portfolio: PortfolioManager;
  private tickInterval: NodeJS.Timeout | null = null;
  private healthInterval: NodeJS.Timeout | null = null;
  private safeMode = false;

  constructor(config: AppConfig) {
    super();
    this.config = config;
    this.rest = new KalshiRestClient(config.kalshi);
    this.ws = new KalshiWsClient(config.kalshi);
    this.scanner = new MarketScannerService(this.rest, config);
    this.candleBuilder = new CandleBuilder(config.strategy);
    this.tradeTape = new TradeTape(config.strategy);
    this.obSnap = new OrderbookSnapshotter(this.rest);
    this.signalGen = new SignalGenerator();
    this.risk = new RiskEngine(config);
    this.exec = new ExecutionEngine(this.rest, this.obSnap, this.risk, config);
    this.portfolio = new PortfolioManager(config.feeModel);

    this.setupLogPersistence();
  }

  getState(): BotState {
    return this.state;
  }

  private setState(newState: BotState): void {
    const allowed = BOT_STATE_TRANSITIONS[this.state];
    if (!allowed || !allowed.includes(newState)) {
      logger.warn(MODULE, `Invalid state transition: ${this.state} -> ${newState}`);
      return;
    }
    logger.info(MODULE, `State: ${this.state} -> ${newState}`);
    this.state = newState;
    this.emit('stateChange', newState);
  }

  async start(): Promise<void> {
    if (this.state !== 'INIT' && this.state !== 'READY' && this.state !== 'ERROR') {
      logger.warn(MODULE, 'Cannot start from state ' + this.state);
      return;
    }

    if (this.state === 'INIT') this.setState('CONNECTING');

    try {
      const healthy = await this.rest.healthCheck();
      if (!healthy) {
        logger.error(MODULE, 'REST health check failed');
        this.setState('ERROR');
        return;
      }

      await this.ws.connect();
      this.setupWsHandlers();

      if (this.state === 'CONNECTING') this.setState('READY');

      this.scanner.start();
      await this.waitForScan();

      this.subscribeToTracked();
      this.startHealthChecks();

      this.setState('TRADING');
      this.startTickLoop();

      logger.info(MODULE, 'Bot started successfully');
    } catch (err: any) {
      logger.error(MODULE, 'Start failed', { error: err.message });
      this.setState('ERROR');
      this.emit('error', err);
    }
  }

  async pause(): Promise<void> {
    if (this.state !== 'TRADING') return;
    this.setState('PAUSED');
    this.stopTickLoop();
    logger.info(MODULE, 'Bot paused - managing exits only');
  }

  async resume(): Promise<void> {
    if (this.state !== 'PAUSED') return;
    this.setState('TRADING');
    this.startTickLoop();
    logger.info(MODULE, 'Bot resumed');
  }

  async stop(): Promise<void> {
    if (this.state === 'INIT' || this.state === 'STOPPING') return;
    this.setState('STOPPING');

    this.stopTickLoop();
    this.stopHealthChecks();
    this.scanner.stop();

    await this.exec.cancelAndReplaceStale();

    this.ws.disconnect();
    this.setState('READY');
    logger.info(MODULE, 'Bot stopped');
  }

  async flatten(): Promise<void> {
    logger.info(MODULE, 'Flatten all requested');
    await this.exec.flattenAll();
  }

  toggleSafeMode(): boolean {
    this.safeMode = !this.safeMode;
    logger.info(MODULE, `Safe mode: ${this.safeMode}`);
    return this.safeMode;
  }

  getPositions(): Position[] {
    return this.portfolio.getAllPositions();
  }

  getConfig(): AppConfig {
    return this.config;
  }

  updateConfig(newConfig: AppConfig): void {
    this.config = newConfig;
    this.risk.updateConfig(newConfig);
    this.exec.updateConfig(newConfig);
  }

  getHealthStatus() {
    return {
      wsConnected: this.ws.connected,
      restAlive: true,
      lastWsHeartbeat: this.ws.lastHeartbeatTs,
      lastRestCheck: Date.now(),
      staleDataTickers: [] as string[],
      killSwitchActive: this.isKillSwitchActive(),
      botState: this.state,
      uptime: process.uptime(),
    };
  }

  private setupWsHandlers(): void {
    this.ws.on('trade', (data) => {
      if (!data.ticker) return;
      this.candleBuilder.onTrade(data.ticker, data.price, data.count, Date.now());
      this.tradeTape.record(data.ticker, data.price, data.count, Date.now(), data.taker_side);
      this.portfolio.updatePrice(data.ticker, data.price);
      this.exec.updateBestPrice(data.ticker, data.price);
    });

    this.ws.on('ticker', (data) => {
      if (!data.ticker) return;
      this.obSnap.updateFromWs(data.ticker, data.yes_bid, data.yes_ask);
      this.portfolio.updatePrice(data.ticker, data.last_price);
    });

    this.ws.on('fill', (data) => {
      if (data.order_id) {
        this.exec.onFill(data.order_id, data.ticker, data.count || 0, data.yes_price || 0);
      }
    });

    this.ws.on('disconnected', () => {
      logger.warn(MODULE, 'WS disconnected');
      if (this.state === 'TRADING') {
        this.setState('PAUSED');
        if (this.config.execution.flattenOnDisconnect) {
          this.flatten().catch((e) => logger.error(MODULE, 'Flatten on disconnect failed', { error: e.message }));
        }
      }
    });

    this.ws.on('connected', () => {
      this.subscribeToTracked();
    });
  }

  private startTickLoop(): void {
    if (this.tickInterval) return;
    this.tickInterval = setInterval(() => this.tick(), 5000);
  }

  private stopTickLoop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  private async tick(): Promise<void> {
    if (this.state !== 'TRADING') return;
    if (this.isKillSwitchActive()) {
      logger.warn(MODULE, 'Kill switch active - pausing');
      this.pause();
      return;
    }

    await this.manageExits();
    await this.exec.cancelAndReplaceStale();

    if (this.risk.shouldFlattenOnDailyLoss()) {
      logger.warn(MODULE, 'Daily loss limit hit - flattening');
      await this.flatten();
      await this.pause();
      return;
    }

    const tickers = this.scanner.getTrackedTickers();
    for (const ticker of tickers) {
      await this.evaluateSignal(ticker);
    }
  }

  private async evaluateSignal(ticker: string): Promise<void> {
    const candles = this.candleBuilder.getRecentCandles(ticker, 100);
    if (candles.length < this.config.strategy.emaSlow + 5) return;

    const ob = this.obSnap.getCached(ticker);
    const spread = ob ? ob.yesAsk - ob.yesBid : 99;
    const tape = this.tradeTape.getMetrics(ticker);

    const signal = this.signalGen.evaluate({
      ticker, candles, spreadCents: spread, tapeMetrics: tape, config: this.config,
    });

    if (!signal) return;

    const market = MarketRepo.getByTicker(ticker);
    const category = market?.category || 'unknown';
    const riskCheck = this.risk.checkEntry(signal, category);

    if (!riskCheck.passed) {
      logger.debug(MODULE, 'Signal blocked by risk', { ticker, reason: riskCheck.reason });
      return;
    }

    const sizing = this.risk.computeSize(signal);
    if (!sizing.approved) {
      logger.debug(MODULE, 'Sizing rejected', { ticker, reason: sizing.reason });
      return;
    }

    let contracts = sizing.contracts;
    if (this.safeMode) {
      contracts = Math.max(1, Math.floor(contracts / 2));
    }

    SignalRepo.insert(signal);
    this.emit('signal', signal);

    await this.exec.executeEntry(signal, contracts);
  }

  private async manageExits(): Promise<void> {
    const positions = this.portfolio.getAllPositions();

    for (const pos of positions) {
      const currentPrice = pos.currentPrice;

      if (pos.side === 'yes' && currentPrice <= pos.stopPrice) {
        logger.info(MODULE, 'Stop loss triggered', { ticker: pos.ticker });
        await this.exec.executeExit(pos, Math.max(1, pos.stopPrice - 1), pos.qty, 'stop_loss');
        this.risk.registerStopHit(pos.ticker);
        this.portfolio.closePosition(pos.ticker, pos.stopPrice, 'stop_loss');
        continue;
      }

      if (pos.side === 'no' && currentPrice >= pos.stopPrice) {
        logger.info(MODULE, 'Stop loss triggered (NO side)', { ticker: pos.ticker });
        await this.exec.executeExit(pos, Math.min(99, pos.stopPrice + 1), pos.qty, 'stop_loss');
        this.risk.registerStopHit(pos.ticker);
        this.portfolio.closePosition(pos.ticker, pos.stopPrice, 'stop_loss');
        continue;
      }

      if (!pos.tp1Hit) {
        if (
          (pos.side === 'yes' && currentPrice >= pos.tp1Price) ||
          (pos.side === 'no' && currentPrice <= pos.tp1Price)
        ) {
          const partialQty = this.risk.computePartialExitQty(pos.qty);
          await this.exec.executeExit(pos, currentPrice, partialQty, 'take_profit_1');
          this.portfolio.closePartial(pos.ticker, partialQty, currentPrice, 'take_profit_1');
          this.portfolio.markTp1Hit(pos.ticker);
          this.portfolio.updateStopPrice(pos.ticker, pos.avgPrice);
        }
      } else {
        const bestPrice = this.exec.getBestPrice(pos.ticker) || currentPrice;
        const newStop = this.risk.computeTrailingStop(pos, bestPrice);
        this.portfolio.updateStopPrice(pos.ticker, newStop);
      }

      if (this.risk.shouldTimeStop(pos, currentPrice)) {
        logger.info(MODULE, 'Time stop triggered', { ticker: pos.ticker });
        await this.exec.executeExit(pos, currentPrice, pos.qty, 'time_stop');
        this.portfolio.closePosition(pos.ticker, currentPrice, 'time_stop');
      }
    }
  }

  private subscribeToTracked(): void {
    const tickers = this.scanner.getTrackedTickers();
    if (tickers.length > 0) {
      this.ws.subscribe(tickers, ['trade', 'ticker', 'orderbook_delta']);
    }
  }

  private async waitForScan(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  private startHealthChecks(): void {
    this.healthInterval = setInterval(() => {
      if (!this.ws.connected && this.state === 'TRADING') {
        logger.warn(MODULE, 'Health: WS disconnected during trading');
      }
    }, 15000);
  }

  private stopHealthChecks(): void {
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
    }
  }

  private isKillSwitchActive(): boolean {
    const ksPath = path.join(DATA_DIR, KILL_SWITCH_FILE);
    return fs.existsSync(ksPath);
  }

  private setupLogPersistence(): void {
    if (this.config.telemetry.persistLogsToDB) {
      logger.onLog((entry: LogEntry) => {
        try {
          LogRepo.insert(entry);
        } catch {
          // DB may not be initialized yet
        }
      });
    }
  }
}
