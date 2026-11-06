import test from "node:test";
import assert from "node:assert/strict";
import type { JobBoardSource } from "./jobs.js";
import { JobBoardCollector } from "./jobs.js";

test("combines Greenhouse and Lever results, tagging the source", async () => {
  const source: JobBoardSource = {
    fetchGreenhouseJobs: async () => [{ title: "Backend Engineer", location: "Seoul" }],
    fetchLeverJobs: async () => [{ title: "Sales Rep" }],
  };
  const r = await new JobBoardCollector(source).collect("acme");
  assert.deepEqual(r.items, [
    { title: "Backend Engineer", location: "Seoul", source: "greenhouse" },
    { title: "Sales Rep", source: "lever" },
  ]);
  assert.equal(r.evidence[0]!.url, "https://boards.greenhouse.io/acme");
});

test("returns an empty, non-error result when neither ATS has the slug (the common case)", async () => {
  const source: JobBoardSource = { fetchGreenhouseJobs: async () => null, fetchLeverJobs: async () => null };
  const r = await new JobBoardCollector(source).collect("some-startup");
  assert.deepEqual(r.items, []);
  assert.deepEqual(r.evidence, []);
  assert.match(r.warnings[0]!, /no open postings found/);
});

test("one ATS failing does not hide the other's results", async () => {
  const source: JobBoardSource = {
    fetchGreenhouseJobs: async () => { throw new Error("network blip"); },
    fetchLeverJobs: async () => [{ title: "Designer" }],
  };
  const r = await new JobBoardCollector(source).collect("acme");
  assert.deepEqual(r.items, [{ title: "Designer", source: "lever" }]);
});

test("caps the snapshot preview but keeps every item in the structured list", async () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ title: `Role ${i}` }));
  const source: JobBoardSource = { fetchGreenhouseJobs: async () => many, fetchLeverJobs: async () => null };
  const r = await new JobBoardCollector(source).collect("acme");
  assert.equal(r.items.length, 40);
  assert.match(r.evidence[0]!.snapshot!, /and 10 more/);
});
