import AdmZip from "adm-zip";
import { assertPublicUrl } from "./net-guard.js";

/**
 * DART(한국 금융감독원 전자공시) Open API. EDGAR와 달리 무료 API 키 발급(회원가입)이
 * 필요하다 — 키 발급은 사용자가 opendart.fss.or.kr에서 직접 해야 한다(계정 생성을
 * 대신 해주지 않는다는 원칙과 맞물린다).
 *
 * 주의: 이 파일의 필드명·엔드포인트는 DART Open API 공식 문서를 기준으로 작성했지만,
 * 실제 키로 라이브 검증을 하지 못했다(이 세션에는 키가 없었다). 사용 전에 실제 키로
 * 한 번 스모크 테스트하길 권한다.
 */
export interface DartOptions {
  apiKey: string;
  timeoutMs?: number;
}

export interface CorpCodeEntry {
  corpCode: string;
  corpName: string;
  stockCode?: string;
}

let corpCodeCache: Promise<CorpCodeEntry[]> | null = null;

/** 전체 회사의 고유번호(corp_code) 매핑을 받아온다. ZIP 안에 XML 하나가 들어있다. */
async function loadCorpCodes(opts: DartOptions): Promise<CorpCodeEntry[]> {
  corpCodeCache ??= (async () => {
    const url = `https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${encodeURIComponent(opts.apiKey)}`;
    await assertPublicUrl(url);
    const res = await fetch(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000) });
    if (!res.ok) throw new Error(`DART corpCode request failed: ${res.status}`);
    const zip = new AdmZip(Buffer.from(await res.arrayBuffer()));
    const entry = zip.getEntries().find((e) => /\.xml$/i.test(e.entryName));
    if (!entry) throw new Error("DART corpCode response: no XML entry found in zip (check API key validity)");
    const xml = entry.getData().toString("utf-8");

    const entries: CorpCodeEntry[] = [];
    for (const m of xml.matchAll(/<list>([\s\S]*?)<\/list>/g)) {
      const block = m[1]!;
      const corpCode = /<corp_code>([^<]*)<\/corp_code>/.exec(block)?.[1];
      const corpName = /<corp_name>([^<]*)<\/corp_name>/.exec(block)?.[1];
      const stockCode = /<stock_code>([^<]*)<\/stock_code>/.exec(block)?.[1]?.trim();
      if (corpCode && corpName) entries.push({ corpCode, corpName, stockCode: stockCode || undefined });
    }
    return entries;
  })();
  return corpCodeCache;
}

/** 정확한 회사명 일치를 우선하고, 없으면 부분일치로 찾는다. 상장(stockCode 보유) 쪽을 우선한다. */
export async function findCorpCode(name: string, opts: DartOptions): Promise<CorpCodeEntry | null> {
  const list = await loadCorpCodes(opts);
  const needle = name.trim();
  const exact = list.filter((c) => c.corpName === needle);
  if (exact.length) return exact.find((c) => c.stockCode) ?? exact[0]!;
  const partial = list.filter((c) => c.corpName.includes(needle));
  return (partial.find((c) => c.stockCode) ?? partial[0]) ?? null;
}

export interface DartAccountLine {
  account_nm: string; // 예: "매출액", "당기순이익(손실)"
  thstrm_amount: string; // 문자열로 내려온다 (쉼표 포함)
  fs_div?: string; // CFS(연결) | OFS(개별)
  sj_div?: string; // BS(재무상태표) | IS(손익계산서) 등
}

export interface DartFinancialResponse {
  status: string; // "000" = 정상, 그 외는 DART 문서의 오류 코드
  message: string;
  list?: DartAccountLine[];
}

/** reprt_code 11011 = 사업보고서(연간 확정 실적). */
export async function fetchFinancialStatement(corpCode: string, year: number, opts: DartOptions): Promise<DartFinancialResponse> {
  const url =
    `https://opendart.fss.or.kr/api/fnlttSinglAcnt.json?crtfc_key=${encodeURIComponent(opts.apiKey)}` +
    `&corp_code=${encodeURIComponent(corpCode)}&bsns_year=${year}&reprt_code=11011`;
  await assertPublicUrl(url);
  const res = await fetch(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000) });
  if (!res.ok) throw new Error(`DART financial statement request failed: ${res.status}`);
  return res.json() as Promise<DartFinancialResponse>;
}
