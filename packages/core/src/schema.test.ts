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
