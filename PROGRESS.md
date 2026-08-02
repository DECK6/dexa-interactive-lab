# PROGRESS — DEXA INTERACTIVE LAB

세션 시작: 2026-08-02 12:13 KST (5h 한도 → ~17:13, 인계 트리거 16:15~16:40 또는 토큰 90%)
오케스트레이션: Fable 설계·검증 / Opus-5 구현 / 한도 임박 시 Orca→Codex 인계 (HANDOFF.md)

## Acceptance Criteria

- [ ] AC1: Vite+TS 프로젝트, `bun run build` exit 0, `bun test` 통과
- [ ] AC2: 01 Off-Axis — 얼굴추적→Kooima 오프액시스 투영, DEXA 씬, 미검출 fallback
- [ ] AC3: 02 Finger Frame — 양손 4점 사각형 마스크 GLSL 8종, 비틀기 전환
- [ ] AC4: 랜딩 + DEXA 다크 테마 + 프라이버시 라인
- [ ] AC5: Playwright fake-cam 스모크 3페이지 통과 (콘솔 에러 0)
- [ ] AC6: GitHub DECK6/dexa-interactive-lab 생성, README, 푸시
- [ ] AC7: dexa.art/interactive 라이브 (200) + 메인 Dev Lab 카드 추가·푸시

## Batches

- [x] B0 설계: DESIGN.md 작성 (Fable) — 12:20
- [x] B1 파운데이션: scaffold, 테마, camera/tracking/math libs, 모델 번들, 랜딩 — Opus-5
      verified: bun run build exit 0, bun test 24 pass, models/wasm 번들, commit c6aa1f7 — 12:30
- [x] B2a 오프액시스 — Kooima P·M·T 검증, 씬 스펙 충족, 12:40 (commit 4376e41)
- [x] B2b 핑거프레임 — 8이펙트 단일 프로그램, invBilinear GLSL, 트위스트 전환, 12:40 (commit 4376e41)
      integrated verify: bun run build exit 0, bun test 24 pass
- [ ] B3 QA·문서: Playwright e2e, README — Opus-5 실행 중
- [ ] B4 배포: gh repo 생성·푸시, deploy.sh, projects.json 카드, adxdeck 푸시, 라이브 확인 — Fable

## Log

- 12:13 조사 완료: 배포 실장소는 adxdeck-dexa-daily-main (vfx deploy.sh가 rsync), 카드는 projects.json(dev 섹션, script.js fallback은 labs 미포함), 테마 토큰은 gen-lab src/theme/dexa-theme.css
- 12:20 DESIGN.md 확정, B1 에이전트 디스패치
