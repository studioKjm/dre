# Technical Requirements Document — DRE v0.1 가격·수익모델 분석기

Seed: `.harness/ouroboros/seeds/seed-v1.yaml` (불변, 이 문서의 architecture 내용은 seed에 반영하지 않음)

## 1. Overview

- 목표: 공개 가격·상품·약관 페이지를 수집해 수익모델 분류에 필요한 증거를 MCP 도구로 제공하고, 에이전트가 낸 리포트를 claim 스키마로 검증한다.
- 추론은 호출하는 에이전트가 수행한다. DRE는 수집, 검증, 평가만 한다.
- 아키텍처: 3-tier layered, 레이어별 패키지.

## 2. Layer Design

### 2.1 Presentation (`@dre/mcp`, `@dre/cli`)
- MCP 도구: `collect_pricing`, `collect_appstore`, `collect_terms`, `submit_report`
- CLI: `dre analyze <url>`, `dre eval <reports> <gold>`
- 책임: 입력 검증(MCP 입력 경계에만 zod), DTO 변환, 에러를 MCP 오류/종료 코드로 변환. 비즈니스 규칙 금지.

### 2.2 Logic (`@dre/logic`)
- `PricingCollector`, `AppStoreCollector`, `TermsCollector`: 수집 오케스트레이션과 정규화, `Evidence` 부착
- `CrawlPolicy`: robots.txt 허용 여부 판단 (불허 시 `RobotsDisallowed` 반환, 수집 중단)
- `ReportService`: `@dre/core`의 `validateReport`를 호출해 보고서 검증, 저장 요청
- `EvalService`: 레이블 집합 Jaccard 평균 계산 (AC-007에서 정의 확정)
- 에러: Data의 타입 에러를 도메인 결과로 변환

### 2.3 Data (`@dre/data`)
- `Fetcher`: HTTP 취득 (타임아웃, User-Agent 명시, 재시도 제한)
- `BrowserRenderer`: puppeteer-core(선택 설치). 브라우저 없으면 `BrowserUnavailable`
- `RobotsRepository`: robots.txt 조회와 파싱
- `AppStoreParser`: 스토어 공개 페이지 HTML 파싱 (v0.1은 픽스처 기준, 라이브는 최선 노력)
- `ReportStore`, `GoldStore`: 파일 입출력 (JSON, YAML)
- 반환은 원시 타입(`RawPage`, `RawProduct`)만. 도메인 판단 금지.

### 2.4 Shared (`@dre/core`)
- 도메인 모델과 DTO: `Claim`, `Evidence`, `Report`, `validateClaim`, `validateReport`, `renderMarkdown`
- 외부 의존성 없음. 모든 패키지가 사용 가능.

## 3. Layer Communication

| 방향 | 방식 |
|---|---|
| Presentation → Logic | Logic 서비스의 함수 호출. 인자/반환은 `core`의 DTO |
| Logic → Data | Data 인터페이스(포트)를 주입받아 호출. 구현체는 Presentation의 조립 지점에서 연결 |
| Data → Logic | 원시 타입 반환, 실패는 타입 있는 에러 |
| 금지 | Presentation → Data 직접 호출, Data → Logic 의존, Logic → Presentation 의존 |

Data 구현체는 Logic이 정의한 인터페이스를 만족시키는 방식(의존성 역전)으로 두어, Logic 단위 테스트를 mock 없이 가짜 구현체로 수행한다.

## 4. Directory Structure

```
packages/
  core/    src/{schema,render}.ts
  data/    src/{fetcher,robots,browser,appstore,stores}.ts
  logic/   src/{collectors/*,crawl-policy,report-service,eval-service}.ts
  mcp/     src/{server,tools/*}.ts
  cli/     src/index.ts
benchmarks/  gold/ (정답표 YAML), README.md
docs/TRD.md
```

의존 방향: `mcp, cli → logic → data`, 모두 `→ core`. `data`는 `logic`을 import하지 않는다.

## 5. Test Strategy

| 레이어 | 방식 |
|---|---|
| core | 단위 테스트 (이미 4개) |
| logic | 단위 테스트. Data 인터페이스의 가짜 구현체를 주입 (CrawlPolicy, 정규화, Jaccard) |
| data | 통합 테스트. 로컬 HTTP 픽스처 서버, 저장된 스토어 HTML 픽스처, SPA 픽스처 |
| mcp | MCP SDK 인메모리 전송으로 클라이언트-서버 통합 테스트 (AC-006) |
| 수동 | AC-008: 사용자 정답표 20곳과 일치율 측정 |

원칙: 해당 모듈의 책임만 검증, mock은 레이어 경계에서만, 구현 직후 테스트 작성. 외부 실사이트 호출은 자동 테스트에 포함하지 않는다.

## 6. Decisions & Trade-offs

| 결정 | 근거 | 대가 |
|---|---|---|
| 레이어별 5패키지 | 경계를 의존성과 게이트로 기계적으로 강제, 유료 호스팅이 logic만 재사용 가능 | 초기 설정 증가 |
| puppeteer-core 선택 설치 | 설치가 가볍고 AC-003 충족 | 사용자가 Chrome을 직접 설치해야 함, 없으면 정적 수집으로 폴백 |
| zod는 MCP 입력 경계에만 | 외부 입력 검증 필수, 내부는 가볍게 유지 | 의존성 1개 추가 |
| robots 판단은 Logic, 조회는 Data | 정책을 네트워크 없이 테스트 가능 | 인터페이스 1개 추가 |
| seed는 유지, architecture는 TRD에만 | seed-v1 불변 원칙, 버전 증가 방지 | seed에서 설계로의 추적은 TRD를 통해야 함 |
| 앱스토어는 픽스처 기준 | 스토어 구조 변경과 약관 리스크를 v0.1에서 분리 | 라이브 수집 신뢰도는 낮음 |

## 7. Implementation Order (Data → Logic → Presentation)

1. 패키지 분리와 의존 방향 게이트 (`boundaries.yaml` DRE 규칙)
2. core 이전 정리 (이미 완료)
3. Data: Fetcher, RobotsRepository → 테스트
4. Logic: CrawlPolicy, PricingCollector → 테스트 (AC-002)
5. Data: BrowserRenderer → 테스트 (AC-003)
6. Data/Logic: AppStore (AC-004), Terms (AC-005)
7. Logic: EvalService → CLI (AC-007)
8. Presentation: MCP 서버 (AC-006)
9. 사용자 정답표 작성과 일치율 측정 (AC-008)

## 8. 구현 전 확인할 사항
- `@modelcontextprotocol/sdk`, `zod`, `puppeteer-core`의 현재 버전과 API를 공식 문서로 확인하고 설치 (기억에만 의존하지 않는다).
- 스토어 공개 페이지의 이용 조건 확인 (법적 검토 필요).
- `ARCHITECTURE_INVARIANTS.md` 4번 `[TODO]` 항목을 "Evidence 없는 observed 금지"로 채울 것을 제안한다.

## 9. Addendum (2026-10-21): 조립 지점 `@dre/app`
- 문제: "Presentation → Data 직접 호출 금지"와 "Data 구현체를 Presentation에서 조립"이 충돌했다.
- 결정: 조립 전용 패키지 `@dre/app`을 추가한다. `data`와 `logic`을 연결하는 유일한 곳이며 `cli`, `mcp`는 `app`과 `core`만 사용한다. 게이트 규칙으로 `cli`, `mcp`의 `@dre/data` import를 막는다.
- 의존 방향: `cli, mcp → app → logic, data → core`. (`logic`은 `data`를 import하지 않고 포트로만 의존)
- 브라우저: `puppeteer-core`는 24.x로 고정한다 (25.x는 Node >=22.12 필요, 본 프로젝트는 Node >=20). `BrowserUnavailable`은 Data와 Logic이 공유하므로 `core`에 둔다.
