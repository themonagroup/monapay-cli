import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { MonaPay } from '../../sdk/node/dist/index.js';
import { integerFlag, parseArgs, required } from './args.js';
import { readCredentials, writeCredentials } from './credentials.js';
import { qrPng } from './qrcode.js';
import { listenForWebhooks } from './webhook-listener.js';

const HELP = `MONA Pay CLI 0.1.0

Cách dùng:
  monapay login [--username USER] [--password PASS] [--secret SECRET]
  monapay me [--json]
  monapay keys generate [--name NAME] [--json]
  monapay keys list [--json]
  monapay keys revoke <key-id> [--json]
  monapay tx list --va <số-VA> [--limit 100] [--since-id ID] [--json]
  monapay qr create --order ID --amount VND [--desc TEXT] [--out FILE]
  monapay webhooks list [--json]
  monapay webhooks create --name NAME --url URL [--auth HMAC_SHA256] [--secret SECRET]
  monapay webhooks test [--url URL] [--secret SECRET] [--json]
  monapay webhooks logs [--status success|failed] [--from YYYY-MM-DD] [--to YYYY-MM-DD]
  monapay webhooks stats [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--json]
  monapay webhook listen [--port 3939] [--secret SECRET] [--forward URL]

Biến môi trường chính:
  MONAPAY_USERNAME, MONAPAY_PASSWORD, MONAPAY_CLIENT_SECRET, MONAPAY_WEBHOOK_SECRET
  MONAPAY_OWNER_NUMBER, MONAPAY_OWNER_TYPE, MONAPAY_MERCHANT_ID, MONAPAY_TERMINAL_ID
  MONAPAY_VA_PREFIX, MONAPAY_BENEFICIARY_NAME, MONAPAY_VA
`;

function makePrompter(input, output) {
  let muted = false;
  const proxy = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) output.write(chunk, encoding);
      callback();
    },
  });
  const readline = createInterface({ input, output: proxy, terminal: Boolean(input.isTTY) });
  return {
    async ask(label, { secret = false } = {}) {
      const answerPromise = readline.question(label);
      muted = secret;
      const answer = await answerPromise;
      if (secret && input.isTTY) output.write('\n');
      muted = false;
      return answer;
    },
    close() {
      readline.close();
    },
  };
}

function print(value, { json, stdout }) {
  if (json) {
    stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return;
  }
  if (typeof value === 'string') stdout.write(`${value}\n`);
  else stdout.write(`Kết quả:\n${JSON.stringify(value, null, 2)}\n`);
}

function makeClient(credentials, clientFactory) {
  if (!credentials.username || !credentials.password) {
    throw new Error('Chưa có tài khoản. Chạy `monapay login` hoặc đặt MONAPAY_USERNAME/MONAPAY_PASSWORD.');
  }
  return clientFactory({
    username: credentials.username,
    password: credentials.password,
    clientSecret: credentials.clientSecret,
    baseUrl: credentials.baseUrl,
  });
}

async function login(flags, context) {
  const current = await readCredentials({ env: context.env });
  const prompt = makePrompter(context.input, context.stdout);
  try {
    const username = flags.username || context.env.MONAPAY_USERNAME
      || await prompt.ask(`Username${current.username ? ` [${current.username}]` : ''}: `)
      || current.username;
    const password = flags.password || context.env.MONAPAY_PASSWORD
      || await prompt.ask('Password: ', { secret: true })
      || current.password;
    const clientSecret = flags.secret || context.env.MONAPAY_CLIENT_SECRET
      || await prompt.ask('Client secret (bỏ trống nếu chưa tạo key): ', { secret: true })
      || current.clientSecret;
    required(username, 'username');
    required(password, 'password');
    const credentials = {
      username,
      password,
      ...(clientSecret ? { clientSecret } : {}),
      baseUrl: flags['base-url'] || context.env.MONAPAY_BASE_URL || current.baseUrl,
    };
    const client = makeClient(credentials, context.clientFactory);
    const profile = await client.me();
    const path = await writeCredentials(credentials, { env: context.env });
    print({ message: 'Đăng nhập thành công.', username: profile?.username || username, credentials: path }, {
      json: flags.json,
      stdout: context.stdout,
    });
  } finally {
    prompt.close();
  }
}

function option(flags, env, flagName, envName) {
  return flags[flagName] ?? env[envName];
}

async function listTransactions(client, flags, env) {
  const virtualAccountNumber = required(option(flags, env, 'va', 'MONAPAY_VA'), '--va hoặc MONAPAY_VA');
  const limit = integerFlag(flags.limit ?? 100, 'limit', { min: 1, max: 10_000 });
  const sinceId = flags['since-id'];
  const transactions = [];
  let page = 1;
  let reachedSinceId = false;

  while (transactions.length < limit && !reachedSinceId) {
    const pageSize = Math.min(100, limit - transactions.length);
    const result = await client.transactions.list({ virtualAccountNumber, page, limit: pageSize });
    const items = result?.data || [];
    for (const transaction of items) {
      if (sinceId && [transaction.id, transaction.transaction_id, transaction.transaction_code].some((id) => String(id) === sinceId)) {
        reachedSinceId = true;
        break;
      }
      transactions.push(transaction);
      if (transactions.length === limit) break;
    }
    const currentPage = Number(result?.current_page || page);
    const lastPage = Number(result?.last_page || currentPage);
    if (items.length === 0 || currentPage >= lastPage || result?.has_next === false) break;
    page += 1;
  }
  return { data: transactions, count: transactions.length, since_id_found: sinceId ? reachedSinceId : undefined };
}

async function createQr(client, flags, env) {
  const orderId = required(flags.order, '--order');
  const amount = integerFlag(required(flags.amount, '--amount'), 'amount', { min: 0, max: 1_000_000_000 });
  const body = {
    ownerNumber: required(option(flags, env, 'owner-number', 'MONAPAY_OWNER_NUMBER'), '--owner-number hoặc MONAPAY_OWNER_NUMBER'),
    ownerType: option(flags, env, 'owner-type', 'MONAPAY_OWNER_TYPE') || 'ORG',
    merchantId: required(option(flags, env, 'merchant-id', 'MONAPAY_MERCHANT_ID'), '--merchant-id hoặc MONAPAY_MERCHANT_ID'),
    terminalId: required(option(flags, env, 'terminal-id', 'MONAPAY_TERMINAL_ID'), '--terminal-id hoặc MONAPAY_TERMINAL_ID'),
    orderId,
    virtualAccountPrefix: required(option(flags, env, 'va-prefix', 'MONAPAY_VA_PREFIX'), '--va-prefix hoặc MONAPAY_VA_PREFIX'),
    beneficiaryName: required(option(flags, env, 'beneficiary-name', 'MONAPAY_BENEFICIARY_NAME'), '--beneficiary-name hoặc MONAPAY_BENEFICIARY_NAME'),
    amount,
    ...(flags.desc ? { description: flags.desc } : {}),
  };
  if (!['PER', 'ORG'].includes(body.ownerType)) throw new Error('--owner-type phải là PER hoặc ORG');
  const result = await client.qr.generate(body);
  const qrData = result?.qr_data_url;
  if (!qrData) throw new Error('Response tạo QR không có qr_data_url');
  const safeOrder = orderId.replace(/[^a-zA-Z0-9._-]/g, '_');
  const outputPath = resolve(flags.out || `${safeOrder}.png`);
  await writeFile(outputPath, qrPng(qrData), { mode: 0o644 });
  return { ...result, qr_data_url: qrData, png: outputPath };
}

async function runKeys(client, action, flags, positionals, context) {
  if (action === 'generate') {
    const result = await client.keys.generate(flags.name || 'CLI Key');
    if (result?.client_secret) {
      const credentials = await readCredentials({ env: context.env });
      await writeCredentials({ ...credentials, clientSecret: result.client_secret }, { env: context.env });
    }
    return result;
  }
  if (action === 'list') return client.keys.list();
  if (action === 'revoke') return client.keys.destroy(required(positionals[2] || flags.id, 'key-id'));
  throw new Error('Dùng `monapay keys generate|list|revoke`');
}

async function runWebhooks(client, action, flags, env) {
  if (action === 'list') return client.webhooks.list();
  if (action === 'create') {
    const authType = flags.auth || 'HMAC_SHA256';
    if (!['NONE', 'API_KEY', 'HMAC_SHA256'].includes(authType)) throw new Error('--auth phải là NONE, API_KEY hoặc HMAC_SHA256');
    const webhookSecret = flags.secret || env.MONAPAY_WEBHOOK_SECRET;
    const body = {
      name: required(flags.name, '--name'),
      webhook_url: required(flags.url, '--url'),
      auth_type: authType,
      payload_format: flags.format || 'application/json',
      ...(webhookSecret ? { secret_key: webhookSecret } : {}),
      ...(flags['api-key-name'] ? { api_key_name: flags['api-key-name'] } : {}),
      ...(flags.va ? { virtual_account_id: flags.va } : {}),
    };
    return client.webhooks.create(body);
  }
  if (action === 'test') {
    return client.webhooks.test({
      is_dummy: true,
      ...(flags.url ? { webhook_url: flags.url } : {}),
      ...(flags.auth ? { auth_type: flags.auth } : {}),
      ...(flags.secret || env.MONAPAY_WEBHOOK_SECRET ? { secret_key: flags.secret || env.MONAPAY_WEBHOOK_SECRET } : {}),
    });
  }
  const logOptions = {
    status: flags.status,
    fromDate: flags.from,
    toDate: flags.to,
    page: flags.page ? integerFlag(flags.page, 'page', { min: 1 }) : undefined,
    limit: flags.limit ? integerFlag(flags.limit, 'limit', { min: 1, max: 100 }) : undefined,
  };
  if (action === 'logs') return client.webhookLogs.list(logOptions);
  if (action === 'stats') return client.webhookLogs.stats(logOptions);
  throw new Error('Dùng `monapay webhooks list|create|test|logs|stats`');
}

export async function main(argv, dependencies = {}) {
  const context = {
    env: dependencies.env || process.env,
    input: dependencies.input || process.stdin,
    stdout: dependencies.stdout || process.stdout,
    clientFactory: dependencies.clientFactory || ((options) => new MonaPay(options)),
  };
  const { positionals, flags } = parseArgs(argv);
  const [command, action] = positionals;
  if (!command || flags.help || command === 'help') {
    context.stdout.write(HELP);
    return;
  }
  if (command === 'login') {
    await login(flags, context);
    return;
  }
  if (command === 'webhook' && action === 'listen') {
    const port = integerFlag(flags.port ?? 3939, 'port', { min: 0, max: 65_535 });
    const server = await listenForWebhooks({
      port,
      secret: flags.secret || context.env.MONAPAY_WEBHOOK_SECRET,
      forwardUrl: flags.forward,
      stdout: context.stdout,
    });
    const close = () => server.close();
    process.once('SIGINT', close);
    process.once('SIGTERM', close);
    return;
  }

  const credentials = await readCredentials({ env: context.env });
  const client = makeClient(credentials, context.clientFactory);
  let result;
  if (command === 'me') result = await client.me();
  else if (command === 'keys') result = await runKeys(client, action, flags, positionals, context);
  else if (command === 'tx' && action === 'list') result = await listTransactions(client, flags, context.env);
  else if (command === 'qr' && action === 'create') result = await createQr(client, flags, context.env);
  else if (command === 'webhooks') result = await runWebhooks(client, action, flags, context.env);
  else throw new Error(`Lệnh không hợp lệ. Chạy \`monapay help\` để xem hướng dẫn.`);
  if (command === 'qr' && action === 'create' && !flags.json) {
    context.stdout.write(`Tạo QR thành công.\nChuỗi QR: ${result.qr_data_url}\nĐã lưu PNG: ${result.png}\n`);
    return;
  }
  print(result, { json: flags.json, stdout: context.stdout });
}
