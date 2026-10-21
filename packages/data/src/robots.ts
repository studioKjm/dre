import type { RobotsGroup, RobotsResult } from "@dre/core";
import { FetchError, fetchText } from "./fetcher.js";
import { assertPublicUrl } from "./net-guard.js";

export function parseRobots(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (field === "allow" || field === "disallow") {
      lastWasAgent = false;
      // 그룹 밖의 규칙은 무시한다. 빈 Disallow는 "제한 없음"이므로 저장하지 않는다.
      if (current && value) current[field].push(value);
    }
  }
  return groups;
}

export interface RobotsFetchOptions {
  timeoutMs?: number;
  userAgent?: string;
  allowPrivate?: boolean;
}

export async function fetchRobots(
  origin: string,
  opts: RobotsFetchOptions = {},
): Promise<RobotsResult> {
  const robotsUrl = new URL("/robots.txt", origin).toString();
  // 차단된 주소는 "접근 불가"가 아니라 명시적 오류로 알린다 (원인이 네트워크가 아니므로).
  await assertPublicUrl(robotsUrl, opts.allowPrivate);
  try {
    const { status, body } = await fetchText(robotsUrl, opts);
    if (status >= 500) return { kind: "unreachable", status };
    if (status >= 400) return { kind: "missing" };
    return { kind: "found", groups: parseRobots(body) };
  } catch (e) {
    if (e instanceof FetchError && e.kind === "blocked") throw e;
    return { kind: "unreachable" };
  }
}
