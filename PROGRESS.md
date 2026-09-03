# PROGRESS — DEXA INTERACTIVE LAB

세션 시작: 2026-08-02 12:13 KST (5h 한도 → ~17:13, 인계 트리거 16:15~16:40 또는 토큰 90%)
오케스트레이션: Fable 설계·검증 / Opus-5 구현 / 한도 임박 시 Orca→Codex 인계 (HANDOFF.md)

## Acceptance Criteria

- [x] AC1: Vite+TS 프로젝트, `bun run build` exit 0, `bun test` 통과
- [x] AC2: 01 Off-Axis — 얼굴추적→Kooima 오프액시스 투영, DEXA 씬, 미검출 fallback
- [x] AC3: 02 Finger Frame — 양손 4점 사각형 마스크 GLSL 12종(유리 7 + 스크린 5), 비틀기 전환
- [x] AC4: 랜딩 + DEXA 다크 테마 + 프라이버시 라인
- [x] AC5: Playwright fake-cam 스모크 3페이지 통과 (콘솔 에러 0)
- [x] AC6: GitHub DECK6/dexa-interactive-lab 생성, README, 푸시
- [x] AC7: dexa.art/interactive 라이브 (200) + 메인 Dev Lab 카드 추가·푸시

## Batches

- [x] B0 설계: DESIGN.md 작성 (Fable) — 12:20
- [x] B1 파운데이션: scaffold, 테마, camera/tracking/math libs, 모델 번들, 랜딩 — Opus-5
      verified: bun run build exit 0, bun test 24 pass, models/wasm 번들, commit c6aa1f7 — 12:30
- [x] B2a 오프액시스 — Kooima P·M·T 검증, 씬 스펙 충족, 12:40 (commit 4376e41)
- [x] B2b 핑거프레임 — 8이펙트 단일 프로그램, invBilinear GLSL, 트위스트 전환, 12:40 (commit 4376e41)
      integrated verify: bun run build exit 0, bun test 24 pass
- [x] B3 QA·문서: e2e 3/3 통과(Fable 재검증), README, deploy.sh — 12:48 (commit db83ac5)
- [x] B4 배포: DECK6/dexa-interactive-lab 생성·푸시, dist→interactive rsync,
      dev-16 카드 추가(충돌 해결: 원격이 dev-15 GLSL LAB 선점 → 내 카드 dev-16, 최신순 배치),
      adxdeck main ec44cce 푸시 — 13:00. 라이브 200 확인(13:05, 3페이지+모델 자산)

## Log

- 12:13 조사 완료: 배포 실장소는 adxdeck-dexa-daily-main (vfx deploy.sh가 rsync), 카드는 projects.json(dev 섹션, script.js fallback은 labs 미포함), 테마 토큰은 gen-lab src/theme/dexa-theme.css
- 12:20 DESIGN.md 확정, B1 에이전트 디스패치
- 13:05 완료: dexa.art/interactive 라이브, 전 AC 충족. Codex 인계 불필요(토큰·시간 여유)
- 13:35 v1.1: 사용자 피드백 반영 — 핑거프레임 이펙트 12종 재질·질감 세트로 교체(유리 7 + 스크린 미디어 5, 모션 왜곡 제거), build·unit 24·e2e 3/3 재검증, 재배포
- 2026-08-28 v1.2: 03 MARIONETTE 추가 — 손 하나가 컨트롤 바, 다섯 손가락 끝 스트링으로 물리 퍼펫
  (버렛 + 스틱/단방향 로프 제약 + 릴인 속도 제한 + 토르소 anti-fold) 조종. Canvas 2D 로봇 렌더링,
  랜딩 카드 3번, e2e 4페이지. verify: bun test 32 pass, build exit 0, e2e 4/4(PW_PORT 오버라이드
  추가 — 4173을 다른 프로젝트 dev 서버가 점유), 합성 앵커 비주얼 QA 4포즈 스크린샷 검수

## v2 — 04~08 (2026-09-03, 세션 시작 20:55 KST)

오케스트레이션: Fable 설계·기반·검수 / Codex gpt-5.6-sol ×5 병렬 구현 / 푸시는 사용자 승인 게이트

### Acceptance Criteria (v2)
- [x] AC8: 5페이지(echo/dust/fluid/graffiti/snow) 각각 DESIGN v2 스펙의 와우 포인트 동작, 미검출 아이들, SNAPSHOT
- [x] AC9: `bunx tsc --noEmit` 0, `bun test` 전부 통과(모듈별 ≥6 테스트), `bun run build` exit 0
- [x] AC10: Playwright 9케이스(랜딩+8) 콘솔 에러 0, 동일 출처 자산
- [x] AC11: 합성 인물 y4m으로 세그멘테이션 극성·에코·눈 착지·먼지 얼굴 비주얼 QA 스크린샷 검수
- [ ] AC12: 랜딩 8카드, README 갱신, adxdeck 배포(로컬 커밋), projects.json dev-16 설명 8종 — 푸시는 승인 대기

### Batches (v2)
- [x] V0 설계: DESIGN.md v2 addendum — 21:05
- [x] V1 기반(Fable): selfie_segmenter 모델, segmenter/face-blend/hands2 트래커, cover.ts, gl.ts, HUD 스냅샷(+S키·워드마크 스탬프),
      5 HTML, vite input, 랜딩 카드 5장, e2e 5케이스, cover 테스트 — tsc 0, bun test 36 pass, commit 1b97d4b — 21:20
- [x] V2 구현(Codex sol ×5 병렬, 21:22 발주 → 22:20 전원 완료): echo / dust / fluid / graffiti / snow — 발주서 scratchpad/prompts/*.md
      게이트: 모듈별 tsc 0 + bun test 통과 → Fable 코드 리뷰 → build → e2e
- [x] V3 QA(22:40): 합성 인물 y4m 비주얼 QA, 수정 라운드(Codex 재위임 또는 Fable 직접)
- [ ] V4 마감: README, PROGRESS, deploy.sh → adxdeck-blog-main 로컬 커밋, projects.json — 푸시 승인 요청

### Log (v2)
- 21:20 기반 커밋 1b97d4b. Codex sol ×5 발주 21:22.
- 21:35 합성 인물 스틸 4장(Codex 이미지 툴) → y4m 5클립(still/move/mouth/hand/pinch). 트래커 프로브(_segqa) 결과:
  세그멘터 극성 정상(사람 1·벽 0, coverage 0.36, 마스크는 비디오 해상도 640x480 — 256²가 아님),
  face jawOpen 열림 0.96 / 닫힘 0.30~0.47(합성 스틸이라 닫힘값이 높음 → 히스테리시스 0.5/0.3 권장),
  hands label 'Right'=관람자 오른손(미러 관례와 일치), pinchRatio 핀치 0.08~0.12 / 펼침 1.0~1.1.
- 22:05 Codex 4/5 완료(snow·graffiti·dust·echo, fluid 진행 중). 게이트: 각 모듈 tsc 0·bun test 통과(9/9/7/9).
  비주얼 QA(헤드리스 y4m): snow 착지·털기 정상(SNOW LOAD 374→0), graffiti 핀치 루프 정상, echo 잔상 정상, dust 얼굴 집합 정상.
  Fable 수정: dust 입 히스테리시스(0.5/0.35 — 합성 스틸 닫힘값 0.47이 0.45 단일 임계에 걸림) + 밝기 0.3→1.15 + 포인트 3px,
  graffiti 글로우를 세그먼트별→단일 패스(밴딩 제거·호출 수 1/4), echo additive→screen 블렌드(6겹 겹침 백화 방지).
  헤드리스 FPS는 모델 CPU 비용 지배(puppet 기준선 15) — 실GPU에서 재확인 필요.
- 22:40 fluid 완료(8 테스트). 리뷰 수정: DISPLAY_FS 비디오 v 반전(피드가 상하 뒤집혀 보이던 버그). 헤드리스는 소프트웨어 GL이라 염료가 거칠고 10~20 FPS →
  헤디드(GPU) Chromium으로 재검증: echo/dust/fluid/graffiti/snow 전부 59~61 FPS, 비주얼 정상(스크린샷 scratchpad/qa/shots/h-*).
  게이트: tsc 0, bun test 78/78, bun run build exit 0, e2e 9/9(PW_PORT=4181).
