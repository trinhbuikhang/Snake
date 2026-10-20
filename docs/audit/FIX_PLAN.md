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
7. **Gặp điểm mơ hồ thì dừng lại và hỏi chủ repo**, không đoán. Các quyết định trong mục "Quyết định đã chốt" bên dưới là cuối cùng — không cần hỏi lại; nhưng nếu code thực tế mâu thuẫn với quyết định, hãy dừng và báo.
8. **Commit file nhị phân (ảnh) phải là nhị phân thật.** Nếu công cụ của bạn chỉ đẩy được file dạng text qua GitHub Contents API, hãy dừng và báo chủ repo — đó chính là nguyên nhân lỗi H1.
9. Không push thẳng lên `master`, không force-push, không sửa lịch sử git.

## Quyết định đã chốt

Chủ repo đã chốt các điểm từng để mở; Muse AI làm theo, không cần hỏi lại:

| Task | Quyết định | Lý do |
|------|-----------|-------|
| T03 | **Xoá hẳn** workflow GitHub Pages (`.github/workflows/deploy.yml`); không thêm workflow deploy nào khác. Deploy Cloudflare (tích hợp Git ở phía Cloudflare, không có file cấu hình trong repo) giữ nguyên. | Bản live chạy trên Cloudflare Workers; Pages trả 404 và gây dấu X đỏ trên mọi commit. |
| T10a | Giảm độ sâu hàng đợi rẽ từ 3 về **2** (`MAX_QUEUE = 2`), giữ nguyên nhánh "thay lượt cuối khi đầy" hiện có (vẫn kiểm tra hợp lệ so với lượt trước đó); có test trong bộ vitest của T04. | Depth 3 làm lượt thứ 3 trễ 3 tick mà không giúp thêm gì đáng kể; depth 2 đủ cho cua góc nhanh. |
| T10b | Unlock xảy ra ở màn **title** (thực tế: verse mở khi mua đồ trong Garden) được lưu vào hàng chờ `pendingUnlocks` (persist ở localStorage `ran-xinh-pending-unlocks`) và **hiển thị trong màn prologue của đêm kế tiếp**, trước các poem mở lúc `nightStart`. | Prologue là UI đọc poem có sẵn, xuất hiện ở đầu mọi ván (kể cả khi hàng đợi rỗng); không cần thêm UI mới, không che gameplay. |
| T10f | Origin chính thức: **`https://moonlit-serpent.trinhbuikhang060708.workers.dev/`** cho `og:url`, `og:image`, `twitter:image` (URL tuyệt đối) + thêm `<link rel="canonical">`. Bỏ `maximum-scale=1, user-scalable=no` khỏi viewport; giữ `touch-action: none` trên `.garden-canvas` và đặt `touch-action: none` cho điều khiển khi chơi (`.dpad`, `.btn-boost`). Phần `accum`/đổi tên `readJSON`/`writeJSON` giữ như mô tả cũ. | Cho phép người dùng phóng to (accessibility) mà pinch/double-tap không zoom khi đang chơi. |

## Thứ tự task (tóm tắt)

| # | ID | Mức | Branch | Nội dung |
|---|----|-----|--------|----------|
| 1 | T01 | Cao | `fix/01-pwa-icons` | Decode 4 ảnh base64 + bump tên cache SW |
| 2 | T02 | Cao | `fix/02-input-shortcuts` | Chặn phím tắt khi đang gõ + cho phép dấu cách trong tên |
| 3 | T03 | Cao | `fix/03-pages-deploy` | Xoá workflow GitHub Pages (đã chốt) |
| 4 | T04 | Cao | `chore/04-vitest-ci` | vitest + `npm test` + CI chạy build & test |
| 5 | T05 | Trung bình | `fix/05-ambient-scheduler` | Nhạc nền: chặn dồn nốt + dừng khi pause |
| 6 | T06 | Trung bình | `fix/06-quality-governor` | Governor: ngưỡng, phục hồi, xử lý resize |
| 7 | T07 | Trung bình | `fix/07-sw-strategy` | Service worker cache đúng như comment |
| 8 | T08 | Trung bình | `fix/08-teardown` | Teardown/dispose + unsubscribe |
| 9 | T09 | Trung bình | `docs/09-agent-md` | Cập nhật `AGENT.md` |
| 10 | T10a–T10f | Thấp | xem từng mục | Nhóm lỗi mức thấp |

---

## T01 — Ảnh PWA/OG là văn bản base64

- [x] **T01** · Mức: **Cao** (AUDIT H1) · Branch: `fix/01-pwa-icons`

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

## T03 — Workflow GitHub Pages fail 11/11 lần → xoá workflow

- [ ] **T03** · Mức: **Cao** (AUDIT H4) · Branch: `fix/03-pages-deploy`

> ✅ **Đã chốt:** xoá workflow GitHub Pages. Bản live là Cloudflare Workers (`https://moonlit-serpent.trinhbuikhang060708.workers.dev/`), deploy qua tích hợp Git của Cloudflare (bot `cloudflare-workers-and-pages` comment trên PR; không có `wrangler.toml` trong repo). Không đụng tới phần Cloudflare.

**Vấn đề**
- `.github/workflows/deploy.yml` L41 `actions/upload-pages-artifact@v3` + L53 `actions/deploy-pages@v3` không tương thích → lỗi `Getting signed artifact URL failed … Failed to create deployment (status: 404)`. Mọi commit trên `master` có dấu X đỏ; `https://trinhbuikhang.github.io/Snake/` trả 404.
- L32–40: bước "Force Pages build type" dùng `curl -X PUT` lên Pages API, `| head -c 500` nuốt lỗi.

**Hành vi mong muốn**
- Repo không còn workflow deploy GitHub Pages; push lên `master` không còn tạo run "Deploy to GitHub Pages".
- Cloudflare tiếp tục build/deploy như cũ.

**Tiêu chí nghiệm thu**
- File `.github/workflows/deploy.yml` bị xoá; thư mục `.github/workflows/` không còn file nào khác tham chiếu Pages: `rg -n -i "pages|deploy-pages|upload-pages-artifact|configure-pages" .github` không có kết quả.
- Tài liệu: `rg -n -i "github pages|github\.io|deploy\.yml" AGENT.md README* 2>/dev/null` không có kết quả (tại thời điểm audit `AGENT.md` không nhắc Pages và repo không có README — nếu vẫn vậy thì không cần sửa tài liệu, ghi rõ điều này trong PR).
- Không sửa `index.html`, `vite.config.js` hay bất cứ cấu hình nào liên quan Cloudflare trong PR này.
- Sau khi merge: `gh run list --limit 5` không có run "Deploy to GitHub Pages" mới; comment preview của Cloudflare vẫn xuất hiện trên PR này (dán ảnh chụp hoặc link).
- Ghi chú trong PR: chủ repo có thể tắt Pages trong Settings → Pages (việc ngoài code, không thuộc PR).

**Kiểm chứng**
- Dán output các lệnh `rg` ở trên và `gh run list --limit 5` sau merge.

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
    - `turn()`: từ chối quay đầu; từ chối trùng hướng; hàng đợi tối đa theo `MAX_QUEUE` hiện hành (3 tại thời điểm T04; T10a sẽ đổi thành 2 và cập nhật test); khi đầy, chỉ thay lượt cuối và giá trị mới hợp lệ so với lượt trước đó; phím không hợp lệ trả `false`. Nên export `MAX_QUEUE` để test không hardcode.
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
  - **Vấn đề:** `src/game/logic.js` L158–193 — hàng đợi sâu 3 làm lượt thứ 3 trễ 3 tick; comment nói quá ("always follows the player's latest steering intent").
  - ✅ **Đã chốt:** `MAX_QUEUE = 2`. Giữ nhánh "khi đầy thì thay lượt cuối" hiện có (hợp lệ hoá so với `queue[0]`, tức chỉ có thể thay lượt cuối bằng hướng ngược của nó).
  - **Hành vi mong muốn:** tối đa 2 lượt chờ; hai lượt được áp dụng ở **hai tick liên tiếp**; không bao giờ có lượt nào khiến rắn quay ngược vào thân.
  - **Nghiệm thu (test trong `src/game/logic.test.js`, chạy bằng `npm test`):**
    - Đang đi `right`, gọi `turn(g,'up')`, `turn(g,'left')` → `g.queue` là `['up','left']`; `step()` lần 1 → `g.dir === 'up'`, đầu rắn đi lên 1 ô; `step()` lần 2 → `g.dir === 'left'`; không có `dead`.
    - Hàng đợi đầy `['up','left']`: `turn(g,'down')` trả `false` (ngược `up`), `turn(g,'up')` trả `false` (trùng `up`), `turn(g,'left')` trả `false` (trùng lượt cuối), `turn(g,'right')` trả `true` và `g.queue` thành `['up','right']`; `g.queue.length` không bao giờ > 2.
    - Đang đi `right`: `turn(g,'left')` trả `false` (quay đầu); chuỗi `turn('up')`, `turn('left')`, `turn('down')` không bao giờ làm queue chứa hai phần tử kề nhau ngược nhau, và với rắn dài ≥ 4 thì hai `step()` sau đó không trả `cause: 'self'` do đảo chiều.
    - Fuzz (seed cố định, ≥ 1000 ván, rắn dài 3, không có mồi): chuỗi lệnh ngẫu nhiên + `step()` không bao giờ trả `cause: 'self'`.
    - Comment trên `turn()` mô tả đúng hành vi depth 2.

- [ ] **T10b** · Thấp (AUDIT L2) · Branch: `fix/10b-run-unlocks`
  - **Vấn đề:** `src/game/store.js` L811–815, L900–904 `.slice(-8)` cắt bớt unlock giữa ván; verse mở khi mua đồ trong Garden ở màn title (`upgradeLanterns`/`upgradeBlooms`/`chooseInk` → `checkVerses('garden')`, L616, L625, L638; `GardenOverlay` chỉ hiển thị khi `status === 'title'`, `Hud.jsx` L1302) bị đẩy vào `runUnlocks` rồi bị `start()` xoá (L488) mà người chơi không thấy.
  - ✅ **Đã chốt:** unlock xảy ra khi `status === 'title'` đi vào `pendingUnlocks` (persist `ran-xinh-pending-unlocks`), và được đưa vào **đầu `prologueQueue` của đêm kế tiếp** trong `start()`, trước các poem `nightStart`.
  - **Hành vi mong muốn (định tuyến trong `checkWhispers`/`checkVerses`):**
    - `prologue` → như hiện tại (qua `whisperToasts`/`verseToasts` → `prologueQueue`).
    - `title` → `pendingUnlocks` (mỗi mục `{ kind, id, text? , lines? }`, không trùng `id`), ghi localStorage ngay.
    - các trạng thái khác (`ready`, `playing`, `paused`, `dead`) → `runUnlocks` như hiện tại.
    - `start()`: `prologueQueue = [...pendingUnlocks, ...nightStart poems]`, sau đó xoá `pendingUnlocks` khỏi state và localStorage.
    - Bỏ `.slice(-8)` của `runUnlocks`; màn game over liệt kê đủ (danh sách cuộn được nếu dài); `JournalPing` hiện đúng tổng số.
  - **Nghiệm thu (test store trong `npm test` + kiểm tra thủ công):**
    - Ở `title`, gọi `checkVerses('garden')` với điều kiện mở được 1 verse → `runUnlocks` rỗng, `pendingUnlocks.length === 1`, `localStorage['ran-xinh-pending-unlocks']` chứa id đó.
    - Gọi `start()` → `status === 'prologue'`, `prologueQueue[0].id` là id đó, `pendingUnlocks` rỗng và key localStorage đã bị xoá.
    - Reload (gọi lại `hydrate()`) giữa hai bước trên → `pendingUnlocks` vẫn còn và vẫn xuất hiện ở prologue kế tiếp.
    - Ở `playing`, mở 10 unlock → `runUnlocks.length === 10`; màn game over render đủ 10 mục.
    - Thủ công: mua 1 bậc lantern trong Garden (dùng localStorage `ran-xinh-moonlight` để có đủ moonlight) → Start → card đầu tiên của prologue là verse đó. Đính kèm ảnh chụp.

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
  - **Vấn đề:** `index.html` L7 `maximum-scale=1, user-scalable=no` chặn zoom (accessibility); OG dùng domain workers.dev (L25–26, L33) nhưng chưa có `canonical`; `engine.js` L745 `accum -= interval.v` trừ khoảng tick mới thay vì `tickDt`; `readJSON`/`writeJSON` (`store.js` L46–60) đặt tên gây hiểu nhầm.
  - ✅ **Đã chốt:** origin chính thức `https://moonlit-serpent.trinhbuikhang060708.workers.dev/`; bỏ chặn zoom trong viewport nhưng chặn pinch/double-tap trên vùng chơi bằng CSS `touch-action`.
  - **Nghiệm thu:**
    - `index.html`: `og:url` = `https://moonlit-serpent.trinhbuikhang060708.workers.dev/`; `og:image` và `twitter:image` = `https://moonlit-serpent.trinhbuikhang060708.workers.dev/og-image.jpg` (tuyệt đối, đã đúng tại thời điểm audit — giữ nguyên); thêm `<link rel="canonical" href="https://moonlit-serpent.trinhbuikhang060708.workers.dev/" />`.
    - Viewport đúng bằng `width=device-width, initial-scale=1, viewport-fit=cover` (không còn `maximum-scale`, `user-scalable`).
    - `src/styles.css`: `.garden-canvas` giữ `touch-action: none`; `.dpad` và `.btn-boost` (cùng các nút con của d-pad) đổi `touch-action: manipulation` → `none`; các sheet/menu cuộn được giữ nguyên (không đặt `touch-action: none` cho `.stage`/`body`, vì title sheet cần cuộn trên màn thấp).
    - Thủ công trên mobile hoặc DevTools device mode: pinch/double-tap trên vùng chơi và d-pad không zoom trang; pinch trên màn title vẫn zoom được; title sheet vẫn cuộn được. Đính kèm ảnh chụp/ghi chú thiết bị.
    - `engine.js`: `accum -= tickDt` (biến `tickDt` đã có ở L734).
    - Đổi tên `readJSON`/`writeJSON` thành tên phản ánh đúng (ví dụ `readItem`/`writeItem`), cập nhật mọi chỗ gọi; `npm test` + `npm run build` xanh.

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
