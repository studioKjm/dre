import type { Collected } from "../types.js";

export interface JobPosting {
  title: string;
  location?: string;
  source: "greenhouse" | "lever";
}

export interface JobBoardSource {
  fetchGreenhouseJobs(slug: string): Promise<{ title: string; location?: string }[] | null>;
  fetchLeverJobs(slug: string): Promise<{ title: string; location?: string }[] | null>;
}

const MAX_SNAPSHOT_ITEMS = 30;

/**
 * 채용공고는 지원자가 봐야 하므로 사실상 차단되지 않는, 거의 유일한 "회사 내부 정보" 소스다.
 * 공고 수·부서 분포는 팀 규모·성장 단계의 간접 신호가 되고, 일부 공고는 설명문에 매출·사용자 수
 * 같은 숫자를 직접 언급하기도 한다(이 수집기는 제목/지역만 구조화해서 돌려주고, 설명문 분석은
 * 에이전트가 필요하면 따로 하도록 남겨둔다 — ADR-004와 같은 "가볍게 주고 에이전트가 읽게" 원칙).
 */
export class JobBoardCollector {
  constructor(private readonly source: JobBoardSource) {}

  /** slug: ATS에 등록된 회사 식별자. 보통 도메인과 다르다 (예: "stripe", 회사 도메인은 stripe.com). */
  async collect(slug: string): Promise<Collected<JobPosting>> {
    const [greenhouse, lever] = await Promise.all([
      this.source.fetchGreenhouseJobs(slug).catch(() => null),
      this.source.fetchLeverJobs(slug).catch(() => null),
    ]);

    const items: JobPosting[] = [
      ...(greenhouse ?? []).map((j) => ({ ...j, source: "greenhouse" as const })),
      ...(lever ?? []).map((j) => ({ ...j, source: "lever" as const })),
    ];

    const warnings: string[] = [];
    if (!items.length) {
      warnings.push(`no open postings found on Greenhouse or Lever for slug "${slug}" — the company may use a different ATS, have no slug match, or have zero open roles right now`);
    }

    const lines = items.slice(0, MAX_SNAPSHOT_ITEMS).map((j) => `[${j.source}] ${j.title}${j.location ? ` — ${j.location}` : ""}`);
    if (items.length > MAX_SNAPSHOT_ITEMS) lines.push(`... and ${items.length - MAX_SNAPSHOT_ITEMS} more`);

    return {
      items,
      evidence: items.length
        ? [
            {
              url: greenhouse?.length ? `https://boards.greenhouse.io/${slug}` : `https://jobs.lever.co/${slug}`,
              snapshot: lines.join("\n"),
              retrievedAt: new Date().toISOString(),
              source: "dre",
            },
          ]
        : [],
      warnings,
    };
  }
}
