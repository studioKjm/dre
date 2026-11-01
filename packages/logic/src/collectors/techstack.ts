import { detectBotChallenge, htmlToText } from "@dre/core";
import type { CrawlPolicy } from "../crawl-policy.js";
import type { PageFetcher } from "../ports.js";
import { detectTechStack, type TechSignal } from "../techstack.js";
import type { Collected } from "../types.js";

const MAX_SNAPSHOT_CHARS = 20_000;

export class TechStackCollector {
  constructor(
    private readonly fetcher: PageFetcher,
    private readonly policy: CrawlPolicy,
  ) {}

  /** robots 불허 시 RobotsDisallowed로 중단한다. 응답 헤더와 HTML에서 기술스택 신호를 찾는다. */
  async collect(url: string): Promise<Collected<TechSignal>> {
    await this.policy.assertAllowed(url);
    const page = await this.fetcher.get(url);
    const warnings: string[] = [];

    const challenge = detectBotChallenge(htmlToText(page.body));
    if (challenge) {
      // CAPTCHA 페이지 자체의 스택(예: 보안 벤더가 쓰는 프레임워크)을 대상의 스택으로
      // 오인하지 않도록, 신호를 반환하지 않는다.
      warnings.push(`page appears to be a CAPTCHA/bot-challenge screen (${challenge}); skipped to avoid misattributing its stack to the target`);
      return { items: [], evidence: [{ url: page.finalUrl, retrievedAt: page.retrievedAt, source: "dre" }], warnings };
    }

    const items = detectTechStack(page);
    if (!items.length) warnings.push("no known technology signatures matched (signature set is small and best-effort)");

    return {
      items,
      evidence: [
        {
          url: page.finalUrl,
          snapshot: items.map((s) => `${s.name}: ${s.evidenceText}`).join("\n").slice(0, MAX_SNAPSHOT_CHARS) || undefined,
          retrievedAt: page.retrievedAt,
          source: "dre",
        },
      ],
      warnings,
    };
  }
}
