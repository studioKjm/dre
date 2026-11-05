import type { RobotsResult } from "@dre/core";
import { ReportStore, fetchFromWayback, fetchPage, fetchRobots, loadGold, parseAppStore, parsePlay, renderPage } from "@dre/data";
import {
  AdLibraryCollector,
  AppStoreCollector,
  CompanyAnalyzer,
  CrawlPolicy,
  PricingCollector,
  ReportService,
  TechStackCollector,
  TermsCollector,
  evaluate,
  type EvalResult,
} from "@dre/logic";

export interface ServiceOptions {
  reportsDir?: string;
  userAgent?: string;
  /** 사설/루프백 주소 수집 허용. 로컬 개발·테스트 전용이며 기본은 DRE_ALLOW_PRIVATE_NETWORK=1일 때만 true. */
  allowPrivateNetwork?: boolean;
}

/** Data 구현체를 Logic 포트에 연결하는 유일한 조립 지점. Presentation은 이 객체만 사용한다. */
export function createServices(opts: ServiceOptions = {}) {
  const {
    reportsDir = "reports",
    userAgent = "DREBot",
    allowPrivateNetwork = process.env.DRE_ALLOW_PRIVATE_NETWORK === "1",
  } = opts;

  const robotsCache = new Map<string, Promise<RobotsResult>>();
  const robots = {
    get(origin: string): Promise<RobotsResult> {
      let hit = robotsCache.get(origin);
      if (!hit) {
        hit = fetchRobots(origin, { userAgent, allowPrivate: allowPrivateNetwork });
        robotsCache.set(origin, hit);
      }
      return hit;
    },
  };
  const parser = { parseAppStore, parsePlay };
  const policy = new CrawlPolicy(robots, userAgent);
  // 리다이렉트·페이지 이동 대상도 같은 robots 정책으로 다시 검사한다.
  const recheck = (url: string) => policy.assertAllowed(url);
  const fetcher = {
    get: (url: string) => fetchPage(url, { userAgent, allowPrivate: allowPrivateNetwork, onRedirect: recheck }),
  };
  const renderer = {
    render: (url: string) => renderPage(url, { userAgent, allowPrivate: allowPrivateNetwork, onNavigate: recheck }),
  };
  const archive = { get: (url: string) => fetchFromWayback(url, { userAgent }) };
  const store = new ReportStore(reportsDir);

  const pricing = new PricingCollector(fetcher, policy, renderer, archive);
  const terms = new TermsCollector(fetcher, policy);
  const techstack = new TechStackCollector(fetcher, policy);
  const adlibrary = new AdLibraryCollector(renderer, policy);

  return {
    pricing,
    appstore: new AppStoreCollector(fetcher, policy, parser),
    terms,
    techstack,
    adlibrary,
    company: new CompanyAnalyzer(pricing, terms, techstack, adlibrary),
    reports: new ReportService(store),
    /** 저장된 리포트 디렉터리와 정답표 디렉터리를 비교한다. */
    async evalDirs(reportsPath: string, goldPath: string): Promise<EvalResult> {
      const reportStore = new ReportStore(reportsPath);
      const reports = await Promise.all((await reportStore.list()).map((p) => reportStore.load(p)));
      const labeled = reports.map((r) => ({ targetUrl: r.target, labels: r.revenueModelLabels ?? [] }));
      return evaluate(labeled, await loadGold(goldPath));
    },
  };
}

export type Services = ReturnType<typeof createServices>;
