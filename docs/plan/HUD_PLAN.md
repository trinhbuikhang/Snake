# Kế hoạch sửa HUD (mobile + màn hẹp) — dành cho Muse AI

> **Người thực hiện:** Muse AI
> **Người duyệt:** chủ repo (trinhbuikhang)
> **Nguồn:** ảnh chụp iPhone của chủ repo ngày 22/10/2026 (bản live mở trong trình duyệt nhúng của Microsoft Teams, dọc) — nhận xét: HUD "xấu", rối, các nút đè lên nhau; cộng với các lỗi tồn đọng từ review PR #44 (S05). Đo lại bằng Chrome headless và làm prototype tham chiếu. Tư liệu: [`docs/plan/hud/`](./hud/README.md) — **đọc README đó trước khi bắt đầu**.
> **Mốc code khi đo:** `master` @ `aabe5b7`. Số dòng (Lxx) bên dưới tham chiếu commit này; nếu code đã dịch chuyển, tìm theo tên hàm/selector, không sửa mù theo số dòng.

## Mục đích

Làm lại HUD khi chơi cho **gọn, dễ thương, không chồng chéo** ở mọi kích thước, theo phong cách pastel ánh trăng của game, và để **camera luôn chừa đúng chỗ** cho những gì đang hiện trên màn hình:

1. Một **thanh trên duy nhất**: "viên nang" chỉ số (Score / Length / Best / Dir, + đồng hồ Lantern Rush) và nút tròn; tôn trọng `safe-area-inset-*`; tap target ≥ 44px.
2. Màn hẹp (< 560px): chỉ còn **chỉ số + nút Pause**; Camera / Touch pad / Sound chuyển vào **sheet Pause** (có nhãn).
3. **Camera fit** (S05) lấy lề từ cùng một nguồn số liệu với CSS (`src/game/hudLayout.js`): thanh trên, safe-area, cụm Dash + d-pad **bất cứ khi nào cụm đó hiện** (theo bề rộng hoặc toggle), không còn phụ thuộc `pointer: coarse`. Màn dọc: bàn chơi được **canh giữa dải trống** giữa thanh trên và d-pad (hết dải trống lớn phía trên).
4. **Coach card** ("Welcome, gardener") không bao giờ đè d-pad / Dash / thanh trên, và không che ô bàn chơi ở các viewport đo.

Prototype chạy được: `docs/plan/hud/reference/hud-prototype.patch` (REFERENCE PROTOTYPE). Nhiệm vụ của Muse là **port sạch** vào `src/` theo từng task, có test, có ảnh và số đo — không dán nguyên patch.

## Hiện trạng đo được (`master` @ `aabe5b7`, harness `docs/plan/hud/tooling/harness.mjs`)

"HUD↔HUD" = số cặp phần tử HUD giao nhau (pill, nút tròn, pause, Dash, nút d-pad, coach card). "Ô bị che" = số ô (trong 20×20) bị một phần tử HUD phủ lên, chiếu bằng đúng camera của engine (lưới chiếu đã kiểm tra trùng viền bàn trong ảnh). Ảnh: `hud/images/all-viewports-before.jpg`, `all-viewports-after.jpg`.

| Viewport | HUD↔HUD (không tính coach) | Coach ↔ d-pad/HUD | Ô bị che (coach / Dash) | Bàn y (px) | **Prototype:** HUD↔HUD / ô bị che | Prototype bàn y |
|----------|---|---|---|---|---|---|
| 390×844 dọc, touch, DPR 3 | **5** (camera↔Length, d-pad toggle↔Best, mute↔Best, mute↔Dir, pause↔Dir) | 3 (đè Up/Left/Right) | 0 / 0 | 235–519 | 0 / 0 | 170–441 |
| 375×667 dọc, touch | 5 | 3 | 0 / 0 | 160–427 | 0 / 0 | 83–333 |
| 414×896 dọc, touch | 5 | 3 | 0 / 0 | 250–551 | 0 / 0 | 189–478 |
| 375×640 dọc (vùng nhìn thấy kiểu Teams) | 5 | 3 | **20** / 0 | 148–413 | 0 / 0 | 69–316 |
| 390×844 dọc + safe-area 47/34 | 5 | 3 | 0 / 0 | 235–519 | 0 / 0 | 167–438 |
| 768×1024 tablet dọc, touch | 1 (camera↔Dir) | 1 | 0 / 0 | 177–703 | 0 / 0 | 147–663 |
| 600×800 chuột | 3 | 2 | 0 / 0 | 138–549 | 0 / 0 | 83–478 |
| 844×390 ngang, touch | 0 | 0 | **196** / 0 | 82–373 | 0 / 0 | 62–373 |
| 844×390 ngang + safe-area 47 trái/phải | 1 (camera↔Dir) | 1 | **198 / 4** | 82–373 | 0 / 0 | 63–361 |
| 844×390 **chuột** (cửa sổ desktop nhỏ) | 0 | 0 | **200 / 13** | 82–373 | 0 / 0 | 62–373 |
| 1280×800 desktop | 0 | 0 | **30** / 0 | 82–760 | 0 / 0 | 80–763 |

Nguyên nhân (tại `aabe5b7`):
- `src/components/Hud.jsx` L1232 `PlayingHud` (pill `.chip` căn giữa, `.hud-top` L334 của `styles.css`) và L1268 `Corners` (`.chrome-actions` L288, `position: absolute; top/right`) là **hai lớp định vị tuyệt đối độc lập** → ở bề rộng < ~760px hai hàng đè nhau. Pill `.chip` (L352) cao 52px, `min-width: 74px`.
- Coach card: `.coach-marks` L935 `bottom: calc(110px + …)`, rộng tới 430px, căn giữa → đè d-pad (dọc) hoặc che giữa bàn (ngang/desktop).
- `src/three/engine.js` L47–48 `HUD_BOTTOM_PX = 74`, `TOUCH_CLUSTER_W_PX = 288`; L955 chỉ chừa cụm điều khiển khi `aspect > 1 && (pointer: coarse)`, nhưng CSS L554–566 hiện d-pad theo **bề rộng ≤ 900px** (hoặc toggle `showControls`) → cửa sổ desktop nhỏ: Dash che 13 ô. Fit không đọc safe-area, không chạy lại khi bật/tắt `showControls`.
- Màn dọc: fit bị giới hạn theo bề ngang; vòng tìm `lookZ` trong `fitAligned` dừng ở biên `lz ≤ 4` → vị trí dọc của bàn là ngẫu nhiên theo biên tìm kiếm, tạo dải trống ~170px phía trên bàn.

## Quy tắc làm việc (bắt buộc)

1. **Làm từng task một, đúng thứ tự.** Không bắt đầu task sau khi PR của task trước chưa được chủ repo merge (trừ khi chủ repo cho phép khác). Task *(tuỳ chọn)* chỉ làm khi chủ repo bảo.
2. **Mỗi task = một branch + một PR**, đúng tên branch ghi trong task (ví dụ `feat/h01-hud-layout-tokens`), tạo từ `master` mới nhất.
3. **Mở PR xong thì DỪNG** và chờ chủ repo review (comment trên PR). Góp ý review → sửa **trên cùng branch/PR đó** (commit mới, không mở PR mới, không force-push), trả lời từng góp ý, rồi lại dừng chờ.
4. **PR nhỏ và đúng phạm vi.** Không refactor, đổi format hay sửa "tiện tay" code không liên quan. Thấy lỗi khác → ghi vào mục "Phát hiện thêm" trong mô tả PR, đừng sửa.
5. **Không bao giờ ghi "test pass" nếu file test và lệnh chạy test không được commit trong repo và chạy được bằng `npm test`.** Kiểm tra thủ công/headless thì ghi rõ "kiểm tra thủ công/headless, không có test tự động".
6. **`npm test` và `npm run build` phải xanh trong mọi PR.** Giữ mọi test hiện có xanh (không xoá/nới test cũ để cho qua; hành vi đổi có chủ đích thì sửa test và giải thích). **Logic mới phải có test mới** — logic layout/camera để ở hàm thuần (`src/game/hudLayout.js`, `src/three/cameraFit.js`), test trong Node (repo không có jsdom; không thêm dependency test mới nếu chủ repo chưa đồng ý).
7. **Mô tả PR bắt buộc có 3 phần:**
   - **Đã thay đổi gì** (file + tóm tắt).
   - **Đã kiểm chứng thế nào**: lệnh chính xác + output thật (dán nguyên văn, rút gọn phần dài nhưng không bịa). Tối thiểu: output `npm test` (số test/số pass), dòng cuối `npm run build`, và **output harness** (các dòng tóm tắt mỗi viewport) khi task có ảnh hưởng hiển thị.
   - **Ảnh chụp màn hình** trước/sau (ảnh có lớp đo của `overlay.py` cho các viewport liên quan).
8. **Tick checkbox của task trong file này (`docs/plan/HUD_PLAN.md`) ngay trong PR của task đó.**
9. **Gặp điểm mơ hồ thì dừng lại và hỏi chủ repo**, không đoán. Mục "Quyết định đã chốt" là cuối cùng; nếu code thực tế mâu thuẫn, dừng và báo.
10. **Ảnh/file nhị phân phải commit bằng git thật** (PNG bắt đầu `89 50 4e 47`, JPEG `ff d8 ff`). Ảnh trong PR phải mở được.
11. **Giữ luật P05**: phần tử hiện khi chơi không dùng `backdrop-filter` (nền đặc trong mờ). Không thêm hook debug (`window.__…`, `?debug`) vào code commit.
12. Không push thẳng lên `master`, không force-push, không sửa lịch sử git.

## Viewport bắt buộc đo (gọi tắt trong tiêu chí)

`p390` 390×844 · `p375` 375×667 · `p414` 414×896 · `teams375` 375×640 · `p390safe` 390×844 + safe-area (top 47, bottom 34) — tất cả dọc, `isMobile`, `hasTouch`, DPR 3; `t768` 768×1024 touch DPR 2; `w600` 600×800 chuột; `l844t` 844×390 touch DPR 3; `l844safe` 844×390 touch + safe-area (trái/phải 47, dưới 21); `l844m` 844×390 **chuột** (không touch); `d1280` 1280×800 chuột. Đã khai báo sẵn trong `tooling/harness.mjs` (`VIEWPORTS`).

"**0/0 ở mọi viewport**" = harness in `hudOverlaps=0 cellsCovered=0` cho cả 11 viewport ở trên, trạng thái `playing`, coach card đang hiện.

## Quyết định đã chốt

| Task | Quyết định | Lý do |
|------|-----------|-------|
| Chung | Nguồn số liệu layout duy nhất: `src/game/hudLayout.js` (hằng `HUD`, ngưỡng, hàm thuần). CSS dùng biến `--hud-*` trong `:root` có **giá trị bằng** `HUD` (test kiểm tra). | HUD đổi thì camera đổi theo; S05 từng lệch vì hằng số `74` tách rời CSS. |
| H03 | Thanh trên cao **44px**, cách mép `max(10px, safe-area)`. Viên nang chỉ số: nền `rgba(14,20,30,0.8)`, viền lilac nhạt, bo 22px; giá trị: Score vàng trăng `#fff0c4`, Length bạc hà `#b8f3dc`, Best lilac `#d9cbff`, Dir đào `#ffd8b5`; nhãn chữ hoa nhỏ. Không `backdrop-filter`. | Pastel, dễ thương, một khối gọn thay vì 4 pill rời. |
| H03 | `< 560px` (**compact**): viên nang bên trái (giãn hết chỗ) + **chỉ nút Pause**. `≥ 560px`: viên nang + Camera / Touch pad / Sound / Pause trên cùng một hàng (grid `1fr auto 1fr`, viên nang ở giữa khi đủ chỗ). Khi Dash: ô Dir hiện ⚡ "Dash" + viên nang phát sáng (bỏ pill `⚡ DASH` riêng làm xô layout). | Ở 375px không đủ chỗ cho 4 chỉ số + 4 nút 44px. |
| H02/H03 | Trong lúc `playing`/`paused`, **không** render `Corners` (`.chrome-actions`); toggle nằm trong thanh (rộng) và luôn có trong sheet Pause (có nhãn: "Classic 3D"/tên camera, "Touch pad", "Sound on/off" — pill hiện **trạng thái**). Màn title/game over giữ `Corners` như cũ. Phím tắt C / M / P giữ nguyên. | Mobile vẫn đổi được camera/âm thanh, chỉ cần một chạm Pause. |
| H04 | Cụm điều khiển hiện ⇔ `controlsVisible(w, showControls) = showControls \|\| w ≤ 900` — **một hàm JS** dùng cho cả render (`Hud.jsx`) lẫn camera. Bỏ media query `.responsive-controls`/`.force-show-controls` và điều kiện `pointer: coarse`. | Hết lệch "d-pad hiện theo bề rộng, camera chừa chỗ theo pointer". |
| H04 | Ngang (`aspect > 1`): chừa cụm bằng lề phải (bàn trượt trái, như S05). Dọc: chừa cụm bằng lề dưới; bàn **canh giữa** dải từ đáy thanh trên tới đỉnh "dải coach" (`HUD.coachH = 92` + 12px) phía trên d-pad nếu đủ chỗ (`anchor: 'middle'`, `softBottom`). Lề trên vẫn ≤ 0.80 NDC trên màn cao (desktop gần như không đổi: chiều cao bàn ở `d1280` lệch ≤ 2%). Không đổi `el`, `fov` của preset. | Hết dải trống lớn phía trên; giữ chỗ cho coach mà không thu nhỏ bàn theo bề ngang. |
| H05 | Coach: dọc có cụm → **ngay trên d-pad**, rộng full (tối đa 430px); ngang có cụm → **cột trên d-pad** (rộng 272px, bằng cụm); không có cụm (desktop) → **góc trên trái dưới thanh**, rộng 250px. Card gọn: cao ≤ 92px, chấm + "tap to skip" chung một dòng. Nội dung (copy) giữ nguyên. | Đo được 0 ô bị che ở mọi viewport bắt buộc trong prototype. |
| Chung | `topdown` / `cinematic` giữ nguyên cách fit cũ. Không đổi gameplay, store, âm thanh. | Giảm rủi ro. |

## Thứ tự task (tóm tắt)

| # | ID | Mức | Branch | Nội dung |
|---|----|-----|--------|----------|
| 1 | H01 | Cao | `feat/h01-hud-layout-tokens` | `hudLayout.js` (token + luật layout thuần) + test + đo baseline bằng harness |
| 2 | H02 | Cao | `feat/h02-pause-settings` | Camera / Touch pad / Sound có nhãn trong sheet Pause |
| 3 | H03 | Cao | `feat/h03-hud-top-bar` | Thanh trên duy nhất: viên nang pastel + Pause, compact < 560px, safe-area |
| 4 | H04 | Cao | `feat/h04-camera-follows-hud` | Camera lấy lề từ HUD thật: thanh, safe-area, cụm điều khiển khi hiện; canh giữa dọc |
| 5 | H05 | Trung bình | `feat/h05-coach-placement` | Coach card gọn, đặt theo layout, không che d-pad/bàn |
| 6 | H06 | Trung bình | `docs/h06-agent-md-hud` | Cập nhật `AGENT.md` (layout HUD, camera margins, tooling) |
| 7 | H07 | Thấp *(tuỳ chọn)* | `feat/h07-portrait-polish` | Ý tưởng thêm cho màn dọc (hỏi chủ repo trước) |

---

## H01 — Token + luật layout thuần (`src/game/hudLayout.js`)

- [ ] **H01** · Mức: **Cao** · Branch: `feat/h01-hud-layout-tokens`

**Mục tiêu**
Một module thuần (không React/Three) chứa mọi con số layout HUD mà CSS và camera cùng dùng. Task này **không đổi giao diện**.

**File**
- Mới: `src/game/hudLayout.js`, `src/game/hudLayout.test.js`.
- `src/styles.css`: thêm biến `--hud-edge`, `--hud-bar-h`, `--hud-btn`, `--hud-gap` vào `:root` (chưa dùng ở đâu cũng được) + class `.safe-probe`.

**Spec** (tham chiếu `hud/reference/src/game/hudLayout.js`)
- `HUD = { edge: 10, barH: 44, btn: 44, gap: 8, fitGap: 8, padInset: 16, padGap: 8, dashGap: 16, coachH: 92, coachGap: 12 }`, `COMPACT_MAX_W = 560`, `CONTROLS_MAX_W = 900`.
- `isCompact(w)`, `controlsVisible(w, showControls)`, `clusterSize(w)` → `{ btn, dash, pad, w, h }` (**lưu ý:** `.dpad` dùng track grid 58px ở mọi bề rộng, chỉ nút co 52px khi ≤ 480px → pad luôn 190px; Dash 66px, ≤ 480px là 56px).
- `hudReserve({ w, h, safe, showControls })` → `{ w, h, top, left, right, bottom, cluster: { w, h } | null, coachStrip? }` (px; `top` = `max(edge, safe.top) + barH`; cluster tính cả `max(16, safe.right/bottom)`; `coachStrip` chỉ khi dọc có cụm).
- `coachPlacement({ w, h, showControls })` → `'above-pad' | 'pad-column' | 'top-left'`.
- `readSafeArea()` đọc `env(safe-area-inset-*)` qua phần tử `.safe-probe` (padding = env(...)); an toàn khi không có `document`/`getComputedStyle` (trả 0 — engine test chạy trong Node với mock).

**Tiêu chí nghiệm thu**
- Test `hudLayout.test.js` (chạy bằng `npm test`):
  - Bảng giá trị: `clusterSize(390)` → `{ w: 262, h: 190 }`, `clusterSize(844)` → `{ w: 272, h: 190 }`; `controlsVisible(844, false) === true` (cửa sổ desktop nhỏ), `controlsVisible(1280, false) === false`, `controlsVisible(1280, true) === true`; `isCompact(559) === true`, `isCompact(560) === false`.
  - `hudReserve` với safe-area: `top` ở 390×844 safe top 47 = 91; cluster ở 844×390 safe right 47 = `{ w: 319, h: 206 }`.
  - `coachPlacement`: 390×844 → `above-pad`; 844×390 → `pad-column`; 1280×800 → `top-left`; 1280×800 + `showControls` → `pad-column`.
  - **Đồng bộ CSS:** test đọc `src/styles.css` (fs) và khẳng định `--hud-bar-h: 44px`, `--hud-edge: 10px`, `--hud-btn: 44px`, `--hud-gap: 8px` bằng `HUD.*`; `.dpad` có `repeat(3, 58px)` và `.btn-boost` 66px / 56px (≤ 480px) khớp `clusterSize`.
  - `readSafeArea()` không ném lỗi khi `document` không có `createElement` (mock).
- Dán output harness **baseline** (chạy trên `master` với `tooling/fit-baseline-aabe5b7.mjs`, đủ 11 viewport) vào PR — số liệu phải khớp bảng "Hiện trạng" ở trên (± vài ô do rắn di chuyển là chấp nhận được; lệch nhiều → dừng và báo).
- Không đổi hiển thị: ảnh `p390` + `d1280` trước/sau giống nhau.

**Kiểm chứng**
- `npm test`, `npm run build`, output harness baseline.

---

## H02 — Toggle có nhãn trong sheet Pause

- [ ] **H02** · Mức: **Cao** · Branch: `feat/h02-pause-settings`

**Vấn đề**
- Để thanh trên màn hẹp chỉ còn Pause (H03), Camera / Touch pad / Sound phải có chỗ khác dễ tìm. Hiện `PauseOverlay` (`Hud.jsx` L526) chỉ có Resume / Back to title (+ End session ở Zen).

**Spec**
- Tách component `SettingsToggles({ labelled })` từ phần thân `Corners` (L1268–1324): `labelled=false` → 3 `.icon-btn` như cũ (dùng lại cho `Corners`); `labelled=true` → 3 pill `.pill-toggle` (icon + chữ): tên camera hiện tại (`CAM_LABELS`), "Touch pad" (`aria-pressed` = `showControls`, viền bạc hà khi bật), "Sound on"/"Sound off" (icon thể hiện **trạng thái hiện tại**; icon tròn ở thanh vẫn thể hiện hành động như cũ).
- `PauseOverlay` thêm hàng `.pause-settings` (flex-wrap, căn giữa) giữa các nút hành động và dòng gợi ý phím.
- Giữ `aria-label`/`title` cũ (phím C / M), không đổi store.

**Tiêu chí nghiệm thu**
- `tooling/states.mjs` (390×844): mọi nút trong sheet ≥ 44px chiều cao (dán dòng output kích thước), ảnh sheet Pause trước/sau (so với `hud/images/pause-sheet-before-after.jpg`).
- Bấm từng pill trong sheet: camera đổi preset (nhìn thấy sau khi Resume), Touch pad bật/tắt, Sound đổi chữ + trạng thái `muted` (kiểm tra thủ công, ghi rõ).
- Màn title vẫn có 3 nút góc như cũ (ảnh `title` 390×844).
- `npm test` + `npm run build` xanh.

---

## H03 — Thanh trên duy nhất (viên nang pastel + Pause), compact, safe-area

- [ ] **H03** · Mức: **Cao** · Branch: `feat/h03-hud-top-bar`

**Vấn đề**
- `PlayingHud` (L1232) + `Corners` (L1268) định vị độc lập → 5 cặp chồng nhau ở 375–414px, 3 ở 600px, 1 ở tablet/landscape safe-area (xem bảng). Ảnh: `hud/images/before-after-portrait.jpg`.

**Spec** (tham chiếu patch: `Stat`, `DirStat`, `PlayingHud`, CSS `.hud-top`, `.hud-stats`, `.hud-stat*`, `.hud-top--compact`)
- `.hud-top` là **một** hàng grid: `top/left/right: max(var(--hud-edge), env(safe-area-inset-*))`, `height: var(--hud-bar-h)`, `grid-template-columns: 1fr auto 1fr` (viên nang cột 2, `.hud-actions` cột 3 `justify-self: end`); compact (`isCompact(innerWidth)`): `minmax(0,1fr) auto`, viên nang cột 1 giãn hết, các ô chỉ số `flex: 1 1 0; min-width: 0`.
- Viên nang `.hud-stats` chứa `.hud-stat` (nhãn ≥ 0.6rem chữ hoa + giá trị font display ≥ 1.2rem, `tabular-nums`, `white-space: nowrap`), vạch ngăn mảnh giữa các ô; ô đồng hồ Lantern Rush là một `.hud-stat` thêm (giữ kiểu "sắp hết giờ" đỏ hồng nhấp nháy, tôn trọng reduced-motion); ô Dir hiện hướng + hướng đã xếp hàng (`dir-next`), khi Dash hiện ⚡ "Dash" và viên nang có class `--boost` (phát sáng, không đổi kích thước).
- `.hud-actions`: compact → chỉ Pause; không compact → `SettingsToggles` + Pause. `Hud()` không render `Corners` khi `status` là `playing` hoặc `paused`.
- Hook nhỏ `useViewport()` (resize listener, gỡ khi unmount) trong `Hud.jsx`; không đọc layout mỗi frame.
- `.journal-ping` chuyển xuống **ngay dưới thanh** (`top: calc(max(edge, safe-top) + bar-h + 6px)`), không đè viên nang.
- Bỏ CSS chết của `.chip`/`.queue-chip` nếu không còn ai dùng (`rg -n "chip" src` chứng minh), cập nhật luật P05 (không `backdrop-filter`).
- Camera **chưa** đổi trong task này (thanh mới thấp hơn pill cũ nên không che thêm ô; ghi nhận trong PR).

**Tiêu chí nghiệm thu**
- Harness (prototype bar, camera cũ): **HUD↔HUD = 0** (không tính coach — coach làm ở H05) ở cả 11 viewport; `smallTaps=0`. Dán output.
- Đo rect (harness JSON): mọi nút trong thanh 44×44; đáy thanh = `max(10, safe-top) + 44` (p390: 54, p390safe: 91) ± 1px; viên nang không tràn khỏi màn và không giao `.hud-actions` ở 375px **kể cả khi có ô Lantern Rush** (chụp thêm 1 ảnh chế độ Lantern Rush ở 375×667).
- Ảnh trước/sau có lớp đo: `p390`, `teams375`, `w600`, `l844t`, `d1280`; ảnh khi đang Dash (giữ nút Dash).
- `npm test` + `npm run build` xanh; `rg -n "backdrop-filter" src/styles.css` không có selector của thanh.

---

## H04 — Camera lấy lề từ HUD thật (thanh, safe-area, cụm điều khiển khi hiện)

- [ ] **H04** · Mức: **Cao** · Branch: `feat/h04-camera-follows-hud`

**Vấn đề**
- `engine.js` L47–48 hằng số rời (`HUD_BOTTOM_PX = 74`, `TOUCH_CLUSTER_W_PX = 288`), L955 chỉ chừa cụm khi `pointer: coarse` → `l844m` Dash che 13 ô (`hud/images/before-after-landscape.jpg`, hàng 2); không đọc safe-area (`l844safe` Dash che 4 ô); không fit lại khi bật/tắt `showControls`.
- Dọc: vị trí bàn phụ thuộc biên tìm `lookZ ≤ 4` → dải trống ~170px phía trên bàn (`p390`: thanh kết thúc 66px, bàn bắt đầu 235px).

**Spec** (tham chiếu `hud/reference/src/three/cameraFit.js`, phần `engine.js` trong patch)
- `cameraFit.js`: thêm `fitMargins(reserve, base, gap)` thuần → `{ x, right, top, bottom, softBottom?, anchor }` (công thức NDC `1 − 2·px/size`; `base` là trần `perspFit` của preset; ngang + cụm → `right`, dọc + cụm → `bottom` và `softBottom` theo `coachStrip`; `anchor = 'middle'` khi dọc, `'min'` khi ngang).
- `fitAligned`: hỗ trợ `anchor: 'middle'` — với mỗi `lookZ` trong dải rộng hơn (ví dụ −2…14, bước 0.1) tìm khoảng cách gần nhất, chỉ nhận nghiệm có `dist ≤ 1.02 × dist tối thiểu`, chọn nghiệm cân lề trên/`softBottom` nhất. Hành vi cũ (không `anchor`) giữ nguyên → test S05 cũ vẫn xanh.
- Export **một hàm thuần** mà engine gọi, ví dụ `alignedCamera({ w, h, safe, showControls, preset })` → `{ dist, lookX, lookZ, margins }` (gói `hudReserve` + `fitMargins` + `fitAligned`). `updateCameraTarget()` (L913) chỉ gọi hàm này cho preset `aligned`; xoá `HUD_BOTTOM_PX`, `TOUCH_CLUSTER_W_PX`, `FIT_GAP_PX`, nhánh `pointer: coarse`.
- Safe-area: engine đọc bằng `readSafeArea()` khi fit (resize/đổi mode), không mỗi frame.
- Subscribe store (L905): fit lại khi `cameraMode` **hoặc** `showControls` đổi.
- `Hud.jsx`: render cụm điều khiển bằng `controlsVisible(vp.w, showControls) && <OnScreenControls />`; xoá `.responsive-controls`/`.force-show-controls` và 2 media query L554–566 (legend: không còn render — kiểm tra bằng `rg`).
- Cập nhật `tooling/fit-prototype.mjs` (hoặc thêm `tooling/fit-current.mjs`) để **gọi đúng `alignedCamera`** — không chép lại logic.

**Tiêu chí nghiệm thu**
- Test mới trong `cameraFit.test.js` (Node, chiếu lại bằng `THREE.PerspectiveCamera` như test S05): với mỗi viewport bắt buộc (w, h, safe, có/không cụm theo `controlsVisible`), **mọi góc bàn và mọi ô 20×20** chiếu ra nằm ngoài các rect dành riêng: dải thanh trên `[0, reserve.top + gap]`, rect cụm ở góc phải-dưới, các dải safe-area. Giảm `dist` 2% (giữ `lookX/lookZ`) thì vi phạm ít nhất một lề (gần nhất).
- Test dọc: ở 390×844 và 375×640, khoảng trống (px) giữa lề trên hiệu dụng (`margins.top`) và mép xa của bàn, so với khoảng giữa mép gần và `softBottom`, chênh nhau ≤ 8px (prototype: 86/85px và 5/6px); bề ngang mép gần của bàn trên màn hình không nhỏ hơn bản `aabe5b7` quá 1%.
- Test `d1280`: chiều cao bàn trên màn hình lệch ≤ 2% so với `aabe5b7`.
- `engine.test.js`: đổi `showControls` → `updateCameraTarget` chạy lại (camera target đổi ở 1280×800); `readSafeArea` mock trả 0 không làm hỏng test cũ.
- Harness (camera mới, coach vẫn kiểu cũ): **ô bị che bởi thanh/Dash/d-pad = 0** ở cả 11 viewport (riêng ô bị coach che được phép còn cho tới H05 — ghi rõ con số). Dán output + ảnh có lớp đo `l844m`, `l844safe`, `p390`, `teams375`.
- Kiểm tra thủ công: cửa sổ desktop 844×390 → bàn trượt trái khỏi Dash; bật toggle Touch pad ở 1280×800 → bàn dịch trái ngay (không cần resize).

---

## H05 — Coach card gọn, đặt theo layout

- [ ] **H05** · Mức: **Trung bình** · Branch: `feat/h05-coach-placement`

**Vấn đề**
- `.coach-marks` (styles.css L935) cố định `bottom: 110px`, rộng 430px, căn giữa: dọc đè nút Up/Left/Right của d-pad (3 cặp), `teams375` che 20 ô; ngang che ~196–200 ô; desktop che 30 ô.

**Spec**
- `CoachMarks` (Hud.jsx L876) thêm class `coach-marks--${coachPlacement({ ...vp, showControls })}`; CSS 3 vị trí như "Quyết định đã chốt" (dùng `max(16px, env(safe-area-inset-*))`, đáy = inset + 190px + 12px khi trên d-pad).
- Card gọn: padding 9/14px, tiêu đề 0.7rem, nội dung 0.84rem line-height 1.35, chấm + "tap to skip" chung một hàng (`.coach-card__foot`); bo 18px, viền vàng trăng nhạt; không `backdrop-filter`. Copy giữ nguyên.

**Tiêu chí nghiệm thu**
- Harness: **0/0 ở mọi viewport** (11 viewport, coach đang hiện), dán output. Đo cả 3 bước coach (chờ 5.5s/bước, hoặc thêm tuỳ chọn cho harness): chiều cao `.coach-card` ≤ `HUD.coachH` (92px) ở mọi viewport, mọi bước.
- Test `hudLayout.test.js` bổ sung (nếu thêm logic) — ví dụ bảng `coachPlacement` cho 11 viewport.
- Ảnh có lớp đo: `p390`, `teams375`, `l844t`, `l844m`, `d1280` (so với `hud/images/before-after-*.jpg`).
- `prefers-reduced-motion`: không animation (giữ rule cũ).

---

## H06 — Cập nhật `AGENT.md`

- [ ] **H06** · Mức: **Trung bình** · Branch: `docs/h06-agent-md-hud`

**Tiêu chí nghiệm thu**
- `AGENT.md` mô tả đúng code trên `master` lúc làm task:
  - `src/game/hudLayout.js` là nguồn số liệu layout HUD; biến `--hud-*` phải bằng `HUD` (có test); thêm/đổi phần tử HUD cố định phải cập nhật `hudReserve` + chạy harness.
  - Thanh trên (compact < 560px, toggle trong sheet Pause), `controlsVisible` (một hàm cho render + camera), vị trí coach.
  - Camera `aligned`: `alignedCamera`/`fitMargins`/`anchor: 'middle'` thay cho `HUD_BOTTOM_PX`/`TOUCH_CLUSTER_W_PX` (sửa đoạn mô tả S05 hiện có ở mục camera).
  - Tooling `docs/plan/hud/tooling/` + cách đọc số "HUD chồng nhau / ô bị che".
  - Mục "Quy tắc cho agent" tham chiếu `docs/plan/HUD_PLAN.md`.
- Mọi tên hàm/hằng/class nhắc tới đều tồn tại (`rg <tên> src` có kết quả — liệt kê lệnh đã chạy trong PR). Chỉ sửa `AGENT.md` (và checkbox trong file này).

---

## H07 — Tinh chỉnh màn dọc *(tuỳ chọn, hỏi chủ repo trước)*

- [ ] **H07** · Mức: **Thấp** · Branch: `feat/h07-portrait-polish`

**Ý tưởng**
- Màn dọc bị giới hạn theo bề ngang nên luôn còn khoảng trống dọc. Có thể nghiêng camera dọc hơn một chút **chỉ khi aspect < 1** (đo: `el` 1.0 → 1.2 ở 390×844 làm bàn cao 277 → 317px, bề ngang giữ nguyên) — đổi cảm giác nhìn mặt rắn, cần chủ repo duyệt bằng ảnh.
- Copy coach theo thiết bị (touch: "Swipe the lake or tap the pad to steer", desktop: WASD/arrow) — thay đổi giọng sản phẩm, cần chủ repo duyệt.

**Tiêu chí nghiệm thu (nếu làm)**
- Vẫn 0/0 ở mọi viewport; ảnh trước/sau; test cập nhật.

---

## Khi hoàn thành tất cả

- Mọi checkbox ở trên đã được tick qua các PR tương ứng.
- Mở một PR cuối `docs/hud-closeout` cập nhật mục "Trạng thái" bên dưới: số PR cho từng task + ghi chú ngắn (kèm dòng output harness cuối cùng trên `master`, đủ 11 viewport).

### Trạng thái

| Task | PR | Ghi chú |
|------|----|---------|
| H01 | — | |
| H02 | — | |
| H03 | — | |
| H04 | — | |
| H05 | — | |
| H06 | — | |
| H07 | — | Tuỳ chọn. |
