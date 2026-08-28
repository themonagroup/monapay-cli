import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import test from 'node:test';

import { createWebhookHandler } from '../src/webhook-listener.js';

function signature(body, timestamp, secret) {
  return `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
}

function request(body, headers) {
  const stream = Readable.from([Buffer.from(body)]);
  stream.method = 'POST';
  stream.headers = headers;
  return stream;
}

function response() {
  return {
    status: undefined,
    body: '',
    writeHead(status) { this.status = status; },
    end(body) { this.body = body; },
  };
}

test('webhook listener nhận POST có HMAC hợp lệ', async () => {
  const lines = [];
  const handler = createWebhookHandler({ secret: 'test-secret', stdout: { write: (line) => lines.push(line) }, colors: false });
  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({ transaction_code: 'FT-CLI-1', amount: 2500000 });
  const result = response();
  await handler(request(body, {
      'content-type': 'application/json',
      'x-mona-timestamp': String(timestamp),
      'x-mona-signature': signature(body, timestamp, 'test-secret'),
  }), result);
  assert.equal(result.status, 200);
  assert.deepEqual(JSON.parse(result.body), { ok: true });
  assert.match(lines.join(''), /FT-CLI-1/);
});

test('webhook listener từ chối chữ ký sai', async () => {
  const handler = createWebhookHandler({ secret: 'test-secret', stdout: { write() {} }, colors: false });
  const result = response();
  await handler(request('{}', {
      'x-mona-timestamp': String(Math.floor(Date.now() / 1000)),
      'x-mona-signature': `sha256=${'0'.repeat(64)}`,
  }), result);
  assert.equal(result.status, 401);
  assert.equal(JSON.parse(result.body).reason, 'invalid_signature');
});
