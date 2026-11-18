import type { RawPage } from "@dre/core";
import { FetchError } from "./fetcher-error.js";
import { assertPublicUrl } from "./net-guard.js";

export { FetchError, type FetchErrorKind } from "./fetcher-error.js";

export interface FetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  userAgent?: string;
  maxRedirects?: number;
  /** 사설/루프백 주소 허용 (로컬 개발·테스트 전용, 기본 false) */
  allowPrivate?: boolean;
  /** 리다이렉트 대상 URL마다 호출된다. 던지면 수집이 중단된다 (robots.txt 재검사용). */
  onRedirect?: (nextUrl: string) => Promise<void>;
  /**
   * true면 4xx/5xx 응답도 던지지 않고 RawPage(헤더+본문 포함)로 그대로 반환한다.
   * collect_techstack처럼 응답 헤더 자체가 증거인 수집기용 — 차단 응답(403 등)에도
   * CDN/WAF 헤더는 실려 있는데, 기본 동작(바로 FetchError)은 그 헤더를 볼 기회조차
   * 주지 않는다. 가격/약관처럼 본문 내용을 신뢰해야 하는 수집기는 기본값(false)을 쓴다.
   */
  allowErrorStatus?: boolean;
}

/** 리다이렉트를 직접 따라가며 매 홉마다 주소 검사와 onRedirect 훅을 실행한다. */
async function request(
  url: string,
  opts: FetchOptions,
  signal: AbortSignal,
): Promise<{ res: Response; finalUrl: string }> {
  const { userAgent = "DREBot", maxRedirects = 5, allowPrivate = false, onRedirect } = opts;
  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertPublicUrl(current, allowPrivate);
    let res: Response;
    try {
      res = await fetch(current, {
        headers: { "user-agent": userAgent, accept: "text/html,*/*;q=0.8" },
        redirect: "manual",
        signal,
      });
    } catch (e) {
      throw new FetchError(current, (e as Error).name === "TimeoutError" ? "timeout" : "network");
    }
    const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!location) return { res, finalUrl: current };

    await res.body?.cancel();
    const next = new URL(location, current).toString();
    await assertPublicUrl(next, allowPrivate);
    await onRedirect?.(next);
    current = next;
  }
  throw new FetchError(url, "too-many-redirects");
}

export async function fetchPage(url: string, opts: FetchOptions = {}): Promise<RawPage> {
  const { timeoutMs = 15_000, maxBytes = 6_000_000, allowErrorStatus = false } = opts;
  const signal = AbortSignal.timeout(timeoutMs);
  const { res, finalUrl } = await request(url, opts, signal);
  if (res.status >= 400 && !allowErrorStatus) throw new FetchError(finalUrl, "http", res.status);

  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    const reader = res.body?.getReader();
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new FetchError(finalUrl, "too-large");
      }
      chunks.push(value);
    }
  } catch (e) {
    if (e instanceof FetchError) throw e;
    throw new FetchError(finalUrl, (e as Error).name === "TimeoutError" ? "timeout" : "network");
  }

  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));

  return {
    url,
    finalUrl,
    status: res.status,
    contentType: res.headers.get("content-type") ?? "",
    body: new TextDecoder("utf-8").decode(Buffer.concat(chunks)),
    retrievedAt: new Date().toISOString(),
    headers,
  };
}

/** robots.txt 조회용. 같은 주소 검사와 리다이렉트 제한을 적용하되 상태 코드 해석은 호출자가 한다. */
export async function fetchText(
  url: string,
  opts: FetchOptions = {},
): Promise<{ status: number; body: string }> {
  const signal = AbortSignal.timeout(opts.timeoutMs ?? 10_000);
  const { res } = await request(url, opts, signal);
  try {
    return { status: res.status, body: res.status < 400 ? await res.text() : "" };
  } catch (e) {
    throw new FetchError(url, (e as Error).name === "TimeoutError" ? "timeout" : "network");
  }
}
