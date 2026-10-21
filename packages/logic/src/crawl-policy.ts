import type { RobotsGroup } from "@dre/core";
import { RobotsDisallowed } from "./errors.js";
import type { RobotsSource } from "./ports.js";

/** robots.txt 패턴(*, $)을 경로 접두 매칭 정규식으로 변환한다. */
function toRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp("^" + escaped);
}

function pickGroup(groups: RobotsGroup[], agent: string): RobotsGroup | undefined {
  const lower = agent.toLowerCase();
  const specific = groups.find((g) => g.agents.some((a) => a !== "*" && lower.includes(a)));
  return specific ?? groups.find((g) => g.agents.includes("*"));
}

export class CrawlPolicy {
  constructor(
    private readonly robots: RobotsSource,
    private readonly userAgent = "DREBot",
  ) {}

  /** 허용되면 resolve, 불허면 RobotsDisallowed로 reject */
  async assertAllowed(rawUrl: string): Promise<void> {
    const url = new URL(rawUrl);
    const result = await this.robots.get(url.origin);

    if (result.kind === "missing") return;
    if (result.kind === "unreachable") {
      throw new RobotsDisallowed(rawUrl, "robots.txt unreachable (5xx/network); assuming disallow");
    }

    const group = pickGroup(result.groups, this.userAgent);
    if (!group) return;

    const target = url.pathname + url.search;
    // 가장 긴 패턴이 이긴다. 같은 길이면 Allow 우선 (RFC 9309).
    let best: { len: number; allow: boolean } | null = null;
    for (const [list, allow] of [[group.allow, true], [group.disallow, false]] as const) {
      for (const p of list) {
        if (toRegExp(p).test(target) && (!best || p.length > best.len || (p.length === best.len && allow))) {
          best = { len: p.length, allow };
        }
      }
    }
    if (best && !best.allow) throw new RobotsDisallowed(rawUrl, "matched Disallow rule");
  }
}
