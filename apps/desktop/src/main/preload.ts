import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@kalshi-bot/shared';

const api = {
  bot: {
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.BOT_STATE),
    start: () => ipcRenderer.invoke(IPC_CHANNELS.BOT_START),
    pause: () => ipcRenderer.invoke(IPC_CHANNELS.BOT_PAUSE),
    stop: () => ipcRenderer.invoke(IPC_CHANNELS.BOT_STOP),
    flatten: () => ipcRenderer.invoke(IPC_CHANNELS.BOT_FLATTEN),
    toggleSafeMode: () => ipcRenderer.invoke(IPC_CHANNELS.BOT_SAFE_MODE),
  },
  config: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET),
    update: (config: any) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_UPDATE, config),
    reload: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_RELOAD),
  },
  positions: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.POSITIONS_LIST),
    close: (ticker: string) => ipcRenderer.invoke(IPC_CHANNELS.POSITIONS_CLOSE, ticker),
  },
  orders: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.ORDERS_LIST),
    cancel: (orderId: string) => ipcRenderer.invoke(IPC_CHANNELS.ORDERS_CANCEL, orderId),
  },
  markets: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.MARKETS_LIST),
  },
  pnl: {
    daily: () => ipcRenderer.invoke(IPC_CHANNELS.PNL_DAILY),
    equity: () => ipcRenderer.invoke(IPC_CHANNELS.PNL_EQUITY),
  },
  trades: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.TRADES_LIST),
  },
  health: {
    status: () => ipcRenderer.invoke(IPC_CHANNELS.HEALTH_STATUS),
  },
  logs: {
    stream: () => ipcRenderer.invoke(IPC_CHANNELS.LOGS_STREAM),
  },
  backtest: {
    run: (params: any) => ipcRenderer.invoke(IPC_CHANNELS.BACKTEST_RUN, params),
    status: () => ipcRenderer.invoke(IPC_CHANNELS.BACKTEST_STATUS),
  },
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  on: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    return () => ipcRenderer.removeAllListeners(channel);
  },
};

contextBridge.exposeInMainWorld('api', api);
