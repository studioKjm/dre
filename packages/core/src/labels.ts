/**
 * 수익모델 레이블 taxonomy. seed-v1에서 정한 10개 레이블의 유일한 공식 정의다.
 *
 * 왜 필요한가: 2026-10-24~25 평가에서 "subscription"과 "in-app-purchase"의 적용 범위가
 * 라벨링 주체(모델 자신 vs 독립 서브에이전트)마다 달라 같은 증거를 보고도 다른 레이블을 냈다.
 * 특히 Substack처럼 "플랫폼이 구독을 직접 받는가"와 "구독 기반 비즈니스를 가능하게 하는가"가
 * 뒤섞인 경우에 split이 생겼다. 아래 정의는 그 모호성을 없애기 위한 것이다.
 */
export const REVENUE_MODEL_LABELS = [
  "subscription",
  "usage-based",
  "freemium",
  "one-time",
  "ads",
  "marketplace-fee",
  "transaction-fee",
  "in-app-purchase",
  "licensing",
  "enterprise-sales",
] as const;

export type RevenueModelLabel = (typeof REVENUE_MODEL_LABELS)[number];

export const REVENUE_MODEL_LABEL_DEFINITIONS: Record<RevenueModelLabel, string> = {
  subscription:
    "분석 대상이 자신의 고객에게 직접 정기 결제를 청구한다. 플랫폼이 제3자(크리에이터, 입점사 등)의 " +
    "구독 요금에서 수수료만 떼는 경우(Substack, Steam의 콘텐츠 구독 등)는 이 레이블이 아니라 " +
    "transaction-fee/marketplace-fee로 표현한다. 플랫폼 자신이 파는 별도 구독 상품이 있을 때만 추가한다.",
  "usage-based": "사용량(호출 수, 시간, 용량, 건수 등)에 비례해 과금한다.",
  freemium: "무료 티어가 존재하고 유료 업그레이드로 유도하는 구조다.",
  "one-time": "건별 단발 결제로 끝나는 상품이 있다 (구독이 아님).",
  ads: "광고 게재로 수익을 낸다 (분석 대상이 광고주에게 받거나, 자사 서비스에 광고를 노출한다).",
  "marketplace-fee": "제3자 간 거래를 중개하고 수수료를 받는다 (예: 숙박, 배달 중개).",
  "transaction-fee": "결제·거래 건당 수수료를 받는다 (예: 결제대행, 플랫폼 커미션).",
  "in-app-purchase":
    "핵심 수익모델이 아니라 '결제 채널' 보조 레이블이다. iOS/Android 앱스토어 인앱결제로 상품이 " +
    "유통된다는 사실만을 나타내며, 같은 상품이 subscription/one-time 등 다른 레이블과 함께 붙을 수 있다. " +
    "비교·집계 시 핵심 수익모델 레이블과 분리해서 보는 것을 권장한다.",
  licensing: "지적재산·기술을 라이선스로 판매한다.",
  "enterprise-sales": "표준 가격표 대신 영업 문의/맞춤 견적 기반 기업 계약이 있다 (예: 'Contact Sales').",
};

export function isRevenueModelLabel(v: string): v is RevenueModelLabel {
  return (REVENUE_MODEL_LABELS as readonly string[]).includes(v);
}
