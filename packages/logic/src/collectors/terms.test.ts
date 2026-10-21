import test from "node:test";
import assert from "node:assert/strict";
import { FakeFetcher, allowAll, policyWith } from "../testing.js";
import { TermsCollector } from "./terms.js";

const HOME = `<a href="/terms">Terms of Service</a> <a href="/about">About</a> <a href="https://other.com/refund">Refund</a>`;
const TERMS = `<p>Welcome.</p><p>Subscriptions renew automatically each month until cancelled.</p><p>Refunds are available within 14 days of purchase.</p>`;

test("collect follows same-origin terms links and extracts billing passages", async () => {
  const fetcher = new FakeFetcher({ "https://a.com/": HOME, "https://a.com/terms": TERMS });
  const r = await new TermsCollector(fetcher, allowAll()).collect("https://a.com/");
  assert.deepEqual(r.items.map((i) => i.text), [
    "Subscriptions renew automatically each month until cancelled.",
    "Refunds are available within 14 days of purchase.",
  ]);
  assert.equal(r.evidence[0]!.url, "https://a.com/terms");
  assert.ok(!fetcher.calls.includes("https://other.com/refund"));
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
