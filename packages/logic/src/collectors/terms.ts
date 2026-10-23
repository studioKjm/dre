import { htmlToText } from "@dre/core";
import type { CrawlPolicy } from "../crawl-policy.js";
import { RobotsDisallowed } from "../errors.js";
import { extractLinks } from "../html.js";
import type { PageFetcher } from "../ports.js";
import type { Collected, TermsPassage } from "../types.js";

const LINK_HINT = /terms|tos|refund|billing|cancel|subscription|legal|약관|환불|해지|결제|이용/i;
const PASSAGE_HINT = /refund|cancel|billing|subscription|renew|charge|환불|해지|결제|구독|갱신/i;
const MAX_PAGES = 3;
const MAX_PASSAGES = 10;

export class TermsCollector {
  constructor(
    private readonly fetcher: PageFetcher,
    private readonly policy: CrawlPolicy,
  ) {}

  async collect(url: string): Promise<Collected<TermsPassage>> {
    await this.policy.assertAllowed(url);
    const home = await this.fetcher.get(url);
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
    const evidence = [];
    const warnings: string[] = [];
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
        evidence.push({ url: page.finalUrl, snapshot: passages.join("\n").slice(0, 1000), retrievedAt: page.retrievedAt });
      } catch (e) {
        if (e instanceof RobotsDisallowed) warnings.push(`skipped ${link}: disallowed by robots.txt`);
        else throw e;
      }
    }
    return { items: items.slice(0, MAX_PASSAGES), evidence, warnings };
  }
}
