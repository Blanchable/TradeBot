import { KalshiRestClient } from '../api/kalshi-rest';
import { KalshiConnection } from '@kalshi-bot/shared';
import { logger } from './logger';

const MODULE = 'creds';

export interface CredentialValidationResult {
  valid: boolean;
  message: string;
  balance?: number;
}

export async function validateCredentials(
  config: KalshiConnection
): Promise<CredentialValidationResult> {
  if (!config.apiKeyId || config.apiKeyId === 'your_api_key_here') {
    return { valid: false, message: 'API key not configured' };
  }

  if (!config.apiPrivateKey || config.apiPrivateKey === 'your_private_key_here') {
    return { valid: false, message: 'Private key not configured' };
  }

  const client = new KalshiRestClient(config);

  try {
    const healthy = await client.healthCheck();
    if (!healthy) {
      return { valid: false, message: 'Kalshi API unreachable' };
    }
  } catch (err: any) {
    return { valid: false, message: `Health check failed: ${err.message}` };
  }

  try {
    const balanceData = await client.getBalance();
    logger.info(MODULE, 'Credentials validated', {
      env: config.env,
      balance: balanceData.balance,
    });
    return {
      valid: true,
      message: `Connected to ${config.env}. Balance: $${(balanceData.balance / 100).toFixed(2)}`,
      balance: balanceData.balance,
    };
  } catch (err: any) {
    return { valid: false, message: `Authentication failed: ${err.message}` };
  }
}
