import * as fs from 'fs';
import * as path from 'path';
import { AppConfig, AppConfigSchema } from '@kalshi-bot/shared';

// Config dir: prefer env var from Electron, fall back to repo root
function resolveConfigDir(): string {
  if (process.env.BOT_CONFIG_DIR && fs.existsSync(process.env.BOT_CONFIG_DIR)) {
    return process.env.BOT_CONFIG_DIR;
  }
  // Walk up from __dirname to find config/default.json
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, 'config', 'default.json');
    if (fs.existsSync(candidate)) return path.join(dir, 'config');
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(__dirname, '../../../../config');
}

const CONFIG_DIR = resolveConfigDir();

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
  } catch { /* skip */ }
  return null;
}

export function loadConfig(env?: string): AppConfig {
  console.log('[config-loader] Config dir:', CONFIG_DIR);

  const defaultRaw = readJsonSafe(path.join(CONFIG_DIR, 'default.json'));

  if (!defaultRaw) {
    console.error('[config-loader] default.json not found in', CONFIG_DIR);
    console.error('[config-loader] Using hardcoded defaults');
    return getHardcodedDefaults();
  }

  const configEnv = env || process.env.NODE_ENV || 'dev';
  const envName = configEnv === 'production' ? 'prod' : 'dev';
  const envRaw = readJsonSafe(path.join(CONFIG_DIR, `${envName}.json`)) || {};
  const overrides = readJsonSafe(path.join(CONFIG_DIR, 'user-overrides.json')) || {};

  let merged = deepMerge(defaultRaw, envRaw);
  merged = deepMerge(merged, overrides);

  // Apply environment variable overrides for credentials
  if (process.env.KALSHI_API_KEY_ID) {
    merged.kalshi = merged.kalshi || {};
    merged.kalshi.apiKeyId = process.env.KALSHI_API_KEY_ID;
  }
  if (process.env.KALSHI_PRIVATE_KEY_PATH) {
    const keyPath = process.env.KALSHI_PRIVATE_KEY_PATH;
    if (fs.existsSync(keyPath)) {
      merged.kalshi = merged.kalshi || {};
      merged.kalshi.apiPrivateKey = fs.readFileSync(keyPath, 'utf-8').trim();
    }
  } else if (process.env.KALSHI_API_PRIVATE_KEY) {
    merged.kalshi = merged.kalshi || {};
    merged.kalshi.apiPrivateKey = process.env.KALSHI_API_PRIVATE_KEY;
  }
  if (process.env.KALSHI_ENV) {
    merged.kalshi = merged.kalshi || {};
    merged.kalshi.env = process.env.KALSHI_ENV;
  }

  return AppConfigSchema.parse(merged);
}

function getHardcodedDefaults(): AppConfig {
  return AppConfigSchema.parse({
    kalshi: {
      env: process.env.KALSHI_ENV || 'demo',
      restBaseUrl: 'https://demo-api.kalshi.co/trade-api/v2',
      wsUrl: 'wss://demo-api.kalshi.co/trade-api/ws/v2',
      apiKeyId: process.env.KALSHI_API_KEY_ID || 'not-set',
      apiPrivateKey: process.env.KALSHI_API_PRIVATE_KEY || 'not-set',
    },
    marketUniverse: {},
    strategy: {},
    execution: {},
    risk: {},
    feeModel: {},
    telemetry: {},
  });
}

export function saveUserOverrides(partial: Partial<AppConfig>): void {
  const overridePath = path.join(CONFIG_DIR, 'user-overrides.json');
  let existing: any = {};
  if (fs.existsSync(overridePath)) {
    try { existing = JSON.parse(fs.readFileSync(overridePath, 'utf-8')); } catch { /* skip */ }
  }
  const merged = deepMerge(existing, partial);
  fs.writeFileSync(overridePath, JSON.stringify(merged, null, 2), 'utf-8');
}
