import { FetchError, htmlToText, type Evidence } from "@dre/core";
import type { CrawlPolicy } from "../crawl-policy.js";
import { RobotsDisallowed } from "../errors.js";
import { extractLinks } from "../html.js";
import type { PageArchive, PageFetcher } from "../ports.js";
import type { Collected, TermsPassage } from "../types.js";

const LINK_HINT = /terms|tos|refund|billing|cancel|subscription|legal|약관|환불|해지|결제|이용/i;
const PASSAGE_HINT = /refund|cancel|billing|subscription|renew|charge|환불|해지|결제|구독|갱신/i;
const MAX_PAGES = 3;
const MAX_PASSAGES = 10;

/** robots.txt 불허나 사설 주소 차단이 아니라 서버가 실제로 자동화를 막은 경우만 "봇 차단"으로 본다. PricingCollector의 isBotBlockLike와 동일한 판단. */
function isBotBlockLike(e: unknown): boolean {
  return e instanceof FetchError && e.kind === "http";
}

export class TermsCollector {
  constructor(
    private readonly fetcher: PageFetcher,
    private readonly policy: CrawlPolicy,
    private readonly archive?: PageArchive,
  ) {}

  async collect(url: string): Promise<Collected<TermsPassage>> {
    await this.policy.assertAllowed(url);
    const warnings: string[] = [];
    let home;
    try {
      home = await this.fetcher.get(url);
    } catch (e) {
      // coupang.com 실측: 홈 자체가 403이면 이 try/catch가 없을 때 terms 전체가 그냥
      // ok:false로 실패했다 — pricing.ts와 같은 archive.org 폴백을 홈 페이지에도 적용한다.
      if (!isBotBlockLike(e) || !this.archive) throw e;
      const archived = await this.archive.get(url);
      if (!archived) throw e;
      warnings.push(`${(e as Error).message}; served directly by the target failed, so an archive.org snapshot was used instead (from ${archived.finalUrl}) — this may be stale, not the site's current state`);
      home = archived;
    }
    const origin = new URL(home.finalUrl).origin;

    // 약관이 다른 도메인에 있는 경우(docs.github.com, notion.so 등)도 따라가되, 같은 출처를 먼저 본다.
    // 각 링크는 robots.txt와 주소 검사를 그대로 통과해야 한다.
    const hinted = extractLinks(home.body, home.finalUrl).filter(
      (l) => /^https?:/i.test(l.href) && (LINK_HINT.test(l.text) || LINK_HINT.test(new URL(l.href).pathname)),
    );
    const candidates = [
      ...new Set([...hinted.filter((l) => l.href.startsWith(origin)), ...hinted.filter((l) => !l.href.startsWith(origin))].map((l) => l.href)),
    ].slice(0, MAX_PAGES);

    const items: TermsPassage[] = [];
    const evidence: Evidence[] = [];
    if (!candidates.length) warnings.push("no terms/refund links found");

    for (const link of candidates) {
      try {
        await this.policy.assertAllowed(link);
        const page = await this.fetcher.get(link);
        const passages = htmlToText(page.body)
          .split("\n")
          .filter((l) => l.length >= 20 && l.length <= 600 && PASSAGE_HINT.test(l))
          .slice(0, MAX_PASSAGES);
        if (!passages.length) continue;
        items.push(...passages.map((text) => ({ sourceUrl: page.finalUrl, text })));
        evidence.push({ url: page.finalUrl, snapshot: passages.join("\n").slice(0, 8000), retrievedAt: page.retrievedAt, source: "dre" });
      } catch (e) {
        // coupang.com 실측: 아카이브로 복구한 홈페이지가 가리키는 약관 링크 자체는
        // 라이브 사이트라 똑같이 403을 낸다 — 링크 하나가 막혔다고 나머지 후보와
        // 지금까지 모은 결과까지 버리지 않는다(RobotsDisallowed와 같은 취급).
        if (e instanceof RobotsDisallowed) warnings.push(`skipped ${link}: disallowed by robots.txt`);
        else if (isBotBlockLike(e)) warnings.push(`skipped ${link}: ${(e as Error).message}`);
        else throw e;
      }
    }
    return { items: items.slice(0, MAX_PASSAGES), evidence, warnings };
  }
}
