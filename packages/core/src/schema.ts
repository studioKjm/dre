import { isRevenueModelLabel, type RevenueModelLabel } from "./labels.js";

/** observed: 직접 관측 / inferred: 근거 기반 추론 / estimated: 가정 기반 추정 */
export type ClaimType = "observed" | "inferred" | "estimated";
export type Confidence = "high" | "medium" | "low";

export interface Evidence {
  url: string;
  snapshot?: string;
  retrievedAt: string; // ISO 8601
}

export interface Claim {
  claim: string;
  type: ClaimType;
  confidence: Confidence;
  evidence: Evidence[];
  assumptions: string[];
  /** estimated 주장은 단일 값 대신 범위로 표기 */
  range?: { low: number; high: number; unit: string };
}

export type Section =
  | "business-model"
  | "positioning"
  | "marketing"
  | "ads"
  | "tech-stack"
  | "domain";

export interface Report {
  target: string;
  generatedAt: string;
  /** 수익모델 다중 레이블 (정답표와 비교하는 값) */
  revenueModelLabels?: RevenueModelLabel[];
  sections: Partial<Record<Section, Claim[]>>;
}

/** 규칙 위반 목록을 반환한다. 비어 있으면 유효. */
export function validateClaim(c: Claim): string[] {
  const errors: string[] = [];
  if (!c.claim.trim()) errors.push("claim is empty");
  if (c.type === "observed" && c.evidence.length === 0)
    errors.push("observed claim requires evidence");
  if (c.type === "estimated") {
    if (!c.range) errors.push("estimated claim requires a range");
    else if (c.range.low > c.range.high) errors.push("range.low > range.high");
    if (c.assumptions.length === 0)
      errors.push("estimated claim requires assumptions");
  }
  if (c.type === "estimated" && c.confidence === "high")
    errors.push("estimated claim cannot have high confidence");
  return errors;
}

export function validateReport(r: Report): string[] {
  const errors: string[] = [];
  for (const [section, claims] of Object.entries(r.sections)) {
    claims?.forEach((c, i) => {
      for (const e of validateClaim(c)) errors.push(`${section}[${i}]: ${e}`);
    });
  }
  for (const label of r.revenueModelLabels ?? []) {
    if (!isRevenueModelLabel(label)) errors.push(`revenueModelLabels: unknown label "${label}"`);
  }
  return errors;
}
