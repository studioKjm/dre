import test from "node:test";
import assert from "node:assert/strict";
import { FetchError, type RawPage } from "@dre/core";
import { FakeFetcher, allowAll } from "../testing.js";
import type { PageArchive, PageFetcher } from "../ports.js";
import { StructuredDataCollector } from "./structured-data.js";

const ldJson = (obj: unknown) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
const ORG = ldJson({ "@type": "Organization", name: "Acme Inc." });

test("collect returns parsed facts with evidence from the fetched page", async () => {
  const url = "https://a.com/";
  const fetcher = new FakeFetcher({ [url]: ORG });
  const r = await new StructuredDataCollector(fetcher, allowAll()).collect(url);
  assert.deepEqual(r.items, [{ kind: "organization", name: "Acme Inc." }]);
  assert.equal(r.evidence[0]!.url, url);
  assert.equal(r.evidence[0]!.source, "dre");
  assert.match(r.evidence[0]!.snapshot!, /Acme Inc\./);
});

test("warns when no JSON-LD is found, without treating it as an error", async () => {
  const url = "https://a.com/";
  const r = await new StructuredDataCollector(new FakeFetcher({ [url]: "<p>hi</p>" }), allowAll()).collect(url);
  assert.deepEqual(r.items, []);
  assert.match(r.warnings[0]!, /no Organization\/Product/);
});

const archived = (body: string): RawPage => ({ url: "u", finalUrl: "https://web.archive.org/web/2026/u", status: 200, contentType: "text/html", body, retrievedAt: "t" });

test("archive.org fallback is used when the page returns an HTTP error (e.g. 403)", async () => {
  const url = "https://a.com/";
  const fetcher: PageFetcher = { get: async () => { throw new FetchError(url, "http", 403); } };
  const archive: PageArchive = { get: async () => archived(ORG) };
  const r = await new StructuredDataCollector(fetcher, allowAll(), archive).collect(url);
  assert.deepEqual(r.items, [{ kind: "organization", name: "Acme Inc." }]);
  assert.match(r.warnings[0]!, /archive\.org snapshot was used instead/);
});

test("without an archive configured, an HTTP block error is thrown as-is", async () => {
  const url = "https://a.com/";
  const fetcher: PageFetcher = { get: async () => { throw new FetchError(url, "http", 403); } };
  await assert.rejects(new StructuredDataCollector(fetcher, allowAll()).collect(url), FetchError);
});

test("archive.org fallback is NOT used for robots.txt-style private-address blocks", async () => {
  const url = "https://a.com/";
  const fetcher: PageFetcher = { get: async () => { throw new FetchError(url, "blocked", undefined, "private address"); } };
  const archive: PageArchive = { get: async () => { throw new Error("should not be called"); } };
  await assert.rejects(new StructuredDataCollector(fetcher, allowAll(), archive).collect(url), FetchError);
});
