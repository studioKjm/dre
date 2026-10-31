import { AutomationBlocked, BrowserUnavailable, FetchError, detectBotChallenge, htmlToText, type RawPage } from "@dre/core";
import type { CrawlPolicy } from "../crawl-policy.js";
import type { PageArchive, PageFetcher, PageRenderer } from "../ports.js";
import type { Collected, PlanCandidate } from "../types.js";

/**
 * robots.txt 불허(RobotsDisallowed)나 사설 주소 차단(FetchError kind "blocked")이 아니라,
 * 서버가 실제로 자동화 요청을 막은 경우(403 등 HTTP 오류, 또는 브라우저 자체를 감지한 경우)만
 * "봇 차단"으로 보고 archive.org 폴백을 쓴다. 전자 둘은 그대로 존중하고 폴백하지 않는다.
 */
function isBotBlockLike(e: unknown): boolean {
  if (e instanceof AutomationBlocked) return true;
  if (e instanceof FetchError) return e.kind === "http";
  return false;
}

// 한국어 가격은 "20만원", "9,900원"처럼 만/억 단위 수사가 숫자와 통화기호 사이에 올 수 있다.
const PRICE =
  /(?:[$€£¥₩]\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s?(?:천|만|억)?\s?(?:원|USD|KRW|EUR))(?:\s*\/\s*(?:month|mo|year|yr|월|년))?/i;
const FREE = /^(?:free|무료)$/i;

/** evidence.snapshot 상한. 실제 가격 페이지 텍스트는 대부분 이보다 훨씬 작다. */
const MAX_SNAPSHOT_CHARS = 20_000;

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
    private readonly archive?: PageArchive,
  ) {}

  /** archive.org 폴백을 시도한다. 실패하면 null — 호출부는 원래 오류를 그대로 던진다. */
  private async tryArchive(url: string, warnings: string[], reason: string): Promise<RawPage | null> {
    if (!this.archive) return null;
    const archived = await this.archive.get(url);
    if (!archived) return null;
    warnings.push(
      `${reason}; served directly by the target failed, so an archive.org snapshot was used instead ` +
        `(from ${archived.finalUrl}) — this may be stale, not the site's current state`,
    );
    return archived;
  }

  /**
   * robots 불허 시 RobotsDisallowed로 중단하고 아무것도 가져오지 않는다 — 이건 archive.org로도
   * 우회하지 않는다. js=true면 브라우저 렌더링을 쓰고, 브라우저를 쓸 수 없으면 정적 수집으로
   * 폴백하며 경고한다. 서버가 실제로 자동화를 차단한 경우(403, 봇 탐지, CAPTCHA)에는
   * archive.org의 독립된 스냅샷으로 한 번 더 보충한다.
   */
  async collect(url: string, opts: { js?: boolean } = {}): Promise<Collected<PlanCandidate>> {
    await this.policy.assertAllowed(url);
    const warnings: string[] = [];
    let page: RawPage | undefined;

    if (opts.js && this.renderer) {
      try {
        page = await this.renderer.render(url);
      } catch (e) {
        if (e instanceof BrowserUnavailable) {
          warnings.push(`${e.message}; fell back to static fetch`);
        } else if (e instanceof AutomationBlocked) {
          // 사이트가 자동화를 적극적으로 감지해 차단한 것이지 "JS 렌더링이 필요한 평범한 페이지"가
          // 아니다. 우회하지 않고, 결과가 불완전할 수 있다는 것을 명확히 알린다.
          warnings.push(`${e.message}; site actively blocks automated browsers — treat remaining results as low-confidence; fell back to static fetch`);
          page = (await this.tryArchive(url, warnings, e.message)) ?? undefined;
        } else {
          throw e;
        }
        page ??= await this.fetcher.get(url);
      }
    } else {
      if (opts.js) warnings.push("no renderer configured; used static fetch");
      try {
        page = await this.fetcher.get(url);
      } catch (e) {
        if (!isBotBlockLike(e)) throw e;
        const archived = await this.tryArchive(url, warnings, (e as Error).message);
        if (!archived) throw e;
        page = archived;
      }
    }

    let text = htmlToText(page.body);
    let challenge = detectBotChallenge(text);
    if (challenge && this.archive) {
      // 요청 자체는 성공(200)했지만 응답이 CAPTCHA 화면이다 — 이것도 봇 차단의 한 형태다.
      const archived = await this.tryArchive(url, warnings, `page appears to be a CAPTCHA/bot-challenge screen (${challenge})`);
      if (archived) {
        page = archived;
        text = htmlToText(page.body);
        challenge = detectBotChallenge(text);
      }
    }

    const items = extractPlanCandidates(text);
    if (!items.length) {
      warnings.push(
        challenge
          ? `page appears to be a CAPTCHA/bot-challenge screen (${challenge}), not real content — results are empty, not just missing prices`
          : "no price-like text found (page may be JS-rendered)",
      );
    }
    // snapshot은 "가격처럼 보이는 줄만 모은 요약"이 아니라 정제된 전체 텍스트다.
    // extractPlanCandidates의 정규식은 틀릴 수 있다(통화 단위 누락, CSS 조각 혼입 등) —
    // 호출하는 에이전트가 이 전체 텍스트를 직접 읽고 판단하는 쪽이 더 신뢰할 수 있다.
    // items는 그 판단을 빠르게 시작할 실마리로만 쓴다.
    const snapshot = text.slice(0, MAX_SNAPSHOT_CHARS);
    return {
      items,
      evidence: [{ url: page.finalUrl, snapshot: snapshot || undefined, retrievedAt: page.retrievedAt, source: "dre" }],
      warnings,
    };
  }
}
