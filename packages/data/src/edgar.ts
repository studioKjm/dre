import { htmlToText } from "@dre/core";
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

async function getJson(url: string, opts: EdgarOptions): Promise<unknown> {
  await assertPublicUrl(url);
  const res = await fetch(url, { headers: { "user-agent": opts.userAgent }, signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`SEC request failed: ${res.status} (${url})`);
  return res.json();
}

async function getText(url: string, opts: EdgarOptions): Promise<string | null> {
  await assertPublicUrl(url);
  const res = await fetch(url, { headers: { "user-agent": opts.userAgent }, signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`SEC request failed: ${res.status} (${url})`);
  return res.text();
}

export interface FilingRef {
  accessionNoDash: string;
  filingDate: string;
}

/** companyfacts(=XBRL 수치)에는 세그먼트/차원 분해(예: 광고 매출만 따로)가 없다 — 그건
 * 공시 본문의 "Disaggregation of Revenue" 주석에만 있고, SEC의 XBRL 뷰어가 그 주석을
 * R##.htm으로 렌더링해서 공개한다(사람이 보는 것과 같은 HTML 표). 그래서 이 세 단계가
 * 필요하다: 최신 10-K accession 찾기 -> FilingSummary.xml에서 그 주석에 해당하는
 * R##.htm 이름 찾기 -> 그 페이지를 읽어 라인아이템을 뽑기. */
export async function fetchLatestTenK(cik: number, opts: EdgarOptions): Promise<FilingRef | null> {
  const padded = String(cik).padStart(10, "0");
  const data = (await getJson(`https://data.sec.gov/submissions/CIK${padded}.json`, opts)) as
    | { filings?: { recent?: { form?: string[]; accessionNumber?: string[]; filingDate?: string[] } } }
    | null;
  const recent = data?.filings?.recent;
  if (!recent?.form) return null;
  const i = recent.form.findIndex((f) => f === "10-K");
  if (i === -1) return null;
  return { accessionNoDash: recent.accessionNumber![i]!.replace(/-/g, ""), filingDate: recent.filingDate![i]! };
}

export interface FilingReport {
  shortName: string;
  htmlFile: string;
}

/** FilingSummary.xml은 그 공시의 모든 재무제표/주석 페이지 목록이다(각 R##.htm 하나씩). */
export function parseFilingSummary(xml: string): FilingReport[] {
  const reports: FilingReport[] = [];
  for (const m of xml.matchAll(/<Report[^>]*>[\s\S]*?<\/Report>/g)) {
    const shortName = /<ShortName>(.*?)<\/ShortName>/.exec(m[0])?.[1];
    const htmlFile = /<HtmlFileName>(.*?)<\/HtmlFileName>/.exec(m[0])?.[1];
    if (shortName && htmlFile) reports.push({ shortName, htmlFile });
  }
  return reports;
}

export async function fetchFilingReports(cik: number, filing: FilingRef, opts: EdgarOptions): Promise<FilingReport[]> {
  const url = `https://www.sec.gov/Archives/edgar/data/${cik}/${filing.accessionNoDash}/FilingSummary.xml`;
  const xml = await getText(url, opts);
  return xml ? parseFilingSummary(xml) : [];
}

export interface RevenueSegment {
  label: string;
  valueUsd: number;
  periodEnd: string;
}

const REVENUE_CONCEPT_LINE = /^(?:total\s+)?(?:revenue|revenues|net\s+revenues|total\s+net\s+revenues|revenue\s+from\s+contract\s+with\s+customer.*)$/i;

/**
 * SEC의 XBRL 뷰어가 렌더링한 R##.htm은 "세그먼트 이름 줄 -> 'Disaggregation of Revenue
 * [Line Items]' -> 개념 이름 줄 -> 연도별 숫자들" 블록이 세그먼트마다 반복되는 고정
 * 패턴이다. 범용 XBRL/차원 파서가 아니라 이 한 가지 렌더링 패턴만 읽는다 — 그 이상은
 * 새 의존성(XML 파서) 없이는 못 한다.
 */
const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** "Dec. 31, 2025" -> "2025-12-31". 못 알아보면 그대로 둔다. */
function toIsoDate(text: string): string {
  const m = /^([a-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/i.exec(text);
  const month = m && MONTHS[m[1]!.slice(0, 3).toLowerCase()];
  return month ? `${m![3]}-${month}-${m![2]!.padStart(2, "0")}` : text;
}

const DATE_LINE = /^[a-z]+\.?\s+\d{1,2},?\s+\d{4}$/i;

const SCALE: Record<string, number> = { thousands: 1_000, millions: 1_000_000, billions: 1_000_000_000 };

export function parseRevenueSegments(text: string): RevenueSegment[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  // 표 머리말에 보고 기간 날짜들이 최신->과거 순으로 여러 줄 나온다(예: "Dec. 31, 2025",
  // "Dec. 31, 2024", "Dec. 31, 2023"). 그중 가장 최근 날짜 — 각 세그먼트 블록에서 읽는
  // 값도 항상 그 열(가장 최근 연도)의 숫자이므로, 날짜와 값이 같은 연도를 가리키게 한다.
  const headerDates = lines.slice(0, 15).filter((l) => DATE_LINE.test(l)).map(toIsoDate);
  const periodEnd = headerDates.sort().at(-1) ?? "";
  // "$ in Thousands"/"$ in Millions" 머리말 — 안 쓰면 표 숫자가 실제 달러의 1/1000, 1/100만이다.
  const scaleMatch = /\$\s*in\s*(thousands|millions|billions)/i.exec(text)?.[1]?.toLowerCase();
  const scale = (scaleMatch && SCALE[scaleMatch]) || 1;

  const out: RevenueSegment[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^disaggregation of revenue \[line items\]$/i.test(lines[i]!)) continue;
    const label = lines[i - 1] ?? "";
    let j = i + 1;
    while (j < lines.length && !REVENUE_CONCEPT_LINE.test(lines[j]!)) j++;
    const value = /^\$?\s*[\d,]+(?:\.\d+)?$/.test(lines[j + 1] ?? "") ? lines[j + 1] : undefined;
    // 맨 첫 블록(회사 전체 합계)의 "직전 줄"은 날짜 헤더다 — 세그먼트 이름이 아니다.
    if (value && label && !DATE_LINE.test(label) && !/^revenue|^disclosure|^schedule/i.test(label)) {
      const raw = Number(value.replace(/[$,\s]/g, ""));
      if (Number.isFinite(raw)) out.push({ label, valueUsd: raw * scale, periodEnd });
    }
  }
  return out;
}

export async function fetchRevenueSegments(cik: number, filing: FilingRef, opts: EdgarOptions): Promise<{ url: string; segments: RevenueSegment[] } | null> {
  const reports = await fetchFilingReports(cik, filing, opts);
  const report = reports.find((r) => /disaggregation.*revenue|revenue.*disaggregation/i.test(r.shortName));
  if (!report) return null;
  const url = `https://www.sec.gov/Archives/edgar/data/${cik}/${filing.accessionNoDash}/${report.htmlFile}`;
  const html = await getText(url, opts);
  if (!html) return null;
  const segments = parseRevenueSegments(htmlToText(html));
  return { url, segments };
}
