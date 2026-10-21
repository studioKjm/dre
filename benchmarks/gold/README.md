# 정답표 (Gold Labels)

AC-008: 직접 라벨링한 20곳(국내 5, 해외 15)과 DRE 리포트의 수익모델 레이블을 비교한다.
일치율은 레이블 집합의 Jaccard 평균이다 (`dre eval`).

## 레이블 목록 (다중 선택)
`subscription`, `usage-based`, `freemium`, `one-time`, `ads`, `marketplace-fee`,
`transaction-fee`, `in-app-purchase`, `licensing`, `enterprise-sales`

## 라벨링 규칙
- 에이전트의 분석 결과를 보기 전에 라벨링한다 (정답이 모델 성향에 치우치는 것을 방지).
- 공개된 가격 페이지·약관·스토어 상품으로 확인 가능한 것만 라벨로 쓴다.
- 확인 근거 URL을 `evidence`에 적는다.
- 한 곳당 YAML 파일 하나, 파일명은 도메인 기준 (`example.com.yaml`).
