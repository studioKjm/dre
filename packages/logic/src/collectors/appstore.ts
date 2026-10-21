import type { RawProduct } from "@dre/core";
import type { CrawlPolicy } from "../crawl-policy.js";
import { UnsupportedStore } from "../errors.js";
import type { PageFetcher, ProductParser } from "../ports.js";
import type { Collected } from "../types.js";

export class AppStoreCollector {
  constructor(
    private readonly fetcher: PageFetcher,
    private readonly policy: CrawlPolicy,
    private readonly parser: ProductParser,
  ) {}

  async collect(url: string): Promise<Collected<RawProduct>> {
    const host = new URL(url).hostname;
    const kind = host === "apps.apple.com" ? "apple" : host === "play.google.com" ? "play" : null;
    if (!kind) throw new UnsupportedStore(url);

    await this.policy.assertAllowed(url);
    const page = await this.fetcher.get(url);
    const parsed = kind === "apple" ? this.parser.parseAppStore(page.body) : this.parser.parsePlay(page.body);
    // 화이트리스트: 파서가 다른 필드를 돌려줘도 상품명·가격만 남긴다 (개인정보 미수집).
    const items = parsed.map(({ name, priceText }) => ({ name, priceText }));
    return {
      items,
      evidence: [{ url: page.finalUrl, snapshot: items.map((p) => `${p.name}: ${p.priceText}`).join("\n").slice(0, 1000) || undefined, retrievedAt: page.retrievedAt }],
      warnings: items.length ? [] : ["no in-app purchase information found on the page"],
    };
  }
}
