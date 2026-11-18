import { FetchError, type RawPage, type RobotsResult } from "@dre/core";
import { CrawlPolicy } from "./crawl-policy.js";
import type { PageFetcher } from "./ports.js";

type FakePage = string | { body: string; status?: number; headers?: Record<string, string> };

/** 테스트용 가짜 Fetcher. 호출한 URL을 기록한다. */
export class FakeFetcher implements PageFetcher {
  calls: string[] = [];
  constructor(private readonly pages: Record<string, FakePage>) {}
  async get(url: string, opts?: { allowErrorStatus?: boolean }): Promise<RawPage> {
    this.calls.push(url);
    const entry = this.pages[url];
    if (entry === undefined) throw new Error(`FakeFetcher: no page for ${url}`);
    const { body, status = 200, headers } = typeof entry === "string" ? { body: entry } : entry;
    if (status >= 400 && !opts?.allowErrorStatus) throw new FetchError(url, "http", status);
    return { url, finalUrl: url, status, contentType: "text/html", body, retrievedAt: "2026-10-21T00:00:00Z", headers };
  }
}

export const allowAll = (): CrawlPolicy => new CrawlPolicy({ get: async () => ({ kind: "missing" }) });
export const policyWith = (r: RobotsResult): CrawlPolicy => new CrawlPolicy({ get: async () => r });
