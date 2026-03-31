import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { loadCodexConfig, resolveSessionSettings } from '../src/config.js';

test('loadCodexConfig reads provider and model fields', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'codex-code-config-'));
  const configPath = path.join(tempDir, 'config.toml');

  await writeFile(configPath, `
model_provider = "crs"
model = "gpt-5.4"
model_reasoning_effort = "xhigh"
disable_response_storage = true

[model_providers.crs]
name = "OpenAI"
base_url = "http://localhost:3000/openai"
wire_api = "responses"
env_key = "CRS_OAI_KEY"
requires_openai_auth = true
`);

  const config = await loadCodexConfig(configPath);

  assert.equal(config.providerId, 'crs');
  assert.equal(config.model, 'gpt-5.4');
  assert.equal(config.reasoningEffort, 'xhigh');
  assert.equal(config.disableResponseStorage, true);
  assert.equal(config.provider.base_url, 'http://localhost:3000/openai');
  assert.equal(config.provider.wire_api, 'responses');
});

test('resolveSessionSettings pins gpt-5.4 medium for smoke runs', () => {
  const session = resolveSessionSettings(
    {
      model: 'gpt-5.4',
    },
    {
      model: 'gpt-5.4',
      reasoningEffort: 'medium',
    },
  );

  assert.deepEqual(session, {
    model: 'gpt-5.4',
    reasoningEffort: 'medium',
  });
});
