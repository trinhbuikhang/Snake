# Kế hoạch hiệu năng + skin rắn — dành cho Muse AI

> **Người thực hiện:** Muse AI
> **Người duyệt:** chủ repo (trinhbuikhang)
> **Nguồn:** báo cáo đo hiệu năng (giật/"lác lác") và prototype skin đã được chủ repo duyệt (skins v2) ngày 21/10/2026. Tư liệu tham chiếu: [`docs/plan/skins/`](./skins/README.md) — đọc README đó trước khi bắt đầu.
> **Mốc code khi đo:** `master` @ `fe422f4`. Số dòng (Lxx) bên dưới tham chiếu commit này; nếu code đã dịch chuyển, hãy tìm theo tên hàm/đoạn code, không sửa mù theo số dòng.

## Mục đích

Hai việc, làm theo thứ tự:

1. **Track P — Hiệu năng (làm trước, PR nhỏ).** Người chơi thấy rắn "giật giật". Đo đạc cho thấy nguyên nhân chính là **chuyển động không đều trong mỗi tick** (easing), **khựng do biên dịch shader** khi mồi xuất hiện lần đầu, và **chi phí GPU/fill-rate** cao hơn cần thiết.
2. **Track S — Skin rắn.** Thay rắn "chuỗi ngọc trai" bằng **rig ống liên tục** (một mesh, số draw call không tăng theo độ dài), thêm 2 skin đã duyệt **Moon Jade ("Ngọc trăng")** và **Plush Moon ("Gấu bông")**, hệ thống chọn/mở khoá skin, và camera mặc định gần hơn để nhìn rõ rắn.

Prototype đầy đủ đã chạy được (xem `docs/plan/skins/reference/`). Nhiệm vụ của Muse là **port sạch** vào `src/` theo từng task, có test, có ảnh kiểm chứng — không dán nguyên patch.

## Quy tắc làm việc (bắt buộc)

1. **Làm từng task một, đúng thứ tự trong danh sách.** Track P trước, Track S sau. Không bắt đầu task sau khi PR của task trước chưa được chủ repo merge (trừ khi chủ repo cho phép khác). Task đánh dấu *(tuỳ chọn)* chỉ làm khi chủ repo bảo.
2. **Mỗi task = một branch + một PR**, dùng đúng tên branch ghi trong task (ví dụ `perf/p01-linear-motion`), tạo từ `master` mới nhất.
3. **PR nhỏ và đúng phạm vi.** Không refactor, đổi format hay sửa "tiện tay" code không liên quan. Thấy lỗi khác → ghi vào mục "Phát hiện thêm" trong mô tả PR, đừng sửa.
4. **Không bao giờ ghi "test pass" nếu file test và lệnh chạy test không được commit trong repo và chạy được bằng `npm test`.** Kiểm tra thủ công/sandbox thì ghi rõ "kiểm tra thủ công, không có test tự động".
5. **`npm test` và `npm run build` phải xanh trong mọi PR.** Giữ mọi test hiện có xanh (không xoá/nới test cũ để cho qua; nếu hành vi đổi có chủ đích thì sửa test và giải thích trong PR). **Logic mới phải có test mới** (ưu tiên tách hàm thuần, test trong Node, không cần WebGL).
6. **Mô tả PR bắt buộc có 3 phần:**
   - **Đã thay đổi gì** (file + tóm tắt).
   - **Đã kiểm chứng thế nào**: lệnh chính xác đã chạy + output thật (dán nguyên văn, có thể rút gọn phần dài nhưng không bịa). Tối thiểu: output `npm test` (số test/số pass) và dòng cuối `npm run build`.
   - **Ảnh chụp màn hình** cho mọi thay đổi có ảnh hưởng hiển thị (trước/sau khi có thể).
7. **Tick checkbox của task trong file này (`docs/plan/SKINS_PERF_PLAN.md`) ngay trong PR của task đó.**
8. **Gặp điểm mơ hồ thì dừng lại và hỏi chủ repo**, không đoán. Các mục trong "Quyết định đã chốt" là cuối cùng; nếu code thực tế mâu thuẫn với quyết định, dừng và báo.
9. **Ảnh/file nhị phân phải commit bằng git thật** (không qua API chỉ nhận text). Ảnh trong PR/tài liệu phải mở được (PNG bắt đầu `89 50 4e 47`, JPEG bắt đầu `ff d8 ff`).
10. **Không đo FPS trong Chrome headless/SwiftShader rồi coi là số thật** (headless chạy ~2 fps). FPS phải đo trên máy thật (ghi rõ máy, trình duyệt, màn hình Hz). Số draw call, số shader program, thời gian JS của frame thì đo headless được.
11. **Không commit hook debug `window.__perf` / `?perf`** của prototype. Chỉ dùng tạm cục bộ khi chạy tooling.
12. Không push thẳng lên `master`, không force-push, không sửa lịch sử git.

## Quyết định đã chốt

| Task | Quyết định | Lý do |
|------|-----------|-------|
| Chung | Track P làm trước Track S. Rig mới (S01) thay hẳn rig ngọc trai; rig cũ chỉ còn qua `?rig=old` để debug/so sánh, **không** có trong picker. | Rig ống giải quyết luôn việc draw call tăng theo độ dài (130 → 486). |
| P01 | Chuyển động tuyến tính, vận tốc không đổi dọc đường đi; khi bật/tắt boost giữa tick thì **giữ nguyên tiến độ (tỉ lệ) của tick hiện tại**. | Easing theo từng tick làm vận tốc dao động 11.4 → 0.4 ô/s trong mỗi tick. |
| P03 | Bắt đầu ở DPR tối đa **1.5**, shadow map **1024**, `antialias: false` khi có composer. | Fill-rate là nút thắt; khác biệt hình ảnh rất nhỏ dưới bloom. |
| S04 | Khoá localStorage **`ran-xinh-skin`** = `{ owned: string[], selected: string }`; skin mặc định `moonJade`. Dữ liệu lỗi/thiếu/id lạ → rơi về mặc định, không crash. | Đúng tiền tố `ran-xinh-` (AGENT.md quy ước 4). |
| S04 | Tên hiển thị: **tiếng Anh là tên chính** ("Moon Jade", "Plush Moon"), tên tiếng Việt ("Ngọc trăng", "Gấu bông") là dòng phụ nhỏ. *(Prototype đang để ngược lại; nếu chủ repo muốn giữ như ảnh `skin-picker.png` thì báo trong PR — chủ repo quyết.)* | AGENT.md: giọng sản phẩm tiếng Anh, giữ chủ đề mực Việt. |
| S04 | Màu ink chỉ là **điểm nhấn nhẹ** trên skin (rim, hạt, chỉ vàng), không nhuộm cả thân. | Skin phải giữ được nhận diện. |
| S06 | Moon Jade: **miễn phí, mặc định**. Plush Moon: mở bằng **800 ☾ moonlight** trong Garden **hoặc** tự mở khi hoàn thành **Moonrise Night** đầu tiên (điều kiện nào đến trước). | 800 ☾ nằm giữa giá ink Gold (500) và Crimson (900), tương đương vài đêm chơi; Moonrise là cột mốc có sẵn. |
| S06 | **Không có thanh toán tiền thật** trong kế hoạch này. Chỉ để ghi chú "future work". | Ngoài phạm vi (không backend/tài khoản). |
| S05 | Chỉ đổi preset `aligned` (mặc định). `topdown`, `cinematic` giữ nguyên. | Giảm rủi ro. |

## Thứ tự task (tóm tắt)

| # | ID | Mức | Branch | Nội dung |
|---|----|-----|--------|----------|
| 1 | P01 | Cao | `perf/p01-linear-motion` | Chuyển động tuyến tính đều + hết giật khi bật boost giữa tick |
| 2 | P02 | Cao | `perf/p02-shader-precompile` | Không khựng do biên dịch shader (foodLight, `compileAsync`, `checkShaderErrors`) |
| 3 | P03 | Cao | `perf/p03-gpu-cost` | Giảm chi phí GPU: antialias, MSAA, DPR 1.5, shadow 1024, nước rẻ hơn |
| 4 | P04 | Trung bình | `perf/p04-governor-refresh` | Governor so với tần số màn hình + frame spike |
| 5 | P05 | Trung bình | `perf/p05-hud-blur` | Bỏ `backdrop-filter` trên HUD khi chơi |
| 6 | P06 | Thấp *(tuỳ chọn)* | `perf/p06-alloc-hygiene` | Dọn cấp phát lặt vặt (mỗi lần ăn/mỗi tick) |
| 7 | S01 | Cao | `feat/s01-serpent-rig` | Rig ống liên tục `serpentBase` thay rắn ngọc trai |
| 8 | S02 | Cao | `feat/s02-skin-moon-jade` | Skin Moon Jade ("Ngọc trăng") |
| 9 | S03 | Cao | `feat/s03-skin-plush-moon` | Skin Plush Moon ("Gấu bông") |
| 10 | S04 | Cao | `feat/s04-skin-registry-picker` | Registry + store + picker trong Garden |
| 11 | S05 | Trung bình | `feat/s05-camera-fit` | Camera mặc định fit sát bàn chơi, chừa chỗ HUD |
| 12 | S06 | Trung bình | `feat/s06-skin-unlocks` | Mở khoá skin bằng moonlight/cột mốc, sẵn sàng cho bộ sưu tập |
| 13 | D01 | Trung bình | `docs/d01-agent-md-skins` | Cập nhật `AGENT.md` (rig, skin, camera, perf) |
| 14 | S07 | Thấp *(tuỳ chọn, sau)* | `feat/s07-skin-showcase` | Khoảnh khắc cận cảnh: preview xoay, cận mặt ở prologue/game over |

---

# Track P — Hiệu năng

## P01 — Chuyển động tuyến tính đều + giật khi bật boost

- [x] **P01** · Mức: **Cao** · Branch: `perf/p01-linear-motion`

**Vấn đề**
- `src/three/snakeRig.js` L18 `easeOutQuad`, L286 `const bt = easeOutQuad(t)`: mỗi đốt được nội suy từ ô cũ sang ô mới bằng easing **trong từng tick**. Đầu rắn lao nhanh đầu tick rồi gần như dừng cuối tick. Đo bằng `tooling/motion-sim.mjs` (màn 60Hz, interval 0.165s): vận tốc đầu rắn dao động **11.4 → 0.4 ô/s** trong mỗi tick (trung bình 6.06). Với nội suy tuyến tính: **hằng 6.06 ô/s**. Đây là cảm giác "lác lác" chính.
- Boost giữa tick: `src/three/engine.js` L476–483 (`setBoost`) và L807 tính lại `interval.v` ngay, trong khi L863 `paintT = clamp01(accum / interval.v)`. Bật boost khi tick đang đi được nửa (accum 0.08 / 0.165 ≈ 0.5) → interval còn 52% (`BOOST_MULTIPLIER = 0.52`) → `paintT` nhảy lên ~0.93 trong một frame = rắn **giật tới trước**; tắt boost → giật lùi.

**Hành vi mong muốn**
- Đầu và thân rắn di chuyển với vận tốc không đổi dọc đường đi (không easing theo tick). Hiệu ứng "chomp", bob, digestion bulge giữ nguyên.
- Bật/tắt boost giữa tick: tiến độ tick (tỉ lệ `accum / interval`) giữ nguyên, chỉ tốc độ đổi; không có bước nhảy vị trí.

**Tiêu chí nghiệm thu**
- `snakeRig.js`: nội suy vị trí dùng `t` tuyến tính (`easeOutQuad` không còn dùng cho vị trí; nếu không còn ai dùng thì xoá export, cập nhật test/mocks liên quan).
- Logic đổi interval khi boost tách thành hàm thuần, ví dụ `rescaleAccum(accum, oldInterval, newInterval)` (trong `src/game/logic.js` hoặc file mới `src/three/tickClock.js`), dùng ở `setBoost()` và chỗ tính lại `interval.v` mỗi frame (L807, L820).
- Test mới (chạy bằng `npm test`):
  - `rescaleAccum(0.0825, 0.165, 0.0858)` → `0.0429` (giữ tỉ lệ 0.5); không bao giờ trả giá trị ≥ `newInterval` (kẹp < 1 tick); interval không đổi → accum không đổi.
  - Mô phỏng 60 frame quanh một lần bật boost: `|paintT(frame n+1) − paintT(frame n)|` không vượt quá `dt / interval` mới + ε (không có bước nhảy).
- Thủ công trên máy thật: chơi 1 phút, bật/tắt boost liên tục — rắn trượt đều, không khựng/giật. Ghi máy + trình duyệt + Hz màn hình.
- (Tuỳ chọn) dán output `tooling/motion-sim.mjs` trước/sau.

**Tham chiếu:** rig mới `docs/plan/skins/reference/src/three/skins/serpentBase.js` (`paint()`: nội suy tuyến tính `lt`), `tooling/motion-sim.mjs`.

**Kiểm chứng**
- Output `npm test`, `npm run build`; mô tả kiểm tra thủ công.

---

## P02 — Không khựng do biên dịch shader

- [x] **P02** · Mức: **Cao** · Branch: `perf/p02-shader-precompile`

**Vấn đề**
- `src/three/garden.js` L917–919: `foodLight` (PointLight) nằm trong `planetsHolder` → `foodGroup` (L707, L724–726). `hideFood()` (L980–982) và màn title ẩn `foodGroup` → Three.js chỉ đếm đèn **đang hiện** → số point light đổi 1 ↔ 2 → **mọi vật liệu lit phải biên dịch lại** (`NUM_POINT_LIGHTS` là define của shader).
- Đo bằng `tooling/compile-probe.mjs` (headless): title 27 program; **mồi Earth đầu tiên: 27 → 35 program, frame JS 928 ms**; **Saturn đầu tiên: +2 program, 776 ms** (vật liệu vành đai). Trên máy thật ngắn hơn nhưng vẫn là cú khựng rõ ở đầu ván.
- `renderer.debug.checkShaderErrors` mặc định `true` (log probe: `checkShaderErrors = true`) → mỗi lần link program đều gọi đồng bộ `getProgramParameter`/`getShaderInfoLog`, chặn song song hoá biên dịch.

**Hành vi mong muốn**
- Số point light **không bao giờ đổi** trong suốt phiên: food light luôn "hiện", tắt bằng `intensity = 0`.
- Mọi program cần cho gameplay (tất cả hành tinh, mặt trời/supernova, burst, rig rắn và **mọi skin** sau Track S) được biên dịch trước khi người chơi bấm Start, bằng `renderer.compileAsync(scene, camera)` (có fallback `renderer.compile` nếu không có).
- `checkShaderErrors` chỉ bật ở dev: `renderer.debug.checkShaderErrors = import.meta.env.DEV`.

**Tiêu chí nghiệm thu**
- `foodLight` không còn là con của node bị ẩn (đưa ra `scene` hoặc giữ nhưng không ẩn cha); `hideFood()`/`setFood()` chỉ đổi `intensity` (và `setFoodGlow` vẫn đúng hệ số `foodGlowMult`). Tách logic cường độ thành hàm thuần (ví dụ `foodLightIntensity(activeKey, glowMult, visible)`) có test.
- Lúc load: bật tạm mọi `planets[*].group` (và vật liệu cần thiết) → `await renderer.compileAsync(scene, camera)` → trả lại trạng thái. Không làm chậm first paint (canvas vẫn fade-in như cũ); nếu `compileAsync` chưa xong mà người chơi bấm Start thì vẫn chạy bình thường.
- Probe (headless, dán output vào PR): số program **sau load** = số program sau khi lần lượt hiện đủ 6 loại mồi + supernova; mỗi "first X" trong `compile-probe` không tạo program mới và frame JS < 50 ms.
- `engine.test.js` (mock): `compileAsync` (hoặc `compile`) được gọi đúng 1 lần khi khởi tạo; `debug.checkShaderErrors` là `false` khi `import.meta.env.DEV` false (mock env).
- Sau Track S: S04 phải thêm việc biên dịch trước vật liệu của skin được chọn và biên dịch nền (idle) skin còn lại — ghi chú này vào PR P02 dưới dạng TODO cho S04.

**Tham chiếu:** `tooling/compile-probe.mjs`.

**Kiểm chứng**
- Output `npm test`, `npm run build`, output probe trước/sau.

---

## P03 — Giảm chi phí GPU (fill-rate)

- [x] **P03** · Mức: **Cao** · Branch: `perf/p03-gpu-cost`

**Vấn đề**
- `src/three/engine.js` L58 `antialias: true` dù đã render qua `EffectComposer` (L212–216) → MSAA của framebuffer mặc định gần như vô ích (composer đã có MSAA riêng) nhưng vẫn tốn bộ nhớ/băng thông.
- L59 + `QUALITY_STEPS` L95–101: bậc 0 là **DPR 2 + 4× MSAA trên cả hai render target** (L135–140) + bloom. Đo (perf.mjs, DPR 1, cửa sổ 1920×1080): composer 1920×1080 ×4 MSAA, HalfFloat. Ở DPR 2 là 3840×2160 ×4 — quá nặng cho GPU tích hợp/điện thoại.
- L160–161: shadow map 2048 cho mặt trăng (bóng chỉ trên bàn 20×20 ô; camera bóng ±16).
- `src/three/garden.js` L207–220: mặt nước phủ cả bàn là `MeshPhysicalMaterial` có `clearcoat: 1` (thêm một lớp BRDF trên mọi pixel của bàn chơi).
- `garden.js` L331: `cluster.castShadow = true` đặt trên `THREE.Group` — không có tác dụng (Group không vẽ), gây hiểu nhầm.

**Hành vi mong muốn**
- `antialias: !composer` (tức chỉ bật khi `reduced` không dùng composer). Lưu ý renderer được tạo trước composer — sắp xếp lại cho đúng.
- MSAA chỉ khi cần: DPR hiệu dụng ≥ 1.5 → 0 sample (răng cưa không thấy dưới bloom ở mật độ điểm ảnh cao); DPR < 1.5 → 4 sample trên target của scene. Giữ cơ chế `msaaRetargetNeeded` (T06).
- DPR tối đa lúc bắt đầu **1.5** (`QUALITY_STEPS[0].dpr = 1.5`); governor vẫn có thể hạ tiếp.
- Shadow map **1024** ở mọi bậc (hoặc 1024 → 512 ở bậc thấp nhất).
- Nước: `MeshStandardMaterial` (giữ `envMap`, `roughness`, `metalness`, `emissive`), bỏ clearcoat; chỉnh thông số để ảnh gần như cũ.
- Bỏ `cluster.castShadow` vô dụng (không bật bóng cho từng cây sậy — sẽ thêm shadow caster).

**Tiêu chí nghiệm thu**
- Test `engine.test.js` (mock WebGLRenderer): renderer tạo với `antialias: false` khi có composer; bậc 0 có `dpr ≤ 1.5`; shadow mapSize 1024.
- Test thuần cho quy tắc MSAA, ví dụ `msaaFor(dpr)` → `dpr >= 1.5 ? 0 : 4`.
- Ảnh trước/sau cùng góc máy (title + khi chơi) ở bậc chất lượng mặc định; khác biệt hình ảnh nhỏ (nước vẫn phản chiếu trăng).
- `perf.mjs` (headless) dán trước/sau: kích thước buffer composer, số sample, shadow size.
- Trên máy thật (nếu có): FPS khi chơi trước/sau, ghi rõ máy.

**Tham chiếu:** `tooling/perf.mjs`.

---

## P04 — Governor so với tần số màn hình + frame spike

- [x] **P04** · Mức: **Trung bình** · Branch: `perf/p04-governor-refresh`

**Vấn đề**
- `src/three/engine.js` L756–760 + `src/three/qualityGovernor.js` L81–86 (`settleWarmup`): "trần" `targetFps` = median FPS đo **trong lúc đang render ở bậc chất lượng cao nhất**. Máy yếu chạy được 35 fps ở bậc 0 sẽ học `targetFps ≈ 35` → `avgFps` không bao giờ < 0.75 × 35 → **không bao giờ hạ bậc**, dù màn hình 60Hz. Governor chỉ giúp được máy *sau đó* mới chậm đi.
- Chỉ dùng FPS trung bình cửa sổ 2.5s → frame spike (khựng 100–300 ms) bị trung bình hoá mất.

**Hành vi mong muốn**
- `targetFps` là **tần số màn hình ước lượng**, không phải tốc độ đang render: làm tròn median lên mức chuẩn gần nhất trong `[30, 60, 75, 90, 120, 144, 165, 240]` sao cho mức đó ≥ median × 0.95 (ví dụ median 35 → 60; 29.7 → 30; 58 → 60; 118 → 120). Có thể đo median trong beat `ready`/title nếu thấy ổn định hơn — ghi rõ lựa chọn.
- Thêm tiêu chí spike: một cửa sổ là "bad" nếu FPS trung bình < 0.75 × target **hoặc** ≥ 10% số frame dài hơn 2 × (1/target).
- Giữ nguyên hysteresis, phục hồi và chống dao động (`failedSteps`) của T06; máy 30Hz ổn định vẫn không bị hạ.

**Tiêu chí nghiệm thu**
- Hàm thuần mới trong `qualityGovernor.js`, ví dụ `snapRefresh(medianFps)` và mở rộng `nextQualityIdx(state, avgFps, spikeRatio)`; cập nhật `qualityGovernor.test.js`:
  - median 35 → target 60 → FPS 35 ổn định → hạ bậc sau 2 cửa sổ.
  - median 29.8 (máy 30Hz) → target 30 → không hạ.
  - FPS trung bình đạt nhưng 15% frame > 2× interval → cửa sổ bad.
  - Mọi test T06 cũ vẫn xanh (hoặc được sửa có giải thích nếu ngữ nghĩa đổi có chủ đích).
- Thủ công: Chrome DevTools → Performance → CPU throttling 4×/6× → governor hạ bậc trong ≤ 10s chơi (ghi lại bậc quan sát được qua log tạm — xoá trước khi commit).

---

## P05 — `backdrop-filter` trên HUD khi chơi

- [x] **P05** · Mức: **Trung bình** · Branch: `perf/p05-hud-blur`

**Vấn đề**
- `src/styles.css` dùng `backdrop-filter: blur(...)` ở: L122 `.sheet`, L307 `.icon-btn`, L363 `.chip`, L454 `.legend`, L535 `.dbtn`, L581 `.sheet-card`, L961–962 `.coach-card`, L1036 `.journal-ping`, L1343 `.prologue-card`.
- Canvas WebGL bên dưới đổi **mỗi frame** → trình duyệt phải làm mờ lại vùng dưới mỗi phần tử có blur mỗi frame. Khi chơi, các phần tử luôn hiện là pill điểm (`.chip`), nút góc (`.icon-btn`), d-pad (`.dbtn`, trên mobile), `.journal-ping`, `.coach-card` — đúng lúc cần frame budget nhất, nhất là trên mobile.

**Hành vi mong muốn**
- Các phần tử hiện **trong lúc chơi** (`.chip`, `.icon-btn`, `.dbtn`, `.journal-ping`, `.coach-card`, `.legend` nếu hiện khi chơi) dùng nền đặc trong mờ (ví dụ `rgba(8, 20, 16, 0.78)` + viền hiện có), không `backdrop-filter`.
- Sheet tĩnh (title/pause/game over: `.sheet`, `.sheet-card`, `.prologue-card`) có thể giữ blur nhưng giảm bán kính (≤ 8px); ghi rõ lựa chọn.

**Tiêu chí nghiệm thu**
- `rg -n "backdrop-filter" src/styles.css` không còn kết quả nào trong các selector ở trên dành cho lúc chơi (dán output).
- Ảnh trước/sau HUD khi chơi (desktop + mobile/DevTools device mode): độ tương phản chữ vẫn đọc tốt.
- Thủ công (nếu có máy thật): DevTools → Rendering → "Paint flashing"/Performance trace khi chơi, mô tả khác biệt.
- Không đổi layout/kích thước phần tử.

---

## P06 — Dọn cấp phát lặt vặt *(tuỳ chọn, ưu tiên thấp)*

- [x] **P06** · Mức: **Thấp** · Branch: `perf/p06-alloc-hygiene`

**Vấn đề**
- `src/three/garden.js` L1020–1066 (`burstAt`): mỗi lần ăn tạo nhiều `new THREE.Color(...)`/`new THREE.Vector3(...)`.
- `src/three/engine.js` L52 `cloneXZ` (`cells.map(...)`) được gọi mỗi tick (L315, L337, L658, L661) và trong demo (L384, L393).
- Ít ảnh hưởng FPS, nhưng góp phần GC nhỏ lẻ trên máy yếu.

**Hành vi mong muốn / nghiệm thu**
- Bảng màu burst là hằng số `Color` dựng một lần (theo `activeKey`); vị trí dùng `Vector3` scratch.
- Snapshot ô (`prevCells`/`curCells`) dùng lại mảng/đối tượng (double buffer) — **cẩn thận**: rig giữ tham chiếu qua `setSnapshots(prev, cur)`; đảm bảo không đổi nội dung mảng rig đang dùng giữa chừng. Có test cho helper copy-in-place.
- Không làm nếu chủ repo không yêu cầu. Ghi chú: tăng trưởng draw call theo độ dài rắn (130 → 486 ở độ dài 120) **được giải quyết bởi S01**, không làm ở đây.

---

# Track S — Skin rắn

Ảnh đích: `docs/plan/skins/images/concept-moon-jade.jpg`, `concept-plush-moon.jpg`. Kết quả prototype đã duyệt: `images/skins-v2-vs-concept.jpg`, `images/<skin>-face.jpg`, `images/<skin>-close-head.jpg`.

## S01 — Rig ống liên tục (`serpentBase`) thay rắn ngọc trai

- [x] **S01** · Mức: **Cao** · Branch: `feat/s01-serpent-rig`

**Vấn đề**
- `src/three/snakeRig.js` L86–99: mỗi đốt là một mesh riêng (`MAX_SEGMENTS` mesh + mesh "ridge" con), vật liệu `sharedMat.clone()` mỗi đốt → draw call tăng theo độ dài. Đo (`tooling/length-probe.mjs`): **130 draw call ở độ dài 3, 183 ở 20, 305 ở 60, 486 ở 120**.
- Lỗi ink: `setInk()` (L203–207) đổi `sharedMat.emissive`, nhưng thân dùng **bản clone** (L87) → màu ink không tới được thân rắn.
- Hình dáng "chuỗi hạt" rời rạc; mắt bị lún vào đầu.

**Hành vi mong muốn**
- Rig mới: **một ống liên tục** dựng lại tại chỗ mỗi frame từ đường đi trên lưới (góc bo bằng Bézier bậc 2, đuôi thon + nắp tròn), **đầu là khối tiện (lathe) liền với thân** (không phải quả cầu gắn vào), vị trí nội suy tuyến tính (như P01).
- **Cùng API `snakeRig`** để `engine.js` không phải đổi nhiều: `group`, `setSnapshots`, `setInk`, `setDir`, `onStep`, `onEat`, `startDeath`, `advanceDeath`, `reset`, `deathCoil`, `paint`, thêm `dispose()` và `skin`.
- **Không cấp phát mỗi frame**: buffer dựng sẵn theo độ dài tối đa (lưới 20×20 → tối đa 400 ô), cập nhật bằng `addUpdateRange`; draw call của rắn cố định (thân 1 + bóng 1 + đầu/mặt vài mesh tĩnh + hạt instanced 1).
- `rig.group` là điểm neo phía trên đầu cho head PointLight của engine (`engine.js` L883: `headLight.position.copy(rig.group.position)…`) — giữ hành vi này.
- Rig ngọc trai cũ chuyển thành `src/three/snakeRig.old.js`, chỉ nạp khi URL có `?rig=old` (debug/so sánh); `snakeRig.js` thành dispatcher `createSnakeRig(scene, skinId)`.
- Trong S01 chỉ cần **một skin trung tính tạm** (hoặc Moon Jade tối giản) để rig chạy; skin thật làm ở S02/S03.

**Tiêu chí nghiệm thu**
- Tách phần hình học thuần (không cần WebGL) để test được, ví dụ `src/three/skins/serpentPath.js`: `buildPath(points, out)` (bo góc, bước mẫu), `radiusAt(d, total, cfg)`, `writeTube(...)`. Test:
  - Đường thẳng 5 ô → số vòng (ring) đúng theo `STEP`; góc 90° → có `ARC_K` mẫu bo, bán kính bo ≤ `CORNER_R`.
  - Với chuỗi frame `t` tăng đều trong một tick, đầu rắn di chuyển quãng đường bằng nhau mỗi frame (sai số < 1%).
  - Rắn dài tối đa (400 ô) không tràn buffer (`MAX_RINGS`), draw range đúng.
  - Gọi `paint()` 100 lần: các `BufferAttribute` vẫn là cùng một đối tượng (không cấp phát lại).
  - `dispose()` gỡ mesh khỏi scene và dispose geometry/material (dùng mock như `dispose.test.js`).
- `engine.test.js` hiện mock `./snakeRig.js` — giữ test cũ xanh; thêm test `?rig=old` → dispatcher trả rig cũ.
- Headless (`length-probe.mjs`, dán output): draw call **không tăng** theo độ dài (prototype: ~114–122 tổng mọi pass, so với 130→486 trước đây).
- Ảnh trước/sau (`snake-look.mjs` hoặc chụp tay): rắn chữ S 16 ô, góc mặc định và cận đầu.
- Thủ công: ăn mồi (bulge chạy dọc thân), chết (coil), boost, đổi ink (thân đổi glow nhẹ — sửa lỗi ink), pause/resume, HMR không rò (T08).

**Tham chiếu:** `reference/src/three/skins/serpentBase.js` (toàn bộ rig: `profile()`, `buildPath()`, `radiusAt()`, `writeTube()`, `writeBeads()`, `api.place()` đặt chi tiết mặt lên bề mặt lathe, `tailCurl`, `H.sculpt`), `reference/src/three/snakeRig.js` (dispatcher), `reference/diffs/engine.js.diff` (phần `createSnakeRig(scene, …)` — **bỏ** phần `__perf`). Lưu ý từ prototype: winding index `(a, a+1, b), (b, a+1, b+1)` cho normal hướng ra ngoài; ma trận instance của hạt phải là hệ thuận tay phải (side, up, −tangent).

---

## S02 — Skin Moon Jade ("Ngọc trăng")

- [x] **S02** · Mức: **Cao** · Branch: `feat/s02-skin-moon-jade`

**Mục tiêu (so với `images/concept-moon-jade.jpg`)**
- Thân đồ chơi vinyl ngọc trắng ngà bóng (MeshPhysical: clearcoat, sheen bạc hà, iridescence nhẹ), dải bụng bạc hà có rãnh vảy bụng, **giả tán xạ dưới bề mặt** (glow trong: phía khuất sáng + lõi dày, bạc hà ở dưới → tím lilac ở trên), lấp lánh ngọc trai thưa (không có trên mặt). Không cháy trắng dưới bloom.
- **Hạt moonstone** dọc sống lưng: InstancedMesh (1 draw), óng ánh, glow mềm đổi màu hồng → lilac → xanh theo góc nhìn, có lõi sữa và lấp lánh; nhìn thấy được ở camera mặc định.
- Đầu hạt đậu to hơn thân (~1.6× bề ngang), chuyển liền vào thân không có "vai"; mắt to màu teal (con ngươi đen to, 2 đốm sáng) **ở mặt trước**; má hồng; nụ cười khép nhỏ; cánh hoa anh đào (shape có khía) trên đầu; đuôi thon kết thúc bằng **móc cuộn** (chỉ hiển thị, không ảnh hưởng lưới).
- Ink: chỉ đổi rim + glow hạt (lerp nhẹ về `ink.emissive`).

**File**
- Mới: `src/three/skins/moonJade.js`, đăng ký trong `src/three/skins/index.js`.

**Tiêu chí nghiệm thu**
- Ảnh `face`, `close-head`, `close-3q`, `default-cam` (cùng góc như `images/moonJade-*.jpg`) đặt cạnh concept trong PR; chủ repo duyệt bằng mắt.
- Draw call tăng thêm so với S01 ≤ 2 (hạt instanced + vài mesh mặt tĩnh); số shader program mới ≤ 2.
- Test: cấu hình skin hợp lệ (ví dụ test `createMoonJadeRig` với mock THREE hoặc test hàm cấu hình thuần: bán kính đầu > thân, `tailCurl` có, `beads.mesh.count` ≤ capacity sau `paint` với rắn 400 ô).
- Ink: đổi ink ở Garden → chỉ rim/hạt đổi màu (ảnh trước/sau).
- Không có lỗi console; `npm test` + `npm run build` xanh.

**Tham chiếu:** `reference/src/three/skins/moonJade.js`, `images/moonJade-*.jpg`, `images/skins-v2-vs-concept.jpg` (hàng 1).

---

## S03 — Skin Plush Moon ("Gấu bông")

- [x] **S03** · Mức: **Cao** · Branch: `feat/s03-skin-plush-moon`

**Mục tiêu (so với `images/concept-plush-moon.jpg`)**
- Chất nỉ/thú bông: lì (roughness ~0.95, sheen 1), noise sợi mịn, **viền lông tơ** ở silhouette (rim fuzz có noise), đường chỉ khâu đứt quãng dọc sống lưng (dừng ở trán).
- Lưng xanh da trời, bụng kem có vạch đốt; **sao + trăng khuyết thêu chỉ vàng**, dày hơn và có **nổi khối** (nhiễu normal theo gradient của mặt nạ chỉ thêu), sợi chỉ chéo, ánh kim.
- **Đầu rất to và tròn (~1.8× bề ngang thân)**, liền vào thân; **mõm kem nổi khối thật** (điêu khắc hình học bằng `H.sculpt`, màu kem theo đúng vùng đó), mi mắt ngủ cong + 3 sợi mi, má hồng tròn, 2 lỗ mũi chấm, miệng nhỏ.
- Ink: chỉ vàng lerp nhẹ về `ink.ridge`, rim về `ink.emissive`.

**File**
- Mới: `src/three/skins/plushMoon.js`, đăng ký trong `src/three/skins/index.js`.

**Tiêu chí nghiệm thu**
- Ảnh `face`, `close-head`, `close-3q`, `default-cam` cạnh concept trong PR (so với `images/plushMoon-*.jpg`).
- Draw call tăng thêm so với S01 ≤ 2 (mắt/mũi/miệng là vài mesh tĩnh dùng chung vật liệu); không thêm shader program ngoài vật liệu của skin.
- Test: hàm `sculpt` của mõm trả 0 xa vùng mõm và > 0 ở tâm; mặt nạ màu mõm trong shader dùng **cùng công thức** (ghi rõ hằng số dùng chung, ví dụ export `MUZZLE` từ một chỗ).
- `npm test` + `npm run build` xanh.

**Tham chiếu:** `reference/src/three/skins/plushMoon.js` (`plushGold()`, `muzzleW()`, chunk `normal` cho chỉ thêu nổi), `reference/src/three/skins/serpentBase.js` (`patchSerpentMaterial` hỗ trợ chunk `normal`, `H.sculpt`), `images/plushMoon-*.jpg`.

---

## S04 — Registry skin + store + picker trong Garden

- [x] **S04** · Mức: **Cao** · Branch: `feat/s04-skin-registry-picker`

**Hành vi mong muốn**
- `src/game/skins.js` (thuần, không Three/React): `SKINS` = `[{ id, name, nameVi, desc, unlock, swatch, accent }]`, `SKIN_IDS`, `DEFAULT_SKIN = 'moonJade'`, `skinById(id)`. Trường `unlock` khai báo luật mở khoá (dùng ở S06).
- `src/game/store.js`: state `skins: { owned, selected }`, persist `ran-xinh-skin` (xem "Quyết định đã chốt"); `hydrate()` đọc + **validate** (id lạ bị lọc, `selected` không thuộc `owned` → mặc định, JSON hỏng → mặc định); action `chooseSkin(id)` (chỉ chọn được skin đã sở hữu — trước khi có S06, Plush Moon **hiện khoá "Coming soon"**, không được chọn miễn phí trên production).
- `engine.js`: tạo rig theo `skins.selected`; subscribe đổi skin → **swap rig trực tiếp** (dispose rig cũ, áp lại garden/ink, `reset`, `setDir`), không reload trang; `?rig=old` không bị swap.
- `Hud.jsx` → `GardenOverlay`: mục "🐍 Serpent skin" (radiogroup, mỗi thẻ: preview swatch, tên, tên phụ, trạng thái worn/wear/locked). Picker chỉ ở Garden (màn title).
- Biên dịch trước vật liệu skin (TODO từ P02): skin đang chọn biên dịch lúc load; skin còn lại biên dịch nền khi rảnh (hoặc ngay trước khi swap) — swap không gây khựng > 100 ms (đo headless JS frame time).

**Tiêu chí nghiệm thu**
- Test `store.test.js`: hydrate với localStorage rỗng / JSON hỏng / id lạ / `selected` không thuộc `owned` → kết quả đúng; `chooseSkin` của skin chưa sở hữu không đổi state; chọn skin sở hữu → persist đúng key.
- Test `skins.test.js`: id duy nhất, `DEFAULT_SKIN` thuộc `SKIN_IDS`, `skinById` id lạ → mặc định.
- Test `engine.test.js` (mock rig): đổi `skins.selected` → `createSnakeRig` được gọi với id mới, `dispose` của rig cũ được gọi đúng 1 lần.
- Ảnh picker (so với `images/skin-picker.png`) + ảnh trước/sau khi đổi skin; reload vẫn giữ skin.
- Ink ở Garden vẫn hoạt động với cả 2 skin (chỉ là điểm nhấn).

**Tham chiếu:** `reference/src/game/skins.js`, `reference/diffs/store.js.diff`, `reference/diffs/Hud.jsx.diff`, `reference/diffs/styles.css.diff`, `reference/diffs/engine.js.diff` (`swapRig`), `tooling/picker.mjs`.

---

## S05 — Camera mặc định fit sát bàn chơi

- [ ] **S05** · Mức: **Trung bình** · Branch: `feat/s05-camera-fit`

**Vấn đề**
- `src/three/engine.js` L36 `FIT_HALF = 11.8` (bàn chỉ rộng ±10) + preset `aligned` L45–46 (`el: 1.05`, `distMult: 1.08`) + `updateCameraTarget()` L691–722 fit kiểu trực giao, nhìn vào gốc toạ độ → mép gần bị bó, **mép xa thừa ~1/3 màn hình**, rắn và mặt rất nhỏ. Đo: chiều cao bàn trên màn hình (NDC) 1.48 → prototype 1.66 (~12% to hơn theo chiều dài, ~26% diện tích). Xem `images/gameplay-cam-before-after.jpg`.

**Hành vi mong muốn**
- Preset `aligned` dùng **fit phối cảnh**: tìm khoảng cách gần nhất mà cả 4 góc bàn (±`BOARD_HALF` = 10.25, gồm viền) vẫn nằm trong lề NDC: ngang ≤ 0.97, **trên ≤ 0.80 (chừa chỗ pill HUD)**, dưới ≤ 0.93; điểm nhìn trượt về phía mép gần để bàn cân giữa theo chiều dọc; `el` ≈ 1.0 (thấp hơn một chút để thấy mặt rắn).
- `topdown`/`cinematic` giữ nguyên.
- Hàm fit chỉ chạy khi resize/đổi mode (không chạy mỗi frame, không cấp phát mỗi frame).

**Tiêu chí nghiệm thu**
- Tách hàm thuần, ví dụ `src/three/cameraFit.js` `fitAligned({ el, fov, aspect, boardHalf, margins })` → `{ dist, lookZ }`; test: với aspect 1.6 (desktop), 0.46 (điện thoại dọc 390×844), 2.17 (điện thoại ngang): mọi góc bàn chiếu vào trong lề yêu cầu (tự chiếu lại trong test), và giảm `dist` 2% thì có góc vi phạm (tức là gần nhất).
- Ảnh khi chơi **có HUD** ở desktop 1280×800 **và điện thoại dọc** (DevTools device mode, ví dụ iPhone 12/13 390×844) + điện thoại ngang: không ô nào của bàn bị HUD/d-pad che (so với `images/gameplay-hud-v2.jpg`). Nếu dọc bị d-pad che → thêm lề dưới riêng cho màn hẹp và ghi rõ.
- Ảnh trước/sau camera mặc định.

**Tham chiếu:** `reference/diffs/engine.js.diff` (`perspFit`, `fitsAt`, `BOARD_HALF`, `camLookTarget.set(0, 0, lookZ)`), `tooling/hudshot.mjs`, `images/gameplay-cam-before-after.jpg`, `images/gameplay-hud-v2.jpg`.

---

## S06 — Mở khoá skin (moonlight / cột mốc), sẵn sàng cho bộ sưu tập

- [ ] **S06** · Mức: **Trung bình** · Branch: `feat/s06-skin-unlocks`

**Hành vi mong muốn**
- Luật mở khoá khai báo dữ liệu trong `SKINS[*].unlock`, dạng danh sách "điều kiện nào đến trước":
  - `moonJade`: `[{ type: 'default' }]` — luôn sở hữu.
  - `plushMoon`: `[{ type: 'moonlight', cost: 800 }, { type: 'milestone', id: 'first-moonrise' }]`.
- Hàm thuần trong `src/game/skins.js`: `skinUnlockState(skin, ctx)` → `{ owned, buyable, cost, reasons }` với `ctx = { owned, balance, keepsakes, totals, … }`; `checkSkinMilestones(ctx)` → danh sách id vừa mở.
- Store: `buySkin(id)` (trừ moonlight như `chooseInk`, thêm vào `owned`, chọn luôn); hoàn thành Moonrise Night (`completeRun()` có `moonrise`) → mở `plushMoon` miễn phí nếu chưa có, ghi vào `pendingUnlocks`/`runUnlocks` như unlock khác để người chơi thấy (theo luật T10b).
- Picker: thẻ khoá hiện giá "☾ 800" + gợi ý "or complete a Moonrise Night"; đủ tiền → nút mua; không đủ → disabled có lý do.
- **Mở rộng sau:** thêm skin mới = thêm 1 mục `SKINS` + 1 file `src/three/skins/<id>.js` + đăng ký `index.js`; không sửa store/picker. Ghi checklist này vào `AGENT.md` (D01).
- **Không thanh toán tiền thật.** Ghi chú "Future work: in-app purchase cần backend/tài khoản — ngoài phạm vi (AGENT.md: Out of scope)".

**Tiêu chí nghiệm thu**
- Test `skins.test.js`: balance 799 → không mua được; 800 → mua được, balance còn 0, `owned` có `plushMoon`, `selected` đổi; milestone `first-moonrise` → mở miễn phí; mua skin đã sở hữu → không trừ tiền; mọi `SKINS[*].unlock` có `type` hợp lệ.
- Test store: dữ liệu `ran-xinh-skin` cũ (từ S04) vẫn đọc được (migration-safe); người đã có `plushMoon` trong `owned` không bị mất.
- Ảnh picker ở 3 trạng thái: khoá (không đủ tiền), mua được, đã mặc.

**Tham chiếu:** `reference/src/game/skins.js` (có `unlock` placeholder + `canUnlockSkin` trả `true` — **thay bằng luật thật**), `src/game/garden.js` (`INKS`, `LANTERN_COSTS` để so giá), luồng `chooseInk` trong `store.js` L689.

---

## D01 — Cập nhật `AGENT.md`

- [ ] **D01** · Mức: **Trung bình** · Branch: `docs/d01-agent-md-skins`

**Tiêu chí nghiệm thu**
- `AGENT.md` mô tả đúng code trên `master` lúc làm task:
  - Kiến trúc: `src/three/skins/` (`serpentBase.js`, từng skin, `index.js`), `snakeRig.js` là dispatcher, `snakeRig.old.js` + `?rig=old` chỉ để debug.
  - API rig, quy tắc không cấp phát mỗi frame, số draw call cố định, chunk shader `patchSerpentMaterial` (`common`/`color`/`roughness`/`normal`/`emissive`), `api.place()`, `H.sculpt`, `tailCurl`.
  - Skin registry `src/game/skins.js`, key `ran-xinh-skin`, luật mở khoá S06, checklist "thêm skin mới".
  - Camera `aligned` fit phối cảnh (S05) + lề HUD.
  - Thay đổi perf P01–P05 (chuyển động tuyến tính, precompile + food light không đổi số đèn, DPR 1.5/shadow 1024/antialias, governor theo tần số màn hình, HUD không blur khi chơi).
  - Mục "Quy tắc cho agent" tham chiếu `docs/plan/SKINS_PERF_PLAN.md`.
- Mọi tên hàm/hằng/khoá localStorage nhắc tới đều tồn tại (`rg <tên> src` có kết quả — liệt kê lệnh đã chạy trong PR).
- Chỉ sửa `AGENT.md` (và checkbox trong file này).

---

## S07 — Khoảnh khắc cận cảnh *(tuỳ chọn, làm sau)*

- [ ] **S07** · Mức: **Thấp** · Branch: `feat/s07-skin-showcase`

**Ý tưởng (hỏi chủ repo trước khi làm)**
- Picker: preview 3D xoay chậm của skin (canvas nhỏ dùng chung renderer hoặc render-to-texture, chỉ khi Garden mở; dừng hẳn khi đóng).
- Prologue / game over: camera lướt cận mặt rắn 1–2 giây (tôn trọng `prefers-reduced-motion` → bỏ qua), không ảnh hưởng gameplay hay thời gian `READY_BEAT_S`.
- Lý do: ở camera chơi, mặt rắn vẫn nhỏ; chi tiết mặt (mắt, má, cánh hoa, mõm) chỉ thấy rõ khi cận cảnh.

**Tiêu chí nghiệm thu (nếu làm)**
- Không tăng chi phí frame khi đang chơi (preview không render khi Garden đóng).
- Ảnh/GIF ngắn trong PR; `npm test` + `npm run build` xanh.

---

## Khi hoàn thành tất cả

- Mọi checkbox ở trên đã được tick qua các PR tương ứng.
- Mở một PR cuối `docs/skins-perf-closeout` cập nhật mục "Trạng thái" bên dưới: số PR cho từng task + ghi chú.

### Trạng thái

| Task | PR | Ghi chú |
|------|----|---------|
| P01 | — | |
| P02 | — | |
| P03 | — | |
| P04 | — | |
| P05 | — | |
| P06 | — | Tuỳ chọn |
| S01 | — | |
| S02 | — | |
| S03 | — | |
| S04 | — | |
| S05 | — | |
| S06 | — | |
| D01 | — | |
| S07 | — | Tuỳ chọn, làm sau |
