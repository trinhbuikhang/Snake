# Kế hoạch sửa lỗi sau audit — dành cho Muse AI

> **Người thực hiện:** Muse AI
> **Người duyệt:** chủ repo (trinhbuikhang)
> **Nguồn:** [`docs/audit/AUDIT.md`](./AUDIT.md) — đọc toàn bộ file này trước khi bắt đầu.
> **Mốc code khi audit:** `master` @ `1a7554b`. Số dòng (Lxx) bên dưới tham chiếu commit này; nếu code đã dịch chuyển, hãy tìm theo tên hàm/đoạn code, không sửa mù theo số dòng.

## Mục đích

Audit ngày 21/10/2026 phát hiện các lỗi trong phần việc Muse AI đã làm (PR #1–#16): ảnh PWA/OG hỏng trên production, phím tắt chiếm ô nhập liệu, workflow deploy fail 100%, không có test thật, cùng một số lỗi âm thanh/hiệu năng/teardown. File này chia việc sửa thành từng task nhỏ, có thứ tự và tiêu chí nghiệm thu kiểm chứng được.

## Quy tắc làm việc (bắt buộc)

1. **Làm từng task một, đúng thứ tự trong danh sách.** Không bắt đầu task sau khi PR của task trước chưa được chủ repo merge (trừ khi chủ repo cho phép khác).
2. **Mỗi task = một branch + một PR**, dùng đúng tên branch ghi trong task (ví dụ `fix/01-pwa-icons`), tạo từ `master` mới nhất.
3. **PR nhỏ và đúng phạm vi.** Không refactor, đổi format hay sửa "tiện tay" code không liên quan tới task. Nếu thấy lỗi khác, ghi vào mô tả PR mục "Phát hiện thêm", đừng sửa.
4. **Không bao giờ ghi "test pass" nếu file test và lệnh chạy test không được commit trong repo và chạy được bằng `npm test` (hoặc lệnh cụ thể ghi trong PR).** Kiểm tra trong sandbox riêng mà không commit thì phải ghi rõ là "kiểm tra thủ công, không có test tự động".
5. **Mô tả PR bắt buộc có 3 phần:**
   - **Đã thay đổi gì** (file + tóm tắt).
   - **Đã kiểm chứng thế nào**: lệnh chính xác đã chạy + output thật (dán nguyên văn, có thể rút gọn phần dài nhưng không bịa).
   - **Ảnh chụp màn hình** cho mọi thay đổi có ảnh hưởng hiển thị.
6. **Tick checkbox của task trong file này (`docs/audit/FIX_PLAN.md`) ngay trong PR của task đó.**
7. **Gặp điểm mơ hồ thì dừng lại và hỏi chủ repo**, không đoán. Các task có ghi "⚠️ Cần hỏi" thì phải hỏi trước khi code.
8. **Commit file nhị phân (ảnh) phải là nhị phân thật.** Nếu công cụ của bạn chỉ đẩy được file dạng text qua GitHub Contents API, hãy dừng và báo chủ repo — đó chính là nguyên nhân lỗi H1.
9. Không push thẳng lên `master`, không force-push, không sửa lịch sử git.

## Thứ tự task (tóm tắt)

| # | ID | Mức | Branch | Nội dung |
|---|----|-----|--------|----------|
| 1 | T01 | Cao | `fix/01-pwa-icons` | Decode 4 ảnh base64 + bump tên cache SW |
| 2 | T02 | Cao | `fix/02-input-shortcuts` | Chặn phím tắt khi đang gõ + cho phép dấu cách trong tên |
| 3 | T03 | Cao | `fix/03-pages-deploy` | Sửa hoặc gỡ workflow GitHub Pages (⚠️ cần hỏi) |
| 4 | T04 | Cao | `chore/04-vitest-ci` | vitest + `npm test` + CI chạy build & test |
| 5 | T05 | Trung bình | `fix/05-ambient-scheduler` | Nhạc nền: chặn dồn nốt + dừng khi pause |
| 6 | T06 | Trung bình | `fix/06-quality-governor` | Governor: ngưỡng, phục hồi, xử lý resize |
| 7 | T07 | Trung bình | `fix/07-sw-strategy` | Service worker cache đúng như comment |
| 8 | T08 | Trung bình | `fix/08-teardown` | Teardown/dispose + unsubscribe |
| 9 | T09 | Trung bình | `docs/09-agent-md` | Cập nhật `AGENT.md` |
| 10 | T10a–T10f | Thấp | xem từng mục | Nhóm lỗi mức thấp |

---

## T01 — Ảnh PWA/OG là văn bản base64

- [ ] **T01** · Mức: **Cao** (AUDIT H1) · Branch: `fix/01-pwa-icons`

**Vấn đề**
- `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-maskable-512.png`, `public/og-image.jpg` chứa **văn bản base64** (bắt đầu bằng `iVBORw0K…` / `/9j/4AAQ…`), không phải ảnh. Trình duyệt không decode được; bản live trên Cloudflare Workers cũng trả về base64 với `Content-Type: image/*`.
- Tham chiếu: `index.html` L26, L33 (og/twitter:image), L35–37 (manifest, icon, apple-touch-icon); `public/manifest.webmanifest`.
- Service worker (`public/sw.js` L11, `CACHE = 'moonlit-serpent-v2'`) đang cache bản hỏng ở client cũ.

**Hành vi mong muốn**
- 4 file là ảnh PNG/JPEG nhị phân hợp lệ; favicon, icon PWA, ảnh preview khi chia sẻ link hiển thị đúng.
- Client cũ bỏ cache chứa ảnh hỏng.

**Tiêu chí nghiệm thu**
- `head -c 8 public/icons/icon-192.png | xxd` cho `8950 4e47 0d0a 1a0a` (PNG signature); tương tự cho 2 icon còn lại. `head -c 3 public/og-image.jpg | xxd` cho `ffd8 ff`.
- Kích thước ảnh: icon-192 là 192×192, icon-512 và maskable là 512×512 (kiểm bằng `file` hoặc `python3 -c` đọc header), og-image ~1200×630.
- `public/sw.js`: `CACHE` đổi thành `'moonlit-serpent-v3'`.
- Trên bản build (`npm run build && npx vite preview`), mở `http://localhost:4173/icons/icon-192.png` thấy ảnh, không phải chữ.
- PR có ảnh chụp: tab trình duyệt hiển thị favicon + ảnh `og-image.jpg` mở trực tiếp.

**Gợi ý cách làm (không bắt buộc)**
```bash
for f in public/icons/icon-192.png public/icons/icon-512.png public/icons/icon-maskable-512.png public/og-image.jpg; do
  base64 -d "$f" > "$f.tmp" && mv "$f.tmp" "$f"
done
```
Commit bằng git thật (`git add` + `git commit`), không qua API dạng text. Nếu không làm được → dừng, báo chủ repo (quy tắc 8).

**Kiểm chứng**
- Dán output `xxd`/`file` của 4 file vào PR.
- Sau khi merge và Cloudflare deploy: `curl -s https://moonlit-serpent.trinhbuikhang060708.workers.dev/og-image.jpg | head -c 3 | xxd` phải ra `ffd8 ff`.

---

## T02 — Phím tắt toàn cục chiếm ô nhập tên

- [ ] **T02** · Mức: **Cao** (AUDIT H3) · Branch: `fix/02-input-shortcuts`

**Vấn đề**
- `src/three/engine.js` L449–503: `onKeyDown` gắn trên `window`, không kiểm tra `e.target`. Khi gõ trong `<input id="gardener-name">` (`src/components/Hud.jsx` L994–1002): Space gọi `st.start()` (đóng Journal, bắt đầu ván); W/A/S/D/H/J/K/L bị `preventDefault()` (L500) nên không gõ được; C/V đổi camera; P bị chặn; M bật/tắt tiếng.
- `src/game/store.js` L579–583: `setGardenerName` gọi `trim()` mỗi lần gõ → không gõ được dấu cách giữa các từ.

**Hành vi mong muốn**
- Khi focus đang ở `input`, `textarea`, `select` hoặc phần tử `contenteditable`, mọi phím tắt của game bị bỏ qua (kể cả Space, Esc chỉ blur hoặc không làm gì — chọn một và ghi rõ trong PR).
- Gõ được tên có dấu cách, ví dụ "Dao Vy Cass"; khoảng trắng đầu/cuối chỉ bị cắt khi lưu cuối cùng (blur/đóng Journal), giới hạn 24 ký tự giữ nguyên.
- Khi focus không ở ô nhập, phím tắt hoạt động như cũ.

**Tiêu chí nghiệm thu**
- Thủ công: Title → Journal → click ô tên → gõ `Dao Vy Cass` (có dấu cách và các chữ w/a/s/d/c/v/p/m) → giá trị ô là đúng chuỗi đó, Journal vẫn mở, trạng thái game vẫn `title`, mute không đổi.
- Đóng Journal → nhấn Space → game bắt đầu bình thường.
- Reload trang → tên đã lưu là `Dao Vy Cass` (đã trim đầu/cuối).
- Logic kiểm tra "đang gõ" nằm trong một hàm thuần có thể test (ví dụ `isTypingTarget(el)` trong `src/game/inputBus.js` hoặc file mới `src/game/keyboard.js`) để T04 viết test cho nó.

**Gợi ý cách làm (không bắt buộc)**
- Đầu `onKeyDown`: `if (isTypingTarget(e.target)) return` với `isTypingTarget = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))`.
- `setGardenerName`: chỉ `slice(0, 24)` khi gõ; thêm action `commitGardenerName()` trim + ghi localStorage khi `onBlur` / đóng Journal (hoặc trim khi đọc/vẽ lên thẻ chia sẻ).

**Kiểm chứng**
- Ảnh chụp Journal với tên có dấu cách đã gõ; mô tả các bước thủ công đã làm.

---

## T03 — Workflow GitHub Pages fail 11/11 lần

- [ ] **T03** · Mức: **Cao** (AUDIT H4) · Branch: `fix/03-pages-deploy`

> ⚠️ **Cần hỏi chủ repo trước khi code:** Bản live đang chạy trên **Cloudflare Workers** (`moonlit-serpent.trinhbuikhang060708.workers.dev`). Có cần GitHub Pages nữa không?
> - **Phương án A (mặc định nếu chủ repo muốn giữ Pages):** sửa workflow sang `actions/deploy-pages@v4`.
> - **Phương án B (nếu chỉ dùng Cloudflare):** xoá `.github/workflows/deploy.yml`.

**Vấn đề**
- `.github/workflows/deploy.yml` L41 `actions/upload-pages-artifact@v3` + L53 `actions/deploy-pages@v3` không tương thích → lỗi `Getting signed artifact URL failed … Failed to create deployment (status: 404)`. Mọi commit trên `master` có dấu X đỏ; `https://trinhbuikhang.github.io/Snake/` trả 404.
- L32–40: bước "Force Pages build type" dùng `curl -X PUT` lên Pages API, `| head -c 500` nuốt lỗi; không cần nữa (API đã báo `build_type: workflow`).

**Hành vi mong muốn**
- A: workflow chạy xanh, site có ở `https://trinhbuikhang.github.io/Snake/` và chạy được (base `./` trong `vite.config.js` đã hỗ trợ subpath).
- B: không còn workflow deploy Pages; không còn run fail.

**Tiêu chí nghiệm thu**
- A: `deploy-pages@v4`; bước `curl` bị xoá; run của PR/merge hiển thị ✅ (dán link run vào PR); mở URL Pages thấy màn title, không lỗi console.
- B: file workflow bị xoá; sau merge không có run "Deploy to GitHub Pages" mới.
- Cả hai: ghi trong PR phương án nào đã được chủ repo chọn.

**Gợi ý cách làm (không bắt buộc)**
- A: đổi `actions/deploy-pages@v3` → `@v4`, giữ `actions/configure-pages@v5` và `upload-pages-artifact@v3`. Lưu ý: workflow chỉ chạy trên `push` vào `master`, nên có thể phải chờ merge mới thấy kết quả deploy; dùng `workflow_dispatch` trên branch nếu chủ repo cho phép.

**Kiểm chứng**
- `gh run list --workflow "Deploy to GitHub Pages" --limit 3` (dán output), hoặc xác nhận file đã bị xoá.

---

## T04 — Hạ tầng test thật: vitest + `npm test` + CI

- [ ] **T04** · Mức: **Cao** (AUDIT H2) · Branch: `chore/04-vitest-ci`

**Vấn đề**
- Không có file test, không có script `test` trong `package.json`, dù PR #1–#16 ghi hàng trăm test pass. PR #1 và PR #16 mâu thuẫn nhau về nhánh "replace" của `turn()`.

**Hành vi mong muốn**
- `npm test` chạy được trên máy sạch (`npm ci && npm test`), không cần trình duyệt/WebGL.
- CI chạy `npm ci`, `npm run build`, `npm test` cho mọi PR và push lên `master`.

**Tiêu chí nghiệm thu**
- `vitest` trong `devDependencies`; `package.json` có `"test": "vitest run"`.
- Tối thiểu các file test sau, đều được commit:
  - `src/game/logic.test.js`:
    - `turn()`: từ chối quay đầu; từ chối trùng hướng; hàng đợi tối đa 3; khi đầy, chỉ thay lượt cuối và giá trị mới hợp lệ so với lượt trước đó; phím không hợp lệ trả `false`.
    - `step()`: tiêu thụ hàng đợi theo thứ tự; không bao giờ tự cắn do lượt trong hàng đợi (fuzz ≥ 1000 lần với seed cố định hoặc vòng lặp xác định); đâm tường → `cause: 'wall'`; Zen wrap; Lantern hết giờ → `cause: 'time'`.
    - `speedInterval()`: giảm theo `SPEED_STEP_EVERY`, kẹp ở `MIN_INTERVAL` trước khi nhân hệ số, boost nhân `BOOST_MULTIPLIER`.
  - Test cho hàm `isTypingTarget` từ T02.
  - Test store transitions (`start()` → `prologue` → `beginNight()` → `ready` → `enterPlaying()` → `playing`; `runUnlocks` nhận unlock giữa ván, bị xoá khi `start()`), mock `localStorage` nếu cần (`environment: 'jsdom'` hoặc stub đơn giản).
- Workflow CI mới, ví dụ `.github/workflows/ci.yml` (Node 20, `cache: npm`), chạy trên `pull_request` và `push` vào `master`; run của chính PR này xanh (dán link).
- Mô tả PR dán nguyên output `npm test` (số test, số pass).

**Gợi ý cách làm (không bắt buộc)**
- `npm i -D vitest` (thêm `jsdom` nếu test store). Giữ `logic.js` thuần, không mock Three.
- `Math.random` trong fuzz: dùng `vi.spyOn(Math, 'random')` với PRNG có seed.

**Kiểm chứng**
- `npm ci && npm run build && npm test` trên máy sạch; link run CI.

---

## T05 — Nhạc nền: dồn nốt sau khi tab chạy nền + không dừng khi pause

- [ ] **T05** · Mức: **Trung bình** (AUDIT M1) · Branch: `fix/05-ambient-scheduler`

**Vấn đề**
- `src/audio/sound.js` L434–441 (`planPhrases`): `while (nextPhraseAt < horizon)` không bù trễ. Khi tab ẩn, `setInterval` (L458) bị throttle nhưng `AudioContext` vẫn chạy → lúc quay lại, hàng loạt phrase được lên lịch ở thời điểm quá khứ và phát cùng lúc.
- `src/three/engine.js` L568–612: không có nhánh tắt ambient/pad khi `status === 'paused'`; engine pause khi blur/ẩn tab (L556–565) nhưng nhạc vẫn chạy.

**Hành vi mong muốn**
- Không bao giờ có nhiều phrase phát chồng do bù trễ: phrase quá hạn bị bỏ, lịch tiếp tục từ "bây giờ".
- Pause → ambient và pad fade out; resume → fade in lại (giữ moon phase hiện tại). Silent Night vẫn giữ tiếng nước như cũ.

**Tiêu chí nghiệm thu**
- Trong `planPhrases`, trước vòng lặp: `nextPhraseAt` được kéo lên tối thiểu `ctx.currentTime + ε` (ví dụ 0.1s).
- Test unit (chạy bằng `npm test`, mock `AudioContext` tối thiểu) chứng minh: khi `currentTime` nhảy +60s, một lần gọi `planPhrases` lên lịch ≤ số phrase vừa trong cửa sổ horizon 2s (không phải hàng chục).
  - Nếu cần export nội bộ để test, export qua tên rõ ràng như `__test__`.
- Thủ công: vào ván → nhấn P → nhạc tắt dần trong ≤ 1.5s; nhấn P lại → nhạc trở lại. Chuyển tab 2–3 phút rồi quay lại → không có tiếng dồn.

**Gợi ý cách làm (không bắt buộc)**
- `nextPhraseAt = Math.max(nextPhraseAt, ctx.currentTime + 0.1)`.
- Trong store subscriber của engine: `paused` → `audio.setAmbientOn(false); audio.setPadOn(false)` (và `setWaterOn(false)`); `playing` từ `paused` → bật lại theo cùng logic như khi vào ván (tách thành hàm `startRunAudio()` để dùng chung).

**Kiểm chứng**
- Output `npm test`; mô tả bước thủ công đã làm.

---

## T06 — Adaptive quality governor

- [ ] **T06** · Mức: **Trung bình** (AUDIT M2) · Branch: `fix/06-quality-governor`

**Vấn đề**
- `src/three/engine.js` L86–128, L682–700: ngưỡng cứng `avgFps < 45`; trên thiết bị bị giới hạn 30fps (iOS Low Power Mode, Chrome Energy Saver, màn 30Hz) governor hạ dần tới mức thấp nhất (tắt bloom) dù GPU đủ mạnh. Chỉ giảm, không bao giờ nâng lại. Đo cả ở title/prologue/pause.
- L658–661: `resize()` gọi `applyQuality()` → mỗi lần resize đều `dispose()` render target của composer (L111–118), kể cả khi số sample không đổi.

**Hành vi mong muốn**
- Ngưỡng tương đối theo tốc độ rAF "trần" của thiết bị (ví dụ < 75% của mức rAF ổn định đo được khi warmup, hoặc so với 60/30 tuỳ refresh rate đo được). Máy 30Hz ổn định ở 30fps không bị hạ chất lượng.
- Chỉ đo khi `status === 'playing'`.
- Có phục hồi: nếu FPS liên tục tốt trong một khoảng dài (ví dụ ≥ 10s) thì nâng một bậc; có hysteresis để không dao động lên xuống.
- `resize()` chỉ cập nhật kích thước; chỉ dispose/đặt lại `samples` khi bậc chất lượng thay đổi `msaa`.

**Tiêu chí nghiệm thu**
- Logic quyết định nâng/hạ tách ra hàm thuần (ví dụ `src/three/qualityGovernor.js`: `nextQualityIdx(state, sample)`), có test trong `npm test` cho: máy 30fps ổn định → không hạ; FPS tụt dưới ngưỡng 2 cửa sổ liên tiếp → hạ 1 bậc; FPS tốt kéo dài → nâng 1 bậc; không dao động khi FPS ở sát ngưỡng.
- Resize cửa sổ nhiều lần không gọi `renderTarget.dispose()` (kiểm bằng test hoặc log tạm trong lúc kiểm tra thủ công — log phải được xoá trước khi commit).
- Ảnh chụp trước/sau ở chất lượng cao nhất trên máy dev để chứng minh không đổi hình ảnh mặc định.

**Gợi ý cách làm (không bắt buộc)**
- Trong warmup, đo median frame interval → `targetFps`. Hạ khi `avg < 0.75 * targetFps`, nâng khi `avg > 0.92 * targetFps` liên tục N cửa sổ.
- Lưu `lastMsaa`; trong `applyQuality()` chỉ đổi `samples` + `dispose()` khi `q.msaa !== lastMsaa`.

**Kiểm chứng**
- Output `npm test`; ghi FPS và bậc chất lượng quan sát được khi bật Chrome DevTools → Rendering → giới hạn FPS (nếu có) hoặc CPU throttling.

---

## T07 — Service worker cache đúng như comment

- [ ] **T07** · Mức: **Trung bình** (AUDIT M3) · Branch: `fix/07-sw-strategy`

**Vấn đề**
- `public/sw.js` L6–7 ghi "Hashed static assets (assets/*): cache-first", nhưng L58–76 áp dụng cache-first cho **mọi** request same-origin không phải navigation (manifest, icons, og-image…) → tài nguyên không hash bị kẹt bản cũ đến khi đổi `CACHE`.
- L66: nhánh `res.type === 'opaque'` không bao giờ xảy ra (cross-origin đã bị bỏ qua ở L44).

**Hành vi mong muốn**
- Navigation: network-first (giữ nguyên).
- `/assets/*` (có hash): cache-first.
- Tài nguyên khác cùng origin (manifest, icons, og-image…): stale-while-revalidate — trả cache nếu có, đồng thời fetch bản mới để cập nhật cache.
- Comment đầu file mô tả đúng chiến lược thực tế; bỏ code chết.
- Bump `CACHE` (ví dụ `moonlit-serpent-v4`).

**Tiêu chí nghiệm thu**
- Trên bản build (`npm run build && npx vite preview`): lần tải thứ 2 trang được SW kiểm soát; `caches` chứa `/`, `/index.html`, `/assets/*`.
- Thay nội dung `dist/manifest.webmanifest` (thử nghiệm cục bộ, không commit), reload 2 lần → nhận bản mới mà không cần đổi `CACHE`.
- Offline (DevTools → Network → Offline) reload → game vẫn mở.
- PR ghi rõ các bước trên và kết quả.

**Gợi ý cách làm (không bắt buộc)**
- `const isHashed = url.pathname.includes('/assets/')` (lưu ý `base: './'`, so khớp theo segment `assets/`).

**Kiểm chứng**
- Ảnh chụp DevTools → Application → Cache Storage; mô tả bước offline.

---

## T08 — Teardown/dispose + unsubscribe

- [ ] **T08** · Mức: **Trung bình** (AUDIT M4) · Branch: `fix/08-teardown`

**Vấn đề**
- `src/three/engine.js` L173: `useGame.subscribe(...)` (áp dụng garden) không lưu hàm unsubscribe; `destroy()` không gọi.
- `destroy()` (L824–840) không dispose `composer`/`bloomPass`/render target; không dispose geometry/material/texture của `garden`, `rig`, `decor`, spirit; không tắt audio (`setAmbientOn(false)`, `setPadOn(false)`, `setWaterOn(false)`) → `setInterval` của ambient tiếp tục chạy sau unmount.

**Hành vi mong muốn**
- Sau `destroy()`: không còn listener store/window/canvas, không còn rAF, không còn timer audio, tài nguyên GPU được giải phóng.

**Tiêu chí nghiệm thu**
- Mọi `subscribe` trong engine có unsubscribe tương ứng trong `destroy()`.
- `destroy()` gọi `composer.dispose()` (hoặc dispose từng render target + pass), traverse `scene` để dispose `geometry`, `material` (kể cả mảng material) và mọi `texture` trên material, rồi `renderer.dispose()`.
- `destroy()` tắt ambient/pad/water.
- Kiểm tra thủ công: chạy `npm run dev`, sửa một file trong `src/three/` để trigger HMR 5 lần → `renderer.info.memory` (log tạm, xoá trước khi commit) không tăng dần; không có nhạc chồng lớp.
- Nếu tách hàm `disposeObject3D(root)` thuần thì có test trong `npm test` với object giả.

**Gợi ý cách làm (không bắt buộc)**
- `const unsubGarden = useGame.subscribe(...)`.
- Helper `disposeScene(scene)` duyệt `scene.traverse`, gom `Set` các geometry/material/texture rồi dispose một lần.

**Kiểm chứng**
- Mô tả bước HMR + số liệu `renderer.info.memory` trước/sau.

---

## T09 — Cập nhật `AGENT.md`

- [ ] **T09** · Mức: **Trung bình** (AUDIT M5) · Branch: `docs/09-agent-md`

**Vấn đề**
- `AGENT.md` L53: Status chỉ ghi `title | playing | paused | dead` (thiếu `prologue`, `ready`).
- L99: ghi luồng `title → prologue → playing` và "In-play whispers/verses still use floating toasts, rendered in a single `.toast-stack` column" — sai sau PR #9 (`ready`) và PR #13 (`runUnlocks`, `.toast-stack` đã bị xoá).
- Thiếu: `runUnlocks`/`JournalPing`, ambient score (`setAmbientOn`/`setAmbientPhase`), quality governor, `READY_BEAT_S`, lệnh `npm test` và CI (từ T04), các thay đổi của T01–T08.

**Hành vi mong muốn**
- `AGENT.md` mô tả đúng code hiện tại trên `master` tại thời điểm làm task.

**Tiêu chí nghiệm thu**
- Luồng trạng thái: `title → prologue → ready → playing ⇄ paused → dead`.
- Không còn nhắc `.toast-stack` / toast giữa ván; có mô tả `runUnlocks` + màn game over.
- Có mục Commands gồm `npm test`.
- Có mục "Quy tắc cho agent" bổ sung: không ghi test pass nếu không commit test; file nhị phân phải commit bằng git thật; tham chiếu `docs/audit/FIX_PLAN.md`.
- Mọi tên hàm/hằng/khóa localStorage nhắc tới đều tồn tại trong code (`rg <tên> src` có kết quả — liệt kê lệnh đã chạy trong PR).
- Chỉ sửa `AGENT.md` (và checkbox trong file này).

**Kiểm chứng**
- Dán danh sách lệnh `rg` đã chạy để đối chiếu.

---

## T10 — Nhóm lỗi mức thấp

Mỗi mục con là **một PR riêng**, làm theo thứ tự a → f. Tham chiếu chi tiết: AUDIT mục "Thấp" (L1–L8) và "Vấn đề có từ trước".

- [ ] **T10a** · Thấp (AUDIT L1) · Branch: `fix/10a-turn-queue`
  - **Vấn đề:** `src/game/logic.js` L158–193 — hàng đợi sâu 3 làm lượt thứ 3 trễ 3 tick; "replace" chỉ cho phép thay lượt cuối bằng hướng ngược của nó; comment nói quá ("always follows the player's latest steering intent").
  - ⚠️ **Cần hỏi chủ repo:** giữ depth 3 hay quay về 2? Có muốn bỏ các lệnh rẽ đã quá cũ (ví dụ > 2 tick) không?
  - **Nghiệm thu:** comment khớp hành vi thật; test trong `logic.test.js` mô tả đúng hành vi đã chọn; `npm test` xanh.
- [ ] **T10b** · Thấp (AUDIT L2) · Branch: `fix/10b-run-unlocks`
  - **Vấn đề:** `src/game/store.js` L811–815, L900–904 `.slice(-8)` cắt bớt unlock giữa ván; verse mở khi mua đồ trong Garden ở màn title (L616, L625, L638) bị đẩy vào `runUnlocks` rồi bị `start()` xoá (L488) mà người chơi không thấy.
  - **Nghiệm thu:** game over hiển thị đủ unlock của ván (hoặc "+N nữa trong Journal" nếu cắt); unlock khi ở `title` được hiển thị cho người chơi (ví dụ toast ngắn trong Garden overlay hoặc ping trên title) — ⚠️ hỏi chủ repo chọn cách hiển thị; test store trong `npm test`.
- [ ] **T10c** · Thấp (AUDIT L4) · Branch: `fix/10c-ready-blur`
  - **Vấn đề:** `src/three/engine.js` L556–560 chỉ pause khi `playing`; mất focus trong beat `ready` (L764–771) thì ván vẫn tự bắt đầu.
  - **Nghiệm thu:** blur/ẩn tab khi `ready` → ván không tự chạy (giữ ở `ready` hoặc chuyển `paused` sau khi vào `playing` — ghi rõ lựa chọn); kiểm tra thủ công có mô tả.
- [ ] **T10d** · Thấp (AUDIT L5) · Branch: `fix/10d-ambient-edge-cases`
  - **Vấn đề:** `src/audio/sound.js` L444–478: bật lại trong 1.6s sau khi tắt làm rò gain/filter cũ; `setAmbientOn(true)` khi chưa có `ctx` làm kẹt trạng thái; vẫn tạo oscillator khi mute.
  - **Nghiệm thu:** test với mock `AudioContext`: bật/tắt/bật nhanh không để node cũ còn kết nối; gọi khi chưa có ctx rồi có ctx → ambient chạy; khi mute không tạo oscillator mới.
- [ ] **T10e** · Thấp (AUDIT L3, L7, L8) · Branch: `chore/10e-perf-hygiene`
  - **Vấn đề:** claim "zero per-frame allocations" sai (`engine.js` L790 tạo object mỗi frame, L298–299 cấp phát mỗi tick); chunk `engine` 580 KB; `setTimeout` coach (`store.js` L533–537) không được clear.
  - **Nghiệm thu:** tái sử dụng object tham số `paint`; sửa comment cho đúng; build không còn cảnh báo chunk > 500 KB hoặc ghi lý do chấp nhận; timeout coach được lưu và clear khi rời `playing`. Dán output `npm run build`.
- [ ] **T10f** · Thấp (AUDIT L6 + "Vấn đề có từ trước") · Branch: `fix/10f-misc`
  - **Vấn đề:** URL OG hardcode domain workers.dev (`index.html` L25–26, L33); `engine.js` L745 `accum -= interval.v` trừ khoảng tick mới thay vì `tickDt`; `index.html` L7 `user-scalable=no` chặn zoom; `readJSON`/`writeJSON` (`store.js` L46–60) đặt tên gây hiểu nhầm.
  - ⚠️ **Cần hỏi chủ repo:** domain chính thức là gì (phụ thuộc T03)? Có chấp nhận bỏ `user-scalable=no` không (ảnh hưởng thao tác chạm khi chơi trên mobile)?
  - **Nghiệm thu:** `accum -= tickDt` + test nhịp (nếu tách được); các mục còn lại theo quyết định của chủ repo; đổi tên hàm đi kèm cập nhật mọi chỗ gọi, `npm test` + `npm run build` xanh.

---

## Khi hoàn thành tất cả

- Mọi checkbox ở trên đã được tick qua các PR tương ứng.
- Mở một PR cuối `docs/audit-closeout` cập nhật mục "Trạng thái" bên dưới: liệt kê số PR cho từng task.

### Trạng thái

| Task | PR | Ghi chú |
|------|----|---------|
| T01 | | |
| T02 | | |
| T03 | | |
| T04 | | |
| T05 | | |
| T06 | | |
| T07 | | |
| T08 | | |
| T09 | | |
| T10a–f | | |
