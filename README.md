# DEXA INTERACTIVE LAB

**Thirteen interactive experiments** that recompute what the screen shows from where your body is.

**Live:** https://dexa.art/interactive/

The September expansion adds five experiments and refines Off-Axis Window and Finger Frame.

## What it is

A static web app with thirteen realtime interactive experiences. Face and hand landmarks and a
person-segmentation mask are inferred in the browser with MediaPipe Tasks, and the result drives
the render directly — a projection matrix, a shader mask, a physics rig, a fluid solver. No
install, no account, no server. Pages 01, 02 and 09–13 start with a labelled pointer preview and
connect to the webcam on request. Pages 01 and 04–13 have a `SNAPSHOT` button (or `S`) that saves a PNG
stamped with the wordmark.

## Experiences

### 01 Off-Axis Window

Head tracking turns the monitor into a hole in the wall. `FaceLandmarker` gives the outer eye
corners; the distance between them against an assumed 60° horizontal FOV yields the viewer's
distance, and the eye midpoint yields lateral offset — a head position in metres relative to the
screen centre. That eye point plus the physical screen rectangle go into Kooima's generalized
perspective projection, which builds an asymmetric frustum every frame. The three.js camera keeps
an identity transform and only its `projectionMatrix` is assigned, because the eye translation is
already folded into that matrix. Move your head to reveal solid near, middle and far occluders behind a fixed screen frame.
A shared optical installation adds a movable source and mirror with bounded reflected rays.
Mouse movement previews the viewpoint; dragging moves the source; Shift-drag rotates the mirror.
With the webcam connected, head position drives the view and a tracked hand moves the source.

`-` / `=` adjust the assumed physical screen width (the projection is only correct if it matches
your actual monitor; the value persists in `localStorage`). `v` toggles a mirrored webcam PIP.

### 02 Finger Frame

The default mode captures a frozen image patch after a stable 0.7-second frame, turns its
brightness into a shallow relief, and lets you move, rotate, scale and place it. This is artistic
brightness displacement, not measured scene depth. Up to five pieces remain; oldest geometry and
textures are disposed on replacement. Brief tracking loss holds the pose; longer loss places the
piece. Pointer preview uses an explicitly labelled generated pattern. Buttons and Space support
capture/place without a camera. The original filter mode remains available:

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

### 04 Time Echo

`ImageSegmenter` (selfie model) cuts you out of the feed every frame. A 32-slot ring buffer keeps
recent frames and masks; six echoes are drawn from slots 0.12 s apart, tinted cyan at the nearest
and orange at the farthest, additively, with the live cut-out on top. Move and your past selves fan
out behind you; stand still and they collapse back into you. `[` / `]` change the spacing, `v`
toggles the dimmed feed behind the echoes.

### 05 Dust Face

`FaceLandmarker` with blendshapes. Twenty thousand particles are seeded inside the face oval and
stored in bbox-local coordinates, so the cloud follows your head; each particle samples its live
colour from the video at its home, so the dust *is* your face. Open your mouth (`jawOpen`) and a
radial impulse from the mouth blows the cloud apart into cyan; close it and springs pull it back
together. Head yaw adds wind, raised brows add shimmer. `r` reseeds, `v` shows a faint feed.

### 06 Neon Fluid

A WebGL2 Stable Fluids solver (curl + vorticity confinement, divergence, Jacobi pressure, gradient
subtraction, semi-Lagrangian advection) at 128 px simulation / up-to-1024 px dye resolution.
`HandLandmarker` tracks two hands; each of the ten fingertips is an emitter injecting velocity and
dye — the left-hand family is cyan, the right orange, both drifting only along the cyan–orange
segment. A pinch bursts an ink drop. `c` clears, `v` toggles the feed.

### 07 Air Graffiti

Pinch thumb and index and you draw with light where your fingers are. Pinch detection is a
hysteresis gate on tip distance normalised by palm size; the pen tip runs through a One Euro
filter; stroke width follows speed (slow = thick). Strokes render on Canvas 2D in three glow passes
over the dimmed mirrored feed, so you are in the picture with your writing. Hold a fist for
0.8 s to wipe, `z` undoes, `S` saves the PNG.

### 08 Snowfall

Snow falls over the segmentation mask and lands where a flake crosses from outside the person to
inside — which, since they come from above, means your head, shoulders and any hand you hold out.
Resting flakes re-check the mask every frame: step aside and they drop, rise into them and they
climb back to the surface, shake (mask motion energy) and they fall off in proportion. Leave the
frame for two seconds and everything falls. `r` resets.

### 09 Light Chamber

A hand moves the light source and a second hand rotates the mirror. A bounded ray model reflects
up to three times, stops at solid objects, and shows light reaching the receiving wall. Pointer
movement controls the source; dragging controls the mirror.

### 10 Swarm

A school of separate organisms follows separation, alignment and cohesion rules using a spatial
hash. Slow hands attract; fast hands scatter the school. Two hands can divide it and bring it
back together. Shift previews a second hand.

### 11 Growth

Place food and watch trails form between it. Moving a barrier redirects exploration. This
Physarum-inspired agent field uses sensing, deposition, diffusion and decay plus an explicit
food-to-food bias for readable connections. It is an artistic adaptation, not a biological model.
Food is capped at six; field resolution and agent count are bounded.

### 12 Webcam Fabric

Your video becomes a hanging cloth with two fixed corners. Pinch near the fabric to pull one or
two points, then release and let gravity and constraints restore the drape. Pointer preview uses
a woven DEXA pattern. Grabs stay above the floor and cannot start outside the cloth.

### 13 Air Harp

Pinch a string, pull and release to trigger a note and visible vibration. Two-hand distance
changes tension. Sound starts only after the sound button is pressed; volume is adjustable and
voices are bounded. No microphone is used. Losing tracking cancels an unfinished pluck.

## Interaction lineage

The expansion follows the project's AKM research on tracked viewpoint, light raycasting,
image-to-3D displacement, Boids, Physarum, cloth constraints and gesture instruments. These are
established concepts. The experiment is in the mapping from action to visible consequences:
reveal, capture and place, reflect, split and reunite, grow, pull and release. New visual effect
counts alone are not treated as evidence of audience impact.

## Stack

| part | choice |
|---|---|
| build | Vite 6 + TypeScript, vanilla (no framework), multi-page |
| tracking | `@mediapipe/tasks-vision` — FaceLandmarker (+blendshapes), HandLandmarker, ImageSegmenter, VIDEO mode |
| render | three.js for 01 · 02 relief · 09 · 12; raw WebGL2 for 02 filters · 04 · 05 · 06; Canvas 2D for 03 · 07 · 08 · 10 · 11 · 13 |
| smoothing | One Euro filter on head pose, frame corners, string anchors and pen tips |
| runtime | bun for packages and unit tests, Playwright for e2e |

Head and frame tracking use One Euro filters. The new hand runtime adds identity-based smoothing,
pinch hysteresis and one-shot pinch/release events. The pure math — Kooima projection, One Euro, quad
ordering and inverse bilinear, twist detection — lives in `src/lib/math/` with no DOM access, and
is covered by unit tests.

## Develop

```bash
bun install
bun run dev          # http://localhost:5173/interactive/
bun test             # math, interaction state and simulation tests
bun run build        # typecheck + production build
bun run test:e2e      # pointer journeys, mobile layout and fake-camera tests
bun run deploy       # rsync dist/ into the dexa.art repo
```

`bun run models` (run automatically by `dev` and `build`) downloads the three models once
and copies the MediaPipe wasm runtime out of `node_modules` into `public/`. Both are served from
this site's own origin, so the deployed app has no CDN dependency at runtime.

## Privacy

Everything runs on-device. The camera stream is read into a `<video>` element, sampled by the
tracker and the shader, and never leaves the page — there is no upload, no analytics on the frames,
and no network request at all once the models are cached. The models and the wasm runtime are
served from the same origin as the page.

## Deploy

`scripts/deploy.sh` mirrors `dist/` into `../adxdeck-blog-main/interactive` (stale files go
to the macOS Trash rather than being deleted), which publishes to https://dexa.art/interactive/.
For an isolated checkout, pass its interactive directory: `bun run deploy /absolute/path/to/checkout/interactive`.
The Vite `base` is `/interactive/`; serving from a different path requires changing it.

## 한국어 요약

인터랙티브 체험 13종을 담은 정적 웹앱입니다. 얼굴·손 랜드마크와 인물 세그멘테이션 추론은 모두
브라우저 안에서 MediaPipe Tasks로 처리되며, 그 결과가 렌더링을 직접 구동합니다. 01·02·09~13은
마우스 프리뷰로 시작하며 웹캠 연결을 선택할 수 있습니다. 01·04~13은
`SNAPSHOT` 버튼(또는 `S`)으로 워드마크가 찍힌 PNG를 저장할 수 있습니다.

- **01 오프액시스 윈도우** — 얼굴 추적으로 머리의 3D 위치를 추정하고, Kooima의 일반화 원근 투영으로
  매 프레임 비대칭 절두체를 만들어 모니터를 창문처럼 다룹니다. 고개를 움직이면 창 너머 공간이 실제
  시차를 그리며 열립니다. `-` / `=` 로 실제 모니터 폭을 맞추고, `v` 로 웹캠 미리보기를 켭니다.
- **02 핑거 프레임** — 사각형을 0.7초 유지해 영상 조각을 잡고, 밝기를 높이로 바꾼 부조를
  이동·기울이기·배치합니다. 최대 5개를 남깁니다. 기존 필터 모드에서는 사각형 안쪽에 GLSL 이펙트가 걸립니다.
  역이중선형 매핑으로 프레임 내부 좌표를 구하고, 프레임을 비틀 때마다 다음 셰이더로 순환합니다.
  프레임 안은 들여다보는 재질(간유리·리브드글라스·스테인드글라스·깨진 얼음·유리블럭 등 7종)이거나
  피드가 표시된 화면(CRT·LED 월·하프톤 인쇄·신문지·필름 5종)으로 읽힙니다 (12종).
- **03 마리오네트** — 손이 곧 마리오네트 컨트롤 바입니다. 다섯 손가락 끝에서 스트링이 내려와 물리
  퍼펫(버렛 적분 + 스틱/로프 제약)의 머리·팔·다리에 묶입니다. 손을 기울이고 흔들면 퍼펫이 춤추고,
  손가락을 굽히면 그 팔다리가 떨어지며, 손을 감추면 퍼펫이 무너집니다.
- **04 시간 메아리** — 인물 세그멘테이션으로 잘라낸 나의 0.12초 간격 과거 6겹이 시안→오렌지 잔상으로
  따라옵니다. 움직이면 펼쳐지고 멈추면 내 안으로 돌아옵니다. `[` `]` 간격, `v` 배경 피드.
- **05 먼지 얼굴** — 얼굴 윤곽 안에 심은 2만 개 입자가 비디오의 실제 색을 띠고 머리를 따라다닙니다.
  입을 벌리면(blendshape `jawOpen`) 입에서 방사되는 임펄스로 흩어지고, 다물면 스프링이 다시 모읍니다.
  고개를 돌리면 바람, 눈썹을 올리면 반짝임. `r` 재시드.
- **06 손끝 유체** — WebGL2 Stable Fluids 솔버 위에서 열 손가락 끝이 속도와 염료를 주입합니다.
  왼손 시안·오른손 오렌지 계열, 엄지·검지를 집으면 잉크 한 방울이 터집니다. `c` 지우기.
- **07 공중 낙서** — 엄지와 검지를 집으면 허공에 빛으로 글씨가 써집니다. 속도에 따라 굵기가 변하고
  글로우 3패스로 렌더링되며, 주먹을 0.8초 쥐면 지워집니다. `z` 되돌리기, `S` PNG 저장.
- **08 쌓이는 눈** — 눈송이가 세그멘테이션 마스크 밖에서 안으로 들어오는 순간 멈춰, 머리·어깨·내민
  손 위에 쌓입니다. 비켜서면 떨어지고, 몸을 털면(마스크 모션 에너지) 우수수 떨어집니다. `r` 리셋.

- **09 빛의 방** — 광원과 반사판을 움직여 빛이 벽에 도달하는 경로를 바꿉니다.
- **10 군집 생물** — 천천히 움직이면 모이고 빠르게 휘두르면 흩어집니다. 양손으로 나누고 다시 모읍니다.
- **11 자라는 연결망** — 먹이를 놓으면 길이 자라며, 장벽을 옮기면 경로가 돌아갑니다.
- **12 웹캠 직물** — 내 영상이 천이 됩니다. 집어 당기고 놓으면 주름이 바뀌며 내려앉습니다.
- **13 공중 현악기** — 현을 집어 당긴 뒤 놓아 연주합니다. 소리는 별도 버튼으로 켭니다.

**프라이버시** — 모든 처리는 브라우저 로컬에서 이뤄집니다. 영상 프레임은 페이지를 벗어나지 않으며
어디에도 전송되지 않습니다. 추적 모델과 WASM 런타임도 이 사이트에 함께 배포되어 외부 CDN을 호출하지
않습니다.

**로컬 실행** — `bun install` 후 `bun run dev`. 웹캠을 연결할 때 권한이 필요하고, 카메라 API 특성상 https 또는
localhost에서만 동작합니다.

## Verification limits

Automated verification covers pointer interactions, capture eviction, simulation invariants,
camera denial and fake-camera startup, and mobile layouts at 390×844 and 320×568. Actual human
webcam tracking, binocular depth perception, audio quality and audience impact require an
in-person pass; a rendered frame or passing test does not establish them.

## License

MIT
