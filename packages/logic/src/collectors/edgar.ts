import type { Collected } from "../types.js";

export interface FinancialFact {
  concept: string; // 예: "Revenues", "NetIncomeLoss" (SEC의 us-gaap XBRL 태그명)
  valueUsd: number;
  fiscalYear: number;
  form: string; // "10-K" (연간 보고서)
  periodEnd: string; // ISO 날짜
}

export interface EdgarSource {
  findCik(nameOrTicker: string): Promise<{ cik: number; ticker: string; title: string } | null>;
  fetchCompanyFacts(cik: number): Promise<unknown>;
}

// 매출 개념은 회계기준 개정(ASC 606)에 따라 쓰는 태그가 회사·시기별로 다르다.
// 먼저 발견되는 태그를 쓴다. NetIncomeLoss는 비교적 일관되게 쓰인다.
const REVENUE_TAGS = ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueNet"];

interface UsdEntry {
  end?: string;
  val?: number;
  fy?: number;
  fp?: string;
  form?: string;
}

function latestAnnual(concept: string, entries: unknown): FinancialFact | undefined {
  if (!Array.isArray(entries)) return undefined;
  const annual = (entries as UsdEntry[]).filter((e) => e.form === "10-K" && e.fp === "FY" && typeof e.val === "number" && typeof e.end === "string");
  if (!annual.length) return undefined;
  const best = annual.reduce((a, b) => (a.end! > b.end! ? a : b));
  return { concept, valueUsd: best.val!, fiscalYear: best.fy!, form: best.form!, periodEnd: best.end! };
}

function extractFacts(raw: unknown): FinancialFact[] {
  const usGaap = (raw as { facts?: { "us-gaap"?: Record<string, { units?: { USD?: unknown } }> } })?.facts?.["us-gaap"];
  if (!usGaap) return [];

  const facts: FinancialFact[] = [];
  for (const tag of REVENUE_TAGS) {
    const fact = latestAnnual(tag, usGaap[tag]?.units?.USD);
    if (fact) {
      facts.push(fact);
      break; // 첫 번째로 데이터가 있는 매출 태그만 쓴다 — 여러 태그를 섞어 중복 보고하지 않는다.
    }
  }
  const netIncome = latestAnnual("NetIncomeLoss", usGaap.NetIncomeLoss?.units?.USD);
  if (netIncome) facts.push(netIncome);
  return facts;
}

export class EdgarCollector {
  constructor(private readonly source: EdgarSource) {}

  /** nameOrTicker: 회사명(부분일치) 또는 정확한 티커. 미국 상장사가 아니면 빈 결과(오류 아님). */
  async collect(nameOrTicker: string): Promise<Collected<FinancialFact>> {
    const entry = await this.source.findCik(nameOrTicker);
    if (!entry) {
      return {
        items: [],
        evidence: [],
        warnings: [`no SEC filer found for "${nameOrTicker}" — likely a private company, or try its official ticker/legal name`],
      };
    }

    const raw = await this.source.fetchCompanyFacts(entry.cik);
    const warnings: string[] = [];
    const items = raw ? extractFacts(raw) : [];
    if (!items.length) warnings.push(`matched SEC filer "${entry.title}" (CIK ${entry.cik}) but no annual (10-K) revenue/income figures were found in XBRL data`);

    return {
      items,
      evidence: [
        {
          url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${entry.cik}&type=10-K`,
          snapshot: `Matched filer: ${entry.title} (ticker ${entry.ticker}, CIK ${entry.cik})`,
          retrievedAt: new Date().toISOString(),
          source: "dre",
        },
      ],
      warnings,
    };
  }
}
