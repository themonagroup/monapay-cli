import assert from 'node:assert/strict';
import test from 'node:test';

import { integerFlag, parseArgs } from '../src/args.js';

test('parse args hỗ trợ positional, boolean, value và --name=value', () => {
  assert.deepEqual(
    parseArgs(['tx', 'list', '--va', 'MONA001', '--limit=25', '--json']),
    {
      positionals: ['tx', 'list'],
      flags: { va: 'MONA001', limit: '25', json: true },
    },
  );
});

test('parse args báo flag thiếu giá trị', () => {
  assert.throws(() => parseArgs(['qr', 'create', '--amount']), /cần một giá trị/);
});

test('integerFlag chặn số ngoài khoảng', () => {
  assert.equal(integerFlag('3939', 'port', { min: 0, max: 65535 }), 3939);
  assert.throws(() => integerFlag('1.5', 'port'), /số nguyên/);
});
