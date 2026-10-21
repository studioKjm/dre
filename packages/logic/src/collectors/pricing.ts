import { BrowserUnavailable, htmlToText, type RawPage } from "@dre/core";
import type { CrawlPolicy } from "../crawl-policy.js";
import type { PageFetcher, PageRenderer } from "../ports.js";
import type { Collected, PlanCandidate } from "../types.js";

const PRICE =
  /(?:[$€£¥₩]\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s?(?:원|USD|KRW|EUR))(?:\s*\/\s*(?:month|mo|year|yr|월|년))?/i;
const FREE = /^(?:free|무료)$/i;

export function extractPlanCandidates(text: string): PlanCandidate[] {
  const lines = text.split("\n");
  const out: PlanCandidate[] = [];
  const seen = new Set<string>();
  lines.forEach((line, i) => {
    const price = PRICE.exec(line)?.[0] ?? (FREE.test(line) ? line : undefined);
    if (!price) return;
    const prev = lines.slice(Math.max(0, i - 2), i).reverse().find((l) => l.length <= 40 && !PRICE.test(l));
    const name = line === price ? (prev ?? "") : line.replace(price, "").replace(/[:\-–|]+$/, "").trim() || (prev ?? "");
    const key = `${name}|${price}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name, priceText: price, line });
  });
  return out;
}

export class PricingCollector {
  constructor(
    private readonly fetcher: PageFetcher,
    private readonly policy: CrawlPolicy,
    private readonly renderer?: PageRenderer,
  ) {}

  /**
   * robots 불허 시 RobotsDisallowed로 중단하고 아무것도 가져오지 않는다.
   * js=true면 브라우저 렌더링을 쓰고, 브라우저를 쓸 수 없으면 정적 수집으로 폴백하며 경고한다.
   */
  async collect(url: string, opts: { js?: boolean } = {}): Promise<Collected<PlanCandidate>> {
    await this.policy.assertAllowed(url);
    const warnings: string[] = [];
    let page: RawPage;
    if (opts.js && this.renderer) {
      try {
        page = await this.renderer.render(url);
      } catch (e) {
        if (!(e instanceof BrowserUnavailable)) throw e;
        warnings.push(`${e.message}; fell back to static fetch`);
        page = await this.fetcher.get(url);
      }
    } else {
      if (opts.js) warnings.push("no renderer configured; used static fetch");
      page = await this.fetcher.get(url);
    }
    const items = extractPlanCandidates(htmlToText(page.body));
    if (!items.length) warnings.push("no price-like text found (page may be JS-rendered)");
    const snapshot = items.map((c) => c.line).join("\n").slice(0, 1000);
    return {
      items,
      evidence: [{ url: page.finalUrl, snapshot: snapshot || undefined, retrievedAt: page.retrievedAt }],
      warnings,
    };
  }
}
