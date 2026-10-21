import type { RawPage, RobotsResult } from "@dre/core";
import { CrawlPolicy } from "./crawl-policy.js";
import type { PageFetcher } from "./ports.js";

/** 테스트용 가짜 Fetcher. 호출한 URL을 기록한다. */
export class FakeFetcher implements PageFetcher {
  calls: string[] = [];
  constructor(private readonly pages: Record<string, string>) {}
  async get(url: string): Promise<RawPage> {
    this.calls.push(url);
    const body = this.pages[url];
    if (body === undefined) throw new Error(`FakeFetcher: no page for ${url}`);
    return { url, finalUrl: url, status: 200, contentType: "text/html", body, retrievedAt: "2026-10-21T00:00:00Z" };
  }
}

export const allowAll = (): CrawlPolicy => new CrawlPolicy({ get: async () => ({ kind: "missing" }) });
export const policyWith = (r: RobotsResult): CrawlPolicy => new CrawlPolicy({ get: async () => r });
