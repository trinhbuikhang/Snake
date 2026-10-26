# Kế hoạch đánh bóng: cảm giác lái, màn dọc, nhạc nền — dành cho Muse AI

> **Người thực hiện:** Muse AI
> **Người duyệt:** chủ repo (trinhbuikhang)
> **Nguồn:** yêu cầu của chủ repo ngày 22/10/2026 sau khi đóng `HUD_PLAN`: (1) điều khiển rắn ở tốc độ cao "không ăn tay", (2) màn dọc vẫn còn chỗ chưa đẹp, (3) muốn có **nhạc nền** dễ thương, êm, hợp "vườn trăng". Chủ repo chơi chủ yếu trên **iPhone, trong trình duyệt nhúng của Microsoft Teams** (WKWebView, dọc). Đo bằng simulator Node + Chrome headless. Tư liệu: [`docs/plan/polish/`](./polish/README.md) — **đọc README đó trước khi bắt đầu**.
> **Mốc code khi đo:** `master` @ `f9d1dd6`. Số dòng (Lxx) bên dưới tham chiếu commit này; nếu code đã dịch chuyển, tìm theo tên hàm/selector, không sửa mù theo số dòng.
> **Thay thế:** task tuỳ chọn **H07** của `docs/plan/HUD_PLAN.md` được chuyển sang đây (V03 + V05).

## Mục đích

Ba nhánh việc, làm theo thứ tự **C → V → M**:

1. **C — Cảm giác lái ở tốc độ cao (C01–C04).** Lượt rẽ phải "ăn" ngay và đúng ý ở tốc độ sàn + Dash, trên bàn phím, d-pad và vuốt. Đo được: logic hàng đợi rẽ **đã tốt** (0 lượt rẽ bị rơi, ≤ 1 tick), nhưng **vuốt khi đang giữ Dash không hoạt động**, d-pad chỉ "sống" 28% diện tích, và **đầu rắn quay chậm 2.6–3.8 tick** so với thân khi Dash.
2. **V — Đánh bóng màn dọc (V01–V05).** Giữ phong cách pastel dễ thương; số trên viên nang dễ đọc, cụm d-pad/Dash pastel, bàn chơi dùng hết chiều dọc (ý của H07), màn title/pause gọn ở 375×640 và **nút góc ở màn title bấm được**.
3. **M — Nhạc nền "vườn trăng" (M01–M04).** Nhạc procedural bằng Web Audio (không file âm thanh → không rủi ro bản quyền, bundle nhỏ), mở khoá đúng cách trên iOS Safari / Teams iPhone, bật/tắt + âm lượng lưu lại, theo trạng thái game, nhường SFX.

**Vì sao thứ tự này:** C là gameplay (người chơi cảm nhận đầu tiên, và C03 đổi cụm d-pad mà V02 sẽ tô màu — làm hit-zone trước, vẽ sau). V trước M vì V04 sắp xếp lại sheet Pause, M02 thêm nút Music vào chính sheet đó — thêm vào layout đã ổn định, không phải sắp lại hai lần. M độc lập về code (`src/audio/`), làm cuối không chặn ai.

Không có prototype UI chạy được cho V/M (chỉ số đo + ảnh "trước"). Có **tham chiếu nhỏ** cho C02 (`polish/reference/swipeTracker.js`) và C04 (tuỳ chọn `--yaw-tau-k` của simulator) — đều là REFERENCE PROTOTYPE, Muse **port sạch** vào `src/` có test, không chép nguyên.

## Hiện trạng đo được (`master` @ `f9d1dd6`)

Toàn bộ output gốc nằm trong `polish/baseline/` (chạy lại được, simulator có seed cố định → cùng commit cho cùng số).

### C — Lái

"Tốc độ": `base` 165 ms/tick (đầu ván), `floor` 80 ms (`MIN_INTERVAL`), `dash` 41.6 ms (sàn × `BOOST_MULTIPLIER` 0.52), `worst` 30.8 ms (Full Moon × High Tide × Lantern Rush × Dash). Simulator `polish/tooling/steer-sim.mjs` chạy **thật** `turn`/`step`/`speedInterval` (`logic.js`) và path builder của rig (`serpentPath.js`) qua bản sao vòng lặp tick của `engine.js` (L1055–1087) ở 30/60/120 fps.

| Đo | Kết quả | Kết luận |
|----|---------|----------|
| Hai lượt rẽ nhanh (U-turn ↑← và đổi làn ↑→, cách nhau 0/8/16/33/50 ms, pha tick ngẫu nhiên), 4 tốc độ × 3 fps × 200 lần | **0 / 24 000 bị rơi** | Hàng đợi `MAX_QUEUE = 2` của `turn()` (`logic.js` L167–201, T10a) đã đúng — **không** cần viết lại. C01 khoá bằng test. |
| Input → tick đổi hướng (logic) | max **≤ 0.99 tick** ở mọi tốc độ/fps | Đạt "≤ 1 tick". |
| Input → frame đầu tiên vẽ hướng mới | `base` TB 81–86 ms (max 167); `floor` 32–58 ms (max 100 @30fps); `dash` 17–28 ms (max 50); `worst` 17–18 ms (max 33) | Ở tốc độ cao độ trễ đã nhỏ; không phải nguyên nhân chính. |
| Ba lần bấm trong 8 ms (↑←↓) | lần 3 bị từ chối đa số (đúng luật: ↓ ngược ↑ đứng trước) | Ghi nhận hành vi, không đổi. |
| **Đầu rắn quay theo hướng mới** (lệch ≤ 9° so với 90°), tính từ tick rẽ | hình học của spine: 17–72 ms; **đầu vẽ ra: 108–117 ms ở 60/120 fps bất kể tốc độ** → `floor` 1.4–1.6 tick, **`dash` 2.6–2.8 tick, `worst` 3.5–3.8 tick**; 120 fps chậm hơn 60 fps (155 vs 138 ms ở `base`) | `serpentBase.js` L444 `rig.yawView += dyaw * Math.min(1, dt * 20)`: làm mượt **theo frame, không theo tick** → ở Dash đầu rắn còn "nhìn hướng cũ" 2–4 ô sau khi thân đã rẽ = cảm giác trễ/không ăn tay. → **C04**. |
| Vuốt (`polish/tooling/swipe-sim.mjs`, bản sao nguyên văn handler `engine.js` L778–804, 9 kịch bản) | **5/9 đúng** | → **C02**. |
| — S6/S7: giữ Dash (ngón 1) + vuốt trên hồ (ngón 2) | **0 lượt rẽ** | `onTouchStart/onTouchMove` đọc `e.touches[0]` = **ngón đang giữ Dash** (danh sách mọi ngón trên màn hình) → vuốt chết hẳn khi Dash. Trên điện thoại, Dash và d-pad cùng ở góc phải → người chơi giữ Dash bằng ngón cái phải và vuốt bằng ngón cái trái: **chính là chế độ "nhanh" mà chủ repo thấy khó lái.** |
| — S8: đang vuốt sang phải, nhả Dash giữa chừng | ra **↑** (sai hướng) | `touches[0]` đổi từ ngón Dash sang ngón vuốt → dx/dy nhảy ~400px. |
| — S3: vuốt lên rồi cong 30px sang phải ở cuối | ↑ rồi **→ ngoài ý muốn** | Ngưỡng 18px cố định, sau mỗi lần rẽ reset gốc, không khoá trục. |
| D-pad (`portrait-shots.mjs`, `elementFromPoint` lưới 4px) | **28.1 %** ô vuông 190×190 của `.dpad` là nút (4 nút 52px ở ≤ 480px, khe 8px, 4 góc trống) | Chạm lệch là mất lượt; không trượt ngón để đổi hướng được (`onPointerDown` từng nút, `Hud.jsx` L1424). → **C03**. |
| Dash giữ từ lúc "ready" | `setBoost()` (L687) bỏ qua khi `status !== 'playing'` → giữ Dash qua lúc vào ván **không** tăng tốc cho tới khi nhấc lên bấm lại | → **C03**. |
| Camera | `aligned` không bám theo rắn (`camPosTarget` chỉ đổi khi fit lại — L946); lerp L1039 chỉ chạy khi resize/đổi mode | **Không** có camera lag khi chơi. Loại trừ. |
| Nội suy | tuyến tính (P01), `rescaleAccum` giữ pha; nhiều tick/frame ở 30 fps vẫn liền mạch (prev/cur là snapshot đủ thân) | Loại trừ. |

### V — Màn dọc

Ảnh: `polish/images/portrait-before-play.jpg` (5 viewport dọc, đang chơi), `portrait-before-coach.jpg`, `portrait-before-menus.jpg` (title + pause), PNG gốc `before-p390-play.png`, `before-teams375-play.png`, `before-teams375-title.png`, `ov-before-p390.png` (lớp đo của `hud/tooling/overlay.py`). Harness HUD trên `f9d1dd6`: **0/0 ở cả 11 viewport** (`polish/baseline/hud-harness-f9d1dd6.txt`) — mọi task V phải giữ nguyên điều này.

| Viewport | Bàn y (cao) | Khoảng trống đáy bàn → đỉnh d-pad | `padHit` |
|----------|-------------|------------------------------------|----------|
| `p390` 390×844 | 170–441 (**271**) | 197 px | 0.281 |
| `p375` 375×667 | 83–333 (250) | 128 px | 0.281 |
| `p414` 414×896 | 189–478 (289) | 212 px | 0.281 |
| `teams375` 375×640 | 69–316 (**247**) | 118 px | 0.281 |
| `p390safe` + safe-area 47/34 | 167–438 (271) | 182 px | 0.281 |

Phát hiện:
- **Bàn nhỏ, dải trống lớn dưới bàn.** Fit dọc bị giới hạn theo bề ngang (`el` 1.0) và **luôn** chừa `coachStrip` (92 + 12 px, `hudLayout.js` `hudReserve` L74) dù coach chỉ hiện ở **đêm đầu tiên** (`coachStep` ≥ 0). `polish/tooling/portrait-fit.mjs` (gọi đúng `hudReserve → fitMargins → fitAligned` của engine): `el` 1.2 + bỏ strip khi không có coach → `p390` 271 → **324 px** (+20%), `teams375` 247 → **303 px** (+23%), bề ngang mép gần **không đổi** (378 / 364 px). (`el` 1.2 khi vẫn giữ strip làm `teams375` hẹp lại 364 → 345 px — vì vậy V03 chỉ đổi `el` khi coach không hiện.)
- **Số trên viên nang khó đọc.** `.hud-stat__value` (styles.css L441) dùng `Cormorant Garamond` 19.5px với **chữ số kiểu cũ** (old-style figures): "0" trông như chữ "o", "3" thòng xuống dòng (xem ảnh). Nhãn 9.6px. Inter chỉ nạp weight 400/500/600 (`index.html` L42).
- **Cụm d-pad/Dash lệch tông.** `.dbtn` (L610) nền `--panel-solid` tối, viền hairline — 4 ô vuông tối rời rạc; `.btn-boost` (L567) gradient cam–đỏ `#ffc107 → #ff7043` — không thuộc bảng pastel `--pastel-*` của H03.
- **Màn title:** `.sheet` (L140, `z-index: var(--z-sheet)` = 30, `inset: 0`) phủ lên `.chrome-actions` (L317, z 10) → `tooling/title-probe.mjs`: tâm 3 nút góc (camera / touch pad / **mute**) trả về `.overline` = **không bấm được nút góc ở title/game over** (chỉ còn phím C/M). Nội dung title cao **984 px**: ở 390×844 phải cuộn (link Journal ở y 899–958), ở `teams375` 640px khối "Choose your journey" bị cắt ở mép dưới, "Choose your moon" + Journal nằm ngoài màn.
- **Sheet Pause:** ổn (pill 44px, H02); "Back to title" xuống 2 dòng ở 390px; chỉ có **một** nút âm thanh "Sound on/off".
- Coach copy chung cho mọi thiết bị: "Steer with WASD or the arrow keys — on touch, swipe across the lake." (`Hud.jsx` L883) — ý thứ hai của H07.

### M — Âm thanh hiện có

`src/audio/sound.js` (602 dòng, procedural hoàn toàn, nằm trong chunk `index`):
- SFX: `playEat` (pluck pentatonic), `playBloom`, `playVerse`, `playTurn`, `playDeath`.
- "Nhạc": `setPadOn` — drone 3 oscillator 55/110.4/219.7 Hz + noise + LFO; `setAmbientOn` — giai điệu ngẫu nhiên **thứ (minor pentatonic)**, 110–294 Hz, `polish/tooling/music-baseline.mjs`: **19–28 nốt/phút, im lặng dài nhất 9–20 s**; `setWaterOn` cho Silent Night. Chỉ phát từ `ready` → `playing`; title/prologue/pause/game over **im lặng**. Kết quả nghe: trầm, thưa, hơi buồn — không phải "dễ thương".
- Một nút duy nhất: **mute tổng** (`ran-xinh-muted`, phím M, pill "Sound on/off" trong Pause). Không có bật/tắt nhạc riêng, không âm lượng.
- Mở khoá: `unlockAudio()` (L50) gọi ở `keydown`, ở **`touchstart`** của canvas (L781 — WebKit **không** coi `touchstart` là user activation; chỉ `touchend`/`pointerup` (touch)/`click`/`keydown`), và trong cú click Start (store subscribe, L864) → hiện tại nhạc chạy được nhờ click Start. `unlockAudio` chỉ `resume()` khi `state === 'suspended'`, **không** xử lý `'interrupted'` (iOS sau cuộc gọi / chuyển app — rất hay gặp trong Teams); không có `visibilitychange`/`pageshow` resume; context không bao giờ `suspend()` khi tab ẩn.
- Không ducking: SFX và nhạc chung `master` → compressor (threshold −18, ratio 8, L23).
- Bundle (`polish/baseline/bundle-f9d1dd6.txt`): `index` 233.00 kB (**73.83 kB gzip**), `engine` 617.02 kB (163.72 kB gzip), CSS 30.61 kB (7.14 kB gzip). Suite: **225 test / 18 file**.

## Quy tắc làm việc (bắt buộc)

1. **Làm từng task một, đúng thứ tự.** Không bắt đầu task sau khi PR của task trước chưa được chủ repo merge (trừ khi chủ repo cho phép khác). Task *(tuỳ chọn)* chỉ làm khi chủ repo bảo.
2. **Mỗi task = một branch + một PR**, đúng tên branch ghi trong task (ví dụ `feat/c01-steering-tests`), tạo từ `master` mới nhất.
3. **Mở PR xong thì DỪNG** và chờ chủ repo review (comment trên PR). Góp ý review → sửa **trên cùng branch/PR đó** (commit mới, không mở PR mới, không force-push), trả lời từng góp ý, rồi lại dừng chờ.
4. **PR nhỏ và đúng phạm vi.** Không refactor, đổi format hay sửa "tiện tay" code không liên quan. Thấy lỗi khác → ghi vào mục "Phát hiện thêm" trong mô tả PR, đừng sửa.
5. **Không bao giờ ghi "test pass" nếu file test và lệnh chạy test không được commit trong repo và chạy được bằng `npm test`.** Kiểm tra thủ công/headless thì ghi rõ "kiểm tra thủ công/headless, không có test tự động". **Không ghi kết quả đo (số, "đã hết lag", "nghe hay") nếu không có lệnh chạy được + output thật** trong PR.
6. **`npm test` và `npm run build` phải xanh trong mọi PR.** Giữ mọi test hiện có xanh (không xoá/nới test cũ để cho qua; hành vi đổi có chủ đích thì sửa test và giải thích). **Logic mới phải có test mới** — để ở hàm thuần (`src/game/*.js`, `src/three/tickClock.js`, `src/audio/musicState.js`, …), test trong Node (repo không có jsdom; Web Audio dùng mock `AudioContext` như `sound.test.js`; không thêm dependency test mới nếu chủ repo chưa đồng ý).
7. **Mô tả PR bắt buộc có 3 phần:**
   - **Đã thay đổi gì** (file + tóm tắt).
   - **Đã kiểm chứng thế nào**: lệnh chính xác + output thật (dán nguyên văn, rút gọn phần dài nhưng không bịa). Tối thiểu: output `npm test` (số test/số pass), dòng cuối `npm run build` (+ kích thước gzip các chunk cho task M), và output tooling của task (`steer-sim` / `swipe-sim` / harness / `portrait-shots` / `music-baseline` — ghi rõ lệnh).
   - **Ảnh chụp màn hình** trước/sau cho mọi thay đổi hiển thị.
8. **Sandbox của Muse không có Chrome**: harness Playwright (`docs/plan/hud/tooling/*.mjs`, `polish/tooling/portrait-shots.mjs`, `title-probe.mjs`) và mọi kiểm tra trình duyệt/thiết bị **do reviewer chạy**. Muse ghi rõ trong PR: lệnh reviewer cần chạy + kết quả mong đợi (theo tiêu chí bên dưới), và **không** tự điền số/ảnh của các bước đó. Simulator Node (`steer-sim.mjs`, `swipe-sim.mjs`, `portrait-fit.mjs`, `music-baseline.mjs`) chạy được trong sandbox — Muse tự chạy và dán output.
9. **Tick checkbox của task trong file này (`docs/plan/POLISH_PLAN.md`) ngay trong PR của task đó.**
10. **Gặp điểm mơ hồ thì dừng lại và hỏi chủ repo**, không đoán. Mục "Quyết định đã chốt" là cuối cùng; nếu code thực tế mâu thuẫn, dừng và báo.
11. **Ảnh/file nhị phân phải commit bằng git thật** (PNG bắt đầu `89 50 4e 47`, JPEG `ff d8 ff`). Ảnh trong PR phải mở được. **Không có file âm thanh** trong kế hoạch này (xem quyết định M).
12. **Giữ luật cũ:** P01–P06 (`SKINS_PERF_PLAN`: không easing chuyển động, không cấp phát mỗi frame trong `loop()`/`paint`, không `backdrop-filter` khi chơi), HUD 0/0 ở 11 viewport (`HUD_PLAN`), `controlsVisible` là luật duy nhất cho cụm điều khiển, khoá localStorage tiền tố `ran-xinh-`. Không thêm hook debug (`window.__…`, `?debug`) vào code commit.
13. Không push thẳng lên `master`, không force-push, không sửa lịch sử git.

## Viewport + ma trận đo (gọi tắt trong tiêu chí)

- **11 viewport HUD** như `HUD_PLAN.md` (`p390`, `p375`, `p414`, `teams375` 375×640, `p390safe`, `t768`, `w600`, `l844t`, `l844safe`, `l844m`, `d1280`) — "**0/0 ở mọi viewport**" = `docs/plan/hud/tooling/harness.mjs` in `hudOverlaps=0 cellsCovered=0` cho cả 11.
- **5 viewport dọc** của `polish/tooling/portrait-shots.mjs`: `p390`, `p375`, `p414`, `teams375`, `p390safe`.
- **Ma trận lái** của `steer-sim.mjs`: tốc độ `base`/`floor`/`dash`/`worst` × 30/60/120 fps.

## Quyết định đã chốt

| Task | Quyết định | Lý do |
|------|-----------|-------|
| Chung | Thứ tự **C → V → M**. Không thêm dependency. Tooling ở `docs/plan/polish/tooling/` không thuộc `npm test`; mọi kết luận phải có **test commit trong `src/`**. | Xem "Mục đích". |
| C01 | **Giữ nguyên** `turn()`/`step()`/`MAX_QUEUE = 2` (đo 0/24 000 rơi). Không làm "grace turn"/tua lại tick đã đi (rewind): bước đã ăn/chết/cộng điểm. C01 chỉ tách vòng lặp tick thành hàm thuần + test khoá hành vi. | Đã đúng; rewind rủi ro cao. |
| C02 | Vuốt theo **một ngón** (identifier của ngón chạm xuống canvas, đọc `changedTouches`), ngón khác (Dash, ngón thứ hai) bị bỏ qua. Lượt rẽ đầu của một cử chỉ: trục trội ≥ **18px** (giữ như cũ, kể cả chéo). Lượt rẽ tiếp theo trong **cùng** cử chỉ: ≥ **32px** **và** trục trội ≥ **1.5×** trục kia. Đi tiếp cùng hướng chỉ dời gốc. Giá trị lấy từ `polish/reference/swipeTracker.js` (9/9 kịch bản). | S3/S6/S7/S8. |
| C03 | Cả ô vuông `.dpad` là vùng lái: hướng theo trục trội của (điểm chạm − tâm pad), **vùng chết bán kính 16px** ở tâm; **trượt ngón** trên pad đổi hướng khi sang góc phần tư khác (`setPointerCapture`). Kích thước pad/Dash **không đổi** (190px / 66–56px) → `clusterSize`, camera, harness không đổi. Giữ Dash từ `ready` sang `playing` → bật boost ngay khi vào `playing`. | padHit 0.281 → ~0.98. |
| C04 | Làm mượt yaw đầu rắn theo thời gian, gắn với tick: `alpha = 1 − exp(−dt / τ)`, **τ = min(50 ms, 0.25 × interval)** (interval hiện tại, kể cả Dash). Không đổi roll, chomp, path. | Tham chiếu `steer-sim --yaw-tau-k 0.25`. |
| V01 | Giá trị trên viên nang: `font-family: var(--font-ui)` (Inter), **weight 600** (đã nạp), `font-variant-numeric: lining-nums tabular-nums`, `font-size: 1.15rem`; nhãn ≥ **0.64rem** (10.24px). Màu pastel H03 giữ nguyên. Chiều cao thanh 44px giữ nguyên. | Số "0/3" đọc được; không thêm font. |
| V02 | D-pad = **một tấm nền bo tròn** 190×190 (bo 44px, nền `var(--hud-glass)`, viền `var(--hud-line)` 1.5px), 4 nút mũi tên dạng "kẹo" pastel (nền mint nhạt `rgba(184,243,220,0.14)`, icon `--pastel-mint`, nét ≥ 2.5px), nhấn: nền mint đặc + chữ mực tối. Dash: gradient **đào → vàng trăng** (`--pastel-peach` → `--pastel-moon`), chữ/icon mực tối `#2a1d14`, glow đào nhẹ. Không `backdrop-filter`. | Đồng bộ bảng pastel H03, giữ "dễ thương". |
| V03 | Thay thế quyết định H04 "không đổi `el`" **chỉ cho màn dọc khi coach không hiện**: preset `aligned` dùng **`el` 1.2 khi `w/h < 1` và coach ẩn**, và lúc đó **không** chừa `coachStrip`. Coach đang hiện (đêm đầu) → **giống hệt master** (`el` 1.0 + strip; vì `el` 1.2 + strip làm `teams375` hẹp 364 → 345px). Ngang/desktop không đổi. Engine fit lại khi coach hiện ↔ ẩn (camera lerp sẵn có làm chuyển động mượt). **Cần chủ repo duyệt bằng ảnh** trước merge (đổi góc nhìn mặt rắn). | +20–23% chiều cao bàn, bề ngang giữ nguyên. |
| V04 | Nút góc (`.chrome-actions`) phải bấm được trên mọi sheet title/game over (z-index trên `.sheet` + sheet chừa chỗ trên cùng `calc(max(14px, safe-top) + 44px + 8px)` khi hẹp). Title ở `< 560px`: Garden / How to play / Camera thành **một hàng 3 pill** (≥ 44px cao, icon + chữ ngắn), giảm khoảng cách dọc của lockup. Copy giữ nguyên trừ nhãn ngắn của 3 pill (ví dụ "Garden", "How to", "Camera") — chủ repo duyệt trong PR. | Title bấm được và gọn ở Teams. |
| M | **Không dùng file âm thanh** (không asset, không CC0 cần ghi license): toàn bộ nhạc procedural Web Audio trong `src/audio/`. Ngân sách: **tổng M01–M04 ≤ +6 kB gzip** (chunk `index` ≤ 79.8 kB gzip so với 73.83), 0 request mạng mới. | Không rủi ro bản quyền, bundle nhỏ. |
| M01 | Mở khoá chỉ trong **activation event thật**: `pointerup`, `touchend`, `click`, `keydown` (listener `capture: true` trên `document`, gỡ khi context `running`). **Không** tạo `AudioContext` trước cử chỉ đầu tiên. `resume()` cả khi `state` là `'suspended'` **hoặc** `'interrupted'`. Tab ẩn / `pagehide` → fade 0.2s rồi `ctx.suspend()`; hiện lại / `pageshow` → `resume()` (nếu bị chặn thì đợi cử chỉ kế). **Không** set `navigator.audioSession.type = 'playback'`: tôn trọng nút gạt im lặng của iPhone và **không cắt nhạc/cuộc gọi Teams** của người dùng (reviewer test với chuông bật). | WebKit chỉ coi `touchend` (không phải `touchstart`) là activation; Teams iPhone hay bị `interrupted`. |
| M02 | Store `music: { on: true, volume: 0.6 }`, khoá **`ran-xinh-music`** (JSON; lỗi/thiếu → mặc định). "Sound" (mute tổng) giữ nguyên, tắt **mọi thứ**; "Music" chỉ tắt nhạc. Sheet Pause: pill "Music on/off" cạnh "Sound" + thanh âm lượng `input[type=range]` 0–100 bước 10 (vùng chạm cao ≥ 44px, track pastel). Không thêm nút mới ở thanh trên hay `Corners`. | Gọn, đúng chỗ H02 đã đặt toggle. |
| M03 | Bản nhạc **"Moonlit Garden Lullaby"**: nhịp **3/4, 66 BPM**, giọng **F trưởng ngũ cung** (F G A C D) cho giai điệu, hoà âm F – Dm – B♭ – C (I–vi–IV–V); lớp: music-box (sine + họa âm ×3 rất nhẹ, tắt dần ~1.2s), pad ấm (triangle qua lowpass ≤ 900 Hz, attack ≥ 0.4s), bass tròn phách 1 (sine), "lấp lánh" thỉnh thoảng (sine cao, ≤ 1 lần/2 ô nhịp). Form 16 ô nhịp A(8) B(8), biến tấu theo seed mỗi vòng. Trần âm lượng nhạc ≤ 0.25 vào `master`. Thay **pad drone + ambient thứ** hiện tại khi chơi; Silent Night vẫn **chỉ nước**. | Êm, dễ thương, không buồn. |
| M04 | Trạng thái: `title`/`prologue` → "menu" (thưa, không bass, 70% gain, chỉ sau cử chỉ đầu); `ready`/`playing` → "play" (crossfade 1.5s); `paused` → fade 0.6s rồi dừng scheduler; resume → vào lại từ đầu ô nhịp kế; `dead` → ngân hết ô nhịp (≤ 2s) rồi về "menu"; **Moonrise Night** → "moonrise" (thêm lớp lấp lánh, lên G trưởng); Silent Night → không nhạc (nước). Ducking: `playEat`/`playBloom`/`playVerse`/`playDeath` hạ bus nhạc **−6 dB** (attack 20 ms, giữ 150 ms, nhả 400 ms). | Nhạc theo trải nghiệm, nhường SFX. |

## Thứ tự task (tóm tắt)

| # | ID | Mức | Branch | Nội dung |
|---|----|-----|--------|----------|
| 1 | C01 | Cao | `feat/c01-steering-tests` | Tách vòng lặp tick thành hàm thuần + test lái tốc độ cao (khoá 0 rơi, ≤ 1 tick) |
| 2 | C02 | Cao | `fix/c02-swipe-multitouch` | Vuốt theo một ngón (chạy khi giữ Dash) + khoá trục cho lượt rẽ thứ hai |
| 3 | C03 | Cao | `feat/c03-dpad-hit-zone` | Cả ô d-pad là vùng lái + trượt ngón đổi hướng + Dash giữ qua `ready` |
| 4 | C04 | Trung bình | `feat/c04-head-yaw-tick` | Đầu rắn quay kịp tick (≤ ~1 tick ở mọi tốc độ, không phụ thuộc fps) |
| 5 | V01 | Trung bình | `feat/v01-stat-numerals` | Số trên viên nang dễ đọc (lining numerals, Inter 600) |
| 6 | V02 | Trung bình | `feat/v02-pastel-touch-cluster` | D-pad + Dash pastel dễ thương (kích thước giữ nguyên) |
| 7 | V03 | Trung bình | `feat/v03-portrait-camera` | Bàn chơi dọc dùng hết chiều cao (`el` dọc 1.2, coach strip chỉ khi có coach) — từ H07 |
| 8 | V04 | Trung bình | `feat/v04-portrait-menus` | Title/Pause màn dọc: nút góc bấm được, title gọn ở 375×640 |
| 9 | V05 | Thấp *(tuỳ chọn)* | `feat/v05-coach-copy-device` | Copy coach theo thiết bị (touch / bàn phím) — từ H07, hỏi chủ repo trước |
| 10 | M01 | Cao | `feat/m01-audio-unlock-lifecycle` | Mở khoá iOS/Teams + vòng đời AudioContext (ẩn/hiện/interrupted), state machine thuần |
| 11 | M02 | Cao | `feat/m02-music-toggle-volume` | Music on/off + âm lượng (lưu `ran-xinh-music`) trong sheet Pause |
| 12 | M03 | Cao | `feat/m03-moonlit-lullaby` | Bản nhạc "Moonlit Garden Lullaby" procedural + scheduler |
| 13 | M04 | Trung bình | `feat/m04-music-states-ducking` | Nhạc theo trạng thái (menu/play/pause/dead/Moonrise/Silent) + ducking SFX |
| 14 | — | — | `docs/polish-closeout` | Cập nhật `AGENT.md` + bảng "Trạng thái" (xem cuối file) |

---

# Nhánh C — Cảm giác lái

## C01 — Vòng lặp tick thuần + test lái tốc độ cao

- [x] **C01** · Mức: **Cao** · Branch: `feat/c01-steering-tests`

**Mục tiêu**
Khoá bằng test cái đang đúng (hàng đợi rẽ, độ trễ ≤ 1 tick) **trên đúng vòng lặp engine dùng**, để C02–C04 và mọi thay đổi sau không làm hỏng. Task này **không đổi hành vi**.

**File**
- `src/three/tickClock.js`: thêm hàm thuần, ví dụ `runTicks(clock, dt, step)` — `clock = { accum, interval }`, cộng `dt`, lặp `while (accum >= interval)` gọi `step(tickDt)` (trả `{ dead, nextInterval }`), trừ đúng `tickDt`, `rescaleAccum` phần dư sang `nextInterval`, `guard > 6` → `accum = 0` — **đúng ngữ nghĩa** `engine.js` L1055–1087 hiện tại (AUDIT L6, P01).
- `src/three/engine.js`: frame loop gọi `runTicks` (chỉ thay khối while; `commitTick`, `handleEat`, `catchSpirit`, `handleDeath` vẫn ở engine qua callback `step`). Không cấp phát mỗi frame (P06): callback/`clock` tạo một lần.
- Mới: `src/game/steering.test.js` (hoặc mở rộng `tickClock.test.js`): mô phỏng như `polish/tooling/steer-sim.mjs` nhưng dùng `runTicks` thật + `createGame/turn/step/speedInterval`.
- `docs/plan/polish/tooling/steer-sim.mjs`: gọi `runTicks` thật thay cho bản sao vòng lặp (như `fit-prototype.mjs` sau H04) — không chép logic.

**Tiêu chí nghiệm thu**
- Test (chạy bằng `npm test`), seed cố định, ma trận 4 tốc độ × {30, 60, 120} fps:
  - Hai lượt rẽ ↑← và ↑→ cách nhau {0, 8, 16, 33, 50} ms, pha tick ngẫu nhiên, ≥ 50 lần mỗi ô: **0 lượt rẽ bị rơi**, 0 lần chết.
  - Một lượt rẽ: tick áp dụng nó đến **≤ 1.0 tick** sau input; frame đầu tiên vẽ hướng mới **≤ 1 tick + 1 frame** sau input.
  - Rẽ ngược với lượt **cuối trong hàng đợi** bị từ chối (ví dụ đang phải, hàng đợi [↑], bấm ↓ → `turn()` false) và không bao giờ gây chết.
  - `runTicks`: một frame `dt = 0.1` ở `interval` 0.0308 chạy đúng 3 tick, phần dư đúng; đổi interval sau tick giữ tỉ lệ (`rescaleAccum`); `guard`.
- Output `node docs/plan/polish/tooling/steer-sim.mjs` sau khi đổi sang `runTicks`: mục [1]–[3] **giống hệt** `polish/baseline/steer-sim-f9d1dd6.txt` (dán `diff`).
- `engine.test.js` cũ xanh, không nới.

**Kiểm chứng**
- `npm test`, `npm run build`, `diff <(node docs/plan/polish/tooling/steer-sim.mjs) docs/plan/polish/baseline/steer-sim-f9d1dd6.txt`.

---

## C02 — Vuốt theo một ngón (chạy khi giữ Dash) + khoá trục

- [x] **C02** · Mức: **Cao** · Branch: `fix/c02-swipe-multitouch`

**Vấn đề**
- `engine.js` L779–804 đọc `e.touches[0]` (mọi ngón trên màn hình) → giữ Dash + vuốt: **0 lượt rẽ** (S6, S7); nhả Dash giữa chừng → rẽ **sai hướng** (S8). Ngưỡng 18px không khoá trục → vuốt cong thêm lượt rẽ ngoài ý muốn (S3). `swipe-sim.mjs`: master **5/9**.

**Spec** (tham chiếu `polish/reference/swipeTracker.js`, quyết định C02)
- Mới: `src/game/swipe.js` — `createSwipeTracker({ threshold: 18, nextThreshold: 32, axisRatio: 1.5 })` thuần (không DOM): `start(e)`, `move(e) → key | null`, `end(e)`, `cancel()`; chỉ đọc `identifier`/`clientX`/`clientY` của `changedTouches`/`touches`.
- `engine.js`: `onTouchStart/Move/End/Cancel` dùng tracker; `requestTurn(key)` như cũ. Listener và `passive` giữ nguyên (không đổi `touch-action`). Lời gọi `unlock()` trong `touchstart` **giữ nguyên** ở task này (M01 xử lý).
- `swipe-sim.mjs`: thêm cờ chạy `src/game/swipe.js` thật (giữ bản sao master làm "before").

**Tiêu chí nghiệm thu**
- Mới `src/game/swipe.test.js`: port **đủ 9 kịch bản S1–S9** (mô hình màn hình cảm ứng như `swipe-sim.mjs`: `touches` = mọi ngón, `changedTouches` = ngón của event, sự kiện của ngón Dash **không** tới canvas) → **9/9 đúng**; thêm: vuốt 3 lượt L-L-L trong một cử chỉ (↑ 40, → 40, ↓ 40 px) cho đúng 3 lượt; `touchcancel` reset.
- `node docs/plan/polish/tooling/swipe-sim.mjs` (bản `src/`) → `swipe scenarios ok: 9/9`; bản master vẫn 5/9 (dán cả hai).
- Kiểm tra thủ công **bởi reviewer** trên iPhone (Teams + Safari): giữ Dash bằng ngón phải, vuốt hồ bằng ngón trái → rắn rẽ; nhả Dash giữa lúc vuốt → không rẽ sai. Muse ghi các bước này vào PR.

---

## C03 — Cả ô d-pad là vùng lái + trượt ngón + Dash giữ qua `ready`

- [x] **C03** · Mức: **Cao** · Branch: `feat/c03-dpad-hit-zone`

**Vấn đề**
- `OnScreenControls` (`Hud.jsx` L1383): mỗi `.dbtn` có `onPointerDown` riêng → chỉ **28.1%** ô 190×190 "sống"; không trượt ngón đổi hướng được. Dash `onPointerDown` không `setPointerCapture`; giữ Dash từ `ready` không boost (`setBoost` L687 bỏ qua ngoài `playing`).

**Spec**
- Mới (thuần): `padDirection(dx, dy, dead = 16)` (ví dụ trong `src/game/padInput.js`) → `'up'|'down'|'left'|'right'|null` theo trục trội; `null` trong vùng chết.
- `.dpad` nhận `onPointerDown` (tính hướng từ tâm rect, emit `turn`, `setPointerCapture`), `onPointerMove` (emit khi hướng đổi), `onPointerUp/Cancel` (thả). Các `.dbtn` vẫn hiển thị và có `aria-label` như cũ (bàn phím/screen reader không đổi), nhưng hit-test thuộc về `.dpad` (`pointer-events: none` trên `.dbtn` hoặc tương đương). Trạng thái nhấn hiển thị trên nút của hướng hiện tại (class, không re-render mỗi pointermove nếu hướng không đổi).
- Dash: `setPointerCapture` khi `pointerdown`; engine giữ cờ "Dash đang giữ" (từ inputBus) và **áp boost ngay khi vào `playing`** nếu cờ còn bật.
- Không đổi kích thước `.dpad`/`.btn-boost` → `hudLayout.test.js` (đồng bộ CSS) xanh không sửa.

**Tiêu chí nghiệm thu**
- Test thuần `padDirection`: tâm ±15px → `null`; (60, 10) → `right`; (−10, −60) → `up`; đường chéo (40, 39) → `right`; chuỗi điểm trượt ↑ → → → ↓ cho đúng chuỗi hướng (không lặp hướng trùng).
- `engine.test.js`: inputBus `boost: true` khi `ready` → sau `enterPlaying()` `isBoosting`/`setBoosting(true)`; `boost: false` sau đó tắt.
- Reviewer chạy `polish/tooling/portrait-shots.mjs` (cập nhật định nghĩa `padHit` = điểm mà `elementFromPoint` nằm trong `.dpad` và ngoài vùng chết) → `padHit ≥ 0.97` ở 5 viewport dọc (master: 0.281). Harness **0/0 ở 11 viewport**.
- Thủ công (reviewer, iPhone): đặt ngón giữa-trên pad rồi trượt quanh → rắn đổi hướng theo; chạm góc trống cũ của pad → vẫn rẽ.

---

## C04 — Đầu rắn quay kịp tick

- [x] **C04** · Mức: **Trung bình** · Branch: `feat/c04-head-yaw-tick`

**Vấn đề**
- `serpentBase.js` L444 `rig.yawView += dyaw * Math.min(1, dt * 20)` → đầu vẽ ra mất **108–117 ms** để quay xong (≤ 9°) **ở mọi tốc độ** → `dash` 2.6–2.8 tick, `worst` 3.5–3.8 tick; phụ thuộc fps (120 fps chậm hơn 60 fps).

**Spec** (quyết định C04)
- Hàm thuần, ví dụ `yawAlpha(dt, interval)` = `1 − Math.exp(−dt / Math.min(0.05, 0.25 * interval))` (trong `serpentPath.js` hoặc `tickClock.js`). `paint()` nhận `interval` hiện tại qua `paintParams` (engine đã có `interval.v`; gán vào object dùng chung — **không** cấp phát mỗi frame, P06). `rollView` giữ nguyên.
- `steer-sim.mjs` mục [4] dùng đúng `yawAlpha` từ `src/` (bỏ cờ `--yaw-tau-k` hoặc để nó trỏ vào hàm thật).

**Tiêu chí nghiệm thu**
- Test thuần: `yawAlpha` ∈ (0, 1]; đơn điệu theo `dt`; **độc lập fps**: sau tổng thời gian T như nhau, phần lệch còn lại khi chạy 30/60/120 fps chênh ≤ 1%; τ = 50 ms khi `interval` ≥ 0.2s.
- Output `steer-sim.mjs` [4] (dán): đầu vẽ ra settle **≤ 1.05 tick** ở 60 và 120 fps cho cả 4 tốc độ, **≤ 1.35 tick** ở 30 fps; `base` ≤ **140 ms** (không chậm hơn master). Tham chiếu: `polish/baseline/steer-sim-reference-yaw-k0.25.txt` (0.75–1.01 tick @60/120 fps).
- `snakeRig.test.js` cũ xanh. Thủ công (reviewer): Dash + rẽ chữ S liên tục → mặt rắn luôn nhìn theo hướng đi.

---

# Nhánh V — Đánh bóng màn dọc

> Mọi task V: harness **0/0 ở 11 viewport**, ảnh trước/sau bằng `polish/tooling/portrait-shots.mjs` ở 5 viewport dọc (do reviewer chạy, Muse ghi lệnh). Giữ phong cách pastel ánh trăng: không đổi bảng màu `--pastel-*`, không thêm font.

## V01 — Số trên viên nang dễ đọc

- [x] **V01** · Mức: **Trung bình** · Branch: `feat/v01-stat-numerals`

**Vấn đề**
- `.hud-stat__value` (styles.css L441) `Cormorant Garamond` 1.22rem chữ số kiểu cũ: "0" ≈ "o", "3" thòng xuống (`polish/images/before-p390-play.png`); nhãn 0.6rem = 9.6px.

**Spec** (quyết định V01)
- `.hud-stat__value`: `var(--font-ui)`, weight 600, `font-variant-numeric: lining-nums tabular-nums`, `font-size: 1.15rem`, `letter-spacing: 0.01em`; `.hud-stat__label` ≥ 0.64rem. Ô Dir (L454) giữ cỡ hiện tại nhưng đậm 600. Không đổi chiều cao thanh, không đổi `hudLayout.js`.

**Tiêu chí nghiệm thu**
- `portrait-shots.mjs` (reviewer): `statValue` = `Inter` 18.4px, `numeric` chứa `lining-nums`; `label` ≥ 10.24px ở 5 viewport; viên nang không tràn và không giao `.hud-actions` ở 375px **kể cả khi có ô Lantern Rush** (luật H03, chụp thêm ảnh Lantern Rush 375×667) — harness 0/0.
- Test: nếu thêm biến CSS mới thì `hudLayout.test.js` (hoặc test CSS mới đọc `styles.css`) khẳng định `.hud-stat__value` có `lining-nums` (để không ai đổi lại).
- Ảnh trước/sau `p390`, `teams375` (crop thanh trên ×2 cũng được).

---

## V02 — Cụm d-pad + Dash pastel

- [x] **V02** · Mức: **Trung bình** · Branch: `feat/v02-pastel-touch-cluster`

**Vấn đề**
- `.dbtn` (L610) 4 ô vuông tối rời rạc, `.btn-boost` (L567) cam–đỏ — lệch tông pastel (ảnh `polish/images/portrait-before-play.jpg`).

**Spec** (quyết định V02; làm **sau** C03 vì pad đã là một vùng)
- `.dpad` thành tấm nền bo 44px, nền/viền theo token HUD; `.dbtn` "kẹo" pastel mint, icon nét ≥ 2.5px; trạng thái nhấn (class từ C03) nền mint đặc; Dash gradient đào → vàng trăng, chữ/icon mực tối, glow đào; `:active` giữ scale nhẹ, tôn trọng `prefers-reduced-motion` (không animation mới khi reduced).
- Kích thước, vị trí, z-index **không đổi** → `clusterSize` + `hudLayout.test.js` xanh không sửa; không `backdrop-filter`.

**Tiêu chí nghiệm thu**
- Harness **0/0 ở 11 viewport**; `smallTaps=0`; rect `.dpad` 190×190 và `.btn-boost` 66/56px như master (dán JSON rect của `p390`, `l844t`).
- Tương phản icon mũi tên/nền nút ≥ **3:1**, chữ "Dash"/nền Dash ≥ **4.5:1** (ghi màu tính toán + tỉ lệ trong PR; công thức WCAG).
- Ảnh trước/sau 5 viewport dọc + `l844t`; ảnh trạng thái đang nhấn và đang Dash.

---

## V03 — Bàn chơi dọc dùng hết chiều cao (từ H07)

- [x] **V03** · Mức: **Trung bình** · Branch: `feat/v03-portrait-camera`

**Vấn đề**
- Bàn dọc nhỏ (`p390` 271px, `teams375` 247px) với dải trống 118–212px dưới bàn; `coachStrip` luôn được chừa dù coach chỉ hiện đêm đầu (xem bảng V ở trên).

**Spec** (quyết định V03)
- `src/three/cameraFit.js`: `alignedCamera({ …, coachVisible })` truyền xuống `hudReserve` (thêm tham số `coachVisible` — mặc định `true` để test cũ không đổi nghĩa) → `coachStrip` chỉ khi `coachVisible`; preset dọc: hàm thuần `presetFor(base, { w, h, coachVisible })` trả `el` 1.2 khi `w/h < 1 && !coachVisible`, nguyên preset trong mọi trường hợp khác.
- `engine.js`: `updateCameraTarget()` dùng `presetFor`, đọc `coachStep >= 0` từ store; subscribe thêm `coachStep` (chỉ khi đổi giữa hiện/ẩn) → fit lại. `topdown`/`cinematic` không đổi.
- `docs/plan/hud/tooling/fit-prototype.mjs` + `polish/tooling/portrait-fit.mjs`: gọi **đúng** `presetFor`/`alignedCamera` mới (không hằng `el: 1.0` riêng) → harness chiếu ô bàn đúng camera mới; harness thêm trạng thái "coach đã tắt" (click `.coach-card`) hoặc chạy thêm lượt với `ran-xinh-onboarded=1`.

**Tiêu chí nghiệm thu**
- Test `cameraFit.test.js`: với 5 viewport dọc, coach ẩn: chiều cao bàn trên màn hình **`p390` ≥ 320px, `teams375` ≥ 300px, `p375` ≥ 300px, `p414` ≥ 340px**; bề ngang mép gần **≥ master − 1px**; mọi ô 20×20 nằm ngoài rect thanh trên/cụm/safe-area (như test H04). Coach hiện (mọi viewport) và ngang/`d1280` (mọi trạng thái): `dist/lookX/lookZ` **giống hệt** master.
- Harness (reviewer): **0/0 ở 11 viewport** cả hai trạng thái coach hiện / coach tắt; dán output.
- **Chủ repo duyệt ảnh** `p390`, `teams375` trước/sau (rắn ở giữa bàn, thấy rõ mặt) trước khi merge — nếu chủ repo chọn `el` khác (1.1–1.2), sửa theo và ghi vào bảng "Quyết định" trong PR.

---

## V04 — Title/Pause màn dọc

- [x] **V04** · Mức: **Trung bình** · Branch: `feat/v04-portrait-menus`

**Vấn đề**
- `.sheet` (z 30) phủ `.chrome-actions` (z 10) → nút camera / touch pad / **mute** ở title và game over **không bấm được** (`polish/baseline/title-probe-f9d1dd6.txt`: "covered by overline"). Title cao 984px: cuộn ở 390×844, ở `teams375` khối chọn chế độ bị cắt.

**Spec** (quyết định V04)
- `.chrome-actions` z-index trên `.sheet` (biến `--z-*` mới nếu cần); `.sheet` ở bề rộng `< 560px` có `padding-top` chừa hàng nút góc.
- `TitleOverlay` (`Hud.jsx` L171): ở compact, Garden / How to play / Camera là một hàng 3 pill (≥ 44px); giảm khoảng dọc lockup (tagline, divider, journey bar). Không bỏ nội dung nào.
- Pause (`PauseOverlay` L542): hai nút hành động không xuống dòng ở 375px (cho phép chữ ngắn hơn hoặc xếp dọc khi không đủ chỗ).

**Tiêu chí nghiệm thu**
- `title-probe.mjs` (reviewer): tâm 3 nút góc → `visible` ở 390×844 và 375×640; 390×844: title **không cần cuộn** (`scroll` = null hoặc `sh ≤ ch`); 375×640: "Start playing" và cả 3 thẻ chế độ nằm trọn trong màn (bottom ≤ 640) không cuộn.
- Pause 375×667: không nút nào cao > 1 dòng chữ; mọi nút ≥ 44px (`states.mjs`/`portrait-shots.mjs`).
- Harness 0/0 (title không thuộc harness nhưng không được ảnh hưởng HUD khi chơi). Ảnh title + pause trước/sau ở `p390`, `teams375`.

---

## V05 — Copy coach theo thiết bị *(tuỳ chọn, hỏi chủ repo trước — từ H07)*

- [ ] **V05** · Mức: **Thấp** · Branch: `feat/v05-coach-copy-device`

**Ý tưởng**
- Bước 1 của coach (`Hud.jsx` L883): touch (cụm điều khiển hiện hoặc `pointer: coarse` — **chỉ để chọn chữ**, không dùng cho layout) → "Swipe the lake or tap the pad to steer — hold Dash to glide faster."; bàn phím → "Steer with WASD or the arrow keys — hold Space to dash." Chủ repo duyệt câu chữ.

**Tiêu chí nghiệm thu (nếu làm)**
- Hàm thuần chọn copy có test; thẻ coach vẫn ≤ `HUD.coachH` (92px) ở 11 viewport (harness, cả 3 bước); 0/0.

---

# Nhánh M — Nhạc nền

> Mọi task M: test với **mock `AudioContext`** (mở rộng mock trong `sound.test.js`; không thêm dependency). Dán kích thước gzip các chunk từ `npm run build` và so với `polish/baseline/bundle-f9d1dd6.txt`. Nghe thử là việc của **reviewer** (Muse không nghe được) — Muse ghi rõ cần nghe gì.

## M01 — Mở khoá iOS/Teams + vòng đời AudioContext

- [x] **M01** · Mức: **Cao** · Branch: `feat/m01-audio-unlock-lifecycle`

**Vấn đề**
- Unlock ở `touchstart` (không phải activation trên WebKit), không xử lý `'interrupted'`, không suspend/resume theo `visibilitychange`/`pagehide`/`pageshow` (xem "Hiện trạng M").

**Spec** (quyết định M01)
- Mới (thuần): `src/audio/musicState.js` — `audioLifecycle(state, event)` (reducer) với `state = { gestured, ctxState, hidden, wantRunning }`, event: `gesture`, `hidden`, `visible`, `pagehide`, `pageshow`, `ctxStateChange(s)` → trả state mới + danh sách hành động (`'create'`, `'resume'`, `'suspend'`, `'fadeOut'`). `musicTarget({ gestured, musicOn, muted, status, nightEvent, moonrise, hidden })` → `{ mode: 'off'|'menu'|'play'|'moonrise', gain }` (M02–M04 dùng; M01 chỉ cần `off`/có tiếng).
- `sound.js`: `ensureCtx()` chỉ chạy từ `unlockAudio()` trong activation event; `unlockAudio` resume cả `'interrupted'`; lắng nghe `ctx.onstatechange`. Một module nhỏ (ví dụ `src/audio/unlock.js`) gắn listener `pointerup`/`touchend`/`click`/`keydown` (`capture: true`, `document`), gỡ khi `running`; `visibilitychange`/`pagehide`/`pageshow` → reducer. Engine: bỏ `unlock()` trong `onTouchStart` (L781) — thay bằng listener ở trên; giữ `unlock()` trong `keydown` và lúc vào ván.
- Không đổi âm thanh nghe được ở task này (pad/ambient cũ giữ nguyên).

**Tiêu chí nghiệm thu**
- Test reducer: trước `gesture` không bao giờ có hành động `create`; `gesture` → `create` + `resume`; `ctxStateChange('interrupted')` + `gesture` → `resume`; `hidden` khi đang chạy → `fadeOut` rồi `suspend`; `visible` → `resume` nếu `wantRunning`; `pageshow` sau bfcache → `resume`; lặp `gesture` khi đã `running` → không hành động.
- Test `sound.js` (mock): `new AudioContext` được gọi **0 lần** trước `unlockAudio()`; `resume()` được gọi khi state `'interrupted'`; sau `suspend` không còn timer scheduler chạy (ambient/water `setInterval` dừng hoặc bỏ qua).
- Không lỗi console (reviewer: Safari iOS + Teams iPhone: mở game, vào ván → có tiếng; chuyển sang app khác 10s rồi quay lại → tiếng trở lại sau tối đa một lần chạm; khoá màn hình/mở → như trên). Bundle `index` gzip tăng ≤ 1.5 kB.

---

## M02 — Music on/off + âm lượng trong sheet Pause

- [x] **M02** · Mức: **Cao** · Branch: `feat/m02-music-toggle-volume`

**Spec** (quyết định M02)
- `store.js`: slice `music: { on, volume }`, `setMusicOn(on)`, `setMusicVolume(v)` (kẹp 0–1, làm tròn 0.1), đọc/ghi `ran-xinh-music` (JSON lỗi → mặc định `{ on: true, volume: 0.6 }`).
- `sound.js`: bus `musicGain` (con của `master`) cho mọi giọng nhạc (pad, ambient, water); `setMusicOn`/`setMusicVolume` → `setTargetAtTime` (≤ 0.1s), không tạo/huỷ node khi kéo thanh âm lượng. "Sound off" (mute tổng) vẫn tắt mọi thứ.
- Sheet Pause (`SettingsToggles({ labelled: true })` + `PauseOverlay`): pill "Music on/off" (icon nốt nhạc, `aria-pressed`), thanh `input[type=range]` (`aria-label="Music volume"`, 0–100 bước 10) — chỉ hiện khi Music on và Sound on. Không đổi thanh trên/`Corners`.

**Tiêu chí nghiệm thu**
- Test store: mặc định, đọc JSON hỏng, kẹp/làm tròn, ghi đúng khoá; test sound (mock): `musicGain` nhận giá trị `volume` khi on, 0 khi off, không tạo node mới khi đổi volume 10 lần.
- `portrait-shots.mjs`/`states.mjs` (reviewer): mọi phần tử bấm trong sheet Pause ≥ 44px cao ở `p390` và `teams375`; ảnh sheet Pause trước/sau. Harness 0/0.
- Thủ công (reviewer): tắt Music → còn SFX; reload → giữ trạng thái/âm lượng. Bundle `index` gzip tăng ≤ 1 kB.

---

## M03 — Bản nhạc "Moonlit Garden Lullaby"

- [x] **M03** · Mức: **Cao** · Branch: `feat/m03-moonlit-lullaby`

**Spec** (quyết định M03)
- Mới: `src/audio/lullaby.js` — **thuần, không Web Audio**: `composeLoop(seed, arrangement)` → mảng nốt `{ t (beat), dur, midi, voice: 'box'|'pad'|'bass'|'sparkle', vel }` cho 16 ô nhịp 3/4; giai điệu chỉ dùng F G A C D (+ quãng tám), hợp âm F–Dm–B♭–C, biến tấu theo seed (PRNG nhỏ, không `Math.random` trong hàm thuần).
- Mới: `src/audio/music.js` — scheduler look-ahead (timer ≤ 250 ms, horizon ≤ 1.2 s, kẹp nốt quá hạn như T05 `planPhrases`), tạo giọng từ nốt (oscillator + gain envelope, nối vào `musicGain` của M02), **trần 10 oscillator đồng thời** (giọng cũ nhất bị cắt êm), `start(arrangement)` / `stop(fadeS)`.
- `startRunAudio()` (engine L840): khi không phải Silent Night → `music.start('play')` **thay** cho `setPadOn(true)` + `setAmbientOn(true)`; Silent Night vẫn `setWaterOn(true)`. Giữ `setAmbientPhase` như "độ sáng" (cutoff pad) theo tuần trăng. Code pad/ambient cũ: xoá nếu không còn ai dùng (cập nhật test tương ứng, giải thích trong PR).
- Thêm `polish/tooling/music-baseline.mjs` mục "lullaby" (chạy scheduler mới với mock 10 phút) để so với baseline.

**Tiêu chí nghiệm thu**
- Test `lullaby.js`: mọi nốt `box`/`sparkle` thuộc ngũ cung F (pitch class ∈ {F, G, A, C, D}); tại mỗi thời điểm không có cặp nốt cách **quãng 2 thứ** (1 hoặc 11 semitone mod 12) vang cùng lúc; cùng seed → cùng kết quả, seed khác → khác ≥ 20% nốt giai điệu; mật độ giai điệu 25–60 nốt/phút ở 66 BPM; im lặng dài nhất của lớp giai điệu ≤ 4s.
- Test `music.js` (mock, 10 phút giả lập): ≤ **10** oscillator đồng thời mọi lúc; ≤ **160** oscillator tạo ra/phút; không lên lịch nốt nào ở quá khứ sau khi tab "ngủ" 30s; `stop()` dừng timer và ngắt node sau fade; trần gain bus nhạc ≤ 0.25.
- Hiệu năng: thời gian JS của một lần chạy scheduler ≤ **0.5 ms** trong Node (đo bằng `performance.now()` trong test, 1000 lần, lấy p95 — ghi số). Bundle: tổng M01–M03 ≤ +5 kB gzip so với baseline.
- Reviewer nghe thử (desktop + iPhone): êm, sáng, không chói, không click/pop khi start/stop; ghi nhận xét. Không lỗi console.

---

## M04 — Nhạc theo trạng thái + ducking SFX

- [ ] **M04** · Mức: **Trung bình** · Branch: `feat/m04-music-states-ducking`

**Spec** (quyết định M04)
- `musicTarget()` (M01) trả đủ các chế độ: `title`/`prologue` (sau cử chỉ đầu) → `menu`; `ready`/`playing` → `play`, hoặc `moonrise` khi `moonriseActive`; `paused`/tab ẩn → `off`; `dead` → giữ `play` tối đa 2s (ngân ô nhịp) rồi `menu`; Silent Night → `off` (nước do `setWaterOn` lo); `music.on === false` hoặc `muted` → `off`.
- Engine/store subscribe gọi một hàm `applyMusic(target)` duy nhất (crossfade 1.5s khi đổi arrangement, fade 0.6s khi `off`, resume vào đầu ô nhịp kế).
- Ducking: `playEat`/`playBloom`/`playVerse`/`playDeath` gọi `duckMusic()` → bus nhạc −6 dB (attack 20 ms, giữ 150 ms, nhả 400 ms); nhiều SFX liên tiếp không chồng ducking sâu hơn −6 dB.

**Tiêu chí nghiệm thu**
- Test bảng `musicTarget` cho mọi `status` × {Silent, Moonrise, thường} × {music on/off} × {muted} × {gestured/chưa}; không bao giờ ra `menu`/`play` khi chưa `gestured`.
- Test (mock): đổi `play → paused → playing` → gain về 0 trong ≤ 0.7s, scheduler dừng khi `off`, chạy lại khi resume; 3 lần `playEat` trong 100 ms → gain thấp nhất ≥ volume × 0.5 (−6 dB) và về lại volume sau ≤ 0.6s.
- Không lỗi console; bundle tổng M01–M04 ≤ **+6 kB gzip** (`index` ≤ 79.8 kB gzip). `engine.test.js` (`destroy()` dừng nhạc + gỡ listener unlock/visibility) xanh.
- Reviewer nghe thử: title (sau một chạm) có nhạc "menu" nhẹ; vào ván chuyển mượt; Pause im; Moonrise Night sáng hơn; Silent Night chỉ có nước; ăn mồi nghe rõ trên nền nhạc.

---

## Khi hoàn thành tất cả

- Mọi checkbox ở trên đã được tick qua các PR tương ứng (V05 chỉ khi chủ repo yêu cầu).
- Mở một PR cuối `docs/polish-closeout`:
  - Cập nhật `AGENT.md`: vòng lặp `runTicks`, `swipe.js`/`padDirection` (vuốt một ngón, cả pad là vùng lái), `yawAlpha`, preset dọc + `coachVisible` trong fit, layout title/Pause dọc, hệ âm thanh (unlock/lifecycle, `ran-xinh-music`, `musicTarget`, lullaby + ducking, không file âm thanh); mục "Quy tắc cho agent" tham chiếu `docs/plan/POLISH_PLAN.md`. Mọi tên nhắc tới phải tồn tại (`rg <tên> src`, liệt kê lệnh trong PR).
  - Cập nhật mục "Trạng thái" bên dưới: số PR + ghi chú ngắn cho từng task, kèm **output cuối trên `master`**: `steer-sim.mjs` (tóm tắt [1], [3], [4]), `swipe-sim.mjs` (9/9), harness 11 viewport (0/0), `portrait-shots.mjs` (5 dòng), `music-baseline.mjs`, kích thước gzip các chunk.

### Trạng thái

| Task | PR | Ghi chú |
|------|----|---------|
| C01 | — | |
| C02 | — | |
| C03 | — | |
| C04 | — | |
| V01 | — | |
| V02 | — | |
| V03 | — | |
| V04 | — | |
| V05 | — | Tuỳ chọn — chỉ làm khi chủ repo yêu cầu. |
| M01 | — | |
| M02 | — | |
| M03 | — | |
| M04 | — | |
| Closeout | — | |
