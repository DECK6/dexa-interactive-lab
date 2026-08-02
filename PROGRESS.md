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
