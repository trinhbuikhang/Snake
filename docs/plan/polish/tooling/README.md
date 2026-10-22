# Tooling đo cho `POLISH_PLAN.md` (tuỳ chọn, không thuộc `npm test`)

Chạy **từ thư mục gốc repo** (để `three` resolve từ `node_modules`). Simulator Node chạy được ở mọi nơi có `npm install` (kể cả sandbox của Muse). Script Playwright cần Chrome — **reviewer chạy**; chuẩn bị giống `docs/plan/hud/tooling/README.md`:

```bash
npm i --no-save playwright-core        # hoặc trỏ PW_CORE tới bản có sẵn
export PW_CORE=playwright-core          # hoặc /đường/dẫn/playwright-core/index.mjs
export CHROME=/usr/bin/google-chrome
npm run build && npx vite preview --port 4462 --strictPort &
```

| Script | Loại | Việc |
|--------|------|------|
| `steer-sim.mjs [--json f] [--yaw-tau-k K]` | Node | Lái ở 4 tốc độ × 30/60/120 fps bằng `turn`/`step`/`speedInterval` thật + path builder thật của rig: [1] lượt rẽ đôi bị rơi, [2] ba lần bấm/tick, [3] độ trễ input → tick / frame vẽ, [4] thời gian đầu rắn quay xong. `--yaw-tau-k` thử làm mượt yaw tham chiếu C04. Vòng lặp tick là **bản sao** `engine.js` @ `f9d1dd6` — **sau C01 phải gọi `runTicks` thật**. |
| `swipe-sim.mjs [--reference] [--json f]` | Node | 9 kịch bản vuốt (S1–S9) qua mô hình màn cảm ứng (`touches` = mọi ngón, `changedTouches` = ngón của event, ngón Dash không tới canvas). Mặc định: bản sao nguyên văn handler của master; `--reference`: `../reference/swipeTracker.js`. **Sau C02 thêm chế độ chạy `src/game/swipe.js`.** |
| `portrait-fit.mjs` | Node | Bàn dọc ở 5 viewport cho `el` 1.0/1.1/1.2 × có/không coach strip, gọi `hudReserve` + `fitMargins` + `fitAligned` của engine, chiếu bằng `THREE.PerspectiveCamera`. **Sau V03 gọi `presetFor`/`alignedCamera` thật.** |
| `music-baseline.mjs` | Node | Chạy scheduler ambient hiện tại qua `__test__` của `sound.js` với `AudioContext` giả, 10 phút: nốt/phút, im lặng dài nhất, dải cao độ. M03 thêm mục cho bản nhạc mới. |
| `portrait-shots.mjs <url> <label> <outdir> [id,id]` | Playwright | 5 viewport dọc: ảnh `title`, `coach`, `play` (đã tắt coach), `paused` + JSON (font/size số, rect d-pad/Dash, `padHit`, tap size Pause, lỗi console). Gameplay chạy ở Zen Garden (headless ~2 fps). |
| `title-probe.mjs [url]` | Playwright | Title 390×844 và 375×640: cần cuộn không, nút góc có bấm được không (`elementFromPoint`), rect mọi nút. |

Harness HUD 11 viewport vẫn là `docs/plan/hud/tooling/harness.mjs` (+ `overlay.py`) — mọi task V phải giữ `hudOverlaps=0 cellsCovered=0`.

Ví dụ:

```bash
node docs/plan/polish/tooling/steer-sim.mjs
node docs/plan/polish/tooling/swipe-sim.mjs && node docs/plan/polish/tooling/swipe-sim.mjs --reference
node docs/plan/polish/tooling/portrait-shots.mjs http://localhost:4462/ after /tmp/polish/shots
node docs/plan/hud/tooling/harness.mjs http://localhost:4462/ after /tmp/hud/shots docs/plan/hud/tooling/fit-prototype.mjs
```

Định nghĩa số liệu:
- **Lượt rẽ bị rơi**: sau khi input đầu được xử lý, chuỗi hướng của các tick kế tiếp không chứa A rồi B.
- **Input → tick**: thời điểm biên tick áp dụng lượt rẽ trừ thời điểm input (biên tick rơi trong cùng frame trước input tính là 0). **Input → frame vẽ**: thời điểm frame đầu tiên sau tick đó.
- **Yaw settle**: từ tick rẽ tới khi yaw đầu vẽ ra lệch ≤ 9° (10% của 90°) so với hướng mới; "target" là yaw hình học của spine (0.35 ô sau đầu), chưa làm mượt.
- **`padHit`**: tỉ lệ điểm (lưới 4px) trong rect `.dpad` mà `elementFromPoint` trúng một `.dbtn` (sau C03: trúng vùng lái của `.dpad`, ngoài vùng chết).

Chrome headless chạy ~2 fps — không dùng để đo FPS hay cảm giác lái; dùng simulator Node cho số lái.
