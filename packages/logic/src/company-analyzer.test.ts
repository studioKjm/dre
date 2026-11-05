import test from "node:test";
import assert from "node:assert/strict";
import { CompanyAnalyzer } from "./company-analyzer.js";

const empty = { items: [], evidence: [], warnings: [] };

test("builds the home URL from a bare domain and queries all four collectors", async () => {
  const calls: string[] = [];
  const analyzer = new CompanyAnalyzer(
    { collect: async (url) => { calls.push(`pricing:${url}`); return empty; } },
    { collect: async (url) => { calls.push(`terms:${url}`); return empty; } },
    { collect: async (url) => { calls.push(`techstack:${url}`); return empty; } },
    { collect: async (domain, opts) => { calls.push(`adlibrary:${domain}:${opts?.region}`); return empty; } },
  );
  const r = await analyzer.analyze("a.com", { region: "KR" });
  assert.deepEqual(calls.sort(), ["adlibrary:a.com:KR", "pricing:https://a.com/", "techstack:https://a.com/", "terms:https://a.com/"]);
  assert.equal(r.domain, "a.com");
  assert.deepEqual(r.pricing, { ok: true, result: empty });
});

test("one collector failing does not affect the others (each reported independently)", async () => {
  const analyzer = new CompanyAnalyzer(
    { collect: async () => { throw Object.assign(new Error("robots.txt disallows"), { name: "RobotsDisallowed" }); } },
    { collect: async () => empty },
    { collect: async () => empty },
    { collect: async () => empty },
  );
  const r = await analyzer.analyze("a.com");
  assert.deepEqual(r.pricing, { ok: false, error: "RobotsDisallowed: robots.txt disallows" });
  assert.deepEqual(r.terms, { ok: true, result: empty });
  assert.deepEqual(r.techstack, { ok: true, result: empty });
  assert.deepEqual(r.adlibrary, { ok: true, result: empty });
});

test("all four can fail independently without throwing", async () => {
  const fail = (name: string) => ({ collect: async () => { throw new Error(name); } });
  const analyzer = new CompanyAnalyzer(fail("p") as never, fail("t") as never, fail("ts") as never, fail("ad") as never);
  const r = await analyzer.analyze("a.com");
  assert.equal(r.pricing.ok, false);
  assert.equal(r.terms.ok, false);
  assert.equal(r.techstack.ok, false);
  assert.equal(r.adlibrary.ok, false);
});
