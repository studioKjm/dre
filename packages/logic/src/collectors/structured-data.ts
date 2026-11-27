import { FetchError } from "@dre/core";
import type { CrawlPolicy } from "../crawl-policy.js";
import type { PageArchive, PageFetcher } from "../ports.js";
import { extractStructuredFacts, type StructuredFact } from "../structured-data.js";
import type { Collected } from "../types.js";

/** robots.txt 불허나 사설 주소 차단이 아니라 서버가 실제로 자동화를 막은 경우만 "봇 차단"으로 본다. PricingCollector/TermsCollector의 isBotBlockLike와 동일한 판단. */
function isBotBlockLike(e: unknown): boolean {
  return e instanceof FetchError && e.kind === "http";
}

export class StructuredDataCollector {
  constructor(
    private readonly fetcher: PageFetcher,
    private readonly policy: CrawlPolicy,
    private readonly archive?: PageArchive,
  ) {}

  async collect(url: string): Promise<Collected<StructuredFact>> {
    await this.policy.assertAllowed(url);
    const warnings: string[] = [];
    let page;
    try {
      page = await this.fetcher.get(url);
    } catch (e) {
      // JSON-LD는 응답 헤더(techstack.ts)와 달리 페이지 본문 구조라 archive.org 스냅샷에도
      // 그대로 보존된다 — pricing.ts/terms.ts와 같은 폴백을 그대로 쓴다.
      if (!isBotBlockLike(e) || !this.archive) throw e;
      const archived = await this.archive.get(url);
      if (!archived) throw e;
      warnings.push(
        `${(e as Error).message}; served directly by the target failed, so an archive.org snapshot was used instead ` +
          `(from ${archived.finalUrl}) — this may be stale, not the site's current state`,
      );
      page = archived;
    }

    const items = extractStructuredFacts(page.body);
    if (!items.length) warnings.push("no Organization/Product schema.org JSON-LD found on this page");

    return {
      items,
      // 다른 수집기의 snapshot(정규식이 놓칠 수 있는 원문 텍스트)과 달리, JSON-LD는 이미
      // 구조화돼 있어 items 자체가 충실한 추출 결과다 — 그대로 직렬화해 증거로 남긴다.
      evidence: [{ url: page.finalUrl, snapshot: items.length ? JSON.stringify(items) : undefined, retrievedAt: page.retrievedAt, source: "dre" }],
      warnings,
    };
  }
}
