# Tư liệu tham chiếu cho `docs/plan/HUD_PLAN.md`

> ⚠️ **Đây là tư liệu tham chiếu (REFERENCE PROTOTYPE), không phải code của game.** Không file nào trong thư mục này được build hay import từ `src/`. Muse port sang `src/` theo từng task H01–H06, có test, có ảnh kiểm chứng — **không dán nguyên patch**.

| Thư mục | Nội dung |
|---------|----------|
| `images/` | Ảnh trước/sau (JPEG nhị phân thật) chụp bằng Chrome headless + SwiftShader, `master` @ `aabe5b7` vs prototype. |
| `reference/hud-prototype.patch` | Toàn bộ prototype (5 file: `Hud.jsx`, `styles.css`, `engine.js`, `cameraFit.js`, `hudLayout.js` mới). Áp dụng được lên `aabe5b7` bằng `git apply` để chạy thử cục bộ. **Không commit nguyên khối.** |
| `reference/src/game/hudLayout.js` | Bản sao module token/luật layout của prototype (dòng đầu có nhãn REFERENCE PROTOTYPE). |
| `reference/src/three/cameraFit.js` | Bản sao `cameraFit.js` của prototype (`fitMargins` + anchor `'middle'`). |
| `tooling/` | Harness đo HUD (Playwright + Chrome headless): chụp ảnh, dump rect, đếm chồng lấn HUD↔HUD, đếm ô bàn bị che. Xem `tooling/README.md`. |

## Ảnh gốc của chủ repo

Ảnh chụp iPhone (iOS, trong trình duyệt nhúng của Microsoft Teams, dọc, ~375–390 CSS px, có thanh trình duyệt trên/dưới) chủ repo gửi ngày 22/10/2026 **không lưu được vào repo** (file đính kèm không truy cập được từ máy chạy). Mô tả lại: hàng pill SCORE / LENGTH / BEST / DIR đè lên các nút tròn (camera, toggle d-pad, mute) nằm dưới LENGTH/BEST/DIR; nút pause bị ép sát mép phải; cả hàng trên trông rối. Bàn chơi nằm giữa màn với **một dải trống lớn phía trên**. Ảnh `images/before-after-portrait.jpg` (cột "TRƯỚC") tái hiện đúng tình trạng đó ở 390×844 và 375×640.

## Ảnh

- `images/before-after-portrait.jpg` — 390×844 và 375×640 (vùng nhìn thấy kiểu Teams), trước | sau, không vẽ đo đạc.
- `images/before-after-portrait-measured.jpg` — như trên (390×844, 375×667) nhưng có lớp đo: viền xanh = rect HUD, ô đỏ = vùng HUD chồng nhau, lưới tím = các ô bàn chơi chiếu lên màn hình.
- `images/before-after-landscape.jpg` — 844×390 touch, 844×390 chuột (cửa sổ desktop nhỏ), 844×390 touch + safe-area 47px trái/phải.
- `images/before-after-desktop.jpg` — 1280×800 chuột.
- `images/all-viewports-before.jpg`, `images/all-viewports-after.jpg` — 9 viewport đo (có lớp đo; `t768`, `w600` chỉ có số liệu trong bảng của HUD_PLAN.md).
- `images/pause-sheet-before-after.jpg` — sheet Pause trước | sau (sau: có nút Camera / Touch pad / Sound).

Header mỗi khung ghi: `HUD chồng nhau: N · ô bàn bị che: M` (đỏ = có lỗi, xanh = 0).
