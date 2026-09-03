import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export function credentialsPath(env = process.env) {
  const configRoot = env.MONAPAY_CONFIG_DIR || join(homedir(), '.config', 'monapay');
  return join(configRoot, 'credentials.json');
}

export async function readCredentials({ env = process.env, path = credentialsPath(env) } = {}) {
  let stored = {};
  try {
    stored = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`Không đọc được credentials: ${error.message}`);
  }
  return {
    clientId: env.MONAPAY_CLIENT_ID || stored.clientId,
    username: env.MONAPAY_USERNAME || stored.username,
    password: env.MONAPAY_PASSWORD || stored.password,
    clientSecret: env.MONAPAY_CLIENT_SECRET || stored.clientSecret,
    baseUrl: env.MONAPAY_BASE_URL || stored.baseUrl || 'https://api.monapay.vn',
  };
}

export async function writeCredentials(credentials, { env = process.env, path = credentialsPath(env) } = {}) {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const temporary = `${path}.${process.pid}.tmp`;
  const body = `${JSON.stringify(credentials, null, 2)}\n`;
  await writeFile(temporary, body, { encoding: 'utf8', mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, path);
  await chmod(path, 0o600);
  return path;
}
