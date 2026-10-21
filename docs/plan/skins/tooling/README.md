# Tooling kiểm chứng (tuỳ chọn)

Script Playwright dùng khi làm prototype. **Tuỳ chọn** — không bắt buộc cho task nào, không thêm vào `package.json`, không đưa vào CI.

Yêu cầu: chạy trong một thư mục tạm có `npm i playwright-core`, Chrome tại `/usr/bin/google-chrome` (sửa `executablePath` nếu khác), và game đang chạy bằng `npm run build && npx vite preview --port 4317`.

⚠️ Hầu hết script cần hook debug `window.__perf` (chỉ bật khi URL có `perf`) — xem cuối `../reference/diffs/engine.js.diff`. Hook này **không được commit** vào game; muốn dùng script thì áp hook tạm cục bộ rồi bỏ trước khi commit. Một số đường dẫn (`OUT`, đường dẫn import trong `motion-sim.mjs`) đang hardcode theo máy prototype — sửa lại trước khi chạy.

| Script | Dùng cho | Cách chạy |
|--------|----------|-----------|
| `motion-sim.mjs` | P01: tốc độ đầu rắn theo từng frame (cells/s) với logic accum/interval của engine | `node motion-sim.mjs 60` (sửa 2 dòng import trỏ tới repo của bạn) |
| `compile-probe.mjs` | P02: số shader program + thời gian frame khi mồi xuất hiện lần đầu từng hành tinh | `node compile-probe.mjs` |
| `perf.mjs` | P03/P04: `renderer.info`, kích thước buffer, đèn, bóng, long task | `node perf.mjs http://localhost:4317/ 1` |
| `length-probe.mjs` | S01: draw call theo độ dài rắn | `RIG=… node length-probe.mjs 1.5` |
| `snake-look.mjs` | S02/S03/S05: render rắn chữ S 16 ô ở các góc `default-cam`, `close-3q`, `close-head`, `close-top`, `face` | `SKIN=moonJade OUT=/tmp/out node snake-look.mjs "http://localhost:4317/?x=" moonJade` (env tuỳ chọn: `ONLY=face,close-head`, `EVAL='<js>'`) |
| `picker.mjs` | S04: chụp picker trong Garden, đổi skin, kiểm tra localStorage + reload | `OUT=/tmp/out node picker.mjs` |
| `hudshot.mjs` | S05: chụp toàn trang khi đang chơi (có HUD) | `node hudshot.mjs "http://localhost:4317/?perf" /tmp/hud.png plushMoon` |
| `sheet_v2.py` | Ghép ảnh so sánh | `python3 sheet_v2.py` (sửa đường dẫn) |

**Lưu ý:** chạy render **tuần tự**, đừng chạy song song nhiều Chrome SwiftShader — khi chạy song song, hạt ngọc của Moon Jade từng bị render đen (lỗi của môi trường, không phải của code). FPS đo trong headless (~2 fps) **không** phản ánh máy thật; chỉ dùng số draw call / program / thời gian JS, còn FPS phải đo trên máy thật.
