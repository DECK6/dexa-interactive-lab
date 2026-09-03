# HANDOFF — Codex 인계 문서 (토큰/시간 한도 시)

> 이 문서는 세션 진행 중 계속 갱신된다. Codex(orca)로 인계 시 이 문서 + DESIGN.md + PROGRESS.md가 전체 컨텍스트다.

## 미션 요약

DEXA INTERACTIVE LAB — 웹캠 인터랙티브 2종(오프액시스 창문, 핑거프레임 GLSL) 웹앱을
빌드→GitHub 푸시→dexa.art/interactive 배포→메인 Dev Lab 카드 추가까지 완료한다.
스펙: `DESIGN.md` (binding). 진행 상태: `PROGRESS.md` 체크리스트가 단일 진실.

## 핵심 사실 (조사 완료, 재조사 불필요)

- 배포 실장소: `/Volumes/data/Dev/adxdeck-dexa-daily-main` (main 브랜치, origin=DECK6/adxdeck, CNAME dexa.art, GitHub Pages)
  - `/Volumes/data/Dev/adxdeck`는 다른 작업 브랜치가 체크아웃된 별도 클론 — 건드리지 말 것
- 배포 방식: vfx-lab `scripts/deploy.sh` 패턴 — dist를 `../adxdeck-dexa-daily-main/interactive`로 rsync(스테일은 trash)
- 메인 카드: `adxdeck-dexa-daily-main/projects.json`에 dev 섹션 항목 추가(dev-13/14가 VFX/GEN LAB 선례).
  `script.js`의 PORTFOLIO_DATA fallback에는 labs가 없으므로 수정 불필요
- 테마 토큰: gen-lab `src/theme/dexa-theme.css`가 소스 오브 트루스
- 모델 CDN(storage.googleapis.com/mediapipe-models) 접근 확인됨. 모델은 public/models에 번들·커밋
- 시블링 관례: bun, Vite, base '/interactive/', Playwright fake-cam 스모크

## 남은 작업

PROGRESS.md의 미체크 배치가 곧 남은 작업. 각 배치의 verify를 통과시킨 뒤 체크할 것.

## 마감 체크리스트 (B4)

1. `bun run build && bun test && bun run test:e2e` 모두 통과 확인
2. `gh repo create DECK6/dexa-interactive-lab --public --source . --push` (README 먼저)
3. `bun run deploy` → adxdeck-dexa-daily-main에서 `git add interactive projects.json && git commit && git push origin main`
4. 2~3분 후 `curl -s -o /dev/null -w '%{http_code}' https://dexa.art/interactive/` == 200 확인
5. PROGRESS.md 최종 체크, 사용자 보고(한국어, 간결)

## 세션별 인계 메모

- 2026-08-02 13:00 — B0~B4 전부 완료. 남은 것은 dexa.art/interactive 200 확인뿐(Pages 빌드 대기).
  주의: 원격 projects.json에서 dev-15는 GLSL LAB(다른 세션 발행)이 선점 → INTERACTIVE LAB은 dev-16.
  로컬 미추적 glsl/은 원격과 동일 확인 후 scratchpad로 이동해 해소.

## v2 인계 메모 (2026-09-03)

- 미션: 04~08 다섯 페이지 추가(echo/dust/fluid/graffiti/snow). 바인딩 스펙은 DESIGN.md 맨 아래 "v2 addendum", 진행 원장은 PROGRESS.md "v2" 섹션.
- 배포 실장소는 이제 `../adxdeck-blog-main/interactive` (deploy.sh 반영 완료). 카드는 projects.json dev-16 설명만 갱신.
- 구현은 Codex gpt-5.6-sol 5개가 병렬(발주서: scratchpad/prompts/*.md — 세션 스크래치패드라 유실 가능, DESIGN.md가 원본). 기반 커밋 1b97d4b.
- QA: 합성 인물 y4m(scratchpad/qa/clips/*.y4m, Codex 이미지 툴로 생성한 스틸을 ffmpeg 크롭 스웨이) + `--use-file-for-fake-video-capture`로 Playwright 스크린샷(qa/shots.mjs).
- 세그멘터 극성(confidenceMasks[personIndex]가 사람인지)은 y4m QA에서 확인할 것 — 반대면 segmenter.ts에서 `1 - v`.
- 푸시는 사용자 승인 게이트. 로컬 커밋까지만.
