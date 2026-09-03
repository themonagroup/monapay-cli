import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';

import { main } from '../src/cli.js';
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

test('login ưu tiên và lưu client credentials', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'monapay-login-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const env = {
    MONAPAY_CONFIG_DIR: directory,
    MONAPAY_CLIENT_ID: 'client-id',
    MONAPAY_CLIENT_SECRET: 'client-secret',
  };
  let receivedOptions;
  const output = [];
  await main(['login', '--json'], {
    env,
    input: Readable.from([]),
    stdout: { write: (chunk) => output.push(String(chunk)) },
    clientFactory: (options) => {
      receivedOptions = options;
      return { me: async () => ({ name: 'Shop Hoa', username: 'shop-hoa' }) };
    },
  });
  assert.equal(receivedOptions.clientId, 'client-id');
  assert.equal(receivedOptions.clientSecret, 'client-secret');
  assert.equal(receivedOptions.username, undefined);
  assert.deepEqual(JSON.parse(await readFile(join(directory, 'credentials.json'), 'utf8')), {
    clientId: 'client-id', clientSecret: 'client-secret', baseUrl: 'https://api.monapay.vn',
  });
  assert.match(output.join(''), /Xác thực thành công/);
});
