export const KALSHI_REST_DEMO = 'https://demo-api.kalshi.co/trade-api/v2';
export const KALSHI_REST_PROD = 'https://trading-api.kalshi.com/trade-api/v2';
export const KALSHI_WS_DEMO = 'wss://demo-api.kalshi.co/trade-api/ws/v2';
export const KALSHI_WS_PROD = 'wss://trading-api.kalshi.com/trade-api/ws/v2';

export const TICK_SIZE_DEFAULT = 1;
export const MAX_PRICE_CENTS = 99;
export const MIN_PRICE_CENTS = 1;

export const KILL_SWITCH_FILE = 'KILL_SWITCH';
export const SETUP_LOG_FILE = 'setup.log';

export const IPC_CHANNELS = {
  BOT_STATE: 'bot:state',
  BOT_START: 'bot:start',
  BOT_PAUSE: 'bot:pause',
  BOT_STOP: 'bot:stop',
  BOT_FLATTEN: 'bot:flatten',
  BOT_SAFE_MODE: 'bot:safe-mode',
  CONFIG_GET: 'config:get',
  CONFIG_UPDATE: 'config:update',
  CONFIG_RELOAD: 'config:reload',
  POSITIONS_LIST: 'positions:list',
  POSITIONS_CLOSE: 'positions:close',
  ORDERS_LIST: 'orders:list',
  ORDERS_CANCEL: 'orders:cancel',
  MARKETS_LIST: 'markets:list',
  PNL_DAILY: 'pnl:daily',
  PNL_EQUITY: 'pnl:equity',
  TRADES_LIST: 'trades:list',
  HEALTH_STATUS: 'health:status',
  LOGS_STREAM: 'logs:stream',
  LOGS_EXPORT: 'logs:export',
  BACKTEST_RUN: 'backtest:run',
  BACKTEST_STATUS: 'backtest:status',
  BACKTEST_RESULT: 'backtest:result',
} as const;

export const BOT_STATE_TRANSITIONS: Record<string, string[]> = {
  INIT: ['CONNECTING'],
  CONNECTING: ['READY', 'ERROR'],
  READY: ['TRADING', 'STOPPING'],
  TRADING: ['PAUSED', 'STOPPING', 'ERROR'],
  PAUSED: ['TRADING', 'STOPPING', 'ERROR'],
  STOPPING: ['READY', 'ERROR'],
  ERROR: ['INIT', 'STOPPING'],
};
