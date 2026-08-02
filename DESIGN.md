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
- 이펙트 8종 (단일 프로그램, int 유니폼 분기):
  1 wave-ripple(중심 радиal sin 왜곡) · 2 rgb-glitch(채널 시프트+스캔라인 지터) ·
  3 pixelate(모자이크, 셀 크기 애니) · 4 kaleido(폴라 미러 6분할) ·
  5 neon-edge(sobel→시안 글로우 on Ink) · 6 vortex(반경 비례 스월) ·
  7 halftone(시안/오렌지 도트) · 8 thermal(휘도→Ink→시안→오렌지 램프)
- TwistDetector 발화 시 인덱스 ±1 순환, HUD에 이펙트 이름 800ms 플래시 (`01 / WAVE RIPPLE`).
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
