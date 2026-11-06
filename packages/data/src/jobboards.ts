import { assertPublicUrl } from "./net-guard.js";

/**
 * 채용 플랫폼(ATS)의 공개 JSON API. 지원자가 봐야 하므로 사실상 차단되지 않는다
 * (boards.greenhouse.io, boards-api.greenhouse.io, api.lever.co 모두 robots.txt가
 * /embed/ 등 일부만 막고 전체는 허용함을 2026-11-07 확인). 회사가 해당 ATS를 안 쓰면
 * 404/빈 응답이 오는데, 이는 오류가 아니라 흔한 경우다.
 */
export interface JobBoardOptions {
  timeoutMs?: number;
  userAgent?: string;
}

export interface RawJobPosting {
  title: string;
  location?: string;
}

/** slug는 보통 회사 도메인과 다르다 (예: stripe.com이지만 Greenhouse slug는 "stripe"). */
export async function fetchGreenhouseJobs(slug: string, opts: JobBoardOptions = {}): Promise<RawJobPosting[] | null> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs`;
  await assertPublicUrl(url);
  const res = await fetch(url, {
    headers: { "user-agent": opts.userAgent ?? "DREBot" },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Greenhouse jobs request failed: ${res.status}`);
  const data = (await res.json()) as { jobs?: Array<{ title?: string; location?: { name?: string } }> };
  if (!data.jobs) return null;
  return data.jobs.map((j) => ({ title: j.title ?? "(제목 없음)", location: j.location?.name }));
}

export async function fetchLeverJobs(slug: string, opts: JobBoardOptions = {}): Promise<RawJobPosting[] | null> {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`;
  await assertPublicUrl(url);
  const res = await fetch(url, {
    headers: { "user-agent": opts.userAgent ?? "DREBot" },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
  });
  if (!res.ok) return null; // Lever는 없는 slug에도 200 {ok:false}를 주기도 하므로 아래에서도 한 번 더 확인
  const data = (await res.json()) as { ok?: boolean } | Array<{ text?: string; categories?: { location?: string } }>;
  if (!Array.isArray(data)) return null;
  return data.map((j) => ({ title: j.text ?? "(제목 없음)", location: j.categories?.location }));
}
