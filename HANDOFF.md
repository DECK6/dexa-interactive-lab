# HANDOFF — DEXA INTERACTIVE LAB

2026-09-05 Codex 확장 구현·검증 완료. 이전 배포 기준은 lab `443fac0`, adxdeck `122d202`다. 마스터가 이번 확장분의 푸시·배포를 요청했으며, 배포 기록은 PROGRESS와 AKM 개발 로그에 남긴다.

## 현재 작업

AKM 기획을 바탕으로 01/02를 개선하고 09~13을 추가했다. 승인 기획은
`/Volumes/data/Obsidian/akm/00-inbox/2026-09-05-dexa-interactive-lab-akm-plan.md`.
개발 단계 상태는 `.planning/M3/P1/STATE.json`, 실행 계획은 같은 폴더의 `PLAN.md`다.
`.planning/`은 gitignore 대상이므로 공개 저장소의 설명은 README와 PROGRESS가 담당한다.

- offaxis/optics: Kooima 투영에 눈 이동이 이미 포함된다. 카메라 위치로 다시 적용하면 안 된다. 고체 깊이 가림 + 35개 광선 번들, 반사 최대 3회, 장면 부피에서 경로 종료.
- fingerframe: `capture.ts`가 획득/유지/배치를 담당한다. `relief.ts`는 밝기 기반 부조이며 실측 3D가 아니다. `filters.ts`에 기존 12개 셰이더 모드를 유지했다. 기본 캔버스는 `#relief-stage`, 필터는 `#stage`다.
- swarm/growth: 공간 해시 Boids / Physarum-inspired field. 성장의 먹이 간 탐색은 시각적 연결을 위한 적응 규칙이며 생물학·최단 경로 보장은 없다.
- cloth: Verlet + 격자 거리 제약. 잡는 점은 서로 중복되지 않고 바닥 위로 제한된다. 자기 충돌·찢기는 구현하지 않았다.
- harp: 소리 버튼으로 Web Audio 시작, 핀치 후 놓을 때만 발음. 현 영역 밖 입력과 손 상실은 발음을 만들지 않는다.
- `src/lib/hand-lab.ts`: 신규 5종 공통 입력·프리뷰·웹캠·종료 처리. `lab-layout.ts`: 모바일 스냅샷 배치와 bfcache 복원 시 재시작.

## 검증 증거

- `bun test tests/unit`: 117 pass, 0 fail, 30,739 assertions.
- `bun run build`: exit 0; TypeScript 검사 포함, 13개 체험 HTML + 랜딩 출력.
- `bun run test:e2e`: 20 pass, 40.4s. 13카드·포인터 동작·6회 캡처 후 5개 상한·양손 직물·모바일 설정·카메라 거부·가짜 카메라·복원 수명주기.
- 원문: `.planning/M3/P1/qa/{unit,build,e2e}.log`; 캡처: 같은 폴더 PNG들.
- Aside 별도 QA가 7개 변경 페이지의 실제 마우스 동작을 확인했고, 이후 root가 최종 캡처를 직접 읽었다.
- 실제 사람 웹캠/음질/관객 체감은 확인하지 않았다. 헤드리스 FPS 표시를 실제 기기 성능 보장으로 사용하지 않는다.

## 이어서 할 일

로컬 프리뷰는 `http://127.0.0.1:4198/interactive/`. 서버가 끝나면 `bun run preview -- --host 127.0.0.1 --port 4198`로 재시작한다.
사용자가 실제 웹캠 체감을 확인한 후 반응을 조정할 수 있다. 배포 시 최신 origin/main 기반의 별도 작업 폴더를 사용해 다른 작업의 수정사항과 분리한다.
`scripts/deploy.sh`의 기본 대상은 `../adxdeck-blog-main/interactive`이며 첫 인자로 별도 체크아웃의 interactive 경로를 지정할 수 있다. `/Volumes/data/Dev/adxdeck`는 다른 작업의 변경이 있는 클론이므로 배포 대상으로 추정하지 않는다.
이전 Claude transcript는 읽기 전용 역사 자료이며 수정하지 않았다.
