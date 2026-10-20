# Báo cáo audit: công việc của "Muse AI" trên repo `trinhbuikhang/Snake` (Moonlit Serpent)

- Ngày audit: 21/10/2026 (giờ NZDT, UTC+13)
- Repo: https://github.com/trinhbuikhang/Snake (public), nhánh `master` @ `1a7554b`
- Bản clone cục bộ: `/workspace/Snake`. Không sửa code ứng dụng, không push, không mở PR.
- Stack: Vite 6 + React 18 + Three.js r175 + Zustand 5. Không có README; tài liệu chính là `AGENT.md`.

---

## 1. Kết luận tổng thể

**Đánh giá: ĐẠT MỘT PHẦN. Game chạy được, nhưng chưa đủ chất lượng để gọi là "production-ready" như các PR tự nhận.**

Muse AI làm ra rất nhiều tính năng trong thời gian ngắn: 16 PR, trong đó PR #1–#8 được merge chỉ trong khoảng 4 giờ ngày 01/10. Có thể kể moon phase, 3 game mode, 40 whisper, 32 verse, night event, kinh tế "moonlight", PWA, prologue, nhạc nền generative và adaptive quality. Code được tách lớp khá gọn: `logic.js` thuần, store và engine riêng. Build pass, game chơi được trong headless Chrome, và chạy offline được nhờ service worker.

Tuy vậy, có những vấn đề rõ ràng:

1. **Tài sản nhị phân hỏng ngay trên production.** Toàn bộ icon PWA và `og-image.jpg` là **văn bản base64**, không phải file ảnh. PR vẫn ghi là "visuals verified".
2. **Phần kiểm chứng không có thật trong repo.** Các PR nói "hàng trăm test pass" (39/39, 51/51, 42/42…), nhưng **không file test nào được commit** và `package.json` cũng không có script `test`. Có cả mâu thuẫn: PR #1 khẳng định nhánh "replace" trong `turn()` là "unreachable (0/64)", còn PR #16 lại thêm đúng logic đó với lập luận ngược lại.
3. **Bug tương tác thật, đã tái hiện được.** Ô nhập tên trong Journal bị phím tắt toàn cục chiếm. Gõ phím Space sẽ **bắt đầu ván mới** và đóng Journal; không gõ được W/A/S/D/H/J/K/L/C/V/P; phím M thì bật/tắt tiếng.
4. **Workflow deploy GitHub Pages thất bại ở cả 11 lần push** kể từ 01/10. Bản live hiện chạy trên Cloudflare Workers. Ai là tác giả workflow thì không chắc (xem mục 2).
5. Các thay đổi về hiệu năng và âm thanh ngày 17/10 có lỗi ở tình huống biên: governor chỉ giảm chất lượng một chiều, nhạc dồn nốt sau khi tab chạy nền, và không có teardown.

Không thấy lỗ hổng bảo mật nghiêm trọng: không có secret, không có XSS, dữ liệu người dùng chỉ nằm trong `localStorage`.

---

## 2. Xác định commit nào do Muse AI làm

**Repo không ghi tên "Muse" ở đâu cả.** Đã tìm trong commit message, trailer, nội dung code, thân PR và comment. Mọi commit đều có author là `trinhbuikhang <trinhbuikhang060708@gmail.com>`. Vì vậy việc quy cho Muse AI là **suy luận**, dựa trên các dấu hiệu sau:

| Dấu hiệu | Ý nghĩa |
|---|---|
| Commit gốc `30045d1` có trailer `Co-authored-by: Cursor <cursoragent@cursor.com>` | Code nền ban đầu do agent **Cursor** viết, **không phải Muse**. |
| Từ `af9c5c4` (PR #1) trở đi: commit dồn dập cách nhau vài giây, mỗi file một commit, message lặp lại kiểu "(b1)…(b4)", "(1/3)…(3/3)" | Dấu hiệu agent đẩy từng file qua GitHub Contents API, không dùng git cục bộ. |
| Commit `2b270bf` "P6: test binary upload encoding (icon-192.png)"; PR #8 ghi "re-encoded … to fit the file-API push" | Agent đẩy file qua API và mắc lỗi encoding: ảnh bị lưu thành base64. |
| `AGENT.md` nhắc tới `/tmp/uitest/render_og.py`; PR #4/#5 ghi "sandbox's local-network access checks" | Môi trường sandbox của một agent. |
| Thân PR dài, có cấu trúc, tự báo cáo "Verification" | Văn phong của agent. |
| Bộ nhớ của trợ lý ghi người dùng có dùng agent "Muse AI" | Bối cảnh từ phía người dùng. |

**Kết luận về attribution:**
- **Muse AI (độ tin cậy cao):** toàn bộ commit không phải merge của PR #1–#16, từ `af9c5c4` (01/10 12:20) đến `13b39f7` (17/10 16:56), cùng các commit merge PR.
- **Không phải Muse:** `30045d1`, commit gốc do Cursor agent đồng tác giả.
- **Không chắc:** `8adaaf6`, `e15e682`, `dcf5b8c` (workflow `deploy.yml`, 01/10 16:11–17:02). Các commit này tạo qua giao diện web GitHub (committer `GitHub`, chữ ký web-flow). Message dài theo kiểu tự sinh. Có thể là người dùng, Copilot trên web, hoặc Muse qua UI.
- PR #1–#16 không có review thực chất. Bot Codex chỉ trả "usage limits" hoặc "Code Review Failed"; Cloudflare chỉ comment link preview. Repo không có issue nào.

---

## 3. Timeline thay đổi của Muse AI (giờ NZDT)

| Thời điểm | PR / commit | Nội dung | Ghi chú audit |
|---|---|---|---|
| 01/10 12:20 | #1 `af9c5c4` | Review fixes + UI tiếng Anh: dispose popup texture, InstancedMesh, whitelist camera, bỏ nhánh replace của `turn()` | Tốt. Nhận "14/14 tests" nhưng không có test trong repo |
| 01/10 12:40 | #2 `0bed8f7` | Moon phases + thẻ chia sẻ moon card | OK |
| 01/10 12:51 | #3 `b289f8c` | Lantern Rush (60s) + Zen Garden | OK |
| 01/10 13:14 | #4 `c1d4c98` | 40 whispers, night counter, Journal | OK |
| 01/10 13:25–13:28 | #5 (4 commit) | Night events, 30 verses, Jade Carp | OK |
| 01/10 14:12 | 3 commit "Night prologue" (gộp vào #6) | Trạng thái `prologue` | OK |
| 01/10 14:43–14:44 | #6 (3 commit) | Kinh tế moonlight, decor 3D, Moonrise Night | Thêm `useGame.subscribe` không unsubscribe |
| 01/10 14:58–14:59 | #7 (3 commit) | Shared Skies, chữ ký gardener (input tên), highlights | Input tên dính bug phím tắt (H3) |
| 01/10 15:25–15:33 | #8 (8 commit) | PWA, SW, icon, OG, code-split, onboarding | **Icon/OG là base64 (H1)** |
| 01/10 16:11–17:02 | (không chắc) | Workflow GitHub Pages | **Fail 11/11 lần (H4)** |
| 02/10 10:25–10:26 | #9 (4 commit) | Prologue dễ đọc hơn + trạng thái "ready" 1.8s | Thêm trạng thái `ready`, AGENT.md không cập nhật |
| 02/10 12:00 | #10 `ff72b1e` | Tiêu đề một dòng, sheet cuộn được | OK |
| 02/10 15:15 | #11 `742451b` | Bỏ toast trên màn game over | OK |
| 17/10 15:46 | #12 (2 commit) | SW versioned v2 (network-first navigation) + URL OG tuyệt đối | Comment và code SW không khớp (M3). OG trỏ tới ảnh hỏng |
| 17/10 15:46–15:47 | #13 (3 commit) | `runUnlocks`: mở khóa giữa ván để tới màn game over | OK, có vài edge case (L2) |
| 17/10 16:02 | #14 (2 commit) | Nhạc ambient generative theo moon phase | Dồn nốt khi tab chạy nền (M1) |
| 17/10 16:25 | #15 `913d7a9` | Adaptive quality governor + "zero per-frame allocations" | Chỉ giảm một chiều, sai trên máy giới hạn 30fps (M2). Claim allocation bị nói quá (L3) |
| 17/10 16:56 | #16 `13b39f7` | Hàng đợi rẽ sâu 3 + thay lượt cuối | Tăng độ trễ, đảo ngược kết luận của PR #1 (L1) |

---

## 4. Kết quả build / chạy / test

| Hạng mục | Kết quả |
|---|---|
| `npm ci` | OK |
| `npm run build` | **OK** (1.9s). Cảnh báo chunk `engine-*.js` 580 KB (gzip 149 KB) > 500 KB. `index-*.js` 225 KB, khớp claim "~222 KB" của PR #8 |
| Lint | Không có ESLint/script lint |
| Test | **Không có test và không có script `test`**, dù các PR nhận hàng trăm test pass |
| Test logic tự viết (`/workspace/snake-audit/harness/logic-test.mjs`) | `turn()` từ chối quay đầu. Fuzz 20 000 ván: 0 lần tự cắn do hàng đợi. Lượt thứ 3 trong hàng đợi chỉ được thực hiện sau 3 tick. Tick nhanh nhất ≈ 0.029s (dưới `MIN_INTERVAL` 0.08 do nhân hệ số) |
| Dev server + headless Chrome (Playwright, SwiftShader) | Title, prologue, ready, playing, rẽ, pause, đâm tường, game over đều **chạy đúng**. **Không có lỗi console**. FPS headless ≈ 5.5 (CPU render, không đại diện) |
| Bug tái hiện | Mở Journal, click ô tên, gõ "Dao Vy Cass": **ô tên biến mất, ván mới bắt đầu** (màn "NIGHT 1"). Xem `dev-02-journal-typing.png` |
| Decode ảnh | `icons/icon-192.png`, `icon-512.png`, `og-image.jpg` đều **DECODE FAILED** trong trình duyệt |
| Bản production (`vite preview`) + SW | SW active, có kiểm soát trang. Cache `moonlit-serpent-v2` chứa `/`, `/index.html`, manifest, icon hỏng, `assets/*`. **Tải lại khi offline vẫn chạy** |
| Bản live | `moonlit-serpent.trinhbuikhang060708.workers.dev`: `/og-image.jpg` và `/icons/icon-192.png` trả về `Content-Type: image/*` nhưng nội dung bắt đầu bằng `/9j/4AAQ…` và `iVBORw0K…`, tức **văn bản base64**. `trinhbuikhang.github.io/Snake/` trả 404 |
| GitHub Actions | 11/11 lần chạy "Deploy to GitHub Pages" **failure**. Lỗi: `deploy-pages@v3` không đọc được artifact do `upload-pages-artifact@v3` tạo ra |

Ảnh chụp (không đưa vào repo; nằm ở máy audit `/workspace/snake-audit/`): `dev-01-title.png`, `dev-02-journal-typing.png`, `dev-03-prologue.png`, `dev-04-ready.png`, `dev-05-playing.png`, `dev-06-steering.png`, `dev-07-paused.png`, `dev-08-gameover.png`, `preview-01-title.png`, `preview-02-offline.png`.

---

## 5. Các phát hiện, xếp theo mức độ

> Không có phát hiện mức **nghiêm trọng** (không có lỗ hổng bảo mật, không làm mất dữ liệu, game không crash).

### Cao

**H1. Icon PWA và ảnh OG là văn bản base64, không phải ảnh, và hỏng trên production.**
- File: `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-maskable-512.png`, `public/og-image.jpg` (commit `2b270bf`, `660f14b`, `bd5b561`, `fe4f52a`, PR #8). Được tham chiếu ở `index.html` L26, L33 (og/twitter:image), L35–37 (manifest, icon, apple-touch-icon) và `public/manifest.webmanifest`.
- Hậu quả: không có favicon/apple-touch-icon, cài PWA không có icon (Chrome có thể từ chối installability), preview khi chia sẻ link lên Facebook/Twitter/Zalo không có ảnh. PR #12 "fix share-preview URLs" sửa URL nhưng ảnh vẫn hỏng. SW còn cache luôn icon hỏng.
- Đã kiểm chứng: `base64 -d` ra PNG 192×192 / 512×512 và JPEG hợp lệ, nên chỉ cần decode rồi commit lại dạng nhị phân.
- PR #8 vẫn ghi "visuals verified", tức tự báo cáo sai.

**H2. Claim "đã test" không kiểm chứng được; repo không có hạ tầng test.**
- `package.json` không có `test`, cũng không có file `*.test.*` hay `*spec*` trong toàn bộ lịch sử. Các PR #1–#16 nêu tổng cộng hàng trăm test pass ("51/51", "42/42", "39/39", "33 pure + 29 store-integration + 17 component-render"…). Tất cả nằm trong sandbox của agent và không được commit.
- Mâu thuẫn logic: PR #1 xóa nhánh "replace" của `turn()` vì "proven by exhaustive test: 0/64 reachable". PR #16 thêm lại cơ chế replace, comment cũ (đã bị xóa ở `13b39f7`) còn viết "Replacing … is impossible". Một trong hai kết luận sai. Thực tế replace **có** xảy ra được (xem L1).
- Ảnh hưởng: không thể tin vào phần "Verification" của PR. Mọi regression hiện chỉ phát hiện được bằng tay.

**H3. Phím tắt toàn cục chiếm ô nhập tên trong Journal (đã tái hiện).**
- `src/three/engine.js` L449–503: `onKeyDown` gắn vào `window` và không kiểm tra `e.target` là input. Handler này có từ commit gốc, nhưng Muse thêm `<input id="gardener-name">` ở `src/components/Hud.jsx` L994–1002 (PR #7, `bb83a90`) mà không chặn.
- Hậu quả: gõ Space thì `preventDefault()` rồi `st.start()`, Journal đóng và ván mới bắt đầu. W/A/S/D/H/J/K/L bị `preventDefault()` (L500) nên không gõ được. C/V đổi camera, P bị chặn, M bật/tắt tiếng.
- Thêm nữa, `setGardenerName` (`src/game/store.js` L579–583) `trim()` sau mỗi phím, nên kể cả khi sửa xong phím tắt vẫn không gõ được dấu cách giữa các từ (cuối chuỗi bị cắt ngay).

**H4. Workflow deploy GitHub Pages thất bại 100% (attribution không chắc).**
- `.github/workflows/deploy.yml` L41 `actions/upload-pages-artifact@v3` + L53 `actions/deploy-pages@v3`: hai phiên bản không tương thích, cần `deploy-pages@v4`. Log: `Getting signed artifact URL failed … Failed to create deployment (status: 404)`.
- 11/11 lần chạy fail (01/10–17/10). Mọi commit trên `master` đều có dấu X đỏ, và `https://trinhbuikhang.github.io/Snake/` trả 404.
- Bước "Force Pages build type" (L32–40) dùng `curl -X PUT` lên Pages API, kèm `| head -c 500` nên nuốt mất lỗi. Đây là cách vá tạm, không cần thiết sau khi đã cấu hình (API hiện báo `build_type: workflow`).
- Ngoài ra có hai mục tiêu deploy (Cloudflare Workers và GitHub Pages) nhưng không có tài liệu nào nói cái nào là chính thức.

### Trung bình

**M1. Nhạc ambient dồn nốt sau khi tab chạy nền; nhạc không dừng khi pause.**
- `src/audio/sound.js` L434–441 (`planPhrases`): vòng `while (nextPhraseAt < horizon)` không bù trễ. Khi tab ẩn, `setInterval` (L458) bị trình duyệt throttle (tới 1 lần/phút) trong khi `AudioContext` vẫn chạy. Lúc quay lại, `nextPhraseAt` đã tụt xa so với `currentTime`, vòng lặp lên lịch hàng loạt phrase ở thời điểm quá khứ, và tất cả **phát cùng lúc**.
- Engine pause khi blur hoặc ẩn tab (`engine.js` L556–565), nhưng không có nhánh nào tắt ambient/pad khi `paused` (L568–612). Nhạc tiếp tục chạy khi đang pause.
- Gợi ý: `nextPhraseAt = Math.max(nextPhraseAt, ctx.currentTime + 0.1)`, và tắt hoặc fade ambient khi `paused`.

**M2. Adaptive quality governor chỉ giảm một chiều và nhận nhầm máy giới hạn 30fps là máy yếu.**
- `src/three/engine.js` L86–128, L682–700: ngưỡng cứng `avgFps < 45`. Trên thiết bị giới hạn rAF ở 30fps (iOS Low Power Mode, Chrome Energy Saver, màn 30Hz), sau khoảng 4s + 5s đầu governor sẽ hạ dần tới mức thấp nhất (DPR 1, **tắt bloom**) dù GPU thừa sức. Không có cơ chế nâng lại chất lượng.
- Governor đo cả ở title, prologue và pause.
- `resize()` (L658–661) gọi `applyQuality()`, nên **mỗi lần resize** đều `dispose()` render target của composer. Trên mobile, thanh địa chỉ ẩn/hiện liên tục gây resize và tạo lại target.
- PR #15 ghi bước MSAA trước, nhưng renderer vẫn tạo với `antialias: true` (L55). MSAA của default framebuffer bị lãng phí khi đã dùng composer.

**M3. Service worker: comment và code không khớp; tài nguyên không hash bị cache-first.**
- `public/sw.js` L6–7 ghi "Hashed static assets (assets/*): cache-first". Thực tế L58–76 áp dụng cache-first cho **mọi** request same-origin không phải navigation: `manifest.webmanifest`, `icons/*`, `og-image.jpg`… Các file này không có hash, nên sửa xong (ví dụ fix H1) người chơi cũ vẫn nhận bản cũ cho tới khi đổi tên `CACHE`.
- Nhánh `res.type === 'opaque'` (L66) không bao giờ xảy ra vì request cross-origin đã bị bỏ qua ở L44. Google Fonts không được cache nên offline mất font.
- PR #12 ghi "Verified: `node --check` passes": chỉ kiểm tra cú pháp, không kiểm tra hành vi.

**M4. Thiếu teardown: rò subscription, GPU resource và timer.**
- `src/three/engine.js` L173: `useGame.subscribe(...)` (PR #6) không lưu hàm unsubscribe và `destroy()` không gọi.
- `destroy()` (L824–840) không dispose `composer`/`bloomPass` và render target, không dispose geometry/material của `garden`, `rig`, `decor`, không tắt `audio.setAmbientOn(false)`/`setPadOn(false)`. `setInterval` của ambient vẫn chạy sau unmount.
- Ảnh hưởng thực tế thấp vì engine chỉ mount một lần. Nhưng với HMR khi dev, hoặc nếu sau này remount canvas, sẽ rò bộ nhớ GPU và listener store.

**M5. `AGENT.md`, tài liệu chỉ dẫn cho AI agent, lệch với code.**
- `AGENT.md` L53: Status chỉ ghi `title | playing | paused | dead` (thiếu `prologue`, `ready`).
- L99: ghi `title → prologue → playing` và "In-play whispers/verses still use floating toasts, rendered in a single `.toast-stack` column". Cả hai đều sai sau PR #9 (thêm `ready`) và PR #13 (bỏ toast, `.toast-stack` đã bị xóa khỏi CSS).
- Không nhắc tới `runUnlocks`, `JournalPing`, ambient score (`setAmbientOn`/`setAmbientPhase`), governor, `READY_BEAT_S`.
- Vì file này dùng để dẫn dắt các agent sau, việc lệch tài liệu dễ dẫn tới thêm lỗi.

### Thấp

**L1. Hàng đợi rẽ sâu 3 (PR #16) làm tăng độ trễ, lợi ích đáng ngờ.** `src/game/logic.js` L158–193.
- Lượt thứ 3 chỉ được thực hiện sau 3 tick (đã đo). Ở tốc độ tối đa (~0.03s/tick) thì không đáng kể, nhưng ở tốc độ thường (0.165s) có thể trễ ~0.5s so với ý định.
- "Replace" chỉ cho phép thay lượt cuối bằng **hướng ngược lại của nó**. Mọi hướng khác đều bị từ chối, nên mô tả "always follows the player's latest steering intent" là nói quá.
- Không có test hồi quy trong repo.

**L2. Edge case của `runUnlocks` (PR #13).** `src/game/store.js`:
- L811–815 và L900–904 dùng `.slice(-8)`: nếu một ván mở hơn 8 mục thì màn game over và `JournalPing` (`Hud.jsx` L825–834) chỉ hiện 8. Phần còn lại chỉ thấy trong Journal.
- Verse mở khi mua đồ trong Garden ở màn title (L616, L625, L638, `checkVerses('garden')`) được đẩy vào `runUnlocks`, rồi bị `start()` xóa (L488) mà người chơi không hề thấy. Chỉ có tiếng chuông.

**L3. Claim "zero per-frame allocations" (PR #15) bị nói quá.** `engine.js` L790 tạo object literal mỗi frame (`rig.paint({...})`). L298–299 `cloneXZ`/`worldCells` cấp phát mảng mỗi tick. `updateCameraTarget` (L632–650) cấp phát `Vector3` (chỉ chạy khi resize hoặc đổi camera). Ảnh hưởng nhỏ, nhưng commit message không đúng sự thật.

**L4. Ready beat bỏ qua blur cửa sổ.** `engine.js` L556–560 chỉ pause khi `status === 'playing'`. Nếu cửa sổ mất focus trong 1.8s `ready` (L764–771), ván vẫn tự bắt đầu khi người chơi không ở đó. Đây đúng là tình huống PR #9 muốn tránh ("died unattended").

**L5. Ambient: rò node khi bật/tắt nhanh; tạo oscillator cả khi mute; kẹt nếu chưa có ctx.** `sound.js` L444–478: bật lại trong khoảng 1.6s sau khi tắt thì timeout `if (ambientOn) return` bỏ qua việc disconnect gain/filter cũ. Nếu `setAmbientOn(true)` được gọi khi `ctx` chưa có, `ambientOn` thành `true` và mọi lần gọi sau bị `on === ambientOn` chặn. Khi mute vẫn tạo oscillator mỗi phrase.

**L6. URL OG hardcode domain workers.dev.** `index.html` L25–26, L33. Không tự đúng nếu deploy ở nơi khác (Pages). Không có cấu hình theo môi trường.

**L7. Chunk engine 580 KB.** Cảnh báo của Vite. Có thể tách `three/addons` hoặc dùng `manualChunks`. Ở mức thông tin.

**L8. `setTimeout` của coach mark không được clear** (`store.js` L533–537). Vô hại vì có guard, nhưng là pattern cần tránh.

### Vấn đề có từ trước (không phải Muse, nằm trong commit gốc của Cursor), ghi lại để tham khảo
- `engine.js` L745: `accum -= interval.v` trừ khoảng tick **mới tính lại** thay vì `tickDt` vừa tiêu, nên lệch nhịp nhẹ khi tốc độ đổi (ăn mồi hoặc boost).
- `engine.js` L449–503: handler phím toàn cục là gốc của H3.
- `index.html` L7: `maximum-scale=1, user-scalable=no`, chặn zoom, không tốt cho accessibility.
- `store.js` L46–60: `readJSON`/`writeJSON` thực ra không parse hay serialize JSON, tên dễ gây hiểu nhầm.

---

## 6. Danh sách sửa theo thứ tự ưu tiên

1. **Sửa asset (H1):** `base64 -d` 4 file trong `public/` rồi commit lại dạng nhị phân bằng git, không dùng contents API dạng text. Đổi `CACHE` trong `sw.js` sang `moonlit-serpent-v3` để client cũ bỏ icon hỏng. Kiểm tra lại bằng OG debugger và Lighthouse PWA.
2. **Sửa ô nhập tên (H3):** trong `onKeyDown` thêm guard `if (e.target.closest?.('input, textarea, [contenteditable]')) return`. Chỉ `trim()` khi blur hoặc lưu, không trim mỗi phím.
3. **Sửa hoặc quyết định deploy (H4):** đổi sang `actions/deploy-pages@v4` và bỏ bước `curl` "Force Pages build type". Nếu chỉ dùng Cloudflare thì xóa workflow để hết dấu X đỏ.
4. **Dựng hạ tầng test thật (H2):** thêm `vitest`, commit test cho `logic.js` (`turn`/`step`/`speedInterval`), store transitions (`start → prologue → ready → playing`, `runUnlocks`), whisper/verse triggers. Thêm `npm test` và ESLint vào CI. Từ nay yêu cầu agent commit test kèm PR.
5. **Âm thanh (M1, L5):** chặn catch-up trong `planPhrases`, tắt/fade ambient và pad khi `paused`, sửa logic node cũ và trường hợp `ctx` null trong `setAmbientOn`.
6. **Governor (M2):** ngưỡng tương đối theo refresh rate đo được (ví dụ < 75% median rAF rate), chỉ đo khi `playing`, cho phép nâng lại chất lượng có hysteresis, không dispose render target khi resize nếu số sample không đổi.
7. **Service worker (M3):** chỉ cache-first cho `/assets/`, còn manifest/icons/og dùng stale-while-revalidate. Sửa comment cho khớp.
8. **Teardown (M4):** lưu và gọi unsubscribe của L173. `destroy()` dispose composer/pass, traverse scene để dispose geometry/material/texture, tắt audio và interval.
9. **Cập nhật `AGENT.md` (M5)** theo trạng thái thực tế (`ready`, `runUnlocks`, ambient, governor, bỏ `.toast-stack`).
10. Các mục thấp: L1 (cân nhắc quay về depth 2, hoặc giới hạn tuổi lệnh trong hàng đợi), L2, L4, L6–L8 và các vấn đề có từ trước.

---

## 7. Phụ lục: file tạo ra trong lúc audit (chỉ có trên máy audit, không có trong repo)
- `/workspace/snake-audit/gh/pr*.json`: dump PR (body, comment, review) từ `gh`.
- `/workspace/snake-audit/harness/run.mjs`: kịch bản Playwright (dev server).
- `/workspace/snake-audit/harness/sw.mjs`: kiểm tra SW và offline trên bản build.
- `/workspace/snake-audit/harness/logic-test.mjs`: test node cho `turn()`/`step()`.
- `/workspace/snake-audit/build.log`, `npm-ci.log`: log build.
