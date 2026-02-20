import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { fork, ChildProcess } from 'child_process';
import { IPC_CHANNELS } from '@kalshi-bot/shared';

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;

const isDev = !app.isPackaged;

function findRepoRoot(): string {
  // Walk up from __dirname until we find package.json with name "kalshi-trend-bot"
  // or config/default.json exists
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, 'config', 'default.json'))) {
      return dir;
    }
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.name === 'kalshi-trend-bot') return dir;
      } catch { /* skip */ }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: assume 4 levels up from dist/main/
  return path.resolve(__dirname, '..', '..', '..', '..');
}

const REPO_ROOT = findRepoRoot();
const DATA_DIR = path.join(REPO_ROOT, 'data');
const CONFIG_DIR = path.join(REPO_ROOT, 'config');

console.log('[electron-main] Repo root:', REPO_ROOT);
console.log('[electron-main] Config dir:', CONFIG_DIR);
console.log('[electron-main] Config exists:', fs.existsSync(path.join(CONFIG_DIR, 'default.json')));

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'Kalshi Trend Trader',
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'right' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startBackend(): void {
  const backendEntry = path.resolve(__dirname, '../../backend/dist/index.js');
  const backendTsEntry = path.resolve(__dirname, '../../backend/src/index.ts');

  if (isDev) {
    // In dev mode, backend is started separately
    return;
  }

  if (fs.existsSync(backendEntry)) {
    backendProcess = fork(backendEntry, [], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: { ...process.env, NODE_ENV: 'production' },
    });

    backendProcess.on('error', (err) => {
      console.error('Backend process error:', err);
    });

    backendProcess.on('exit', (code) => {
      console.log('Backend process exited with code:', code);
    });
  }
}

function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key])
    ) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function readJsonSafe(filePath: string): any {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (err: any) {
    console.error(`[config] Failed to read ${filePath}:`, err.message);
  }
  return null;
}

function loadMergedConfig(): any {
  const defaultCfg = readJsonSafe(path.join(CONFIG_DIR, 'default.json'));

  if (!defaultCfg) {
    console.error('[config] default.json not found at', CONFIG_DIR);
    console.error('[config] Falling back to hardcoded defaults');
    return getHardcodedDefaults();
  }

  const env = process.env.NODE_ENV || 'development';
  const envName = env === 'production' ? 'prod' : 'dev';
  const envCfg = readJsonSafe(path.join(CONFIG_DIR, `${envName}.json`)) || {};
  const overrides = readJsonSafe(path.join(CONFIG_DIR, 'user-overrides.json')) || {};

  let merged = deepMerge(defaultCfg, envCfg);
  merged = deepMerge(merged, overrides);

  console.log('[config] Loaded config - groups:', Object.keys(merged).join(', '));
  return merged;
}

function getHardcodedDefaults(): any {
  return {
    kalshi: {
      env: 'demo',
      restBaseUrl: 'https://demo-api.kalshi.co/trade-api/v2',
      wsUrl: 'wss://demo-api.kalshi.co/trade-api/ws/v2',
      apiKeyId: '',
      apiPrivateKey: '',
    },
    marketUniverse: {
      marketStatusFilter: 'open', minVolume24h: 200, minLiquidity: 1000,
      minOpenInterest: 100, maxSpreadCents: 5, excludeMVE: true,
      maxMarketsTracked: 10, scanIntervalSeconds: 60, minMinutesToClose: 30,
      hysteresisDropFactor: 0.7,
    },
    strategy: {
      candleIntervalSeconds: 60, breakoutLookbackMinutes: 30, emaFast: 9,
      emaSlow: 21, atrPeriod: 14, atrStopMultiplier: 1.5,
      tapeConfirmWindowMinutes: 5, tapeConfirmMultiplier: 2.0,
      minExpectedMoveCents: 5, signalCooldownSeconds: 180, breakoutBufferCents: 1,
    },
    execution: {
      orderTypeEntry: 'limit', orderTypeExit: 'limit', entryPatienceSeconds: 20,
      cancelReplaceMaxCycles: 2, maxSlippageCents: 2, rejectOnSpreadWidenCents: 8,
      flattenOnDisconnect: true, emergencyMarketOrderEnabled: false,
    },
    risk: {
      bankrollUSD: 200, maxRiskPerTradeUSD: 4, maxDailyLossUSD: 15,
      maxConcurrentPositions: 2, maxExposurePerCategoryUSD: 60,
      cooldownAfterStopSeconds: 300, timeStopMinutes: 45,
      minRMultipleForPartial: 1.0, partialTakePercent: 50,
      trailStopAtrMultiplier: 1.0, minContracts: 1, maxContracts: 20,
      flattenOnDailyLossHit: true,
    },
    feeModel: {
      feeSchedule: 'general', feeCoefficient: 0.07,
      feeRoundingRule: 'ceil', includeFeeInMinimumMove: true,
    },
    telemetry: {
      logLevel: 'info', persistLogsToDB: true, exportDailyCSV: true,
    },
  };
}

function setupIpc(): void {
  ipcMain.handle(IPC_CHANNELS.BOT_STATE, async () => {
    return { state: 'READY', connected: false };
  });

  ipcMain.handle(IPC_CHANNELS.BOT_START, async () => {
    sendToBackend({ type: 'start' });
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.BOT_PAUSE, async () => {
    sendToBackend({ type: 'pause' });
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.BOT_STOP, async () => {
    sendToBackend({ type: 'stop' });
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.BOT_FLATTEN, async () => {
    sendToBackend({ type: 'flatten' });
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.BOT_SAFE_MODE, async () => {
    sendToBackend({ type: 'safe-mode' });
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.CONFIG_GET, async () => {
    return loadMergedConfig();
  });

  ipcMain.handle(IPC_CHANNELS.CONFIG_UPDATE, async (_event, config) => {
    const overridePath = path.join(CONFIG_DIR, 'user-overrides.json');
    try {
      fs.writeFileSync(overridePath, JSON.stringify(config, null, 2));
      return { success: true };
    } catch (err: any) {
      console.error('[config] Save failed:', err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.CONFIG_RELOAD, async () => {
    return loadMergedConfig();
  });

  ipcMain.handle(IPC_CHANNELS.POSITIONS_LIST, async () => {
    return [];
  });

  ipcMain.handle(IPC_CHANNELS.ORDERS_LIST, async () => {
    return [];
  });

  ipcMain.handle(IPC_CHANNELS.MARKETS_LIST, async () => {
    return [];
  });

  ipcMain.handle(IPC_CHANNELS.PNL_DAILY, async () => {
    return [];
  });

  ipcMain.handle(IPC_CHANNELS.TRADES_LIST, async () => {
    return [];
  });

  ipcMain.handle(IPC_CHANNELS.HEALTH_STATUS, async () => {
    return {
      wsConnected: false,
      restAlive: false,
      lastWsHeartbeat: 0,
      lastRestCheck: 0,
      staleDataTickers: [],
      killSwitchActive: false,
      botState: 'INIT',
      uptime: process.uptime(),
    };
  });

  ipcMain.handle(IPC_CHANNELS.LOGS_STREAM, async () => {
    return [];
  });

  ipcMain.handle('open-external', async (_event, url: string) => {
    shell.openExternal(url);
  });
}

function sendToBackend(message: any): void {
  if (backendProcess) {
    backendProcess.send(message);
  }
}

app.whenReady().then(() => {
  createWindow();
  setupIpc();
  startBackend();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (backendProcess) {
    backendProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
