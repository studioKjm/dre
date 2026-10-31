import type { RawPage } from "@dre/core";
import { assertPublicUrl } from "./net-guard.js";

/**
 * Internet Archive(Wayback Machine)에서 대상 URL의 최신 스냅샷을 찾아 가져온다.
 *
 * 왜 원칙 위반이 아닌가: 이 함수는 원본 대상 사이트에 요청을 보내지 않는다 — archive.org와
 * web.archive.org라는 완전히 다른, 협조적인 제3자에게 요청한다. 2026-10-31 기준 두 호스트 모두
 * 이 용도(아카이브 조회·스냅샷 열람)를 robots.txt로 막지 않는다(archive.org: /control/, /report/만
 * 차단, /wayback/ 미포함; web.archive.org: robots.txt 자체가 없음 = RFC 9309상 전체 허용).
 * 즉 원본 사이트의 차단을 우회하는 게 아니라, 애초에 그 사이트에 요청하지 않는 것이다.
 *
 * 한계: 이 확인은 지금 시점의 스냅샷이며 코드가 매번 archive.org의 robots.txt를 다시 확인하지는
 * 않는다. 정책이 바뀌면 이 주석과 동작이 어긋날 수 있다.
 */
export async function fetchFromWayback(
  originalUrl: string,
  opts: { timeoutMs?: number; userAgent?: string } = {},
): Promise<RawPage | null> {
  const { timeoutMs = 15_000, userAgent = "DREBot" } = opts;
  const availabilityUrl = `https://archive.org/wayback/available?url=${encodeURIComponent(originalUrl)}`;
  await assertPublicUrl(availabilityUrl);

  let snapshotUrl: string | undefined;
  try {
    const res = await fetch(availabilityUrl, {
      headers: { "user-agent": userAgent },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      archived_snapshots?: { closest?: { available?: boolean; url?: string } };
    };
    const closest = data.archived_snapshots?.closest;
    if (closest?.available && closest.url) snapshotUrl = closest.url.replace(/^http:/, "https:");
  } catch {
    return null;
  }
  if (!snapshotUrl) return null;

  await assertPublicUrl(snapshotUrl);
  try {
    const res = await fetch(snapshotUrl, {
      headers: { "user-agent": userAgent },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status >= 400) return null;
    return {
      url: originalUrl,
      finalUrl: snapshotUrl,
      status: res.status,
      contentType: res.headers.get("content-type") ?? "",
      body: await res.text(),
      retrievedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
