import test from "node:test";
import assert from "node:assert/strict";
import { AutomationBlocked, type RawPage } from "@dre/core";
import { allowAll, policyWith } from "../testing.js";
import type { PageRenderer } from "../ports.js";
import { RobotsDisallowed } from "../errors.js";
import { AdLibraryCollector } from "./adlibrary.js";

const rendered = (body: string): RawPage => ({
  url: "u", finalUrl: "https://adstransparency.google.com/?region=US&domain=a.com", status: 200, contentType: "text/html", body, retrievedAt: "t",
});

test("collect builds the Google Ads Transparency URL from domain and region", async () => {
  let requested = "";
  const renderer: PageRenderer = { render: async (url) => { requested = url; return rendered("<p>광고 약 12개</p>"); } };
  await new AdLibraryCollector(renderer, allowAll()).collect("notion.com", { region: "KR" });
  assert.equal(requested, "https://adstransparency.google.com/?region=KR&domain=notion.com");
});

test("defaults region to US when not given", async () => {
  let requested = "";
  const renderer: PageRenderer = { render: async (url) => { requested = url; return rendered("<p>no match here</p>"); } };
  await new AdLibraryCollector(renderer, allowAll()).collect("notion.com");
  assert.match(requested, /region=US/);
});

test("extracts a Korean ad-count phrase and includes the full text as evidence", async () => {
  const renderer: PageRenderer = { render: async () => rendered("notion.com\n광고 약 200개\nNotion Labs, Inc") };
  const r = await new AdLibraryCollector(renderer, allowAll()).collect("notion.com");
  assert.deepEqual(r.items, [{ adCountText: "광고 약 200개" }]);
  assert.match(r.evidence[0]!.snapshot!, /Notion Labs, Inc/);
  assert.equal(r.evidence[0]!.source, "dre");
});

test("extracts an English ad-count phrase too", async () => {
  const renderer: PageRenderer = { render: async () => rendered("About 42 ads") };
  const r = await new AdLibraryCollector(renderer, allowAll()).collect("notion.com");
  assert.deepEqual(r.items, [{ adCountText: "About 42 ads" }]);
});

test("warns instead of guessing when no ad-count phrase is found", async () => {
  const renderer: PageRenderer = { render: async () => rendered("some unrelated UI chrome") };
  const r = await new AdLibraryCollector(renderer, allowAll()).collect("notion.com");
  assert.deepEqual(r.items, []);
  assert.match(r.warnings[0]!, /could not confidently parse/);
});

test("respects robots.txt and never renders when disallowed", async () => {
  let called = false;
  const renderer: PageRenderer = { render: async () => { called = true; return rendered(""); } };
  const policy = policyWith({ kind: "found", groups: [{ agents: ["*"], allow: [], disallow: ["/"] }] });
  await assert.rejects(new AdLibraryCollector(renderer, policy).collect("notion.com"), RobotsDisallowed);
  assert.equal(called, false);
});

test("propagates AutomationBlocked unchanged (no static fallback exists for this page)", async () => {
  const renderer: PageRenderer = { render: async () => { throw new AutomationBlocked("u", 'title="blocked"'); } };
  await assert.rejects(new AdLibraryCollector(renderer, allowAll()).collect("notion.com"), AutomationBlocked);
});

test("extracts an exact (non-approximate) Korean ad-count phrase (Google omits '약' for small/zero counts)", async () => {
  const zero = { render: async () => rendered("광고 0개") } as PageRenderer;
  const r0 = await new AdLibraryCollector(zero, allowAll()).collect("a.com");
  assert.deepEqual(r0.items, [{ adCountText: "광고 0개" }]);

  const some = { render: async () => rendered("광고 56개\n주식회사 일그램") } as PageRenderer;
  const r1 = await new AdLibraryCollector(some, allowAll()).collect("a.com");
  assert.deepEqual(r1.items, [{ adCountText: "광고 56개" }]);
});

test("extracts a bare English count phrase without 'about'", async () => {
  const renderer = { render: async () => rendered("5 ads found") } as PageRenderer;
  const r = await new AdLibraryCollector(renderer, allowAll()).collect("a.com");
  assert.deepEqual(r.items, [{ adCountText: "5 ads" }]);
});
