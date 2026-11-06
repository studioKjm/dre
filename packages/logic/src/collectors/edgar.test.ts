import test from "node:test";
import assert from "node:assert/strict";
import type { EdgarSource } from "./edgar.js";
import { EdgarCollector } from "./edgar.js";

const companyFacts = (overrides: Record<string, unknown> = {}) => ({
  cik: 1234,
  entityName: "Example Inc.",
  facts: {
    "us-gaap": {
      Revenues: {
        units: {
          USD: [
            { end: "2023-12-31", val: 900, fy: 2023, fp: "FY", form: "10-K" },
            { end: "2024-03-31", val: 300, fy: 2024, fp: "Q1", form: "10-Q" }, // 연간이 아니므로 제외돼야 함
            { end: "2024-12-31", val: 1000, fy: 2024, fp: "FY", form: "10-K" },
          ],
        },
      },
      NetIncomeLoss: {
        units: { USD: [{ end: "2024-12-31", val: -50, fy: 2024, fp: "FY", form: "10-K" }] },
      },
      ...overrides,
    },
  },
});

const fakeSource = (entry: { cik: number; ticker: string; title: string } | null, facts: unknown): EdgarSource => ({
  findCik: async () => entry,
  fetchCompanyFacts: async () => facts,
});

test("returns an empty, non-error result when no SEC filer matches (most companies are private)", async () => {
  const r = await new EdgarCollector(fakeSource(null, null)).collect("Some Private Startup");
  assert.deepEqual(r.items, []);
  assert.deepEqual(r.evidence, []);
  assert.match(r.warnings[0]!, /no SEC filer found/);
});

test("picks the most recent full fiscal year 10-K value, ignoring quarterly 10-Q entries", async () => {
  const r = await new EdgarCollector(fakeSource({ cik: 1234, ticker: "EX", title: "Example Inc." }, companyFacts())).collect("Example");
  const revenue = r.items.find((f) => f.concept === "Revenues");
  assert.deepEqual(revenue, { concept: "Revenues", valueUsd: 1000, fiscalYear: 2024, form: "10-K", periodEnd: "2024-12-31" });
});

test("also reports NetIncomeLoss alongside revenue", async () => {
  const r = await new EdgarCollector(fakeSource({ cik: 1234, ticker: "EX", title: "Example Inc." }, companyFacts())).collect("Example");
  const ni = r.items.find((f) => f.concept === "NetIncomeLoss");
  assert.equal(ni?.valueUsd, -50);
});

test("tries revenue tag aliases in order and stops at the first with data", async () => {
  const facts = {
    cik: 1,
    entityName: "x",
    facts: {
      "us-gaap": {
        RevenueFromContractWithCustomerExcludingAssessedTax: {
          units: { USD: [{ end: "2024-12-31", val: 555, fy: 2024, fp: "FY", form: "10-K" }] },
        },
      },
    },
  };
  const r = await new EdgarCollector(fakeSource({ cik: 1, ticker: "X", title: "X" }, facts)).collect("X");
  assert.deepEqual(
    r.items.map((f) => f.concept),
    ["RevenueFromContractWithCustomerExcludingAssessedTax"],
  );
});

test("evidence includes the matched filer name and a browsable EDGAR URL, not raw JSON", async () => {
  const r = await new EdgarCollector(fakeSource({ cik: 1234, ticker: "EX", title: "Example Inc." }, companyFacts())).collect("Example");
  assert.match(r.evidence[0]!.url, /CIK=1234/);
  assert.match(r.evidence[0]!.snapshot!, /Example Inc\./);
});

test("matched filer but no annual figures yields a warning, not a crash", async () => {
  const r = await new EdgarCollector(fakeSource({ cik: 1, ticker: "X", title: "X Corp" }, { facts: { "us-gaap": {} } })).collect("X");
  assert.deepEqual(r.items, []);
  assert.match(r.warnings[0]!, /no annual \(10-K\)/);
});
