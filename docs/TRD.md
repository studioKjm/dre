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

## 10. Addendum (2026-11-27): `collect_structured_data` (schema.org JSON-LD)

Seed: `.harness/ouroboros/seeds/seed-structured-data-v1.yaml` (프로젝트 전체 seed-v1과 별개 — 이 기능 전용).

### 10.1 Layer Design

| 레이어 | 모듈 | 책임 |
|---|---|---|
| Presentation (`@dre/mcp`) | `server.ts`에 `collect_structured_data` 도구 등록 | 입력은 기존 `collectInput`({url}) 재사용 — 새 스키마 불필요 |
| Logic (`@dre/logic`) | `structured-data.ts` (순수 함수) | HTML에서 `<script type="application/ld+json">` 블록을 찾아 JSON.parse, `@type`이 `Organization`/`Product`인 것만 화이트리스트 필드로 변환. 블록 하나가 깨져도 나머지는 계속 처리(best-effort) |
| Logic (`@dre/logic/collectors`) | `structured-data.ts` (`StructuredDataCollector` 클래스) | fetch → 파싱 → 봇 차단류 오류면 archive.org 폴백(pricing.ts/terms.ts와 동일 패턴: `isBotBlockLike` 재사용) |
| Data (`@dre/data`) | 신규 코드 없음 | `fetchPage`, `fetchFromWayback` 기존 함수 그대로 재사용 |

### 10.2 Ontology (결정됨)

```ts
// packages/logic/src/structured-data.ts
export type StructuredFact =
  | { kind: "organization"; name?: string; foundingDate?: string; numberOfEmployees?: string; industry?: string }
  | { kind: "product"; name?: string; price?: string; priceCurrency?: string; availability?: string };
```

- `Organization`과 `Product`를 하나의 union(`StructuredFact`)으로 합치고 `kind` 필드로 구분한다 (논의 결과 — `Collected<T>`의 기존 `items: T[]` 패턴과 자연스럽게 맞물림).
- `numberOfEmployees`가 `QuantitativeValue`({minValue,maxValue}) 객체면 `"${minValue}-${maxValue}"` 문자열로 정규화한다. 단순 숫자/문자열이면 그대로 문자열화. 둘 다 아니면 필드 생략.
- `offers`가 배열이면 첫 번째 원소만 쓴다 (여러 SKU 전부를 다루는 건 이번 범위 밖 — seed의 non_goals와 일치).

### 10.3 Layer Communication

- Presentation → Logic: MCP 핸들러가 `services.structuredData.collect(url)` 직접 호출 (기존 `guarded()` 래퍼 재사용).
- Logic → Data: `PageFetcher`/`PageArchive` 포트 (기존 `ports.ts`, 변경 없음).
- 데이터 형식: `Collected<StructuredFact>` (기존 `types.ts`에 타입 추가).

### 10.4 Directory Structure

```
packages/logic/src/
  structured-data.ts         (신규, 순수 함수 — techstack.ts와 같은 위치)
  structured-data.test.ts    (신규)
  collectors/
    structured-data.ts       (신규 — pricing.ts/terms.ts와 같은 구조)
    structured-data.test.ts  (신규)
  types.ts                   (수정 — StructuredFact export 추가)
packages/mcp/src/
  server.ts                  (수정 — 도구 등록 1개 추가, ToolServices에 structuredData 추가)
  server.test.ts             (수정 — "exposes the eleven/twelve tools" 갱신)
packages/app/src/
  services.ts                (수정 — DI 조립 1줄 추가)
```

### 10.5 Test Strategy

- Logic(`structured-data.ts` 순수 함수): 단위 테스트 — Organization만/Product만/둘 다/JSON-LD 없음/블록 하나 깨짐/QuantitativeValue 정규화. mock 없음.
- Logic(`collectors/structured-data.ts`): 단위 테스트 — `FakeFetcher`/`PageArchive` 가짜 구현 주입(기존 `testing.ts` 패턴), 봇 차단→archive 폴백, 폴백도 실패 시 원래 에러 전파.
- Presentation(`server.ts`): 기존 "exposes the N tools" 테스트 갱신 + 수집기 예외가 `isError` 결과로 변환되는지 확인(기존 패턴 재사용, 새 테스트 불필요할 수도 있음 — 기존 테스트가 이미 포괄적으로 커버).
- 라이브 검증(AC-006, 자동화 테스트 아님): 실제 사이트 3곳 — JSON-LD 있는 곳 / 없는 곳 / 봇 차단된 곳(archive.org 폴백 경로 확인).

### 10.6 Decisions & Trade-offs

| 결정 | 근거 | 대가 |
|---|---|---|
| `techstack`과 별개 독립 도구 | 기술스택 신호와 비즈니스 메타데이터는 성격이 달라 합치면 출처 구분이 어려워짐 | 도구 개수 11→12, README 표 갱신 필요 |
| 화이트리스트 필드만 추출 (원문 JSON 통째 반환 안 함) | 예측 가능한 결과, `pricing.ts`의 snapshot(원문)+items(힌트) 분리와는 다른 성격(JSON-LD는 이미 구조화돼 있어 원문 노이즈가 더 큼) | 화이트리스트 밖 필드는 유실 — 필요해지면 필드 추가 필요 |
| fetch 독립 요청 (techstack과 공유 안 함) | "각 수집기는 독립적으로 성공/실패 보고" 원칙 유지 | 같은 페이지를 두 번 fetch (허용 가능한 비용) |
| archive.org 폴백 재사용 | JSON-LD는 페이지 본문 구조라 아카이브에도 보존됨 (techstack의 응답 헤더와 다름) | 없음 — 기존 패턴 그대로 |
| numberOfEmployees 정규화 (QuantitativeValue → 문자열) | 호출 에이전트가 필드 타입을 두 가지로 분기하지 않아도 됨 | 정규화 로직 약간 추가 |

### 10.7 Implementation Order

1. Logic: `structured-data.ts` 순수 파싱 함수 → 단위 테스트 (AC-001~004)
2. Logic: `types.ts`에 `StructuredFact` 추가
3. Logic: `collectors/structured-data.ts` (fetch+archive 폴백) → 단위 테스트 (AC-005)
4. Presentation: `server.ts`에 도구 등록, `ToolServices`에 `structuredData` 추가 → 테스트 갱신 (AC-007)
5. App: `services.ts` DI 조립
6. 라이브 검증 3곳 (AC-006)
7. 문서화: README 도구 표, CHANGELOG.md, docs/adr.yaml
