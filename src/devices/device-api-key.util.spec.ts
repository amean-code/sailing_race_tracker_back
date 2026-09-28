import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractApiKeyPrefix,
  generateDeviceApiKey,
  verifyDeviceApiKey,
} from './device-api-key.util';

describe('device-api-key.util', () => {
  it('generates key with parseable prefix and verifiable hash', async () => {
    const { apiKey, apiKeyPrefix, apiKeyHash } = await generateDeviceApiKey();
    assert.match(apiKey, /^thmdev_[a-f0-9]{8}_/);
    assert.equal(apiKeyPrefix.length, 8);
    assert.equal(extractApiKeyPrefix(apiKey), apiKeyPrefix);
    assert.equal(await verifyDeviceApiKey(apiKey, apiKeyHash), true);
    assert.equal(await verifyDeviceApiKey('thmdev_deadbeef_wrong', apiKeyHash), false);
  });

  it('rejects malformed keys for prefix extraction', () => {
    assert.equal(extractApiKeyPrefix(''), null);
    assert.equal(extractApiKeyPrefix('Bearer abc'), null);
    assert.equal(extractApiKeyPrefix('thmdev_short_secret'), null);
    assert.equal(extractApiKeyPrefix('other_abcdef12_secret'), null);
  });
});
