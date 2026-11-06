import { htmlToText, type WaybackSnapshotMeta } from "@dre/core";
import { extractPlanCandidates } from "./pricing.js";
import type { Collected, PlanCandidate } from "../types.js";

export interface PriceSnapshot {
  /** "YYYY-MM-DD" (CDX 타임스탬프 앞 8자리를 사람이 읽기 쉬운 형태로) */
  date: string;
  snapshotUrl: string;
  items: PlanCandidate[];
}

export interface WaybackTimelineSource {
  fetchTimeline(url: string): Promise<WaybackSnapshotMeta[]>;
  fetchSnapshot(meta: WaybackSnapshotMeta): Promise<{ body: string; finalUrl: string } | null>;
}

function toIsoDate(timestamp: string): string {
  // "20240315123456" -> "2024-03-15"
  return `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}`;
}

/** n개를 전체 범위에 고르게 걸쳐 고른다 (맨 처음·마지막 포함). */
function evenlySpaced<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(arr[Math.round((i * (arr.length - 1)) / (n - 1))]!);
  return [...new Set(out)];
}

/**
 * REA에는 없는 기능: 한 사이트의 가격이 시간에 따라 어떻게 바뀌었는지 archive.org 스냅샷으로
 * 추적한다. "지금 이 순간의 상태"가 아니라 "최근 N년간 어떻게 바뀌었는가"를 본다.
 * 각 스냅샷은 그 시점의 정적 HTML이라, JS 렌더링이 필요했던 페이지는 당시에도 셸만
 * 저장됐을 수 있다 — 그런 경우 해당 시점은 items가 비어 있을 뿐 오류는 아니다.
 */
export class PriceHistoryCollector {
  constructor(private readonly source: WaybackTimelineSource) {}

  async collect(url: string, opts: { maxSnapshots?: number } = {}): Promise<Collected<PriceSnapshot>> {
    const { maxSnapshots = 6 } = opts;
    const timeline = await this.source.fetchTimeline(url);
    const warnings: string[] = [];
    if (!timeline.length) {
      return { items: [], evidence: [], warnings: ["no archived snapshots found for this URL on archive.org"] };
    }

    const chosen = evenlySpaced(timeline, maxSnapshots);
    const items: PriceSnapshot[] = [];
    const evidence = [];
    for (const meta of chosen) {
      const page = await this.source.fetchSnapshot(meta);
      if (!page) {
        warnings.push(`snapshot at ${toIsoDate(meta.timestamp)} could not be fetched; skipped`);
        continue;
      }
      const snapshotItems = extractPlanCandidates(htmlToText(page.body));
      items.push({ date: toIsoDate(meta.timestamp), snapshotUrl: page.finalUrl, items: snapshotItems });
      evidence.push({ url: page.finalUrl, retrievedAt: new Date().toISOString(), source: "dre" as const });
    }

    if (items.every((s) => s.items.length === 0)) {
      warnings.push("no price-like text found in any snapshot — the page may have always needed JS rendering, which archived static snapshots don't capture");
    }

    return { items, evidence, warnings };
  }
}
