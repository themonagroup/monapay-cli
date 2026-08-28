# CLI STATUS — 2026-08-29

## Trạng thái

Hoàn thành CLI `monapay` phiên bản `0.1.0`, Node.js 18+, MIT, không có dependency bên thứ ba.

- Có `login`, `me`, `keys generate|list|revoke`, `tx list`, `qr create`, `webhooks list|create|test|logs|stats` và `webhook listen`.
- Credentials nhận từ flag/env/prompt, lưu atomic tại `~/.config/monapay/credentials.json`; thư mục mode `700`, file mode `600`.
- `tx list` hỗ trợ `--va`, `--limit`, `--since-id`, `--json`; lọc `since-id` phía client theo API truth hiện tại.
- `qr create` gọi QR API, in `qr_data_url` và lưu PNG bằng encoder QR nội bộ MIT.
- Listener kiểm timestamp 5 phút + HMAC-SHA256 trên raw body, in JSON màu và hỗ trợ `--forward` với timeout 10 giây.
- README có hướng dẫn `cloudflared`, ngrok và `monapay webhooks test`.

## Gate đã chạy

- `node --test cli` — PASS, 7/7 test.
- `find cli examples -type f -name '*.js' -print0 | xargs -0 -n1 node --check` — PASS.

Test bao phủ parser args, validation số, credentials mode `600`, webhook POST HMAC hợp lệ/sai và đầu ra PNG. Sandbox cấm bind loopback nên test listener mô phỏng trực tiếp Node request/response thay vì mở socket.

## Ghi chú môi trường

Không cài dependency và không chạy smoke test vào API production. CLI dùng trực tiếp `../sdk/node/dist` đúng cấu trúc monorepo.
