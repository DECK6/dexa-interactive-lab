# DEXA INTERACTIVE LAB

**Three webcam interactives** that recompute what the screen shows from where your body is.

**Live:** https://dexa.art/interactive/

## What it is

A static web app with three realtime computer-vision experiences. Face and hand landmarks are
inferred in the browser with MediaPipe Tasks, and the result drives the render directly — a
projection matrix in one case, a shader mask in the other. No install, no account, no server.

## Experiences

### 01 Off-Axis Window

Head tracking turns the monitor into a hole in the wall. `FaceLandmarker` gives the outer eye
corners; the distance between them against an assumed 60° horizontal FOV yields the viewer's
distance, and the eye midpoint yields lateral offset — a head position in metres relative to the
screen centre. That eye point plus the physical screen rectangle go into Kooima's generalized
perspective projection, which builds an asymmetric frustum every frame. The three.js camera keeps
an identity transform and only its `projectionMatrix` is assigned, because the eye translation is
already folded into that matrix. Move your head and the wireframe room behind the glass shifts
with real parallax.

`-` / `=` adjust the assumed physical screen width (the projection is only correct if it matches
your actual monitor; the value persists in `localStorage`). `v` toggles a mirrored webcam PIP.

### 02 Finger Frame

The rectangle you draw with both hands is a live viewport. `HandLandmarker` tracks two hands; the
thumb and index tips become four corners, sorted clockwise by angle around their centroid. A
single WebGL2 program inverse-bilinear-maps each pixel into quad-local space, so only what falls
inside the frame is re-rendered — everything outside stays dimmed camera feed with a cyan
viewfinder edge. Twisting the frame past a hysteresis threshold cycles the effect.

Twelve effects, selected by one int uniform. None of them animate the image: the quad reads either
as a material you look through — `FROSTED GLASS` · `REEDED GLASS` · `RIPPLE GLASS` ·
`STAINED GLASS` · `PRISM GLASS` · `CRACKED ICE` · `GLASS BLOCK` — or as a surface the feed is
displayed on — `CRT PHOSPHOR` · `LED WALL` · `HALFTONE PRINT` · `NEWSPRINT` · `FILM GRAIN`. Only
film grain and the CRT flicker touch the clock.

### 03 Marionette

Your hand is a marionette control bar. `HandLandmarker` tracks one hand; strings run from the five
fingertips to a physics puppet — outer fingers to the arms, index and ring to the legs, middle to
the head. The puppet is a position-verlet rig (rigid sticks for the skeleton, unilateral rope
constraints for the strings, a floor with friction), so tilting and swinging the hand steers it,
curling a finger drops that limb, and hiding the hand collapses it in a heap. Strings reel in at a
finite speed and an anti-fold nudge keeps the torso from mirror-flipping under violent yanks. The
thumb-vs-pinky x order decides which side of the puppet each finger drives, so either hand works,
palm in or out.

## Stack

| part | choice |
|---|---|
| build | Vite 6 + TypeScript, vanilla (no framework), multi-page |
| tracking | `@mediapipe/tasks-vision` — FaceLandmarker, HandLandmarker, VIDEO mode |
| render | three.js for 01, raw WebGL2 for 02, Canvas 2D for 03 |
| smoothing | One Euro filter on head pose, frame corners and string anchors |
| runtime | bun for packages and unit tests, Playwright for e2e |

Landmark jitter is the main enemy in both experiences, so every tracked value passes through a One
Euro filter before it reaches the renderer. The pure math — Kooima projection, One Euro, quad
ordering and inverse bilinear, twist detection — lives in `src/lib/math/` with no DOM access, and
is covered by unit tests.

## Develop

```bash
bun install
bun run dev          # http://localhost:5173/interactive/
bun test             # math unit tests
bun run build        # typecheck + production build
bun run test:e2e     # playwright fake-camera smoke, all four pages
bun run deploy       # rsync dist/ into the dexa.art repo
```

`bun run models` (run automatically by `dev` and `build`) downloads the two `.task` models once
and copies the MediaPipe wasm runtime out of `node_modules` into `public/`. Both are served from
this site's own origin, so the deployed app has no CDN dependency at runtime.

## Privacy

Everything runs on-device. The camera stream is read into a `<video>` element, sampled by the
tracker and the shader, and never leaves the page — there is no upload, no analytics on the frames,
and no network request at all once the models are cached. The models and the wasm runtime are
served from the same origin as the page.

## Deploy

`scripts/deploy.sh` mirrors `dist/` into `../adxdeck-dexa-daily-main/interactive` (stale files go
to the macOS Trash rather than being deleted), which publishes to https://dexa.art/interactive/.
The Vite `base` is `/interactive/`; serving from a different path requires changing it.

## 한국어 요약

웹캠 기반 인터랙티브 체험 3종을 담은 정적 웹앱입니다. 얼굴·손 랜드마크 추론은 모두 브라우저 안에서
MediaPipe Tasks로 처리되며, 그 결과가 렌더링을 직접 구동합니다.

- **01 오프액시스 윈도우** — 얼굴 추적으로 머리의 3D 위치를 추정하고, Kooima의 일반화 원근 투영으로
  매 프레임 비대칭 절두체를 만들어 모니터를 창문처럼 다룹니다. 고개를 움직이면 창 너머 공간이 실제
  시차를 그리며 열립니다. `-` / `=` 로 실제 모니터 폭을 맞추고, `v` 로 웹캠 미리보기를 켭니다.
- **02 핑거 프레임** — 양손 엄지와 검지 끝 4점이 만드는 사각형 안쪽에만 GLSL 이펙트가 걸립니다.
  역이중선형 매핑으로 프레임 내부 좌표를 구하고, 프레임을 비틀 때마다 다음 셰이더로 순환합니다.
  프레임 안은 들여다보는 재질(간유리·리브드글라스·스테인드글라스·깨진 얼음·유리블럭 등 7종)이거나
  피드가 표시된 화면(CRT·LED 월·하프톤 인쇄·신문지·필름 5종)으로 읽힙니다 (12종).
- **03 마리오네트** — 손이 곧 마리오네트 컨트롤 바입니다. 다섯 손가락 끝에서 스트링이 내려와 물리
  퍼펫(버렛 적분 + 스틱/로프 제약)의 머리·팔·다리에 묶입니다. 손을 기울이고 흔들면 퍼펫이 춤추고,
  손가락을 굽히면 그 팔다리가 떨어지며, 손을 감추면 퍼펫이 무너집니다.

**프라이버시** — 모든 처리는 브라우저 로컬에서 이뤄집니다. 영상 프레임은 페이지를 벗어나지 않으며
어디에도 전송되지 않습니다. 추적 모델과 WASM 런타임도 이 사이트에 함께 배포되어 외부 CDN을 호출하지
않습니다.

**로컬 실행** — `bun install` 후 `bun run dev`. 웹캠 권한이 필요하고, 카메라 API 특성상 https 또는
localhost에서만 동작합니다.

## License

MIT
