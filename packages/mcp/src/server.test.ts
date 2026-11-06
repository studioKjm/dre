import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod/v4";
import { SERVER_INFO, createDreServer, type ToolServices } from "./server.js";
import { collectInput, urlSchema } from "./schemas.js";

const empty = { items: [], evidence: [], warnings: [] };
const calls: string[] = [];

const fake: ToolServices = {
  pricing: {
    collect: async (url, opts) => {
      calls.push(`pricing ${url} js=${opts?.js}`);
      if (url.includes("blocked")) throw Object.assign(new Error("robots.txt disallows"), { name: "RobotsDisallowed" });
      return { ...empty, items: [{ name: "Pro", priceText: "$12/month", line: "Pro $12/month" }] };
    },
  },
  appstore: { collect: async () => ({ ...empty, items: [{ name: "Pro", priceText: "$9.99" }] }) },
  terms: { collect: async () => empty },
  techstack: { collect: async () => ({ ...empty, items: [{ name: "Next.js", category: "framework", evidenceText: "__NEXT_DATA__" }] }) },
  adlibrary: { collect: async () => ({ ...empty, items: [{ adCountText: "about 5 ads" }] }) },
  company: {
    analyze: async (domain) => ({
      domain,
      pricing: { ok: true, result: empty },
      terms: { ok: true, result: empty },
      techstack: { ok: true, result: empty },
      adlibrary: { ok: true, result: empty },
    }),
  },
  edgar: { collect: async () => ({ ...empty, items: [{ concept: "Revenues", valueUsd: 1000, fiscalYear: 2025, form: "10-K", periodEnd: "2025-12-31" }] }) },
  dart: { collect: async () => ({ ...empty, items: [{ accountName: "매출액", amountKrw: 1000, fiscalYear: 2025 }] }) },
  reports: {
    submit: async (r) =>
      r.sections["business-model"]?.some((c) => c.type === "observed" && c.evidence.length === 0)
        ? { ok: false, errors: ["business-model[0]: observed claim requires evidence"] }
        : { ok: true, path: "/tmp/report.json" },
  },
};

async function connect() {
  const server = createDreServer(fake);
  const client = new Client({ name: "test", version: "0.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

const text = (r: unknown): string => (r as { content: { text: string }[] }).content[0]!.text;

test("server exposes the nine tools", async () => {
  const client = await connect();
  assert.deepEqual(client.getServerVersion(), SERVER_INFO);
  const names = (await client.listTools()).tools.map((t) => t.name).sort();
  assert.deepEqual(
    names,
    [
      "collect_appstore",
      "collect_pricing",
      "collect_techstack",
      "collect_terms",
      "collect_ad_library",
      "collect_financials",
      "collect_financials_kr",
      "analyze_company",
      "submit_report",
    ].sort(),
  );
  await client.close();
});

test("collect_pricing returns candidates and forwards js", async () => {
  const client = await connect();
  const res = await client.callTool({ name: "collect_pricing", arguments: { url: "https://a.com/pricing", js: true } });
  assert.ok(!res.isError);
  assert.equal(JSON.parse(text(res)).items[0].priceText, "$12/month");
  assert.ok(calls.includes("pricing https://a.com/pricing js=true"));
  await client.close();
});

test("collector exceptions become isError results with the error name", async () => {
  const client = await connect();
  const res = await client.callTool({ name: "collect_pricing", arguments: { url: "https://blocked.com/" } });
  assert.equal(res.isError, true);
  assert.equal(JSON.parse(text(res)).error, "RobotsDisallowed");
  await client.close();
});

test("invalid input is rejected before the collector runs", async () => {
  const client = await connect();
  const before = calls.length;
  const res = await client.callTool({ name: "collect_appstore", arguments: { url: "file:///etc/passwd" } }).catch((e: Error) => e);
  const failed = res instanceof Error || (res as { isError?: boolean }).isError === true;
  assert.ok(failed);
  assert.equal(calls.length, before);
  await client.close();
});

test("submit_report saves valid reports and returns violations for invalid ones", async () => {
  const client = await connect();
  const claim = { claim: "Freemium", type: "observed", confidence: "high", evidence: [], assumptions: [] };
  const bad = await client.callTool({ name: "submit_report", arguments: { report: { target: "https://a.com", generatedAt: "t", sections: { "business-model": [claim] } } } });
  assert.equal(bad.isError, true);
  assert.deepEqual(JSON.parse(text(bad)).errors, ["business-model[0]: observed claim requires evidence"]);

  const good = await client.callTool({ name: "submit_report", arguments: { report: { target: "https://a.com", generatedAt: "t", sections: {} } } });
  assert.ok(!good.isError);
  assert.equal(JSON.parse(text(good)).saved, "/tmp/report.json");
  await client.close();
});

test("urlSchema accepts http(s) and rejects other schemes", () => {
  assert.ok(urlSchema.safeParse("https://a.com/pricing").success);
  assert.ok(!urlSchema.safeParse("file:///etc/passwd").success);
  assert.ok(!urlSchema.safeParse("javascript:alert(1)").success);
  assert.ok(!urlSchema.safeParse("not a url").success);
  for (const u of ["http://localhost:8080/admin", "http://127.0.0.1/", "http://192.168.0.1/", "http://169.254.169.254/latest/meta-data", "http://[::1]/"]) {
    assert.ok(!urlSchema.safeParse(u).success, u);
  }
  assert.ok(!z.object(collectInput).safeParse({}).success);
});

test("tool descriptions tell the agent how to fall back to its own research", async () => {
  const client = await connect();
  const tools = (await client.listTools()).tools;
  const submit = tools.find((t) => t.name === "submit_report")!;
  const pricing = tools.find((t) => t.name === "collect_pricing")!;
  assert.match(submit.description!, /source:'agent'/);
  assert.match(submit.description!, /not observed/);
  assert.match(pricing.description!, /source:'agent'/);
  await client.close();
});
