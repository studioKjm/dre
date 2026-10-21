import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isPrivateAddress, isPrivateHostname } from "@dre/core";
import { FetchError } from "./fetcher-error.js";

/**
 * 사설/루프백/링크로컬 주소로 향하는 요청을 막는다 (SSRF 방어).
 * 호스트 이름은 DNS로 풀어서 모든 결과 주소를 검사한다.
 * 한계: 검사와 실제 연결 사이에 DNS가 바뀌는 rebinding 공격은 막지 못한다.
 */
export async function assertPublicUrl(rawUrl: string, allowPrivate = false): Promise<void> {
  const url = new URL(rawUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FetchError(rawUrl, "blocked", undefined, `unsupported scheme ${url.protocol}`);
  }
  if (allowPrivate) return;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isPrivateHostname(host)) throw new FetchError(rawUrl, "blocked", undefined, "private or local address");
  if (isIP(host)) return;
  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new FetchError(rawUrl, "network", undefined, "DNS lookup failed");
  }
  if (addrs.some((a) => isPrivateAddress(a.address))) {
    throw new FetchError(rawUrl, "blocked", undefined, "hostname resolves to a private address");
  }
}
