import test from "node:test";
import assert from "node:assert/strict";
import { validateClaim, type Claim } from "./schema.js";

const base: Claim = {
  claim: "Freemium",
  type: "observed",
  confidence: "high",
  evidence: [{ url: "https://example.com/pricing", retrievedAt: "2026-10-20T00:00:00Z" }],
  assumptions: [],
};

test("observed claim with evidence is valid", () => {
  assert.deepEqual(validateClaim(base), []);
});

test("observed claim without evidence is rejected", () => {
  assert.ok(validateClaim({ ...base, evidence: [] }).length > 0);
});

test("estimated claim needs range, assumptions, and non-high confidence", () => {
  const errs = validateClaim({ ...base, type: "estimated" });
  assert.equal(errs.length, 3);
});

test("valid estimated claim passes", () => {
  const c: Claim = {
    ...base,
    type: "estimated",
    confidence: "low",
    range: { low: 1, high: 2, unit: "USD/month" },
    assumptions: ["industry CVR 1-2%"],
  };
  assert.deepEqual(validateClaim(c), []);
});

import { validateReport, type Report } from "./schema.js";

test("validateReport prefixes errors with section and index", () => {
  const report: Report = {
    target: "https://example.com",
    generatedAt: "2026-10-21T00:00:00Z",
    sections: { "business-model": [base, { ...base, evidence: [] }] },
  };
  assert.deepEqual(validateReport(report), [
    "business-model[1]: observed claim requires evidence",
  ]);
});

test("validateReport accepts a report with no sections", () => {
  const report: Report = { target: "x", generatedAt: "2026-10-21T00:00:00Z", sections: {} };
  assert.deepEqual(validateReport(report), []);
});

test("estimated range with low > high is rejected", () => {
  const c: Claim = {
    ...base,
    type: "estimated",
    confidence: "low",
    range: { low: 5, high: 1, unit: "USD" },
    assumptions: ["a"],
  };
  assert.deepEqual(validateClaim(c), ["range.low > range.high"]);
});

test("empty claim text is rejected", () => {
  assert.deepEqual(validateClaim({ ...base, claim: "  " }), ["claim is empty"]);
});

test("validateReport rejects labels outside the canonical taxonomy", () => {
  // 외부 입력(MCP 등)은 타입 검사를 거치지 않으므로 런타임 검증이 필요하다 — 여기서는 그 상황을 흉내낸다.
  const labels = ["subscription", "bogus-label"] as unknown as Report["revenueModelLabels"];
  const r: Report = { target: "x", generatedAt: "t", revenueModelLabels: labels, sections: {} };
  assert.deepEqual(validateReport(r), ['revenueModelLabels: unknown label "bogus-label"']);
});

test("observed claim cannot rely on agent-supplied (non-DRE) evidence", () => {
  const c: Claim = { ...base, evidence: [{ ...base.evidence[0]!, source: "agent" }] };
  assert.deepEqual(validateClaim(c), [
    "observed claim cannot rely on agent-supplied evidence (source: agent) — use inferred or estimated",
  ]);
});

test("observed claim with dre-sourced or unset-source evidence is still valid", () => {
  assert.deepEqual(validateClaim({ ...base, evidence: [{ ...base.evidence[0]!, source: "dre" }] }), []);
  assert.deepEqual(validateClaim(base), []); // source 미지정 == dre로 간주
});

test("inferred/estimated claims may use agent-supplied evidence", () => {
  const c: Claim = {
    ...base, type: "estimated", confidence: "low",
    range: { low: 1, high: 2, unit: "USD" }, assumptions: ["a"],
    evidence: [{ ...base.evidence[0]!, source: "agent" }],
  };
  assert.deepEqual(validateClaim(c), []);
});
