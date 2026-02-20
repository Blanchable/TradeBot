import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { fork, ChildProcess } from 'child_process';

// IPC channels inlined to match preload.ts (preload can't import npm packages)
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
  CREDENTIALS_BROWSE_KEY: 'credentials:browse-key',
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

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;

const isDev = !app.isPackaged;

function findRepoRoot(): string {
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
  return path.resolve(__dirname, '..', '..', '..', '..');
}

const REPO_ROOT = findRepoRoot();
const DATA_DIR = path.join(REPO_ROOT, 'data');
const CONFIG_DIR = path.join(REPO_ROOT, 'config');
const ENV_PATH = path.join(REPO_ROOT, '.env');

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
      sandbox: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startBackend(): void {
  const backendEntry = path.resolve(__dirname, '../../backend/dist/index.js');
  if (isDev) return;

  if (fs.existsSync(backendEntry)) {
    backendProcess = fork(backendEntry, [], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: { ...process.env, NODE_ENV: 'production' },
    });
    backendProcess.on('error', (err) => console.error('Backend error:', err));
    backendProcess.on('exit', (code) => console.log('Backend exited:', code));
  }
}

// ── Config helpers ──────────────────────────────────────────────────────────

function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
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
    console.error(`[config] Read failed ${filePath}:`, err.message);
  }
  return null;
}

function loadMergedConfig(): any {
  const defaultCfg = readJsonSafe(path.join(CONFIG_DIR, 'default.json'));
  if (!defaultCfg) {
    console.error('[config] default.json not found, using hardcoded defaults');
    return getHardcodedDefaults();
  }

  const env = process.env.NODE_ENV || 'development';
  const envCfg = readJsonSafe(path.join(CONFIG_DIR, env === 'production' ? 'prod.json' : 'dev.json')) || {};
  const overrides = readJsonSafe(path.join(CONFIG_DIR, 'user-overrides.json')) || {};

  let merged = deepMerge(defaultCfg, envCfg);
  merged = deepMerge(merged, overrides);
  console.log('[config] Loaded:', Object.keys(merged).join(', '));
  return merged;
}

function getHardcodedDefaults(): any {
  return {
    kalshi: { env: 'demo', restBaseUrl: 'https://demo-api.kalshi.co/trade-api/v2', wsUrl: 'wss://demo-api.kalshi.co/trade-api/ws/v2', apiKeyId: '', apiPrivateKey: '' },
    marketUniverse: { marketStatusFilter: 'open', minVolume24h: 200, minLiquidity: 1000, minOpenInterest: 100, maxSpreadCents: 5, excludeMVE: true, maxMarketsTracked: 10, scanIntervalSeconds: 60, minMinutesToClose: 30, hysteresisDropFactor: 0.7 },
    strategy: { candleIntervalSeconds: 60, breakoutLookbackMinutes: 30, emaFast: 9, emaSlow: 21, atrPeriod: 14, atrStopMultiplier: 1.5, tapeConfirmWindowMinutes: 5, tapeConfirmMultiplier: 2.0, minExpectedMoveCents: 5, signalCooldownSeconds: 180, breakoutBufferCents: 1 },
    execution: { orderTypeEntry: 'limit', orderTypeExit: 'limit', entryPatienceSeconds: 20, cancelReplaceMaxCycles: 2, maxSlippageCents: 2, rejectOnSpreadWidenCents: 8, flattenOnDisconnect: true, emergencyMarketOrderEnabled: false },
    risk: { bankrollUSD: 200, maxRiskPerTradeUSD: 4, maxDailyLossUSD: 15, maxConcurrentPositions: 2, maxExposurePerCategoryUSD: 60, cooldownAfterStopSeconds: 300, timeStopMinutes: 45, minRMultipleForPartial: 1.0, partialTakePercent: 50, trailStopAtrMultiplier: 1.0, minContracts: 1, maxContracts: 20, flattenOnDailyLossHit: true },
    feeModel: { feeSchedule: 'general', feeCoefficient: 0.07, feeRoundingRule: 'ceil', includeFeeInMinimumMove: true },
    telemetry: { logLevel: 'info', persistLogsToDB: true, exportDailyCSV: true },
  };
}

// ── Credential helpers (.env file) ──────────────────────────────────────────

function parseEnvFile(): Record<string, string> {
  const result: Record<string, string> = {};
  try {
    if (!fs.existsSync(ENV_PATH)) return result;
    const lines = fs.readFileSync(ENV_PATH, 'utf-8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      result[key] = val;
    }
  } catch (err: any) {
    console.error('[creds] Failed to parse .env:', err.message);
  }
  return result;
}

function writeEnvFile(values: Record<string, string>): void {
  const lines: string[] = [
    '# Kalshi API Credentials',
    '# Managed by Kalshi Trend Trader GUI',
    '',
  ];
  for (const [key, val] of Object.entries(values)) {
    lines.push(`${key}=${val}`);
  }
  lines.push('');
  fs.writeFileSync(ENV_PATH, lines.join('\n'), 'utf-8');
  console.log('[creds] .env written');
}

function getCredentials(): { apiKeyId: string; apiPrivateKey: string; env: string; configured: boolean } {
  const envVars = parseEnvFile();
  const apiKeyId = envVars['KALSHI_API_KEY_ID'] || '';
  const env = envVars['KALSHI_ENV'] || 'demo';
  // Check if the key file path is stored and the file exists
  const keyPath = envVars['KALSHI_PRIVATE_KEY_PATH'] || '';
  const hasKeyFile = !!(keyPath && fs.existsSync(keyPath));
  // Or check inline key
  const inlineKey = envVars['KALSHI_API_PRIVATE_KEY'] || '';
  const hasInlineKey = !!(inlineKey && inlineKey !== 'your_private_key_here' && inlineKey.length > 20);
  const configured = !!(apiKeyId && apiKeyId !== 'your_api_key_here' && (hasKeyFile || hasInlineKey));
  return { apiKeyId, apiPrivateKey: configured ? '(key on file)' : '', env, configured };
}

function loadPrivateKeyContent(): string {
  const envVars = parseEnvFile();
  // First check for a key file path
  const keyPath = envVars['KALSHI_PRIVATE_KEY_PATH'] || '';
  if (keyPath && fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath, 'utf-8').trim();
  }
  // Fall back to inline key
  return envVars['KALSHI_API_PRIVATE_KEY'] || '';
}

function saveCredentials(creds: { apiKeyId: string; apiPrivateKey: string; env: string }): void {
  const pemContent = creds.apiPrivateKey.trim();

  // Save the PEM key to a dedicated file in the data directory
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const keyFilePath = path.join(DATA_DIR, 'kalshi-private.key');
  fs.writeFileSync(keyFilePath, pemContent, { mode: 0o600 });
  console.log('[creds] Private key saved to', keyFilePath);

  // Store the path in .env (not the key content -- avoid multi-line .env issues)
  const existing = parseEnvFile();
  existing['KALSHI_API_KEY_ID'] = creds.apiKeyId;
  existing['KALSHI_PRIVATE_KEY_PATH'] = keyFilePath;
  existing['KALSHI_ENV'] = creds.env || 'demo';
  // Clear any old inline key
  delete existing['KALSHI_API_PRIVATE_KEY'];
  if (!existing['LOG_LEVEL']) existing['LOG_LEVEL'] = 'info';
  if (!existing['NODE_ENV']) existing['NODE_ENV'] = 'development';
  writeEnvFile(existing);
}

// ── Kalshi request signing (RSA-PSS SHA256) ─────────────────────────────────

function loadPrivateKey(privateKeyInput: string): crypto.KeyObject {
  const trimmed = privateKeyInput.trim();

  // If it's already PEM-formatted
  if (trimmed.includes('-----BEGIN')) {
    return crypto.createPrivateKey(trimmed);
  }

  // Raw base64 -- try PKCS8 DER (Kalshi's download format)
  const derBuffer = Buffer.from(trimmed, 'base64');

  try {
    return crypto.createPrivateKey({
      key: derBuffer,
      format: 'der',
      type: 'pkcs8',
    });
  } catch { /* not raw DER, wrap as PEM */ }

  // Wrap base64 in PEM armor and try again
  const chunked = trimmed.replace(/(.{64})/g, '$1\n').trim();
  const pem = `-----BEGIN PRIVATE KEY-----\n${chunked}\n-----END PRIVATE KEY-----`;
  return crypto.createPrivateKey(pem);
}

function signKalshiRequest(
  privateKeyInput: string,
  timestampMs: number,
  method: string,
  resourcePath: string
): string {
  // Kalshi requires: RSA-PSS, SHA256, salt_length = hash_length (32 bytes)
  // Message = timestamp_ms + METHOD + path (no query string)
  const pathNoQuery = resourcePath.split('?')[0];
  const message = String(timestampMs) + method + pathNoQuery;
  const messageBuffer = Buffer.from(message, 'utf-8');

  const keyObj = loadPrivateKey(privateKeyInput);

  return crypto.sign('sha256', messageBuffer, {
    key: keyObj,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
  }).toString('base64');
}

// ── IPC Setup ───────────────────────────────────────────────────────────────

function setupIpc(): void {
  ipcMain.handle(CH.BOT_STATE, async () => {
    return { state: 'READY', connected: false };
  });

  ipcMain.handle(CH.BOT_START, async () => {
    sendToBackend({ type: 'start' });
    return { success: true };
  });

  ipcMain.handle(CH.BOT_PAUSE, async () => {
    sendToBackend({ type: 'pause' });
    return { success: true };
  });

  ipcMain.handle(CH.BOT_STOP, async () => {
    sendToBackend({ type: 'stop' });
    return { success: true };
  });

  ipcMain.handle(CH.BOT_FLATTEN, async () => {
    sendToBackend({ type: 'flatten' });
    return { success: true };
  });

  ipcMain.handle(CH.BOT_SAFE_MODE, async () => {
    sendToBackend({ type: 'safe-mode' });
    return { success: true };
  });

  ipcMain.handle(CH.CONFIG_GET, async () => loadMergedConfig());

  ipcMain.handle(CH.CONFIG_UPDATE, async (_event, config) => {
    const overridePath = path.join(CONFIG_DIR, 'user-overrides.json');
    try {
      fs.writeFileSync(overridePath, JSON.stringify(config, null, 2));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(CH.CONFIG_RELOAD, async () => loadMergedConfig());

  // Credential management
  ipcMain.handle(CH.CREDENTIALS_GET, async () => getCredentials());

  ipcMain.handle(CH.CREDENTIALS_SAVE, async (_event, creds) => {
    try {
      saveCredentials(creds);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(CH.CREDENTIALS_TEST, async (_event, creds?) => {
    // Accept credentials directly from the UI (before save) or fall back to .env
    let apiKeyId: string;
    let privateKey: string;
    let kalshiEnv: string;

    if (creds && creds.apiKeyId && creds.apiPrivateKey) {
      apiKeyId = creds.apiKeyId;
      privateKey = creds.apiPrivateKey;
      kalshiEnv = creds.env || 'demo';
    } else {
      const envVars = parseEnvFile();
      apiKeyId = envVars['KALSHI_API_KEY_ID'] || '';
      privateKey = loadPrivateKeyContent();
      kalshiEnv = envVars['KALSHI_ENV'] || 'demo';
    }

    if (!apiKeyId || apiKeyId === 'your_api_key_here') {
      return { success: false, message: 'API Key ID is empty' };
    }
    if (!privateKey || privateKey === 'your_private_key_here') {
      return { success: false, message: 'Private Key is empty' };
    }

    const baseUrl = kalshiEnv === 'prod'
      ? 'https://api.elections.kalshi.com/trade-api/v2'
      : 'https://demo-api.kalshi.co/trade-api/v2';

    const apiPath = '/portfolio/balance';
    const method = 'GET';
    const timestampMs = Date.now();

    let signature: string;
    try {
      signature = signKalshiRequest(privateKey, timestampMs, method, '/trade-api/v2' + apiPath);
    } catch (err: any) {
      return { success: false, message: `Key signing failed: ${err.message}. Check that your private key is valid.` };
    }

    try {
      const resp = await fetch(`${baseUrl}${apiPath}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'KALSHI-ACCESS-KEY': apiKeyId,
          'KALSHI-ACCESS-SIGNATURE': signature,
          'KALSHI-ACCESS-TIMESTAMP': String(timestampMs),
        },
      });

      if (resp.ok) {
        const data = await resp.json() as any;
        const balanceCents = data.balance ?? 0;
        return {
          success: true,
          message: `Connected to Kalshi ${kalshiEnv}. Balance: $${(balanceCents / 100).toFixed(2)}`,
        };
      }

      const errBody = await resp.text().catch(() => '');
      console.error(`[creds-test] ${resp.status} from ${baseUrl}${apiPath}:`, errBody.slice(0, 500));
      if (resp.status === 401) {
        return { success: false, message: `Auth failed (401) on ${kalshiEnv}. Server: ${baseUrl}. Response: ${errBody.slice(0, 150)}` };
      }
      if (resp.status === 403) {
        return { success: false, message: `Access denied (403). Your API key may not have the required permissions.` };
      }
      return { success: false, message: `API returned ${resp.status}: ${errBody.slice(0, 200)}` };
    } catch (err: any) {
      return { success: false, message: `Connection failed: ${err.message}` };
    }
  });

  ipcMain.handle(CH.CREDENTIALS_BROWSE_KEY, async () => {
    if (!mainWindow) return { success: false, content: '' };
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select your Kalshi private key file',
      filters: [
        { name: 'Key Files', extensions: ['key', 'pem'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, content: '' };
    }
    try {
      const content = fs.readFileSync(result.filePaths[0], 'utf-8');
      return { success: true, content: content.trim(), path: result.filePaths[0] };
    } catch (err: any) {
      return { success: false, content: '', error: err.message };
    }
  });

  ipcMain.handle(CH.POSITIONS_LIST, async () => []);
  ipcMain.handle(CH.ORDERS_LIST, async () => []);
  ipcMain.handle(CH.MARKETS_LIST, async () => []);
  ipcMain.handle(CH.PNL_DAILY, async () => []);
  ipcMain.handle(CH.TRADES_LIST, async () => []);

  ipcMain.handle(CH.HEALTH_STATUS, async () => ({
    wsConnected: false, restAlive: false, lastWsHeartbeat: 0,
    lastRestCheck: 0, staleDataTickers: [], killSwitchActive: false,
    botState: 'INIT', uptime: process.uptime(),
  }));

  ipcMain.handle(CH.LOGS_STREAM, async () => []);

  ipcMain.handle('open-external', async (_event, url: string) => {
    shell.openExternal(url);
  });
}

function sendToBackend(message: any): void {
  if (backendProcess) backendProcess.send(message);
}

// ── App lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  setupIpc();
  startBackend();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (backendProcess) backendProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});
