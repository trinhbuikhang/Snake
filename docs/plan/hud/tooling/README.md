# Tooling đo HUD (tuỳ chọn, không thuộc `npm test`)

Script Playwright + Chrome headless dùng để tạo số liệu và ảnh trong `HUD_PLAN.md`. Chạy **từ thư mục gốc repo** (để `three` resolve từ `node_modules`).

Chuẩn bị (một lần, không thêm vào `package.json`):

```bash
npm i --no-save playwright-core        # hoặc trỏ PW_CORE tới bản có sẵn
export PW_CORE=playwright-core          # hoặc /đường/dẫn/playwright-core/index.mjs
export CHROME=/usr/bin/google-chrome    # Chrome/Chromium bất kỳ
npm run build && npx vite preview --port 4462 --strictPort &
```

| Script | Việc |
|--------|------|
| `harness.mjs <url> <label> <outdir> <fit-model.mjs> [id,id]` | Với mỗi viewport (`p390`, `p375`, `p414`, `teams375`, `p390safe`, `l844t`, `l844safe`, `t768`, `w600`, `d1280`, `l844m`): vào ván, chờ coach card hiện, chụp `<label>-<id>.png`, ghi `<label>.json` (rect HUD, chồng lấn, ô bị che, góc bàn). In một dòng tóm tắt/viewport. Safe-area được giả lập bằng cách viết lại `env(safe-area-inset-*)` trong file CSS được phục vụ. |
| `fit-baseline-aabe5b7.mjs` | Mô hình camera của `master` @ `aabe5b7` (bản sao logic lề trong `updateCameraTarget()`), để chiếu ô bàn khi đo "trước". |
| `fit-prototype.mjs` | Mô hình camera của prototype (gọi `fitMargins` + `hudReserve`). **Sau H04** thay bằng việc gọi đúng hàm thuần mà engine dùng (xem H04) để harness không lệch engine. |
| `overlay.py <label> <outdir>` | Vẽ lớp đo (rect HUD, vùng chồng, lưới ô bàn) → `ov-<label>-<id>.png`. Lưới tím phải trùng viền bàn trong ảnh — nếu lệch thì mô hình camera sai, số "ô bị che" không đáng tin. |
| `compare.py` | Ghép ảnh trước/sau (đọc `shots/before.json`, `shots/after.json`; chạy trong thư mục chứa `shots/`). |
| `states.mjs <url> <label> <outdir>` | Ảnh màn title + sheet Pause ở 390×844, in kích thước nút (tap target). |

Ví dụ:

```bash
node docs/plan/hud/tooling/harness.mjs http://localhost:4462/ after /tmp/hud/shots docs/plan/hud/tooling/fit-prototype.mjs
python3 docs/plan/hud/tooling/overlay.py after /tmp/hud/shots
```

Định nghĩa số liệu:
- **HUD chồng nhau**: số cặp phần tử HUD hiển thị (`.chip`, `.icon-btn`, `.btn-boost`, `.dbtn`, `.coach-card`, `.journal-ping`, `.hud-stat`, …) có giao nhau > 0.5px theo cả hai chiều (bỏ cặp cha–con).
- **Ô bị che**: số ô (trong 20×20) mà một rect HUD phủ > 0.2% diện tích ô đã chiếu lên màn hình (cột "≥25%" là số ô bị phủ ≥ 1/4).
- **Tap target nhỏ**: nút có cạnh < 44px.

Chrome headless chạy ~2 fps — không dùng harness để đo FPS. Ván chơi tự chạy nên rắn có thể chết nếu máy quá chậm; khi đó dòng tóm tắt ghi `other` thay vì `playing` → chạy lại.
