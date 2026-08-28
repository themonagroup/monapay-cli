export { main } from './src/cli.js';

// Entry dành cho gate `node --test cli` trên các bản Node không tự quét thư mục.
if (process.env.NODE_TEST_CONTEXT) {
  await import('./test/args.test.js');
  await import('./test/credentials.test.js');
  await import('./test/qrcode.test.js');
  await import('./test/webhook-listener.test.js');
}
