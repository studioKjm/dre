import test from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown } from "./render.js";
import type { Report } from "./schema.js";

test("renderMarkdown renders header, sections, claims, evidence, assumptions, and a range", () => {
  const report: Report = {
    target: "https://a.com/",
    generatedAt: "2026-01-01T00:00:00Z",
    sections: {
      "business-model": [
        {
          claim: "Freemium model",
          type: "estimated",
          confidence: "low",
          range: { low: 10, high: 20, unit: "USD/mo" },
          evidence: [{ url: "https://a.com/pricing", retrievedAt: "2026-01-01T00:00:00Z" }],
          assumptions: ["pricing may change seasonally"],
        },
      ],
    },
  };

  const md = renderMarkdown(report);
  assert.match(md, /^# DRE Report: https:\/\/a\.com\//);
  assert.match(md, /_generated 2026-01-01T00:00:00Z_/);
  assert.match(md, /## business-model/);
  assert.match(md, /- \*\*\[estimated\/low\]\*\* Freemium model \(10–20 USD\/mo\)/);
  assert.match(md, /- evidence: https:\/\/a\.com\/pricing/);
  assert.match(md, /- assumption: pricing may change seasonally/);
});

test("renderMarkdown omits the range suffix when a claim has none", () => {
  const report: Report = {
    target: "https://a.com/",
    generatedAt: "t",
    sections: { "business-model": [{ claim: "X", type: "observed", confidence: "high", evidence: [], assumptions: [] }] },
  };
  const md = renderMarkdown(report);
  assert.match(md, /\*\*\[observed\/high\]\*\* X$/m);
  assert.ok(!md.includes("("));
});

test("renderMarkdown handles a report with no sections at all", () => {
  const report: Report = { target: "https://a.com/", generatedAt: "t", sections: {} };
  assert.equal(renderMarkdown(report), "# DRE Report: https://a.com/\n\n_generated t_\n");
});
