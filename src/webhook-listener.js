import { createServer } from 'node:http';
import { verifyWebhook } from '../../sdk/node/dist/index.js';

const REASONS = {
  missing_timestamp: 'thiếu X-Mona-Timestamp',
  invalid_timestamp: 'timestamp không hợp lệ',
  timestamp_out_of_tolerance: 'timestamp quá 5 phút',
  missing_signature: 'thiếu X-Mona-Signature',
  invalid_signature: 'chữ ký không hợp lệ',
  invalid_json: 'body không phải JSON hợp lệ',
};

async function readBody(request, maxBytes = 1024 * 1024) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > maxBytes) throw new Error('Payload vượt quá 1 MB');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function respond(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(`${JSON.stringify(body)}\n`);
}

function coloredPayload(payload, colors) {
  const text = JSON.stringify(payload, null, 2);
  return colors ? `\u001b[36m${text}\u001b[0m` : text;
}

export function createWebhookServer({ secret, forwardUrl, stdout = process.stdout, colors = stdout.isTTY } = {}) {
  if (!secret) throw new Error('Thiếu webhook secret (--secret hoặc MONAPAY_WEBHOOK_SECRET)');

  return createServer(createWebhookHandler({ secret, forwardUrl, stdout, colors }));
}

export function createWebhookHandler({ secret, forwardUrl, stdout = process.stdout, colors = stdout.isTTY } = {}) {
  if (!secret) throw new Error('Thiếu webhook secret (--secret hoặc MONAPAY_WEBHOOK_SECRET)');
  return async (request, response) => {
    if (request.method !== 'POST') {
      respond(response, 405, { ok: false, reason: 'method_not_allowed' });
      return;
    }

    try {
      const rawBody = await readBody(request);
      const result = verifyWebhook({ rawBody, headers: request.headers, secret });
      if (!result.ok) {
        stdout.write(`Webhook bị từ chối: ${REASONS[result.reason] || result.reason}\n`);
        respond(response, 401, { ok: false, reason: result.reason });
        return;
      }

      stdout.write(`Webhook hợp lệ:\n${coloredPayload(result.payload, colors)}\n`);
      if (forwardUrl) {
        const forwarded = await fetch(forwardUrl, {
          method: 'POST',
          headers: {
            'content-type': request.headers['content-type'] || 'application/json',
            'x-mona-timestamp': request.headers['x-mona-timestamp'],
            'x-mona-signature': request.headers['x-mona-signature'],
          },
          body: rawBody,
          signal: AbortSignal.timeout(10_000),
        });
        if (![200, 201, 202].includes(forwarded.status)) {
          stdout.write(`Chuyển tiếp thất bại: HTTP ${forwarded.status}\n`);
          respond(response, 502, { ok: false, reason: 'forward_failed', status: forwarded.status });
          return;
        }
        stdout.write(`Đã chuyển tiếp tới ${forwardUrl} (HTTP ${forwarded.status})\n`);
      }
      respond(response, 200, { ok: true });
    } catch (error) {
      stdout.write(`Không xử lý được webhook: ${error.message}\n`);
      respond(response, error.message.includes('1 MB') ? 413 : 500, { ok: false, reason: error.message });
    }
  };
}

export async function listenForWebhooks(options) {
  const server = createWebhookServer(options);
  const port = options.port ?? 3939;
  const host = options.host || '127.0.0.1';
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  options.stdout?.write?.(`Đang nghe webhook tại http://${host}:${address.port}\n`);
  return server;
}
