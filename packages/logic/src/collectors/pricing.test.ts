import test from "node:test";
import assert from "node:assert/strict";
import { AutomationBlocked } from "@dre/core";
import { RobotsDisallowed } from "../errors.js";
import { FakeFetcher, allowAll, policyWith } from "../testing.js";
import { PricingCollector, extractPlanCandidates } from "./pricing.js";

const PAGE = `<html><body>
<script>var price = "$999";</script>
<div class="plan"><h3>Free</h3><p>Free forever</p></div>
<div class="plan"><h3>Pro</h3><p>$12/month</p></div>
<div class="plan"><h3>Team</h3><p>₩29,000 / 월</p></div>
</body></html>`;

test("extractPlanCandidates finds plan names and prices, ignoring scripts", () => {
  const items = extractPlanCandidates("Pro\n$12/month\nTeam\n₩29,000 / 월");
  assert.deepEqual(items.map((i) => [i.name, i.priceText]), [["Pro", "$12/month"], ["Team", "₩29,000 / 월"]]);
});

test("collect returns candidates with evidence from the fetched page", async () => {
  const url = "https://a.com/pricing";
  const r = await new PricingCollector(new FakeFetcher({ [url]: PAGE }), allowAll()).collect(url);
  assert.deepEqual(r.items.map((i) => i.priceText), ["Free", "$12/month", "₩29,000 / 월"]);
  assert.equal(r.evidence[0]!.url, url);
  assert.match(r.evidence[0]!.snapshot!, /\$12\/month/);
  assert.ok(!r.evidence[0]!.snapshot!.includes("$999"));
  assert.deepEqual(r.warnings, []);
});

test("collect does not fetch when robots.txt disallows", async () => {
  const url = "https://a.com/pricing";
  const fetcher = new FakeFetcher({ [url]: PAGE });
  const policy = policyWith({ kind: "found", groups: [{ agents: ["*"], allow: [], disallow: ["/pricing"] }] });
  await assert.rejects(new PricingCollector(fetcher, policy).collect(url), RobotsDisallowed);
  assert.deepEqual(fetcher.calls, []);
});

test("collect warns when no price-like text exists", async () => {
  const url = "https://a.com/";
  const r = await new PricingCollector(new FakeFetcher({ [url]: "<div id=root></div>" }), allowAll()).collect(url);
  assert.equal(r.items.length, 0);
  assert.equal(r.warnings.length, 1);
});

import { BrowserUnavailable, type RawPage } from "@dre/core";
import type { PageRenderer } from "../ports.js";

const rendered = (body: string): RawPage => ({ url: "u", finalUrl: "u", status: 200, contentType: "text/html", body, retrievedAt: "t" });

test("js mode uses the renderer output", async () => {
  const url = "https://a.com/pricing";
  const fetcher = new FakeFetcher({ [url]: "<div id=root></div>" });
  const renderer: PageRenderer = { render: async () => rendered("<h3>Pro</h3><p>$19/month</p>") };
  const r = await new PricingCollector(fetcher, allowAll(), renderer).collect(url, { js: true });
  assert.deepEqual(r.items.map((i) => i.priceText), ["$19/month"]);
  assert.deepEqual(fetcher.calls, []);
});

test("js mode falls back to static fetch with a warning when the browser is unavailable", async () => {
  const url = "https://a.com/pricing";
  const fetcher = new FakeFetcher({ [url]: "<h3>Pro</h3><p>$12/month</p>" });
  const renderer: PageRenderer = { render: async () => { throw new BrowserUnavailable("Chrome not found"); } };
  const r = await new PricingCollector(fetcher, allowAll(), renderer).collect(url, { js: true });
  assert.deepEqual(r.items.map((i) => i.priceText), ["$12/month"]);
  assert.match(r.warnings[0]!, /browser unavailable.*fell back to static/);
});

test("js mode propagates unexpected renderer errors", async () => {
  const url = "https://a.com/pricing";
  const renderer: PageRenderer = { render: async () => { throw new Error("boom"); } };
  await assert.rejects(new PricingCollector(new FakeFetcher({}), allowAll(), renderer).collect(url, { js: true }), /boom/);
});

test("js mode without a renderer warns and uses static fetch", async () => {
  const url = "https://a.com/pricing";
  const r = await new PricingCollector(new FakeFetcher({ [url]: "<h3>Pro</h3><p>$12/month</p>" }), allowAll()).collect(url, { js: true });
  assert.equal(r.items.length, 1);
  assert.match(r.warnings[0]!, /no renderer configured/);
});

test("extractPlanCandidates matches Korean 만/억-unit prices", () => {
  const items = extractPlanCandidates("구독\n개별 구매\n일반 이용\n개당 평균 20만원\n9만원 쿠폰팩\n9,900원 단품");
  assert.deepEqual(items.map((i) => i.priceText), ["20만원", "9만원", "9,900원"]);
});

test("js mode surfaces AutomationBlocked as a distinct low-confidence warning, then falls back to static", async () => {
  const url = "https://a.com/pricing";
  const fetcher = new FakeFetcher({ [url]: "<h3>Pro</h3><p>$12/month</p>" });
  const renderer: PageRenderer = { render: async () => { throw new AutomationBlocked(url, 'title="Unsupported Client"'); } };
  const r = await new PricingCollector(fetcher, allowAll(), renderer).collect(url, { js: true });
  assert.deepEqual(r.items.map((i) => i.priceText), ["$12/month"]);
  assert.match(r.warnings[0]!, /actively blocks automated browsers/);
});

test("evidence from collect() is tagged source: dre", async () => {
  const url = "https://a.com/pricing";
  const r = await new PricingCollector(new FakeFetcher({ [url]: "<h3>Pro</h3><p>$12/month</p>" }), allowAll()).collect(url);
  assert.equal(r.evidence[0]!.source, "dre");
});
