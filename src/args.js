const BOOLEAN_FLAGS = new Set(['help', 'json']);

export function parseArgs(argv) {
  const positionals = [];
  const flags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--') {
      positionals.push(...argv.slice(index + 1));
      break;
    }
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }

    const equalAt = token.indexOf('=');
    const name = token.slice(2, equalAt === -1 ? undefined : equalAt);
    if (!name) throw new Error('Flag không hợp lệ: --');
    if (equalAt !== -1) {
      flags[name] = token.slice(equalAt + 1);
      continue;
    }
    if (BOOLEAN_FLAGS.has(name)) {
      flags[name] = true;
      continue;
    }
    const value = argv[index + 1];
    if (value == null || value.startsWith('--')) {
      throw new Error(`Flag --${name} cần một giá trị`);
    }
    flags[name] = value;
    index += 1;
  }

  return { positionals, flags };
}

export function integerFlag(value, name, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new Error(`--${name} phải là số nguyên từ ${min} đến ${max}`);
  }
  return number;
}

export function required(value, label) {
  if (value == null || String(value).trim() === '') throw new Error(`Thiếu ${label}`);
  return String(value);
}
