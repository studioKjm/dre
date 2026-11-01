import test from "node:test";
import assert from "node:assert/strict";
import { RobotsDisallowed } from "../errors.js";
import { FakeFetcher, allowAll, policyWith } from "../testing.js";
import { TechStackCollector } from "./techstack.js";

test("collect returns detected signals with evidence from the fetched page", async () => {
  const url = "https://a.com/";
  const fetcher = new FakeFetcher({ [url]: '<script src="https://js.stripe.com/v3/"></script>' });
  const r = await new TechStackCollector(fetcher, allowAll()).collect(url);
  assert.deepEqual(r.items.map((s) => s.name), ["Stripe"]);
  assert.equal(r.evidence[0]!.source, "dre");
  assert.match(r.evidence[0]!.snapshot!, /Stripe: js\.stripe\.com/);
});

test("collect does not fetch when robots.txt disallows", async () => {
  const url = "https://a.com/";
  const fetcher = new FakeFetcher({ [url]: "<html/>" });
  const policy = policyWith({ kind: "found", groups: [{ agents: ["*"], allow: [], disallow: ["/"] }] });
  await assert.rejects(new TechStackCollector(fetcher, policy).collect(url), RobotsDisallowed);
  assert.deepEqual(fetcher.calls, []);
});

test("warns when nothing matches", async () => {
  const url = "https://a.com/";
  const r = await new TechStackCollector(new FakeFetcher({ [url]: "<html><body>Hi</body></html>" }), allowAll()).collect(url);
  assert.deepEqual(r.items, []);
  assert.match(r.warnings[0]!, /no known technology signatures matched/);
});

test("a CAPTCHA page returns no signals, with a specific warning, instead of misattributing its own stack", async () => {
  const url = "https://a.com/";
  const r = await new TechStackCollector(
    new FakeFetcher({ [url]: "보안문자를 정확히 입력 후 접속하시면" }),
    allowAll(),
  ).collect(url);
  assert.deepEqual(r.items, []);
  assert.match(r.warnings[0]!, /CAPTCHA\/bot-challenge/);
});
