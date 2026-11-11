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

test("extractPlanCandidates catches a plan name run into \"Free\" with no separator (real dropbox.com/plans bug)", () => {
  // htmlToText only breaks lines at block tags; a card built from inline elements collapses
  // "Basic" + "Free" onto one line with no whitespace, which the old free-text-only regex missed.
  const items = extractPlanCandidates("BasicFree\n2 GB to store and share your files");
  assert.deepEqual(items.map((i) => [i.name, i.priceText]), [["Basic", "Free"]]);
});

test("extractPlanCandidates does not treat ordinary prose mentioning \"free\" as a plan", () => {
  // trailing punctuation means the line doesn't end in exactly "free", so the anchored
  // FREE_SUFFIX pattern (meant only for short, no-separator plan-name+price lines) skips it.
  assert.deepEqual(extractPlanCandidates("Shipping is completely free."), []);
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

test("collect reports a specific CAPTCHA/bot-challenge warning instead of a generic empty-result message", async () => {
  const url = "https://a.com/pricing";
  const body = "접속하신 사이트를 임시 보호 중에 있습니다.\n보안문자를 정확히 입력 후 접속하시면 정상적으로 이용하실 수 있습니다.";
  const r = await new PricingCollector(new FakeFetcher({ [url]: body }), allowAll()).collect(url);
  assert.equal(r.items.length, 0);
  assert.match(r.warnings[0]!, /CAPTCHA\/bot-challenge/);
});

test("evidence.snapshot is the full cleaned page text, not just the regex-matched price lines", async () => {
  const url = "https://a.com/pricing";
  const page = `<html><body>
<p>Our Business plan is billed per member, starting at a base rate described below.</p>
<h3>Business</h3><p>$20/month per member</p>
</body></html>`;
  const r = await new PricingCollector(new FakeFetcher({ [url]: page }), allowAll()).collect(url);
  // extractPlanCandidates는 설명 문단을 플랜으로 안 뽑지만, snapshot은 전체 텍스트라 에이전트가 읽을 수 있다.
  assert.match(r.evidence[0]!.snapshot!, /billed per member, starting at a base rate/);
  assert.match(r.evidence[0]!.snapshot!, /\$20\/month per member/);
});

import type { PageArchive, PageFetcher } from "../ports.js";
import { FetchError } from "@dre/core";

const archived = (body: string): RawPage => ({ url: "u", finalUrl: "https://web.archive.org/web/2026/u", status: 200, contentType: "text/html", body, retrievedAt: "t" });

test("archive.org fallback is used when the static fetch returns an HTTP error (e.g. 403)", async () => {
  const url = "https://a.com/pricing";
  const fetcher: PageFetcher = { get: async () => { throw new FetchError(url, "http", 403); } };
  const archive: PageArchive = { get: async () => archived("<h3>Pro</h3><p>$9/month</p>") };
  const r = await new PricingCollector(fetcher, allowAll(), undefined, archive).collect(url);
  assert.deepEqual(r.items.map((i) => i.priceText), ["$9/month"]);
  assert.match(r.warnings[0]!, /archive\.org snapshot was used instead/);
});

test("without an archive configured, an HTTP block error is thrown as-is", async () => {
  const url = "https://a.com/pricing";
  const fetcher: PageFetcher = { get: async () => { throw new FetchError(url, "http", 403); } };
  await assert.rejects(new PricingCollector(fetcher, allowAll()).collect(url), FetchError);
});

test("archive.org fallback is NOT used for robots.txt-style private-address blocks", async () => {
  const url = "https://a.com/pricing";
  const fetcher: PageFetcher = { get: async () => { throw new FetchError(url, "blocked", undefined, "private address"); } };
  const archive: PageArchive = { get: async () => { throw new Error("should not be called"); } };
  await assert.rejects(new PricingCollector(fetcher, allowAll(), undefined, archive).collect(url), FetchError);
});

test("archive.org fallback is used when a CAPTCHA page is returned with a 200 status", async () => {
  const url = "https://a.com/pricing";
  const fetcher: PageFetcher = { get: async () => ({ url, finalUrl: url, status: 200, contentType: "text/html", body: "보안문자를 정확히 입력 후 접속하시면", retrievedAt: "t" }) };
  const archive: PageArchive = { get: async () => archived("<h3>Pro</h3><p>20만원</p>") };
  const r = await new PricingCollector(fetcher, allowAll(), undefined, archive).collect(url);
  assert.deepEqual(r.items.map((i) => i.priceText), ["20만원"]);
  assert.match(r.warnings[0]!, /CAPTCHA\/bot-challenge/);
});

test("if the archive also has nothing, falls through to the normal empty-result warning", async () => {
  const url = "https://a.com/pricing";
  const fetcher: PageFetcher = { get: async () => { throw new FetchError(url, "http", 403); } };
  const archive: PageArchive = { get: async () => null };
  await assert.rejects(new PricingCollector(fetcher, allowAll(), undefined, archive).collect(url), FetchError);
});

test("when the home page has no price text, follows a same-origin pricing link automatically", async () => {
  const home = "https://a.com/";
  const fetcher = new FakeFetcher({
    [home]: '<nav><a href="/about">About</a><a href="/pricing">Pricing</a></nav>',
    "https://a.com/pricing": "<h3>Pro</h3><p>$15/month</p>",
  });
  const r = await new PricingCollector(fetcher, allowAll()).collect(home);
  assert.deepEqual(r.items.map((i) => i.priceText), ["$15/month"]);
  assert.equal(r.evidence[0]!.url, "https://a.com/pricing");
  assert.match(r.warnings[0]!, /followed a same-origin pricing link/);
});

test("discovery respects robots.txt on the discovered link too", async () => {
  const home = "https://a.com/";
  const fetcher = new FakeFetcher({ [home]: '<a href="/pricing">Pricing</a>' });
  const policy = policyWith({ kind: "found", groups: [{ agents: ["*"], allow: [], disallow: ["/pricing"] }] });
  await assert.rejects(new PricingCollector(fetcher, policy).collect(home), RobotsDisallowed);
});

test("does not attempt discovery when the requested page already has prices", async () => {
  const url = "https://a.com/pricing";
  const fetcher = new FakeFetcher({ [url]: '<a href="/other-pricing-page">x</a><h3>Pro</h3><p>$9/month</p>' });
  const r = await new PricingCollector(fetcher, allowAll()).collect(url);
  assert.deepEqual(fetcher.calls, [url]);
  assert.deepEqual(r.items.map((i) => i.priceText), ["$9/month"]);
});

test("does not loop when no distinct pricing link exists", async () => {
  const home = "https://a.com/";
  const fetcher = new FakeFetcher({ [home]: "<p>Contact us for details.</p>" });
  const r = await new PricingCollector(fetcher, allowAll()).collect(home);
  assert.deepEqual(fetcher.calls, [home]);
  assert.deepEqual(r.items, []);
});

test("falls back to a cross-origin pricing link when no same-origin one exists (e.g. post-redirect origin change)", async () => {
  const home = "https://a.com/";
  const fetcher = new FakeFetcher({
    [home]: '<a href="https://other.a.com/pricing">Pricing</a>',
    "https://other.a.com/pricing": "<h3>Pro</h3><p>$5/month</p>",
  });
  const r = await new PricingCollector(fetcher, allowAll()).collect(home);
  assert.deepEqual(r.items.map((i) => i.priceText), ["$5/month"]);
  assert.equal(r.evidence[0]!.url, "https://other.a.com/pricing");
});

test("snapshot windows around matched prices on a long page instead of always cutting the head (real stripe.com/pricing bug)", async () => {
  const url = "https://a.com/pricing";
  // 25,000+ chars of unrelated marketing copy before any price — a flat head-slice would
  // never reach the actual plan text, exactly what happened with stripe.com/pricing's
  // subscription pricing section (it sat past char 20,000 in the full extracted text).
  const filler = Array.from({ length: 2000 }, (_, i) => `<p>Marketing copy paragraph number ${i}.</p>`).join("\n");
  const page = `<html><body>${filler}<div><h3>Pro</h3><p>$29/month</p></div></body></html>`;
  const r = await new PricingCollector(new FakeFetcher({ [url]: page }), allowAll()).collect(url);
  assert.deepEqual(r.items.map((i) => i.priceText), ["$29/month"]);
  assert.match(r.evidence[0]!.snapshot!, /\$29\/month/);
});
