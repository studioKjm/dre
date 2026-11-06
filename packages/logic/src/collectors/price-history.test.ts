import test from "node:test";
import assert from "node:assert/strict";
import type { WaybackTimelineSource } from "./price-history.js";
import { PriceHistoryCollector } from "./price-history.js";

test("returns an empty, non-error result when archive.org has no snapshots", async () => {
  const source: WaybackTimelineSource = { fetchTimeline: async () => [], fetchSnapshot: async () => null };
  const r = await new PriceHistoryCollector(source).collect("https://a.com/pricing");
  assert.deepEqual(r.items, []);
  assert.match(r.warnings[0]!, /no archived snapshots found/);
});

test("extracts price candidates per snapshot and reports the date for each", async () => {
  const timeline = [
    { timestamp: "20230101000000", originalUrl: "https://a.com/pricing" },
    { timestamp: "20240601000000", originalUrl: "https://a.com/pricing" },
  ];
  const bodies: Record<string, string> = {
    "20230101000000": "<h3>Pro</h3><p>$10/month</p>",
    "20240601000000": "<h3>Pro</h3><p>$15/month</p>",
  };
  const source: WaybackTimelineSource = {
    fetchTimeline: async () => timeline,
    fetchSnapshot: async (meta) => ({ body: bodies[meta.timestamp]!, finalUrl: `https://web.archive.org/web/${meta.timestamp}/${meta.originalUrl}` }),
  };
  const r = await new PriceHistoryCollector(source).collect("https://a.com/pricing");
  assert.deepEqual(
    r.items.map((s) => [s.date, s.items.map((i) => i.priceText)]),
    [["2023-01-01", ["$10/month"]], ["2024-06-01", ["$15/month"]]],
  );
  assert.equal(r.evidence.length, 2);
});

test("samples at most maxSnapshots, evenly spaced across the timeline", async () => {
  const timeline = Array.from({ length: 10 }, (_, i) => ({ timestamp: `2020${String(i + 1).padStart(2, "0")}01000000`, originalUrl: "https://a.com/" }));
  const calls: string[] = [];
  const source: WaybackTimelineSource = {
    fetchTimeline: async () => timeline,
    fetchSnapshot: async (meta) => { calls.push(meta.timestamp); return { body: "", finalUrl: "x" }; },
  };
  await new PriceHistoryCollector(source).collect("https://a.com/", { maxSnapshots: 3 });
  assert.equal(calls.length, 3);
  assert.deepEqual(calls, [timeline[0]!.timestamp, timeline[5]!.timestamp, timeline[9]!.timestamp]);
});

test("a snapshot that fails to fetch is skipped with a warning, not a crash", async () => {
  const timeline = [{ timestamp: "20230101000000", originalUrl: "https://a.com/" }];
  const source: WaybackTimelineSource = { fetchTimeline: async () => timeline, fetchSnapshot: async () => null };
  const r = await new PriceHistoryCollector(source).collect("https://a.com/");
  assert.deepEqual(r.items, []);
  assert.match(r.warnings[0]!, /could not be fetched/);
});

test("warns when every snapshot has zero price-like text (likely JS-only even historically)", async () => {
  const timeline = [{ timestamp: "20230101000000", originalUrl: "https://a.com/" }];
  const source: WaybackTimelineSource = {
    fetchTimeline: async () => timeline,
    fetchSnapshot: async () => ({ body: "<div id=app></div>", finalUrl: "x" }),
  };
  const r = await new PriceHistoryCollector(source).collect("https://a.com/");
  assert.match(r.warnings.at(-1)!, /no price-like text found in any snapshot/);
});
