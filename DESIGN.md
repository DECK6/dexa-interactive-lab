# DEXA INTERACTIVE LAB — Design Spec (v1)

Author: Fable (설계) / Implementers: Opus-5 agents → (token 한도 시) Codex via Orca
Date: 2026-08-02

## 0. 목표

웹캠 기반 인터랙티브 체험 2종을 담은 정적 웹앱. dexa.art/interactive 배포.
시블링: dexa-gen-lab(구조·테마 레퍼런스), dexa-vfx-lab(배포 스크립트 레퍼런스).

- **01 Off-Axis Window** — 얼굴 추적으로 머리 위치를 추정, 모니터를 "창문"으로 만드는
  오프액시스 투영 3D 씬 (Johnny Lee head-tracking VR 계열).
- **02 Finger Frame** — 양손 엄지+검지 4점으로 만든 사각형 내부에만 GLSL 이펙트,
  프레임을 비틀 때마다 다음 셰이더로 순환.

모든 트래킹은 브라우저 로컬(MediaPipe Tasks WASM). 영상 서버 전송 없음.

## 1. 스택

- Vite 6 + TypeScript, **vanilla** (gen-lab 패턴, React 금지 — 불필요)
- three@^0.185 (off-axis 씬 전용)
- @mediapipe/tasks-vision (FaceLandmarker, HandLandmarker)
- 모델(.task)과 wasm은 **public/에 번들** (런타임 CDN 의존 금지, GitHub Pages 오프라인 자립)
- bun (패키지·테스트 러너). 유닛테스트는 `bun test`, E2E는 Playwright.
- MPA: `index.html`(랜딩), `offaxis.html`, `fingerframe.html` — vite build.rollupOptions.input 3개
- `base: '/interactive/'` (vite.config.ts) — dexa.art/interactive/ 하위 배포 필수

## 2. 디렉터리

```
dexa-interactive-lab/
  index.html  offaxis.html  fingerframe.html
  vite.config.ts  tsconfig.json  package.json  playwright.config.ts
  public/models/            # face_landmarker.task, hand_landmarker.task
  public/wasm/              # tasks-vision wasm 파일들 (node_modules에서 postinstall 복사)
  scripts/fetch-models.mjs  # 모델 다운로드(존재하면 skip), wasm 복사
  scripts/deploy.sh         # vfx-lab deploy.sh 패턴: trash 스테일 + rsync dist → ../adxdeck-dexa-daily-main/interactive
  src/
    theme/dexa-theme.css    # gen-lab에서 복사한 중앙 토큰 + lab 공통 칩
    lib/camera.ts
    lib/tracking/face.ts    lib/tracking/hands.ts
    lib/math/one-euro.ts    lib/math/offaxis-projection.ts
    lib/math/quad.ts        lib/math/twist.ts
    lib/hud.ts              # 공통 HUD(상태 dot, 안내, fps)
    offaxis/main.ts  offaxis/scene.ts
    fingerframe/main.ts  fingerframe/effects.ts (GLSL 문자열)
  tests/unit/*.test.ts      # bun test — math 모듈만
  tests/e2e/*.spec.ts       # Playwright fake-cam 스모크
```

## 3. 공통 계약 (구현 시 시그니처 고정)

```ts
// lib/camera.ts — getUserMedia 640x480 기본, 실패시 CameraError{kind:'denied'|'notfound'|'insecure'}
export async function initCamera(video: HTMLVideoElement, opts?: {width?: number; height?: number}): Promise<MediaStream>

// lib/tracking/face.ts — VIDEO 모드, rAF마다 detectForVideo
export interface HeadPose { x: number; y: number; z: number; present: boolean }
// 좌표: 화면 중심 원점 미터. x 오른쪽+, y 위+, z 화면에서 관람자 쪽+(항상 양수)
export async function createFaceTracker(video: HTMLVideoElement): Promise<{ read(): HeadPose; dispose(): void }>

// lib/tracking/hands.ts
export type Vec2 = { x: number; y: number }
export interface FingerFrame { corners: [Vec2,Vec2,Vec2,Vec2] | null; roll: number; present: boolean }
// corners: 비디오 정규화 좌표(0..1, 미러 적용 후), 중심 기준 각도 정렬 TL,TR,BR,BL
// roll: 왼손 미드포인트→오른손 미드포인트 벡터 각도(rad)
export async function createHandTracker(video: HTMLVideoElement): Promise<{ read(): FingerFrame; dispose(): void }>
```

### math (순수 모듈 — DOM 금지, bun test 대상)

- `one-euro.ts`: `class OneEuroFilter { constructor(minCutoff=1, beta=0.007, dCutoff=1); filter(v: number, tSec: number): number }` + `class OneEuroVec3`
- `offaxis-projection.ts`: `kooimaProjection(pa,pb,pc,pe: Vec3, n,f: number): number[16]` — Kooima "Generalized Perspective Projection" 논문 그대로. pa=화면 좌하, pb=우하, pc=좌상 (미터, 눈 좌표계)
- `quad.ts`: `orderCorners(pts: Vec2[4]): [Vec2,Vec2,Vec2,Vec2]` (centroid 각도 정렬, TL 시작 시계방향), `invBilinear(p, a,b,c,d): Vec2|null` (셰이더와 동일 알고리즘의 CPU 레퍼런스 — 테스트용)
- `twist.ts`: `class TwistDetector { constructor(fireDeg=35, rearmDeg=15, cooldownMs=600); update(rollRad: number, tMs: number): -1|0|1 }` — 히스테리시스 + 쿨다운, 발화 후 재무장 필요

## 4. 01 Off-Axis Window

- 머리 위치: FaceLandmarker 눈 바깥 코너(landmark 33, 263). 
  `z = (IPD_M * focalPx) / eyeDistPx`, `focalPx = 0.866 * videoWidth` (hFOV 60° 가정), IPD_M=0.063.
  x,y: 눈 midpoint를 화면 미터로 매핑(SCREEN_W_M 비율). **미러 반전 주의**: 관람자가 오른쪽으로 → 시점 오른쪽.
- SCREEN_W_M 기본 0.6, `-`/`=` 키로 조정(localStorage 저장). OneEuroVec3로 스무딩.
- three.js PerspectiveCamera에 `camera.projectionMatrix.fromArray(kooima...)` 매 프레임 수동 세팅
  (`projectionMatrixInverse`도 갱신). 화면 평면 = z=0, 방은 z<0으로 후퇴.
- 씬(DEXA 아이덴티티, Ink #0D0E10 배경):
  - 방: 폭=SCREEN_W_M 비율 박스, 깊이 1.2m. 벽·바닥·천장 = 시안(#5EE7F3) 그리드 라인(LineSegments), 배경으로 fog.
  - 부유 오브젝트: 와이어프레임 icosa/box/torus 6~9개, 깊이 -0.15~-1.0m, 느린 회전. 1~2개는 z>0 (팝아웃).
  - 방 안쪽 끝에 오렌지(#FF5A1F) 액센트 링 + "DEXA" 스프라이트.
  - 파티클 더스트 ~200개.
- 얼굴 미검출 시: 마지막 포즈로 서서히 복귀(중앙), HUD dot 회색.
- HUD: 워드마크, 트래킹 상태, 안내("화면 앞에서 머리를 움직여 보세요"), fps, `v` 키로 웹캠 PIP 토글.

## 5. 02 Finger Frame

- 렌더: WebGL2 raw(three 불필요). 풀스크린 쿼드, 웹캠 텍스처(미러).
- 프래그먼트: `quadUV = invBilinear(uv, c0..c3)`; 내부(0..1)면 `effect(effectIndex, tex, quadUV, uv, time)`,
  경계 0.01 폭 시안 글로우 프레임 + 코너 마커(뷰파인더 느낌), 외부는 원본 0.55 dim + 약한 비네트.
- corners 유니폼은 OneEuro 스무딩(코너당 x,y). 손 미검출 시 프레임 서서히 축소·페이드.
- 이펙트 12종 (단일 프로그램, int 유니폼 분기). 프레임 안쪽은 "들여다보는 재질"이거나
  "피드가 표시된 화면"으로 읽힌다. 표면은 정지 — 시간에 반응하는 건 필름 그레인과 CRT 플리커뿐.
  유리·재질: 1 frosted glass(스파이럴 블러+미세 노이즈 굴절) · 2 reeded glass(세로 리브, 리브 기울기로 수평 굴절) ·
  3 ripple glass(정적 사인 표면 굴절+스펙큘러) · 4 stained glass(보로노이 셀 색조+납선) ·
  5 prism glass(중심 방사 색분산, 가장자리로 갈수록 강함) · 6 cracked ice(파편별 오프셋·회전+균열선) ·
  7 glass block(5×4 유리블럭, 블럭별 배럴 굴절+두꺼운 이음매)
  스크린 텍스처: 8 crt phosphor(RGB 트라이어드+스캔라인+튜브 벌지) · 9 led wall(사각 발광체+글로우) ·
  10 halftone print(15° 도트, 시안/오렌지 잉크 on 종이) · 11 newsprint(45° 그레이 도트+종이 그레인+잉크 번짐) ·
  12 film grain(S커브+웜 페이드+애니메이션 그레인+비네트)
- TwistDetector 발화 시 인덱스 ±1 순환, HUD에 이펙트 이름 800ms 플래시 (`01 / FROSTED GLASS`).
- HUD: 안내("양손 엄지와 검지로 사각형을 만들어 보세요 · 비틀면 이펙트 전환"), 상태 dot, fps.

## 6. 랜딩 (index.html)

gen-lab 랜딩 구조 참고. Ink 다크, 상단 워드마크 `DEXA INTERACTIVE LAB.`(시안 마침표),
`/// WEBCAM INTERACTIVE EXPERIMENTS` 사이드 캡션, 카드 2장(01/02, 번호·모노 캡션·설명·REQUIRES WEBCAM 뱃지),
프라이버시 라인("모든 처리는 브라우저 로컬 — 영상은 전송되지 않습니다"), 푸터 `← dexa.art`.

## 7. 검증

- `bun run build` exit 0 (typecheck 포함), `bun test` 전부 통과
- Playwright(Chromium, `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`):
  세 페이지 로드 → 콘솔 에러 0(모델 로드 포함), 캔버스 존재, HUD 표시. fake 영상엔 얼굴/손이 없으므로
  "미검출 상태 UX"가 보이는 것까지 확인.
- 배포 후 `curl -s -o /dev/null -w '%{http_code}' https://dexa.art/interactive/` == 200

## 8. 배포·카드

1. GitHub repo `DECK6/dexa-interactive-lab` 생성(gh), README(영문 본문+한국어 요약, 시블링 톤), main 푸시
2. `scripts/deploy.sh` → `../adxdeck-dexa-daily-main/interactive`
3. `adxdeck-dexa-daily-main/projects.json`에 dev 카드 추가(dev-15, url "/interactive/", size large, badge NEW,
   repo 링크, category "Webcam · Realtime CV"). script.js fallback은 건드리지 않음(labs 미포함 확인됨).
4. adxdeck-dexa-daily-main 커밋·푸시(main) → GitHub Pages 반영 확인

---

# v2 addendum — 04~08 (2026-09-03)

Author: Fable (설계·기반·검수) / Implementers: Codex gpt-5.6-sol ×5 병렬 (모듈별) / 통합·QA: Fable

## 0. 목표

"보는 순간 놀라고, 찍어서 올리고 싶은" 웹캠 인터랙티브 5종 추가. 각 페이지는 한 문장으로 설명되는
와우 포인트 하나를 가진다. 모든 페이지에 SNAPSHOT(PNG 저장, DEXA 워드마크 스탬프) 공통 제공 — 공유 유도.

| # | 파일 | 이름 | 모달리티 | 한 줄 와우 |
|---|------|------|----------|-----------|
| 04 | echo.html / src/echo | TIME ECHO 시간 메아리 | ImageSegmenter | 움직이면 과거의 내가 시안→오렌지 잔상으로 따라온다 |
| 05 | dust.html / src/dust | DUST FACE 먼지 얼굴 | FaceLandmarker+blendshapes | 내 얼굴이 2만 개 먼지로 떠 있고, 입을 벌리면 흩어졌다 다시 모인다 |
| 06 | fluid.html / src/fluid | NEON FLUID 손끝 유체 | HandLandmarker ×2 | 손가락 끝에서 네온 잉크가 흘러나와 소용돌이친다 |
| 07 | graffiti.html / src/graffiti | AIR GRAFFITI 공중 낙서 | HandLandmarker ×2 | 손가락을 집으면 허공에 빛으로 글씨가 써지고, PNG로 저장된다 |
| 08 | snow.html / src/snow | SNOWFALL 쌓이는 눈 | ImageSegmenter | 눈이 내 머리와 어깨 위에 진짜처럼 쌓이고, 몸을 털면 떨어진다 |

## 1. 공통 기반 (Fable 작성, 구현자는 수정 금지)

- `public/models/selfie_segmenter.tflite` 추가(fetch-models.mjs). 런타임 CDN 없음 유지.
- `src/lib/tracking/segmenter.ts` — `createSegmenter(video)` → `{ read(): PersonMask; dispose() }`
  `PersonMask { data: Float32Array|null; width; height; present; coverage; sample(u,v): number }`
  data는 **비디오 원본 방향**(미러 아님) 행우선. `sample(u,v)`는 **미러 적용된** 정규화 좌표(손 트래커와 동일 관례)로 0..1 확률 반환.
- `src/lib/tracking/face-blend.ts` — `createFaceBlendTracker(video)` → `{ read(): FaceState; dispose() }`
  `FaceState { landmarks: Vec2[]|null (478, 미러·정규화); blend: Record<string,number>; present }`
  blend 키는 MediaPipe categoryName 그대로(`jawOpen`, `browInnerUp`, `eyeBlinkLeft`…). `FACE_OVAL` 인덱스 export.
- `src/lib/tracking/hands2.ts` — `createTwoHandTracker(video)` → `{ read(): TwoHands; dispose() }`
  `TwoHands { hands: HandData[]; present }`, `HandData { landmarks: Vec2[] (21, 미러·정규화); label: string }`
  hands는 **손목 x 오름차순**(화면 왼쪽이 index 0). `FINGERTIPS`, `PALM` 인덱스 export.
- `src/lib/cover.ts` — `coverMap(videoW, videoH, canvasW, canvasH)` → `{ toScreen(p: Vec2): Vec2; coverX; coverY }`
  (비디오를 뷰포트에 cover-crop 했을 때 정규화 좌표→캔버스 px, fingerframe/puppet과 동일 수식)
- `src/lib/gl.ts` — `createProgram(gl, vs, fs)`, `FULLSCREEN_VS`, `createTexture(gl, {filter, wrap})`, `uploadVideo(gl, tex, video)`
- `src/lib/hud.ts` — `createHud({ title, sub, hint, snapshot?: () => HTMLCanvasElement | null })`.
  snapshot이 주어지면 우하단 `SNAPSHOT ⤓` 버튼(Signal Orange) + `S` 키. 저장 파일명 `dexa-<slug>-<yyyymmdd-hhmmss>.png`,
  우하단에 `DEXA INTERACTIVE LAB.` 워드마크 스탬프 합성, 저장 후 `SAVED` 플래시.
- 페이지 HTML 5개, vite input, 랜딩 카드 5장(04~08), e2e 5케이스(+카드 수 8) — Fable.

## 2. 모듈 공통 규칙

- 진입점 `src/<mod>/main.ts`는 puppet/main.ts 구조를 따른다: HUD → initCamera(실패 시 showCameraError) → 트래커 →
  resize(dpr≤2) → rAF 루프(dt clamp 0.1, fps EMA, presence 엔벨로프) → pagehide 정리.
- 순수 로직은 DOM 없는 모듈로 분리해 `tests/unit/<mod>.test.ts`(bun test)로 검증. 렌더/GL은 테스트 제외.
- 색은 DEXA 토큰만: Ink `#0D0E10` 배경, Cyan `#5EE7F3`, Orange `#FF5A1F`, key `#2A2B2E`. 다른 hue 금지(hue 드리프트는 시안↔오렌지 사이에서만).
- 미검출 상태에서도 화면이 죽어 있으면 안 된다(아이들 모션 + HUD 힌트).
- 라이브러리 추가 금지(three는 필요 시만). 런타임 CDN 금지. TypeScript strict, noUnused.

## 3. 04 TIME ECHO

- WebGL2. 링 버퍼 32슬롯: 슬롯당 비디오 프레임 텍스처(RGBA, 비디오 해상도) + 마스크 텍스처(R8 256²) + 타임스탬프.
  새 비디오 프레임마다 슬롯 갱신(video.currentTime 변화 시).
- 에코 7겹: k=0(라이브, 원색) + k=1..6 (지연 k·spacing, 기본 spacing 0.12s). 각 k는 `now - k·spacing`에 가장 가까운 슬롯.
  틴트: k=1 시안 → k=6 오렌지 선형, 알파 0.6→0.15. 그리기 순서 오래된 것부터, 라이브 마지막. 블렌드 screen/additive.
- 마스크 엣지 smoothstep(0.35, 0.65). 배경: 원본 피드 0.18 밝기 + Ink.
- 키: `[`/`]` spacing 0.04~0.3s, `v` 배경 피드 토글. 사람 미검출: 에코 페이드아웃, HUD 힌트.
- 테스트: `ring.ts` — `class FrameRing { constructor(n); push(t); pick(t): index|-1 }` 시간 기반 슬롯 선택.

## 4. 05 DUST FACE

- FaceLandmarker(blendshapes on). 파티클 20,000(FPS<40 지속 시 1회 절반).
- 홈 좌표: FACE_OVAL 다각형 내부에서 균등 샘플(스폰 시 point-in-polygon). 저장은 oval bbox-local (u,v). 매 프레임 홈 = 현재 bbox로 사상 → 머리 이동·스케일 추종.
- 색: 버텍스 셰이더에서 비디오 텍스처를 홈 UV(미러)로 샘플 → 살아있는 얼굴색. scatter 정도에 따라 시안으로 믹스.
- 물리(CPU Float32Array): 스프링 복귀(k 18, damping 0.88) + 컬 노이즈 미세 흔들림. `jawOpen ≥ 0.45`: 입 중심(13·14 중점)에서 방사 임펄스(강도 ∝ jawOpen) + 난류, 복귀 스프링 off, 드래그만. 입 닫으면 복귀. 머리 yaw(코끝 1 vs 눈 코너 33·263 비대칭)로 바람 방향. `browInnerUp ≥ 0.5` 반짝임(지터).
- 렌더: WebGL2 POINTS, 크기 2.5px·dpr, additive 블렌드, Ink 배경 + 점 그리드. `v` 희미한 피드 토글(기본 off). `r` 재시드.
- 얼굴 미검출: 마지막 홈 유지 + 느린 드리프트, 30초 후 구름처럼 확산.
- 테스트: `particles.ts` — `createDust(n)`, `seedHomes(oval: Vec2[], n, rng)`, `step(state, dt, input)` 순수 함수. 입 열면 평균 홈 거리 증가, 닫으면 감소 검증.

## 5. 06 NEON FLUID

- WebGL2 Stable Fluids(Stam/Dobryakov 구조를 직접 구현, 외부 코드 복사·라이브러리 금지): sim 128(짧은 변), dye 512~1024.
  단계: curl → vorticity(30) → divergence → pressure Jacobi 20 → gradient subtract → advect velocity(dissipation 0.2/s) → advect dye(1.0/s) → splats.
  EXT_color_buffer_float 있으면 RGBA16F, 없으면 RGBA8 폴백.
- 이미터: 두 손 손가락 끝 10점. 속도 = (pos - prev)/dt. 색: hand0 시안 계열, hand1 오렌지 계열, 손가락별 미세 hue 변주 + 시간 드리프트(시안↔오렌지 사이).
  핀치(엄지-검지 거리/손바닥 크기 < 0.4) → 잉크 드롭: 반경 ×4, 방사 속도 버스트.
- 배경: 피드 0.25 밝기. 손 미검출: 1.5s마다 은은한 앰비언트 splat, HUD 힌트.
- 테스트: `emitters.ts` — `computeEmitters(prev: HandData[]|null, curr: HandData[], dt): Emitter[]`, `isPinching(hand): boolean`, `emitterColor(handIdx, fingerIdx, t): [r,g,b]` (0..1, hue가 시안~오렌지 밖으로 나가지 않음).

## 6. 07 AIR GRAFFITI

- 두 손. 핀치 히스테리시스(0.45 on / 0.65 off, 손바닥 크기 정규화). 펜 끝 = 엄지·검지 끝 중점, OneEuro(1.5, 0.6).
- 스트로크: 최소 세그먼트 2px, 폭 = 속도 매핑(느림 14px ↔ 빠름 3px, dpr 스케일). 손0 시안, 손1 오렌지. 두 손 동시 드로잉 가능.
- 렌더(Canvas2D): 글로우 3패스(4×폭 α0.12 → 2×폭 α0.3 → 1×폭 α1 + 0.4×폭 화이트 코어). 은은한 글로우 펄스. 배경 = 미러 피드 0.55 밝기(사람이 사진에 들어온다).
- 주먹(네 손가락 끝이 PIP보다 손목에 가까움) 0.8s 유지 → 전체 지우기(0.5s 디졸브). `c` 지우기, `z` 되돌리기. 포인트 20,000 초과 시 오래된 스트로크부터 제거.
- SNAPSHOT 필수(피드+스트로크 합성).
- 테스트: `ink.ts` — `class PinchGate { update(ratio): boolean }`, `widthForSpeed(pxPerSec, dpr): number`, `class Stroke { add(p, t): boolean }`, `isFist(landmarks): boolean`.

## 7. 08 SNOWFALL

- ImageSegmenter. 플레이크 1,800: 반지름 1.5~4px, 낙하 40~120px/s(크기 비례), 좌우 sway(sin), 화면 밖 아래로 나가면 위에서 리스폰.
- 착지: 이번 스텝 이동으로 mask(0.5) 밖→안 진입 시 이전 위치에 정지(resting). resting은 매 프레임 마스크 재확인: 밖이면 낙하 재개(작은 랜덤 임펄스), 마스크 안쪽으로 깊이 묻히면 위로 최대 40px 표면 탐색 후 재정지, 실패 시 낙하.
- 털기: 마스크 모션 에너지(연속 프레임 마스크 차분 평균)가 임계 이상이면 resting 플레이크가 확률적으로 떨어짐(에너지 비례).
- 사람 2s 미검출: 전부 낙하. `r` 리셋. HUD 우측 `SNOW LOAD n` 카운터(resting 수).
- 렌더(Canvas2D): 피드 0.35 밝기 + 마스크 실루엣 시안 틴트 α0.10, 플레이크 = 흰~시안 점 + 소프트 글로우.
- 테스트: `flakes.ts` — `createFlakes(n, w, h, rng)`, `stepFlakes(flakes, dt, mask: (x,y)=>number, motion: number, w, h)`. 합성 사각형 마스크에 착지·마스크 제거 시 낙하·바닥 아래 미존재 검증.

## 8. 검증·배포

- 게이트: `bunx tsc --noEmit` exit 0, `bun test` 전부 통과, `bun run build` exit 0, Playwright 9케이스(랜딩+8) 콘솔 에러 0·동일 출처 자산.
- 배포: deploy.sh → adxdeck-blog-main/interactive, projects.json dev-16 설명 갱신(8종). **푸시는 사용자 승인 게이트**.
