import test from "node:test";
import assert from "node:assert/strict";
import type { RobotsResult } from "@dre/core";
import { CrawlPolicy } from "./crawl-policy.js";
import { RobotsDisallowed } from "./errors.js";

const policy = (r: RobotsResult) => new CrawlPolicy({ get: async () => r });
const found = (disallow: string[], allow: string[] = [], agents = ["*"]): RobotsResult => ({
  kind: "found",
  groups: [{ agents, allow, disallow }],
});

test("missing robots.txt allows everything", async () => {
  await policy({ kind: "missing" }).assertAllowed("https://a.com/pricing");
});

test("unreachable robots.txt is treated as disallow", async () => {
  await assert.rejects(policy({ kind: "unreachable", status: 503 }).assertAllowed("https://a.com/"), RobotsDisallowed);
});

test("Disallow prefix blocks matching paths only", async () => {
  const p = policy(found(["/admin"]));
  await p.assertAllowed("https://a.com/pricing");
  await assert.rejects(p.assertAllowed("https://a.com/admin/users"), RobotsDisallowed);
});

test("longest match wins and Allow wins ties", async () => {
  const p = policy(found(["/docs"], ["/docs/public"]));
  await p.assertAllowed("https://a.com/docs/public/x");
  await assert.rejects(p.assertAllowed("https://a.com/docs/private"), RobotsDisallowed);
  await policy(found(["/x"], ["/x"])).assertAllowed("https://a.com/x");
});

test("wildcard and $ anchors", async () => {
  const p = policy(found(["/*.pdf$"]));
  await assert.rejects(p.assertAllowed("https://a.com/files/a.pdf"), RobotsDisallowed);
  await p.assertAllowed("https://a.com/files/a.pdf.html");
});

test("specific user-agent group overrides *", async () => {
  const r: RobotsResult = {
    kind: "found",
    groups: [
      { agents: ["*"], allow: [], disallow: ["/"] },
      { agents: ["drebot"], allow: [], disallow: ["/private"] },
    ],
  };
  const p = policy(r);
  await p.assertAllowed("https://a.com/pricing");
  await assert.rejects(p.assertAllowed("https://a.com/private"), RobotsDisallowed);
});
