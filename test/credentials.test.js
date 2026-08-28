import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { readCredentials, writeCredentials } from '../src/credentials.js';

test('credentials được lưu mode 600 và env ghi đè file', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'monapay-credentials-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const env = { MONAPAY_CONFIG_DIR: directory };
  const path = await writeCredentials({ username: 'stored', password: 'secret', baseUrl: 'https://example.test' }, { env });
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), {
    username: 'stored', password: 'secret', baseUrl: 'https://example.test',
  });
  const loaded = await readCredentials({ env: { ...env, MONAPAY_USERNAME: 'from-env' } });
  assert.equal(loaded.username, 'from-env');
  assert.equal(loaded.password, 'secret');
});
