import * as crypto from 'crypto';
import { KalshiConnection, Market, OrderSide, OrderAction, Candle } from '@kalshi-bot/shared';
import { logger } from '../util/logger';

const MODULE = 'kalshi-rest';

interface KalshiMarketResponse {
  ticker: string;
  event_ticker: string;
  title: string;
  category: string;
  status: string;
  close_time: string;
  yes_bid: number;
  yes_ask: number;
  last_price: number;
  volume: number;
  volume_24h: number;
  liquidity: number;
  open_interest: number;
  tick_size?: number;
  [key: string]: unknown;
}

interface KalshiOrderResponse {
  order_id: string;
  ticker: string;
  side: string;
  action: string;
  type: string;
  yes_price: number;
  no_price: number;
  count: number;
  remaining_count: number;
  status: string;
  created_time: string;
  [key: string]: unknown;
}

export class KalshiRestClient {
  private baseUrl: string;
  private apiKeyId: string;
  private privateKey: string;
  private token: string | null = null;

  constructor(config: KalshiConnection) {
    this.baseUrl = config.restBaseUrl;
    this.apiKeyId = config.apiKeyId;
    this.privateKey = config.apiPrivateKey;
  }

  private async signRequest(
    method: string,
    path: string,
    timestamp: number
  ): Promise<string> {
    const message = `${timestamp}${method}${path}`;
    try {
      const key = crypto.createPrivateKey({
        key: Buffer.from(this.privateKey, 'base64'),
        format: 'der',
        type: 'pkcs8',
      });
      const signature = crypto.sign(null, Buffer.from(message), key);
      return signature.toString('base64');
    } catch {
      const hmac = crypto.createHmac('sha256', this.privateKey);
      hmac.update(message);
      return hmac.digest('base64');
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    retries = 2
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await this.signRequest(method, path, timestamp);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'KALSHI-ACCESS-KEY': this.apiKeyId,
      'KALSHI-ACCESS-SIGNATURE': signature,
      'KALSHI-ACCESS-TIMESTAMP': String(timestamp),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const resp = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!resp.ok) {
        const errText = await resp.text();
        if (resp.status === 429 && retries > 0) {
          logger.warn(MODULE, 'Rate limited, backing off', { path, retries });
          await new Promise((r) => setTimeout(r, 2000));
          return this.request<T>(method, path, body, retries - 1);
        }
        throw new Error(`Kalshi API ${resp.status}: ${errText}`);
      }

      return (await resp.json()) as T;
    } catch (err: any) {
      if (retries > 0 && err.code === 'ECONNRESET') {
        await new Promise((r) => setTimeout(r, 1000));
        return this.request<T>(method, path, body, retries - 1);
      }
      throw err;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.request<any>('GET', '/exchange/status');
      return true;
    } catch {
      return false;
    }
  }

  async getMarkets(
    params: {
      limit?: number;
      cursor?: string;
      status?: string;
      event_ticker?: string;
    } = {}
  ): Promise<{ markets: Market[]; cursor: string }> {
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.cursor) qs.set('cursor', params.cursor);
    if (params.status) qs.set('status', params.status);
    if (params.event_ticker) qs.set('event_ticker', params.event_ticker);

    const path = `/markets?${qs.toString()}`;
    const data = await this.request<{ markets: KalshiMarketResponse[]; cursor: string }>(
      'GET',
      path
    );

    const markets: Market[] = (data.markets || []).map((m) => ({
      ticker: m.ticker,
      eventTicker: m.event_ticker,
      title: m.title,
      category: m.category || '',
      status: m.status,
      closeTime: m.close_time,
      tickSize: m.tick_size || 1,
      volume24h: m.volume_24h || 0,
      liquidity: m.liquidity || 0,
      openInterest: m.open_interest || 0,
      yesBid: m.yes_bid || 0,
      yesAsk: m.yes_ask || 0,
      lastPrice: m.last_price || 0,
    }));

    return { markets, cursor: data.cursor || '' };
  }

  async getMarket(ticker: string): Promise<Market | null> {
    try {
      const data = await this.request<{ market: KalshiMarketResponse }>('GET', `/markets/${ticker}`);
      const m = data.market;
      return {
        ticker: m.ticker, eventTicker: m.event_ticker, title: m.title,
        category: m.category || '', status: m.status, closeTime: m.close_time,
        tickSize: m.tick_size || 1, volume24h: m.volume_24h || 0,
        liquidity: m.liquidity || 0, openInterest: m.open_interest || 0,
        yesBid: m.yes_bid || 0, yesAsk: m.yes_ask || 0, lastPrice: m.last_price || 0,
      };
    } catch {
      return null;
    }
  }

  async getOrderbook(ticker: string): Promise<{
    yesBids: Array<[number, number]>;
    yesAsks: Array<[number, number]>;
  }> {
    const data = await this.request<{ orderbook: any }>('GET', `/markets/${ticker}/orderbook`);
    const ob = data.orderbook || {};
    return {
      yesBids: (ob.yes || []).map((l: any) => [l[0], l[1]]),
      yesAsks: (ob.no || []).map((l: any) => [100 - l[0], l[1]]),
    };
  }

  async getCandlesticks(
    ticker: string,
    params: { series_ticker: string; period_interval?: number; start_ts?: number; end_ts?: number } = { series_ticker: ticker }
  ): Promise<Candle[]> {
    const qs = new URLSearchParams();
    qs.set('series_ticker', params.series_ticker);
    if (params.period_interval) qs.set('period_interval', String(params.period_interval));
    if (params.start_ts) qs.set('start_ts', String(params.start_ts));
    if (params.end_ts) qs.set('end_ts', String(params.end_ts));

    try {
      const data = await this.request<{ candlesticks: any[] }>('GET', `/series/${ticker}/markets/${ticker}/candlesticks?${qs.toString()}`);
      return (data.candlesticks || []).map((c: any) => ({
        ticker,
        ts: new Date(c.end_period_ts || c.t).getTime(),
        open: c.open ?? c.price?.open ?? 0,
        high: c.high ?? c.price?.high ?? 0,
        low: c.low ?? c.price?.low ?? 0,
        close: c.close ?? c.price?.close ?? 0,
        volume: c.volume ?? 0,
      }));
    } catch {
      return [];
    }
  }

  async placeOrder(params: {
    ticker: string;
    side: OrderSide;
    action: OrderAction;
    type: 'limit' | 'market';
    count: number;
    yesPrice?: number;
    noPrice?: number;
    clientOrderId?: string;
  }): Promise<{ orderId: string; status: string }> {
    const body: any = {
      ticker: params.ticker,
      action: params.action,
      side: params.side,
      type: params.type,
      count: params.count,
    };
    if (params.yesPrice !== undefined) body.yes_price = params.yesPrice;
    if (params.noPrice !== undefined) body.no_price = params.noPrice;
    if (params.clientOrderId) body.client_order_id = params.clientOrderId;

    const data = await this.request<{ order: KalshiOrderResponse }>('POST', '/portfolio/orders', body);
    logger.info(MODULE, 'Order placed', { orderId: data.order.order_id, ticker: params.ticker });
    return { orderId: data.order.order_id, status: data.order.status };
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    try {
      await this.request<any>('DELETE', `/portfolio/orders/${orderId}`);
      logger.info(MODULE, 'Order canceled', { orderId });
      return true;
    } catch (err: any) {
      logger.warn(MODULE, 'Cancel failed', { orderId, error: err.message });
      return false;
    }
  }

  async getPositions(): Promise<Array<{
    ticker: string;
    market_exposure: number;
    position: number;
    resting_orders_count: number;
    total_traded: number;
  }>> {
    const data = await this.request<{ market_positions: any[] }>('GET', '/portfolio/positions');
    return data.market_positions || [];
  }

  async getBalance(): Promise<{ balance: number }> {
    const data = await this.request<{ balance: number }>('GET', '/portfolio/balance');
    return data;
  }

  async getFills(params: { ticker?: string; limit?: number } = {}): Promise<Fill[]> {
    const qs = new URLSearchParams();
    if (params.ticker) qs.set('ticker', params.ticker);
    if (params.limit) qs.set('limit', String(params.limit));
    const data = await this.request<{ fills: any[] }>('GET', `/portfolio/fills?${qs.toString()}`);
    return (data.fills || []).map((f: any) => ({
      fillId: f.trade_id || f.fill_id || '',
      orderId: f.order_id || '',
      ticker: f.ticker,
      side: f.side,
      action: f.action,
      price: f.yes_price || f.price || 0,
      qty: f.count || 0,
      feeCents: 0,
      ts: new Date(f.created_time || 0).getTime(),
    }));
  }
}

type Fill = import('@kalshi-bot/shared').Fill;
