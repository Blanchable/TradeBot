import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { fork, ChildProcess } from 'child_process';
import { IPC_CHANNELS } from '@kalshi-bot/shared';

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;

const isDev = !app.isPackaged;
const DATA_DIR = path.resolve(__dirname, '../../../../data');

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
    const configPath = path.resolve(__dirname, '../../../../config/default.json');
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch {
      return {};
    }
  });

  ipcMain.handle(IPC_CHANNELS.CONFIG_UPDATE, async (_event, config) => {
    const overridePath = path.resolve(__dirname, '../../../../config/user-overrides.json');
    fs.writeFileSync(overridePath, JSON.stringify(config, null, 2));
    return { success: true };
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
