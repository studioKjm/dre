/** Data 레이어가 반환하는 원시 페이지. 해석은 Logic이 한다. */
export interface RawPage {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
  retrievedAt: string; // ISO 8601
  /** 응답 헤더 (소문자 키). 기술스택 탐지(x-powered-by, server 등)에 쓴다. 비어 있을 수 있다. */
  headers?: Record<string, string>;
}

/** 스토어 페이지에서 추출한 인앱 상품 (개인정보 필드 없음) */
export interface RawProduct {
  name: string;
  priceText: string;
}

/** archive.org CDX 조회로 얻은 스냅샷 메타데이터 (콘텐츠 자체는 아니다) */
export interface WaybackSnapshotMeta {
  timestamp: string; // "YYYYMMDDhhmmss"
  originalUrl: string;
}

/** 사용자가 직접 라벨링한 정답 (AC-008) */
export interface GoldLabel {
  targetUrl: string;
  country?: string;
  labels: string[];
  evidence: string[];
  labeledAt: string;
}
