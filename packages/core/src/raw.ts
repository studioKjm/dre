/** Data 레이어가 반환하는 원시 페이지. 해석은 Logic이 한다. */
export interface RawPage {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
  retrievedAt: string; // ISO 8601
}

/** 스토어 페이지에서 추출한 인앱 상품 (개인정보 필드 없음) */
export interface RawProduct {
  name: string;
  priceText: string;
}

/** 사용자가 직접 라벨링한 정답 (AC-008) */
export interface GoldLabel {
  targetUrl: string;
  country?: string;
  labels: string[];
  evidence: string[];
  labeledAt: string;
}
