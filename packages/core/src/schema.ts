import { isRevenueModelLabel, type RevenueModelLabel } from "./labels.js";

/** observed: 직접 관측 / inferred: 근거 기반 추론 / estimated: 가정 기반 추정 */
export type ClaimType = "observed" | "inferred" | "estimated";
export type Confidence = "high" | "medium" | "low";

export interface Evidence {
  url: string;
  snapshot?: string;
  retrievedAt: string; // ISO 8601
  /**
   * 이 근거를 누가 가져왔는지. "dre"는 DRE 수집기(collect_*)가 직접 가져온 것이고,
   * "agent"는 DRE 수집이 막히거나(robots.txt, 로그인 리다이렉트, 봇 차단) 비어 있어서
   * 호출하는 에이전트가 자체 웹 리서치로 보충한 것이다. 생략 시 "dre"로 간주한다
   * (과거 리포트와의 호환을 위함 — 그 시점엔 이 구분이 없었다).
   */
  source?: "dre" | "agent";
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
  if (c.type === "observed" && c.evidence.some((e) => e.source === "agent"))
    errors.push("observed claim cannot rely on agent-supplied evidence (source: agent) — use inferred or estimated");
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
