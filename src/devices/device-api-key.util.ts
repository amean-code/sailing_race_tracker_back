import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;
const KEY_PREFIX_TAG = 'thmdev';

export type GeneratedDeviceApiKey = {
  apiKey: string;
  apiKeyPrefix: string;
  apiKeyHash: string;
};

/** Format: thmdev_<8hex>_<secret> — prefix is the 8hex segment for DB lookup. */
export function extractApiKeyPrefix(apiKey: string): string | null {
  const parts = apiKey.split('_');
  if (parts.length < 3 || parts[0] !== KEY_PREFIX_TAG) return null;
  const prefix = parts[1];
  if (!/^[a-f0-9]{8}$/i.test(prefix)) return null;
  return prefix.toLowerCase();
}

export async function generateDeviceApiKey(): Promise<GeneratedDeviceApiKey> {
  const apiKeyPrefix = randomBytes(4).toString('hex');
  const secret = randomBytes(24).toString('base64url');
  const apiKey = `${KEY_PREFIX_TAG}_${apiKeyPrefix}_${secret}`;
  const apiKeyHash = await bcrypt.hash(apiKey, SALT_ROUNDS);
  return { apiKey, apiKeyPrefix, apiKeyHash };
}

export async function verifyDeviceApiKey(apiKey: string, apiKeyHash: string): Promise<boolean> {
  return bcrypt.compare(apiKey, apiKeyHash);
}
