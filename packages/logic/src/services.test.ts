import test from "node:test";
import assert from "node:assert/strict";
import type { Claim, GoldLabel, Report } from "@dre/core";
import { evaluate, jaccard } from "./eval-service.js";
import { ReportService } from "./report-service.js";

const claim: Claim = { claim: "Freemium", type: "observed", confidence: "high", evidence: [{ url: "https://a.com", retrievedAt: "t" }], assumptions: [] };
const report = (c: Claim): Report => ({ target: "https://a.com", generatedAt: "t", sections: { "business-model": [c] } });

test("ReportService saves valid reports and returns the sink path", async () => {
  const saved: Report[] = [];
  const svc = new ReportService({ save: async (r) => { saved.push(r); return "/tmp/r.json"; } });
  assert.deepEqual(await svc.submit(report(claim)), { ok: true, path: "/tmp/r.json" });
  assert.equal(saved.length, 1);
});

test("ReportService rejects invalid reports without saving", async () => {
  const saved: Report[] = [];
  const svc = new ReportService({ save: async (r) => { saved.push(r); return "x"; } });
  const res = await svc.submit(report({ ...claim, evidence: [] }));
  assert.deepEqual(res, { ok: false, errors: ["business-model[0]: observed claim requires evidence"] });
  assert.equal(saved.length, 0);
});

test("jaccard edge cases", () => {
  assert.equal(jaccard(["a", "b"], ["a", "b"]), 1);
  assert.equal(jaccard(["a"], ["b"]), 0);
  assert.equal(jaccard(["a", "b"], ["b", "c"]), 1 / 3);
  assert.equal(jaccard([], []), 1);
  assert.equal(jaccard([], ["a"]), 0);
});

const gold = (url: string, labels: string[]): GoldLabel => ({ targetUrl: url, labels, evidence: [], labeledAt: "d" });

test("evaluate averages per-target scores, matching by hostname", () => {
  const res = evaluate(
    [{ targetUrl: "https://www.a.com/pricing", labels: ["subscription", "ads"] }, { targetUrl: "https://z.com", labels: ["x"] }],
    [gold("https://a.com", ["subscription"]), gold("https://b.com", ["freemium"])],
  );
  assert.equal(res.perTarget[0]!.score, 0.5);
  assert.deepEqual(res.perTarget[0]!.extra, ["ads"]);
  assert.equal(res.perTarget[1]!.score, 0);
  assert.equal(res.mean, 0.25);
  assert.deepEqual(res.unmatchedGold, ["https://b.com"]);
  assert.deepEqual(res.unmatchedReports, ["https://z.com"]);
});

test("evaluate with no gold returns mean 0", () => {
  assert.equal(evaluate([], []).mean, 0);
});

test("evaluate excludes in-app-purchase from scoring but still reports it as missing/extra", () => {
  const res = evaluate(
    [{ targetUrl: "https://a.com", labels: ["subscription", "in-app-purchase"] }],
    [gold("https://a.com", ["subscription"])],
  );
  assert.equal(res.perTarget[0]!.score, 1);
  assert.deepEqual(res.perTarget[0]!.extra, ["in-app-purchase"]);
});
