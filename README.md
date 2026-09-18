# `monapay` CLI

MONA Pay là API ngân hàng và dịch vụ xác nhận thanh toán tự động của The MONA Group, giúp doanh nghiệp Việt Nam nhận và xác nhận tiền chuyển khoản theo thời gian thực qua tài khoản ảo (VA), VietQR, webhook và Telegram — thiết kế để cả lập trình viên lẫn AI agent tích hợp trong vài phút.

CLI chạy trên Node.js 18 trở lên, không dùng dependency bên thứ ba và dùng trực tiếp SDK Node trong monorepo. MONA Pay miễn phí hoàn toàn.

## Chạy trong 2 phút

Từ thư mục `cli/`, anh chị có thể link lệnh vào máy mà không tải package từ mạng:

```bash
npm link
monapay login --client-id "$MONAPAY_CLIENT_ID" --client-secret "$MONAPAY_CLIENT_SECRET"
monapay me
```

`login` ưu tiên `--client-id`, `--client-secret` hoặc `MONAPAY_CLIENT_ID`, `MONAPAY_CLIENT_SECRET`; CLI đổi cặp này thành OAuth token và tự cache token theo hạn dùng. Giá trị còn thiếu sẽ được hỏi tương tác. Credentials nằm tại `~/.config/monapay/credentials.json`, thư mục có mode `700` và file có mode `600`. Có thể đổi thư mục bằng `MONAPAY_CONFIG_DIR`.

Cách cũ `--username`, `--password` hoặc `MONAPAY_USERNAME`, `MONAPAY_PASSWORD` vẫn hoạt động. Nên dùng client credentials vì tài khoản bật 2FA không login bằng mật khẩu được.

## Các lệnh thường dùng

```bash
monapay keys generate --name "Máy local"
monapay keys list --json
monapay keys revoke <key-id>

monapay tx list --va MONA0000010234 --limit 100
monapay tx list --va MONA0000010234 --since-id FT26240001234 --json

monapay webhooks list
monapay webhooks create \
  --name "Shop chính" \
  --url https://shop.example/webhooks/monapay \
  --auth HMAC_SHA256 \
  --secret "$MONAPAY_WEBHOOK_SECRET"
monapay webhooks logs --status failed --from 2026-08-01 --to 2026-08-31
monapay webhooks stats --json
```

`--since-id` đọc giao dịch mới nhất trước, dừng khi gặp `id`, `transaction_id` hoặc `transaction_code` đã biết và không in lại bản ghi đó. Đây là lọc phía CLI theo API hiện tại.

## Tạo QR động và lưu PNG

Ngoài mã đơn và số tiền, API cần cấu hình merchant ACB. Anh chị đặt một lần trong môi trường:

```bash
export MONAPAY_OWNER_NUMBER=123456789
export MONAPAY_OWNER_TYPE=ORG
export MONAPAY_MERCHANT_ID=MC00012345
export MONAPAY_TERMINAL_ID=TM0001
export MONAPAY_VA_PREFIX=MONA
export MONAPAY_BENEFICIARY_NAME="CONG TY ABC"

monapay qr create --order DH10234 --amount 2500000 --desc "Thanh toan DH10234"
```

CLI in chuỗi `qr_data_url` từ API và lưu ảnh `DH10234.png`. Dùng `--out ./public/qr/DH10234.png` để chọn đường dẫn khác. Bộ dựng PNG nằm sẵn trong CLI, không gửi dữ liệu thanh toán sang dịch vụ vẽ QR bên ngoài.

## Nghe webhook như Stripe CLI

```bash
export MONAPAY_WEBHOOK_SECRET='thay-bang-secret-that'
monapay webhook listen --port 3939
```

Listener chỉ nhận payload có `X-Mona-Timestamp` trong 5 phút và HMAC-SHA256 hợp lệ trên raw body. Muốn chuyển tiếp sang app đang chạy:

```bash
monapay webhook listen \
  --port 3939 \
  --forward http://localhost:8000/webhook
```

MONA Pay cần gọi được một URL public. Tụi em khuyên anh chị mở tunnel rồi đưa URL tunnel vào lệnh test:

```bash
cloudflared tunnel --url http://localhost:3939
# hoặc: ngrok http 3939

monapay webhooks test --url https://YOUR-TUNNEL.example
```

Máy nhận cần trả HTTP `200`, `201` hoặc `202` trong 10 giây. Khi xử lý đơn, luôn đặt unique constraint trên `transaction_code` để chống trùng lúc webhook được gửi lại.

## Phát triển

```bash
node --test cli
find cli -type f -name '*.js' -print0 | xargs -0 -n1 node --check
```

Tài liệu: https://monapay.vn/docs · AI/LLM: https://monapay.vn/llms.txt · Hotline 1900 636 648 · info@themona.global

License MIT.
