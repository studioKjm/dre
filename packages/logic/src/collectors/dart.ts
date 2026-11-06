import { ApiKeyMissing } from "@dre/core";
import type { Collected } from "../types.js";

export interface KoreanFinancialFact {
  accountName: string; // DART 계정명 그대로 (예: "매출액", "당기순이익(손실)")
  amountKrw: number;
  fiscalYear: number;
}

export interface DartCorp {
  corpCode: string;
  corpName: string;
  stockCode?: string;
}

export interface DartSource {
  findCorpCode(name: string): Promise<DartCorp | null>;
  fetchFinancialStatement(corpCode: string, year: number): Promise<{ status: string; message: string; list?: Array<{ account_nm: string; thstrm_amount: string }> }>;
}

// 회계 계정명은 표준계정과목체계를 따르지만 회사마다 표기가 조금씩 다를 수 있다.
const REVENUE_NAMES = ["매출액", "영업수익"];
const PROFIT_NAMES = ["당기순이익", "당기순이익(손실)"];

function parseAmount(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

export class DartCollector {
  constructor(private readonly source: DartSource) {}

  /**
   * companyName: 정확한 법인명 권장(부분일치도 시도). year 기본값은 작년 — 사업보고서(연간
   * 확정 실적)는 보통 다음 해 3월에 공시되므로, 올해 연도를 넘기면 아직 없을 가능성이 높다.
   * DART에 없으면(대부분의 비상장·중소 법인) 오류가 아니라 빈 결과로 보고한다.
   */
  async collect(companyName: string, opts: { year?: number } = {}): Promise<Collected<KoreanFinancialFact>> {
    const year = opts.year ?? new Date().getFullYear() - 1;
    let corp;
    try {
      corp = await this.source.findCorpCode(companyName);
    } catch (e) {
      if (e instanceof ApiKeyMissing) {
        return { items: [], evidence: [], warnings: [`${e.message} — set DRE_DART_API_KEY (free signup at opendart.fss.or.kr) to enable this tool`] };
      }
      throw e;
    }
    if (!corp) {
      return {
        items: [],
        evidence: [],
        warnings: [`no DART-listed corporation found for "${companyName}" — most small/private companies have no DART filings; try the exact Korean legal name`],
      };
    }

    const res = await this.source.fetchFinancialStatement(corp.corpCode, year);
    const warnings: string[] = [];
    const items: KoreanFinancialFact[] = [];

    if (res.status !== "000" || !res.list) {
      warnings.push(`matched DART corporation "${corp.corpName}" (corp_code ${corp.corpCode}) but no ${year} 사업보고서 data (DART status ${res.status}: ${res.message})`);
    } else {
      for (const names of [REVENUE_NAMES, PROFIT_NAMES]) {
        const line = res.list.find((l) => names.includes(l.account_nm));
        const amount = parseAmount(line?.thstrm_amount);
        if (line && amount !== undefined) items.push({ accountName: line.account_nm, amountKrw: amount, fiscalYear: year });
      }
    }

    return {
      items,
      evidence: [
        {
          url: `https://dart.fss.or.kr/corp/main.do?corpCode=${corp.corpCode}`,
          snapshot: `Matched corporation: ${corp.corpName} (corp_code ${corp.corpCode}${corp.stockCode ? `, stock ${corp.stockCode}` : ", 비상장/코드 없음"})`,
          retrievedAt: new Date().toISOString(),
          source: "dre",
        },
      ],
      warnings,
    };
  }
}
