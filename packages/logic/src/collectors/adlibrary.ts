import { AutomationBlocked, BrowserUnavailable, htmlToText } from "@dre/core";
import type { CrawlPolicy } from "../crawl-policy.js";
import type { PageRenderer } from "../ports.js";
import type { Collected } from "../types.js";

const MAX_SNAPSHOT_CHARS = 20_000;

/**
 * Google Ads Transparency Center만 다룬다. Meta 광고 라이브러리는 의도적으로 제외했다 —
 * facebook.com/robots.txt가 "명시적 서면 허가 없는 자동 수집은 금지"라고 밝히고 ClaudeBot을
 * 이름으로 지정해 전체 차단(Disallow: /)하고 있다. adstransparency.google.com은 robots.txt
 * 자체가 없어(2026-11-01 확인, 404) 제한이 없다.
 */
export interface AdLibraryHit {
  /** "약 200개"처럼 원문 그대로의 광고 수 문구 (숫자로 변환하지 않는다 — UI 언어가 바뀌면 깨질 수 있다) */
  adCountText: string;
}

export class AdLibraryCollector {
  constructor(
    private readonly renderer: PageRenderer,
    private readonly policy: CrawlPolicy,
  ) {}

  /** domain은 "example.com" 형태. region은 ISO 국가 코드(기본 US). */
  async collect(domain: string, opts: { region?: string } = {}): Promise<Collected<AdLibraryHit>> {
    const url = `https://adstransparency.google.com/?region=${encodeURIComponent(opts.region ?? "US")}&domain=${encodeURIComponent(domain)}`;
    await this.policy.assertAllowed(url);

    const warnings: string[] = [];
    let page;
    try {
      page = await this.renderer.render(url);
    } catch (e) {
      if (e instanceof BrowserUnavailable || e instanceof AutomationBlocked) {
        // 이 페이지는 JS 렌더링 없이는 거의 빈 셸만 나온다 — 정적 수집으로 의미 있게 폴백할 수 없다.
        throw e;
      }
      throw e;
    }

    const text = htmlToText(page.body);
    // 숫자 파싱은 하지 않는다 — Google UI 언어가 바뀌면 깨지기 쉽고, 틀린 숫자를 "관측값"이라고
    // 주장하는 게 더 위험하다. 전체 텍스트를 주고 호출하는 에이전트가 직접 읽게 한다
    // (ADR-004와 같은 원칙: 정규식보다 LLM이 이런 텍스트를 더 잘 읽는다).
    // Google은 숫자가 클 때만 "약"(approximately)을 붙이고, 0개나 작은 정확한 값은 "약" 없이
    // "광고 N개"라고만 쓴다 (실사이트로 확인: pay.naver.com="광고 0개", kakaobank.com="광고 56개").
    const adCountText = /광고\s*(?:약\s*)?[\d,]+\s*개|about\s+[\d,]+\s+ads?|\b[\d,]+\s+ads?\b/i.exec(text)?.[0];
    const items: AdLibraryHit[] = adCountText ? [{ adCountText }] : [];
    if (!adCountText) {
      warnings.push(
        "could not confidently parse an ad-count phrase from the page (may be a different UI language, " +
          "zero ads, or a parsing miss) — read evidence[0].snapshot yourself before concluding there are no ads",
      );
    }

    return {
      items,
      evidence: [{ url: page.finalUrl, snapshot: text.slice(0, MAX_SNAPSHOT_CHARS) || undefined, retrievedAt: page.retrievedAt, source: "dre" }],
      warnings,
    };
  }
}
