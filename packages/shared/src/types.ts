export type KalshiEnv = 'demo' | 'prod';
export type OrderSide = 'yes' | 'no';
export type OrderAction = 'buy' | 'sell';
export type OrderType = 'limit' | 'market';
export type SignalDirection = 'long_yes' | 'long_no' | 'exit' | 'none';
export type SignalReason =
  | 'breakout_up'
  | 'breakout_down'
  | 'take_profit_1'
  | 'take_profit_2'
  | 'stop_loss'
  | 'time_stop'
  | 'risk_event'
  | 'flatten'
  | 'disconnect';

export type OrderStatus =
  | 'pending'
  | 'open'
  | 'partial'
  | 'filled'
  | 'canceled'
  | 'rejected';

export type BotState =
  | 'INIT'
  | 'CONNECTING'
  | 'READY'
  | 'TRADING'
  | 'PAUSED'
  | 'STOPPING'
  | 'ERROR';

export type FeeSchedule = 'general' | 'index_discount';
export type FeeRoundingRule = 'ceil';

export interface Market {
  ticker: string;
  eventTicker: string;
  title: string;
  category: string;
  status: string;
  closeTime: string;
  tickSize: number;
  volume24h: number;
  liquidity: number;
  openInterest: number;
  yesBid: number;
  yesAsk: number;
  lastPrice: number;
  metadata?: Record<string, unknown>;
}

export interface Candle {
  ticker: string;
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OrderbookTop {
  ticker: string;
  ts: number;
  yesBid: number;
  yesAsk: number;
  depthBid: number;
  depthAskEst: number;
}

export interface Signal {
  ticker: string;
  ts: number;
  direction: SignalDirection;
  reason: SignalReason;
  entryPrice: number;
  stopPrice: number;
  tp1Price: number;
  tp2Price?: number;
  expectedMoveCents: number;
  feeCostCents: number;
  score: number;
  features: Record<string, number>;
}

export interface Order {
  orderId: string;
  ticker: string;
  side: OrderSide;
  action: OrderAction;
  type: OrderType;
  price: number;
  qty: number;
  filledQty: number;
  status: OrderStatus;
  clientOrderId?: string;
  tsCreated: number;
  tsUpdated: number;
}

export interface Fill {
  fillId: string;
  orderId: string;
  ticker: string;
  side: OrderSide;
  action: OrderAction;
  price: number;
  qty: number;
  feeCents: number;
  ts: number;
}

export interface Position {
  ticker: string;
  side: OrderSide;
  qty: number;
  avgPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
  stopPrice: number;
  tp1Price: number;
  tp2Price: number;
  entryTs: number;
  tp1Hit: boolean;
  partialExitQty: number;
}

export interface DailyPnl {
  date: string;
  realized: number;
  fees: number;
  net: number;
  trades: number;
  wins: number;
  losses: number;
  maxDrawdown: number;
}

export interface TradeRecord {
  id: string;
  ticker: string;
  side: OrderSide;
  entryPrice: number;
  exitPrice: number;
  qty: number;
  entryTs: number;
  exitTs: number;
  grossPnl: number;
  fees: number;
  netPnl: number;
  reason: SignalReason;
  exitReason: SignalReason;
  rMultiple: number;
}

export interface BacktestResult {
  startDate: string;
  endDate: string;
  totalTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  netPnl: number;
  maxDrawdown: number;
  expectancyPerTrade: number;
  totalFees: number;
  totalSlippage: number;
  trades: TradeRecord[];
  equityCurve: Array<{ ts: number; equity: number }>;
  drawdownCurve: Array<{ ts: number; drawdown: number }>;
}

export interface HealthStatus {
  wsConnected: boolean;
  restAlive: boolean;
  lastWsHeartbeat: number;
  lastRestCheck: number;
  staleDataTickers: string[];
  killSwitchActive: boolean;
  botState: BotState;
  uptime: number;
}

export interface MarketScore {
  ticker: string;
  score: number;
  volume24h: number;
  liquidity: number;
  openInterest: number;
  spreadCents: number;
  minutesToClose: number;
}

export interface IpcMessage<T = unknown> {
  channel: string;
  payload: T;
  ts: number;
}
