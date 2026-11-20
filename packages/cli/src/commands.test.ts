import test from "node:test";
import assert from "node:assert/strict";
import type { EvalResult } from "@dre/app";
import { runAnalyze, runEval } from "./commands.js";

const capture = () => {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) }, out, err };
};
const result: EvalResult = {
  mean: 0.75,
  perTarget: [
    { targetUrl: "https://a.com", score: 1, missing: [], extra: [] },
    { targetUrl: "https://b.com", score: 0.5, missing: ["ads"], extra: ["freemium"] },
  ],
  unmatchedGold: [],
  unmatchedReports: ["https://z.com"],
};

test("runEval prints per-target scores, mean and verdict", async () => {
  const c = capture();
  const code = await runEval(["r", "g"], c.io, { evalDirs: async () => result });
  assert.equal(code, 0);
  assert.match(c.out.join("\n"), /100%  https:\/\/a\.com/);
  assert.match(c.out.join("\n"), / 50%  https:\/\/b\.com  \(missing: ads \| extra: freemium\)/);
  assert.match(c.out.join("\n"), /ignored \(no gold\): https:\/\/z\.com/);
  assert.match(c.out.join("\n"), /mean match: 75\.0% over 2 targets \(below 85% target\)/);
});

test("runEval reports usage and load errors with exit code 1", async () => {
  const a = capture();
  assert.equal(await runEval([], a.io, { evalDirs: async () => result }), 1);
  assert.match(a.err[0]!, /usage/);
  const b = capture();
  const code = await runEval(["r", "g"], b.io, { evalDirs: async () => { throw new Error("invalid gold files"); } });
  assert.equal(code, 1);
  assert.equal(b.err[0], "invalid gold files");
});

test("runAnalyze prints the raw collector snapshot as JSON, not a fake claim-based report", async () => {
  const c = capture();
  let seenDomain = "";
  const snapshot = { domain: "notion.com", pricing: { ok: true as const, result: { items: [], evidence: [], warnings: [] } } };
  const code = await runAnalyze(["notion.com"], c.io, { company: { analyze: async (d) => { seenDomain = d; return snapshot as never; } } });
  assert.equal(code, 0);
  assert.equal(seenDomain, "notion.com");
  assert.deepEqual(JSON.parse(c.out.join("\n")), snapshot);
});

test("runAnalyze extracts the hostname when given a full URL", async () => {
  const c = capture();
  let seenDomain = "";
  await runAnalyze(["https://www.notion.com/pricing"], c.io, { company: { analyze: async (d) => { seenDomain = d; return {} as never; } } });
  assert.equal(seenDomain, "www.notion.com");
});

test("runAnalyze reports usage and collector errors with exit code 1", async () => {
  const a = capture();
  assert.equal(await runAnalyze([], a.io, { company: { analyze: async () => ({}) as never } }), 1);
  assert.match(a.err[0]!, /usage/);
  const b = capture();
  const code = await runAnalyze(["notion.com"], b.io, { company: { analyze: async () => { throw new Error("boom"); } } });
  assert.equal(code, 1);
  assert.equal(b.err[0], "boom");
});
