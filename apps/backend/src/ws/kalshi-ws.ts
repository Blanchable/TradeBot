import WebSocket from 'ws';
import * as crypto from 'crypto';
import EventEmitter from 'eventemitter3';
import { KalshiConnection } from '@kalshi-bot/shared';
import { logger } from '../util/logger';

const MODULE = 'kalshi-ws';

export interface WsEvents {
  connected: () => void;
  disconnected: (code: number, reason: string) => void;
  error: (err: Error) => void;
  trade: (data: { ticker: string; price: number; count: number; ts: string; taker_side: string }) => void;
  orderbook: (data: { ticker: string; yes: number[][]; no: number[][] }) => void;
  ticker: (data: { ticker: string; yes_bid: number; yes_ask: number; last_price: number; volume: number }) => void;
  fill: (data: any) => void;
  orderUpdate: (data: any) => void;
  heartbeat: () => void;
}

export class KalshiWsClient extends EventEmitter<WsEvents> {
  private ws: WebSocket | null = null;
  private config: KalshiConnection;
  private reconnectAttempts = 0;
  private maxReconnect = 10;
  private reconnectDelay = 2000;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lastHeartbeat = 0;
  private subscriptions: Set<string> = new Set();
  private channels: Set<string> = new Set();
  private _connected = false;

  constructor(config: KalshiConnection) {
    super();
    this.config = config;
  }

  get connected(): boolean {
    return this._connected;
  }

  get lastHeartbeatTs(): number {
    return this.lastHeartbeat;
  }

  private loadPrivateKey(): crypto.KeyObject {
    const trimmed = this.config.apiPrivateKey.trim();
    if (trimmed.includes('-----BEGIN')) {
      return crypto.createPrivateKey(trimmed);
    }
    const derBuffer = Buffer.from(trimmed, 'base64');
    try {
      return crypto.createPrivateKey({ key: derBuffer, format: 'der', type: 'pkcs8' });
    } catch { /* wrap as PEM */ }
    const chunked = trimmed.replace(/(.{64})/g, '$1\n').trim();
    return crypto.createPrivateKey(`-----BEGIN PRIVATE KEY-----\n${chunked}\n-----END PRIVATE KEY-----`);
  }

  async connect(): Promise<void> {
    if (this.ws) this.disconnect();

    const timestampMs = Date.now();
    const wsPath = '/trade-api/ws/v2';
    const message = `${timestampMs}GET${wsPath}`;
    const messageBuffer = Buffer.from(message, 'utf-8');

    const keyObj = this.loadPrivateKey();
    const signature = crypto.sign('sha256', messageBuffer, {
      key: keyObj,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
    }).toString('base64');

    const url = this.config.wsUrl;
    const headers: Record<string, string> = {
      'KALSHI-ACCESS-KEY': this.config.apiKeyId,
      'KALSHI-ACCESS-SIGNATURE': signature,
      'KALSHI-ACCESS-TIMESTAMP': String(timestampMs),
    };

    this.ws = new WebSocket(url, { headers });

    this.ws.on('open', () => {
      this._connected = true;
      this.reconnectAttempts = 0;
      this.lastHeartbeat = Date.now();
      logger.info(MODULE, 'WebSocket connected');
      this.emit('connected');
      this.startHeartbeatMonitor();
      this.resubscribeAll();
    });

    this.ws.on('message', (raw: WebSocket.Data) => {
      try {
        const msg = JSON.parse(raw.toString());
        this.handleMessage(msg);
      } catch (err: any) {
        logger.warn(MODULE, 'Failed to parse WS message', { error: err.message });
      }
    });

    this.ws.on('close', (code, reason) => {
      this._connected = false;
      this.stopHeartbeatMonitor();
      logger.warn(MODULE, 'WebSocket disconnected', { code, reason: reason.toString() });
      this.emit('disconnected', code, reason.toString());
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      logger.error(MODULE, 'WebSocket error', { error: err.message });
      this.emit('error', err);
    });
  }

  disconnect(): void {
    this.stopHeartbeatMonitor();
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
  }

  subscribe(tickers: string[], channels: string[] = ['trade', 'ticker', 'orderbook_delta']): void {
    for (const ch of channels) this.channels.add(ch);
    for (const t of tickers) this.subscriptions.add(t);

    if (!this._connected || !this.ws) return;

    const cmd = {
      id: Date.now(),
      cmd: 'subscribe',
      params: {
        channels,
        market_tickers: tickers,
      },
    };
    this.ws.send(JSON.stringify(cmd));
    logger.debug(MODULE, 'Subscribed', { tickers, channels });
  }

  unsubscribe(tickers: string[]): void {
    for (const t of tickers) this.subscriptions.delete(t);
    if (!this._connected || !this.ws) return;

    const cmd = {
      id: Date.now(),
      cmd: 'unsubscribe',
      params: {
        channels: Array.from(this.channels),
        market_tickers: tickers,
      },
    };
    this.ws.send(JSON.stringify(cmd));
  }

  private handleMessage(msg: any): void {
    this.lastHeartbeat = Date.now();

    if (msg.type === 'heartbeat' || msg.id !== undefined) {
      this.emit('heartbeat');
      return;
    }

    const type = msg.type || msg.channel;
    const data = msg.msg || msg.data || msg;

    switch (type) {
      case 'trade':
        this.emit('trade', data);
        break;
      case 'orderbook_snapshot':
      case 'orderbook_delta':
        this.emit('orderbook', data);
        break;
      case 'ticker':
        this.emit('ticker', data);
        break;
      case 'fill':
        this.emit('fill', data);
        break;
      case 'order':
      case 'order_update':
        this.emit('orderUpdate', data);
        break;
    }
  }

  private resubscribeAll(): void {
    if (this.subscriptions.size === 0) return;
    this.subscribe(Array.from(this.subscriptions), Array.from(this.channels));
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnect) {
      logger.error(MODULE, 'Max reconnect attempts reached');
      return;
    }
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);
    logger.info(MODULE, `Reconnecting in ${delay}ms`, { attempt: this.reconnectAttempts });
    setTimeout(() => this.connect(), delay);
  }

  private startHeartbeatMonitor(): void {
    this.heartbeatTimer = setInterval(() => {
      const elapsed = Date.now() - this.lastHeartbeat;
      if (elapsed > 30000) {
        logger.warn(MODULE, 'Heartbeat stale, reconnecting');
        this.disconnect();
        this.connect();
      }
    }, 10000);
  }

  private stopHeartbeatMonitor(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
