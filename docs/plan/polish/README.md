# Tư liệu tham chiếu cho `docs/plan/POLISH_PLAN.md`

> ⚠️ **Đây là tư liệu tham chiếu, không phải code của game.** Không file nào trong thư mục này được build hay import từ `src/`. Muse port sang `src/` theo từng task C01–M04, có test, có ảnh/số đo kiểm chứng — **không dán nguyên** file tham chiếu.

Đo trên `master` @ `f9d1dd6` (2026-10-22). Simulator Node có seed cố định: chạy lại trên cùng commit cho cùng số.

| Thư mục | Nội dung |
|---------|----------|
| `images/` | Ảnh "trước" (PNG/JPEG nhị phân thật) chụp bằng Chrome headless + SwiftShader ở các viewport dọc. |
| `baseline/` | Output gốc của mọi tooling bên dưới trên `f9d1dd6` (`.txt` để đọc, `.json` để so máy). |
| `tooling/` | Simulator lái/vuốt (Node), explorer fit màn dọc (Node), đo âm thanh (Node), chụp ảnh màn dọc + probe title (Playwright). Xem `tooling/README.md`. |
| `reference/swipeTracker.js` | REFERENCE PROTOTYPE cho C02 (vuốt một ngón + khoá trục). `swipe-sim.mjs --reference` → 9/9 kịch bản. |

## Ảnh

- `images/portrait-before-play.jpg` — 5 viewport dọc (`p390`, `p375`, `p414`, `teams375`, `p390safe`) đang chơi, coach đã tắt; tiêu đề mỗi khung ghi bàn y (chiều cao) + `padHit`. Ván chơi ở chế độ Zen Garden (headless ~2 fps, Classic đâm tường trước khi chụp xong) — layout HUD giống Classic.
- `images/portrait-before-coach.jpg` — như trên, coach card đang hiện (trạng thái harness HUD đo 0/0).
- `images/portrait-before-menus.jpg` — title `p390`, title `teams375` (phải cuộn, nút góc bị sheet che), sheet Pause `p390`/`teams375`.
- `images/before-p390-play.png`, `before-teams375-play.png`, `before-teams375-title.png` — PNG gốc DPR 3.
- `images/ov-before-p390.png` — lớp đo của `docs/plan/hud/tooling/overlay.py` (rect HUD, lưới ô bàn chiếu bằng camera của engine): 0 chồng lấn, 0 ô bị che.

## Baseline (tóm tắt)

| File | Tóm tắt |
|------|---------|
| `steer-sim-f9d1dd6.txt` | 0/24 000 lượt rẽ đôi bị rơi; input → tick rẽ ≤ 0.99 tick; đầu rắn quay xong sau 108–117 ms ở 60/120 fps (Dash 2.6–2.8 tick, worst 3.5–3.8 tick). |
| `steer-sim-reference-yaw-k0.25.txt` | Cùng simulator với làm mượt yaw τ = min(50 ms, 0.25 × interval) (C04): 0.75–1.01 tick ở 60/120 fps. |
| `swipe-sim-f9d1dd6.txt` / `swipe-sim-reference.txt` | Handler vuốt của master 5/9 kịch bản (hỏng khi giữ Dash); tham chiếu C02 9/9. |
| `portrait-fit-f9d1dd6.txt` | Chiều cao/bề ngang bàn dọc theo `el` 1.0/1.1/1.2 × có/không coach strip (gọi đúng fit của engine). |
| `hud-harness-f9d1dd6.txt` | `docs/plan/hud/tooling/harness.mjs`: 0/0 ở cả 11 viewport. |
| `portrait-shots-f9d1dd6.txt/.json` | Font/size số trên viên nang, rect d-pad/Dash, `padHit` 0.281, tap size sheet Pause. |
| `title-probe-f9d1dd6.txt` | Title cao 984px (cuộn ở 844 và 640), nút góc bị `.sheet` che. |
| `music-baseline-f9d1dd6.txt` | Ambient hiện tại: 19–28 nốt/phút, im lặng dài nhất 9–20 s, minor pentatonic 110–392 Hz; pad drone 55 Hz. |
| `bundle-f9d1dd6.txt` | `index` 73.83 kB gzip, `engine` 163.72 kB gzip, CSS 7.14 kB gzip. |
