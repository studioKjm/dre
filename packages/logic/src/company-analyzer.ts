import type { AdLibraryCollector, AdLibraryHit } from "./collectors/adlibrary.js";
import type { PricingCollector } from "./collectors/pricing.js";
import type { TechStackCollector } from "./collectors/techstack.js";
import type { TermsCollector } from "./collectors/terms.js";
import type { Collected, PlanCandidate, TermsPassage } from "./types.js";
import type { TechSignal } from "./techstack.js";

type Outcome<T> = { ok: true; result: Collected<T> } | { ok: false; error: string };

export interface CompanySnapshot {
  domain: string;
  pricing: Outcome<PlanCandidate>;
  terms: Outcome<TermsPassage>;
  techstack: Outcome<TechSignal>;
  adlibrary: Outcome<AdLibraryHit>;
}

/**
 * 도메인 하나만 받아서 가격·약관·기술스택·광고를 한 번에 조회한다. 에이전트가 매번 정확한
 * 서브페이지 URL을 미리 찾아 각 도구를 따로 호출해야 하는 마찰을 없애는 것이 목적이다
 * (collect_pricing은 이미 홈 URL만으로 가격 링크를 스스로 찾는다 — 여기서는 그걸 나머지
 * 수집기와 한 번에 묶는다). 앱스토어는 별도 URL(스토어 앱 ID)이 필요해 도메인만으로는
 * 추론할 수 없으므로 여기 포함하지 않는다 — 필요하면 collect_appstore를 따로 호출한다.
 *
 * 한 수집기가 막히거나 실패해도 전체를 포기하지 않는다 — 각자 독립적으로 성공/실패를
 * 보고한다("모르면 모른다"는 지금까지의 원칙과 같다).
 */
export class CompanyAnalyzer {
  constructor(
    private readonly pricing: Pick<PricingCollector, "collect">,
    private readonly terms: Pick<TermsCollector, "collect">,
    private readonly techstack: Pick<TechStackCollector, "collect">,
    private readonly adlibrary: Pick<AdLibraryCollector, "collect">,
  ) {}

  async analyze(domain: string, opts: { region?: string } = {}): Promise<CompanySnapshot> {
    const home = `https://${domain}/`;
    const settle = async <T>(p: Promise<Collected<T>>): Promise<Outcome<T>> => {
      try {
        return { ok: true, result: await p };
      } catch (e) {
        return { ok: false, error: `${(e as Error).name}: ${(e as Error).message}` };
      }
    };

    const [pricing, terms, techstack, adlibrary] = await Promise.all([
      settle(this.pricing.collect(home)),
      settle(this.terms.collect(home)),
      settle(this.techstack.collect(home)),
      settle(this.adlibrary.collect(domain, opts)),
    ]);

    return { domain, pricing, terms, techstack, adlibrary };
  }
}
