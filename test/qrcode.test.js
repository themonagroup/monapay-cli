import assert from 'node:assert/strict';
import test from 'node:test';

import { makeQrMatrix, qrPng } from '../src/qrcode.js';

test('QR encoder tạo ma trận vuông và PNG hợp lệ', () => {
  const matrix = makeQrMatrix('00020101021238570010A000000727');
  assert.ok(matrix.length >= 21);
  assert.equal(matrix.length, matrix[0].length);
  assert.equal(matrix[0][0], true);
  assert.deepEqual([...qrPng('MONA Pay test').subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});
