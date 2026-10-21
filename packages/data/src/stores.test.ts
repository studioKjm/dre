import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Report } from "@dre/core";
import { ReportStore } from "./report-store.js";
import { GoldFormatError, loadGold } from "./gold-store.js";

test("ReportStore save/load/list round-trips", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dre-reports-"));
  const store = new ReportStore(dir);
  const report: Report = { target: "https://example.com/pricing", generatedAt: "2026-10-21T01:02:03Z", sections: {} };
  const path = await store.save(report);
  assert.match(path, /example\.com-20261021T010203Z\.json$/);
  assert.deepEqual(await store.load(path), report);
  assert.deepEqual(await store.list(), [path]);
});

test("loadGold reads valid files and skips _ templates", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dre-gold-"));
  await writeFile(join(dir, "_template.yaml"), "not: valid");
  await writeFile(join(dir, "a.com.yaml"), 'targetUrl: "https://a.com"\ncountry: KR\nlabels: [subscription, freemium]\nevidence: ["https://a.com/pricing"]\nlabeledAt: "2026-10-21"\n');
  const gold = await loadGold(dir);
  assert.deepEqual(gold, [{ targetUrl: "https://a.com", country: "KR", labels: ["subscription", "freemium"], evidence: ["https://a.com/pricing"], labeledAt: "2026-10-21" }]);
});

test("loadGold reports every invalid file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dre-gold-"));
  await writeFile(join(dir, "bad1.yaml"), "targetUrl: 5\nlabels: []\nlabeledAt: x\n");
  await writeFile(join(dir, "bad2.yaml"), "- just\n- a list\n");
  await assert.rejects(loadGold(dir), (e: unknown) => e instanceof GoldFormatError && e.problems.length >= 3);
});
