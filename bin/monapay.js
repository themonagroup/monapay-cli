#!/usr/bin/env node

import { main } from '../src/cli.js';

main(process.argv.slice(2)).catch((error) => {
  const detail = error?.body?.detail;
  const message = Array.isArray(detail)
    ? detail.map((item) => item.msg || JSON.stringify(item)).join('; ')
    : error?.message || String(error);
  console.error(`Lỗi: ${message}`);
  process.exitCode = 1;
});
