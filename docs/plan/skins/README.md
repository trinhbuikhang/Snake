# Tư liệu tham chiếu cho `docs/plan/SKINS_PERF_PLAN.md`

> ⚠️ **Đây là tư liệu tham chiếu (REFERENCE PROTOTYPE), không phải code của game.** Không có file nào trong thư mục này được build hay import từ `src/`. Muse AI port nó vào `src/` theo từng task nhỏ trong kế hoạch; được phép dùng lại code nhưng phải dọn sạch (bỏ hook `?perf`/`window.__perf`, bỏ comment "PROTOTYPE/uncommitted", thêm test).

| Thư mục | Nội dung |
|---------|----------|
| `images/` | Ảnh concept đã được duyệt + ảnh render của prototype v2 (JPEG/PNG nhị phân thật). |
| `reference/src/` | Bản sao file nguồn prototype: `three/skins/serpentBase.js` (rig ống liên tục), `three/skins/moonJade.js`, `three/skins/plushMoon.js`, `three/skins/index.js`, `three/snakeRig.js` (dispatcher + `?rig=old`), `game/skins.js` (registry). Dòng đầu mỗi file có nhãn REFERENCE PROTOTYPE. |
| `reference/diffs/` | Diff của prototype so với `master` @ `fe422f4` cho các file có sẵn: `Hud.jsx.diff` (picker trong Garden), `styles.css.diff`, `store.js.diff` (state `skins` + `chooseSkin`), `engine.js.diff` (swap rig, camera fit, **và hook `__perf` không được port**). |
| `reference/worktree-skins-v2.patch` | Toàn bộ patch prototype (gồm `snakeRig.old.js` = bản sao rig ngọc trai cũ). Áp dụng được lên `fe422f4` bằng `git apply` để xem chạy thử cục bộ — **không commit patch này nguyên khối**. |
| `tooling/` | Script kiểm chứng tuỳ chọn (Playwright + Chrome headless). Xem `tooling/README.md`. |

## Ảnh

- `images/concept-moon-jade.jpg`, `images/concept-plush-moon.jpg` — concept chủ repo đã chọn (đích nhắm về hình ảnh).
- `images/skins-v2-vs-concept.jpg` — mỗi skin một hàng: concept | v1 close-head | v2 close-head | v2 default-cam.
- `images/gameplay-cam-before-after.jpg` — camera mặc định trước/sau (S05).
- `images/gameplay-hud-v2.jpg` — khi chơi có HUD: bàn chơi không bị HUD che.
- `images/skin-picker.png` — mục "🐍 Serpent skin" trong Garden sheet (đang mặc Plush Moon).
- `images/<skin>-{close-head,face,close-3q,default-cam}.jpg` — ảnh render từng skin (rắn chữ S 16 ô, cùng góc máy).

Ảnh render chụp bằng Chrome headless + SwiftShader (render phần mềm), nên vật liệu trên GPU thật có thể hơi khác.
