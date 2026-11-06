import { assertPublicUrl } from "./net-guard.js";

/**
 * SEC EDGAR(미국 증권거래위원회 전자공시)의 무료 공개 API. robots.txt 차단이 아니라
 * "자신을 밝히라"는 공개 정책이다 — User-Agent에 조직명과 연락처를 넣지 않으면
 * data.sec.gov가 "Undeclared Automated Tool" 오류를 돌려준다(2026-11-06 확인).
 * 요청 빈도도 과하게 보내면(초당 다건) 레이트리밋에 걸린다. 키 발급이나 가입은 필요 없다.
 */
export interface EdgarOptions {
  /** SEC가 요구하는 형식: "조직명 연락처" (예: "DRE research you@example.com") */
  userAgent: string;
  timeoutMs?: number;
}

export interface TickerEntry {
  cik: number;
  ticker: string;
  title: string;
}

let tickerCache: Promise<TickerEntry[]> | null = null;

/** 상장사 티커·CIK 전체 목록을 받아온다 (매일 갱신되는 정적 파일, 캐시해서 한 번만 받는다). */
async function loadTickers(opts: EdgarOptions): Promise<TickerEntry[]> {
  tickerCache ??= (async () => {
    const url = "https://www.sec.gov/files/company_tickers.json";
    await assertPublicUrl(url);
    const res = await fetch(url, {
      headers: { "user-agent": opts.userAgent },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
    });
    if (!res.ok) throw new Error(`SEC ticker list request failed: ${res.status}`);
    const data = (await res.json()) as Record<string, { cik_str: number; ticker: string; title: string }>;
    return Object.values(data).map((e) => ({ cik: e.cik_str, ticker: e.ticker, title: e.title }));
  })();
  return tickerCache;
}

/** 정확한 티커 일치를 우선하고, 없으면 회사명 부분일치로 찾는다. 못 찾으면 null. */
export async function findCik(nameOrTicker: string, opts: EdgarOptions): Promise<TickerEntry | null> {
  const tickers = await loadTickers(opts);
  const needle = nameOrTicker.trim().toLowerCase();
  const byTicker = tickers.find((t) => t.ticker.toLowerCase() === needle);
  if (byTicker) return byTicker;
  return tickers.find((t) => t.title.toLowerCase().includes(needle)) ?? null;
}

/** 해당 CIK의 전체 XBRL 재무 데이터(모든 us-gaap 개념, 모든 보고 기간)를 받아온다. */
export async function fetchCompanyFacts(cik: number, opts: EdgarOptions): Promise<unknown> {
  const padded = String(cik).padStart(10, "0");
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${padded}.json`;
  await assertPublicUrl(url);
  const res = await fetch(url, {
    headers: { "user-agent": opts.userAgent },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
  });
  if (res.status === 404) return null; // 상장사지만 XBRL 데이터가 아직 없는 경우(신규 상장 등)
  if (!res.ok) throw new Error(`SEC companyfacts request failed: ${res.status}`);
  return res.json();
}
