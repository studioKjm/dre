import test from "node:test";
import assert from "node:assert/strict";
import { FetchError, type RawPage } from "@dre/core";
import { FakeFetcher, allowAll, policyWith } from "../testing.js";
import type { PageArchive, PageFetcher } from "../ports.js";
import { TermsCollector } from "./terms.js";

const HOME = `<a href="/terms">Terms of Service</a> <a href="/about">About</a>`;
const TERMS = `<p>Welcome.</p><p>Subscriptions renew automatically each month until cancelled.</p><p>Refunds are available within 14 days of purchase.</p>`;

test("collect follows same-origin terms links and extracts billing passages", async () => {
  const fetcher = new FakeFetcher({ "https://a.com/": HOME, "https://a.com/terms": TERMS });
  const r = await new TermsCollector(fetcher, allowAll()).collect("https://a.com/");
  assert.deepEqual(r.items.map((i) => i.text), [
    "Subscriptions renew automatically each month until cancelled.",
    "Refunds are available within 14 days of purchase.",
  ]);
  assert.equal(r.evidence[0]!.url, "https://a.com/terms");
});

test("cross-origin terms links are followed after same-origin ones, each checked by robots", async () => {
  const home = `<a href="https://docs.a.com/tos">Terms</a> <a href="/legal">Legal</a>`;
  const fetcher = new FakeFetcher({
    "https://a.com/": home,
    "https://a.com/legal": "<p>Subscriptions renew automatically every year.</p>",
    "https://docs.a.com/tos": "<p>Refunds are not provided for partial periods.</p>",
  });
  const r = await new TermsCollector(fetcher, allowAll()).collect("https://a.com/");
  assert.deepEqual(fetcher.calls, ["https://a.com/", "https://a.com/legal", "https://docs.a.com/tos"]);
  assert.equal(r.items.length, 2);
});

test("a linked page disallowed by robots is skipped with a warning", async () => {
  const fetcher = new FakeFetcher({ "https://a.com/": HOME, "https://a.com/terms": TERMS });
  const policy = policyWith({ kind: "found", groups: [{ agents: ["*"], allow: [], disallow: ["/terms"] }] });
  const r = await new TermsCollector(fetcher, policy).collect("https://a.com/");
  assert.equal(r.items.length, 0);
  assert.match(r.warnings[0]!, /disallowed/);
  assert.ok(!fetcher.calls.includes("https://a.com/terms"));
});

test("warns when no terms links exist", async () => {
  const r = await new TermsCollector(new FakeFetcher({ "https://a.com/": "<p>hi</p>" }), allowAll()).collect("https://a.com/");
  assert.deepEqual(r.warnings, ["no terms/refund links found"]);
});

test("evidence from collect() is tagged source: dre", async () => {
  const fetcher = new FakeFetcher({ "https://a.com/": HOME, "https://a.com/terms": TERMS });
  const r = await new TermsCollector(fetcher, allowAll()).collect("https://a.com/");
  assert.equal(r.evidence[0]!.source, "dre");
});

const archived = (body: string): RawPage => ({ url: "u", finalUrl: "https://web.archive.org/web/2026/u", status: 200, contentType: "text/html", body, retrievedAt: "t" });

test("archive.org fallback is used when the home page returns an HTTP error (e.g. 403, coupang.com-style WAF block)", async () => {
  const url = "https://a.com/";
  // 아카이브 스냅샷은 링크가 절대경로로 보존돼 있다고 가정한다 — archived()의 finalUrl은
  // web.archive.org라 상대경로는 원래 출처로 못 돌아간다(실측 archive.org 동작과 일치).
  const fetcher: PageFetcher = {
    get: async (u) => {
      if (u === url) throw new FetchError(url, "http", 403);
      if (u === "https://a.com/terms") return { url: u, finalUrl: u, status: 200, contentType: "text/html", body: TERMS, retrievedAt: "t" };
      throw new Error(`unexpected fetch: ${u}`);
    },
  };
  const archive: PageArchive = { get: async () => archived(`<a href="https://a.com/terms">Terms of Service</a>`) };
  const r = await new TermsCollector(fetcher, allowAll(), archive).collect(url);
  assert.equal(r.items.length, 2);
  assert.match(r.warnings[0]!, /archive\.org snapshot was used instead/);
});

test("without an archive configured, an HTTP block error on the home page is thrown as-is", async () => {
  const url = "https://a.com/";
  const fetcher: PageFetcher = { get: async () => { throw new FetchError(url, "http", 403); } };
  await assert.rejects(new TermsCollector(fetcher, allowAll()).collect(url), FetchError);
});

test("a candidate link that 403s is skipped with a warning instead of failing the whole collect", async () => {
  const fetcher: PageFetcher = {
    get: async (u) => {
      if (u === "https://a.com/") return { url: u, finalUrl: u, status: 200, contentType: "text/html", body: HOME, retrievedAt: "t" };
      throw new FetchError(u, "http", 403); // only candidate link is /terms
    },
  };
  const r = await new TermsCollector(fetcher, allowAll()).collect("https://a.com/");
  assert.equal(r.items.length, 0);
  assert.match(r.warnings.find((w) => w.startsWith("skipped https://a.com/terms"))!, /403/);
});

test("archive.org fallback is NOT used for robots.txt-style private-address blocks", async () => {
  const url = "https://a.com/";
  const fetcher: PageFetcher = { get: async () => { throw new FetchError(url, "blocked", undefined, "private address"); } };
  const archive: PageArchive = { get: async () => { throw new Error("should not be called"); } };
  await assert.rejects(new TermsCollector(fetcher, allowAll(), archive).collect(url), FetchError);
});
