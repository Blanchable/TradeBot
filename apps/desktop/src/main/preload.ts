const { contextBridge, ipcRenderer } = require('electron');

// IPC channel constants inlined here because Electron's sandboxed preload
// cannot require() npm packages like @kalshi-bot/shared.
const CH = {
  BOT_STATE: 'bot:state',
  BOT_START: 'bot:start',
  BOT_PAUSE: 'bot:pause',
  BOT_STOP: 'bot:stop',
  BOT_FLATTEN: 'bot:flatten',
  BOT_SAFE_MODE: 'bot:safe-mode',
  CONFIG_GET: 'config:get',
  CONFIG_UPDATE: 'config:update',
  CONFIG_RELOAD: 'config:reload',
  CREDENTIALS_GET: 'credentials:get',
  CREDENTIALS_SAVE: 'credentials:save',
  CREDENTIALS_TEST: 'credentials:test',
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
  BACKTEST_RUN: 'backtest:run',
  BACKTEST_STATUS: 'backtest:status',
};

const api = {
  bot: {
    getState: () => ipcRenderer.invoke(CH.BOT_STATE),
    start: () => ipcRenderer.invoke(CH.BOT_START),
    pause: () => ipcRenderer.invoke(CH.BOT_PAUSE),
    stop: () => ipcRenderer.invoke(CH.BOT_STOP),
    flatten: () => ipcRenderer.invoke(CH.BOT_FLATTEN),
    toggleSafeMode: () => ipcRenderer.invoke(CH.BOT_SAFE_MODE),
  },
  config: {
    get: () => ipcRenderer.invoke(CH.CONFIG_GET),
    update: (config: any) => ipcRenderer.invoke(CH.CONFIG_UPDATE, config),
    reload: () => ipcRenderer.invoke(CH.CONFIG_RELOAD),
  },
  credentials: {
    get: () => ipcRenderer.invoke(CH.CREDENTIALS_GET),
    save: (creds: { apiKeyId: string; apiPrivateKey: string; env: string }) =>
      ipcRenderer.invoke(CH.CREDENTIALS_SAVE, creds),
    test: () => ipcRenderer.invoke(CH.CREDENTIALS_TEST),
  },
  positions: {
    list: () => ipcRenderer.invoke(CH.POSITIONS_LIST),
    close: (ticker: string) => ipcRenderer.invoke(CH.POSITIONS_CLOSE, ticker),
  },
  orders: {
    list: () => ipcRenderer.invoke(CH.ORDERS_LIST),
    cancel: (orderId: string) => ipcRenderer.invoke(CH.ORDERS_CANCEL, orderId),
  },
  markets: {
    list: () => ipcRenderer.invoke(CH.MARKETS_LIST),
  },
  pnl: {
    daily: () => ipcRenderer.invoke(CH.PNL_DAILY),
    equity: () => ipcRenderer.invoke(CH.PNL_EQUITY),
  },
  trades: {
    list: () => ipcRenderer.invoke(CH.TRADES_LIST),
  },
  health: {
    status: () => ipcRenderer.invoke(CH.HEALTH_STATUS),
  },
  logs: {
    stream: () => ipcRenderer.invoke(CH.LOGS_STREAM),
  },
  backtest: {
    run: (params: any) => ipcRenderer.invoke(CH.BACKTEST_RUN, params),
    status: () => ipcRenderer.invoke(CH.BACKTEST_STATUS),
  },
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  on: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.on(channel, (_event: any, ...args: any[]) => callback(...args));
    return () => ipcRenderer.removeAllListeners(channel);
  },
};

contextBridge.exposeInMainWorld('api', api);
