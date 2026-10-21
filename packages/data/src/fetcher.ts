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
  const { timeoutMs = 15_000, maxBytes = 2_000_000 } = opts;
  const signal = AbortSignal.timeout(timeoutMs);
  const { res, finalUrl } = await request(url, opts, signal);
  if (res.status >= 400) throw new FetchError(finalUrl, "http", res.status);

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

  return {
    url,
    finalUrl,
    status: res.status,
    contentType: res.headers.get("content-type") ?? "",
    body: new TextDecoder("utf-8").decode(Buffer.concat(chunks)),
    retrievedAt: new Date().toISOString(),
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
