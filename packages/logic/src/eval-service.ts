import { SECONDARY_LABELS, type GoldLabel } from "@dre/core";

const coreLabels = (labels: string[]): string[] => labels.filter((l) => !(SECONDARY_LABELS as readonly string[]).includes(l));

export interface LabeledReport {
  targetUrl: string;
  labels: string[];
}

export interface TargetScore {
  targetUrl: string;
  score: number;
  missing: string[]; // 정답에는 있으나 리포트에 없음
  extra: string[]; // 리포트에만 있음
}

export interface EvalResult {
  mean: number;
  perTarget: TargetScore[];
  unmatchedGold: string[]; // 리포트가 없는 정답 (0점 처리)
  unmatchedReports: string[]; // 정답이 없는 리포트 (무시)
}

export function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 && B.size === 0) return 1;
  const inter = [...A].filter((x) => B.has(x)).length;
  return inter / (A.size + B.size - inter);
}

const key = (url: string): string => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return url.toLowerCase();
  }
};

export function evaluate(reports: LabeledReport[], gold: GoldLabel[]): EvalResult {
  const byKey = new Map(reports.map((r) => [key(r.targetUrl), r]));
  const perTarget: TargetScore[] = [];
  const unmatchedGold: string[] = [];

  for (const g of gold) {
    const r = byKey.get(key(g.targetUrl));
    if (!r) {
      unmatchedGold.push(g.targetUrl);
      perTarget.push({ targetUrl: g.targetUrl, score: 0, missing: [...g.labels], extra: [] });
      continue;
    }
    perTarget.push({
      targetUrl: g.targetUrl,
      // in-app-purchase 등 보조 레이블은 집계에서 뺀다 — core/labels.ts SECONDARY_LABELS 참고.
      score: jaccard(coreLabels(r.labels), coreLabels(g.labels)),
      missing: g.labels.filter((l) => !r.labels.includes(l)),
      extra: r.labels.filter((l) => !g.labels.includes(l)),
    });
  }
  const goldKeys = new Set(gold.map((g) => key(g.targetUrl)));
  return {
    mean: perTarget.length ? perTarget.reduce((s, t) => s + t.score, 0) / perTarget.length : 0,
    perTarget,
    unmatchedGold,
    unmatchedReports: reports.filter((r) => !goldKeys.has(key(r.targetUrl))).map((r) => r.targetUrl),
  };
}
