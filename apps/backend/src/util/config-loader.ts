import * as fs from 'fs';
import * as path from 'path';
import { AppConfig, AppConfigSchema } from '@kalshi-bot/shared';

const ROOT = path.resolve(__dirname, '../../../../');

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

export function loadConfig(env?: string): AppConfig {
  const defaultPath = path.join(ROOT, 'config', 'default.json');
  const defaultRaw = JSON.parse(fs.readFileSync(defaultPath, 'utf-8'));

  let envRaw = {};
  const configEnv = env || process.env.NODE_ENV || 'dev';
  const envPath = path.join(ROOT, 'config', `${configEnv}.json`);
  if (fs.existsSync(envPath)) {
    envRaw = JSON.parse(fs.readFileSync(envPath, 'utf-8'));
  }

  let overrides = {};
  const overridePath = path.join(ROOT, 'config', 'user-overrides.json');
  if (fs.existsSync(overridePath)) {
    overrides = JSON.parse(fs.readFileSync(overridePath, 'utf-8'));
  }

  let merged = deepMerge(defaultRaw, envRaw);
  merged = deepMerge(merged, overrides);

  if (process.env.KALSHI_API_KEY_ID) {
    merged.kalshi = merged.kalshi || {};
    merged.kalshi.apiKeyId = process.env.KALSHI_API_KEY_ID;
  }
  if (process.env.KALSHI_API_PRIVATE_KEY) {
    merged.kalshi = merged.kalshi || {};
    merged.kalshi.apiPrivateKey = process.env.KALSHI_API_PRIVATE_KEY;
  }
  if (process.env.KALSHI_ENV) {
    merged.kalshi = merged.kalshi || {};
    merged.kalshi.env = process.env.KALSHI_ENV;
  }

  return AppConfigSchema.parse(merged);
}

export function saveUserOverrides(partial: Partial<AppConfig>): void {
  const overridePath = path.join(ROOT, 'config', 'user-overrides.json');
  let existing: any = {};
  if (fs.existsSync(overridePath)) {
    existing = JSON.parse(fs.readFileSync(overridePath, 'utf-8'));
  }
  const merged = deepMerge(existing, partial);
  fs.writeFileSync(overridePath, JSON.stringify(merged, null, 2), 'utf-8');
}
