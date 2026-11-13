import { AutomationBlocked, BrowserUnavailable, FetchError, detectBotChallenge, htmlToText, type RawPage } from "@dre/core";
import type { CrawlPolicy } from "../crawl-policy.js";
import { extractLinks } from "../html.js";
import type { PageArchive, PageFetcher, PageRenderer } from "../ports.js";
import type { Collected, PlanCandidate } from "../types.js";

/**
 * 홈페이지 등에서 가격 페이지로 보이는 링크를 찾는다. 같은 출처를 먼저 보고, 없으면 다른 출처도
 * 본다 — zoom.us의 홈이 www.zoom.com으로 리다이렉트되지만 가격 링크는 zoom.us에 남아있는
 * 경우처럼, 리다이렉트 전후로 출처가 갈리는 경우가 실제로 있다 (TermsCollector와 같은 전략).
 */
const PRICING_LINK_HINT = /pricing|plans|subscribe|price|요금제|가격|구독/i;
function findPricingLink(html: string, baseUrl: string): string | undefined {
  const origin = new URL(baseUrl).origin;
  const hinted = extractLinks(html, baseUrl).filter(
    (l) => /^https?:/i.test(l.href) && (PRICING_LINK_HINT.test(l.text) || PRICING_LINK_HINT.test(new URL(l.href).pathname)),
  );
  return hinted.find((l) => l.href.startsWith(origin))?.href ?? hinted[0]?.href;
}

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
// 플랜 이름과 "Free"가 공백 없이 붙어 "BasicFree"처럼 되는 경우 — htmlToText가 블록
// 태그에만 줄바꿈을 넣다 보니, 카드 레이아웃을 inline 요소로 짠 페이지(dropbox.com/plans
// 실측)에서 이름과 가격 사이 줄바꿈이 사라진다. 짧은 줄(플랜 카드 한 줄 분량)에서만 본다.
const FREE_SUFFIX = /^.{1,30}?[a-z](free)$/i;

/** evidence.snapshot 상한. 실제 가격 페이지 텍스트는 대부분 이보다 훨씬 작다. */
const MAX_SNAPSHOT_CHARS = 20_000;

export function extractPlanCandidates(text: string): PlanCandidate[] {
  const lines = text.split("\n");
  const out: PlanCandidate[] = [];
  const seen = new Set<string>();
  lines.forEach((line, i) => {
    const price = PRICE.exec(line)?.[0] ?? (FREE.test(line) ? line : FREE_SUFFIX.test(line) ? "Free" : undefined);
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

/**
 * MAX_SNAPSHOT_CHARS를 넘는 페이지는 앞부분만 자르던 게 버그였다 — stripe.com/pricing
 * 실측 결과, 전체 텍스트(~40,000자)에는 "Stripe Sigma"/"Billing" 같은 구독 상품의 가격·
 * 설명이 있는데, 그 구간이 char 23,869 부근이라 20,000자 컷오프 밖이었다. 긴 마케팅
 * 페이지는 가격표 앞에 수천 자의 소개/네비게이션 텍스트가 오는 게 보통이라, 머리부터
 * 자르면 실제 가격 증거가 통째로 빠질 수 있다. 대신 매칭된 가격 후보들이 걸쳐 있는
 * 구간의 중앙을 기준으로 창을 잡는다.
 */
function snapshotWindow(text: string, items: PlanCandidate[], maxChars: number): string {
  if (text.length <= maxChars || items.length === 0) return text.slice(0, maxChars);
  const lines = text.split("\n");
  const matchedLines = new Set(items.map((it) => it.line));
  let first = -1;
  let last = -1;
  lines.forEach((l, i) => {
    if (!matchedLines.has(l)) return;
    if (first === -1) first = i;
    last = i;
  });
  if (first === -1) return text.slice(0, maxChars);
  const before = lines.slice(0, first).join("\n").length;
  const after = lines.slice(0, last + 1).join("\n").length;
  const center = Math.floor((before + after) / 2);
  const half = Math.floor(maxChars / 2);
  const start = Math.max(0, Math.min(center - half, text.length - maxChars));
  return text.slice(start, start + maxChars);
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

  /** url 하나를 (필요하면 archive.org 폴백까지 써서) 가져와 텍스트와 가격 후보를 뽑는다. */
  private async fetchAndExtract(
    url: string,
    opts: { js?: boolean },
    warnings: string[],
  ): Promise<{ page: RawPage; text: string; items: PlanCandidate[]; challenge?: string }> {
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
    return { page, text, items: extractPlanCandidates(text), challenge };
  }

  /**
   * robots 불허 시 RobotsDisallowed로 중단하고 아무것도 가져오지 않는다 — 이건 archive.org로도
   * 우회하지 않는다. js=true면 브라우저 렌더링을 쓰고, 브라우저를 쓸 수 없으면 정적 수집으로
   * 폴백하며 경고한다. 서버가 실제로 자동화를 차단한 경우(403, 봇 탐지, CAPTCHA)에는
   * archive.org의 독립된 스냅샷으로 한 번 더 보충한다.
   *
   * url에 가격 정보가 없으면(가격 후보 0개, 차단 아님) 같은 출처에서 "pricing/plans/요금제"처럼
   * 보이는 링크를 찾아 한 번 더 시도한다 — 홈페이지 URL만 주더라도 가격 페이지를 스스로 찾는다.
   */
  async collect(url: string, opts: { js?: boolean } = {}): Promise<Collected<PlanCandidate>> {
    await this.policy.assertAllowed(url);
    const warnings: string[] = [];
    let result = await this.fetchAndExtract(url, opts, warnings);
    let effectiveUrl = url;

    if (!result.items.length && !result.challenge) {
      const link = findPricingLink(result.page.body, result.page.finalUrl);
      if (link && link !== url && link !== result.page.finalUrl) {
        await this.policy.assertAllowed(link);
        const discovered = await this.fetchAndExtract(link, opts, warnings);
        warnings.push(`'${url}' had no price-like text; followed a same-origin pricing link to '${link}' instead`);
        result = discovered; // 원래 결과는 어차피 비어 있었으므로 그대로 교체한다
        effectiveUrl = link;
      }
    }

    // 정적 수집으로 가격 텍스트를 하나도 못 찾았고, 차단도 아니고, js:true를 아직 안 써봤다면
    // — class101.net처럼 콘텐츠 자체가 React/Vue 등으로 클라이언트에서 렌더링되는 SPA일 수
    // 있다(실측 확인: 정적으로는 0개, 렌더링하면 가격이 보인다). 브라우저가 없으면
    // fetchAndExtract가 BrowserUnavailable을 조용히 정적 수집으로 폴백하므로, 여기서는
    // 그냥 한 번 더 시도해 보고 안 되면 원래 결과를 그대로 쓴다.
    if (!result.items.length && !result.challenge && !opts.js && this.renderer) {
      const rendered = await this.fetchAndExtract(effectiveUrl, { js: true }, warnings);
      if (rendered.items.length) {
        warnings.push(`static fetch of '${effectiveUrl}' found no price-like text; retried with JS rendering and found some`);
        result = rendered;
      }
    }

    const { page, text, items, challenge } = result;
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
    const snapshot = snapshotWindow(text, items, MAX_SNAPSHOT_CHARS);
    return {
      items,
      evidence: [{ url: page.finalUrl, snapshot: snapshot || undefined, retrievedAt: page.retrievedAt, source: "dre" }],
      warnings,
    };
  }
}
