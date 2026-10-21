import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServices } from "./services.js";

test("evalDirs compares stored reports with gold files end to end", async () => {
  const root = await mkdtemp(join(tmpdir(), "dre-app-"));
  const services = createServices({ reportsDir: join(root, "reports") });
  const res = await services.reports.submit({
    target: "https://a.com",
    generatedAt: "2026-10-21T00:00:00Z",
    revenueModelLabels: ["subscription", "freemium"],
    sections: {},
  });
  assert.equal(res.ok, true);

  const goldDir = join(root, "gold");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(goldDir);
  await writeFile(join(goldDir, "a.com.yaml"), 'targetUrl: "https://a.com"\nlabels: [subscription]\nlabeledAt: "2026-10-21"\n');

  const evalRes = await services.evalDirs(join(root, "reports"), goldDir);
  assert.equal(evalRes.mean, 0.5);
  assert.deepEqual(evalRes.perTarget[0]!.extra, ["freemium"]);
});

import http from "node:http";
import type { AddressInfo } from "node:net";

const listen = (h: http.RequestListener) =>
  new Promise<http.Server>((r) => { const s = http.createServer(h).listen(0, "127.0.0.1", () => r(s)); });

test("E-1 regression: a redirect into a robots-disallowed path is not collected", async () => {
  const hit: string[] = [];
  const b = await listen((req, res) => {
    hit.push(req.url!);
    if (req.url === "/robots.txt") return res.end("User-agent: *\nDisallow: /pricing\n");
    res.setHeader("content-type", "text/html");
    res.end("<h3>Pro</h3><p>$99/month</p>");
  });
  const a = await listen((req, res) => {
    if (req.url === "/robots.txt") return res.end("User-agent: *\nAllow: /\n");
    res.statusCode = 302;
    res.setHeader("location", `http://127.0.0.1:${(b.address() as AddressInfo).port}/pricing`);
    res.end();
  });
  try {
    const services = createServices({ reportsDir: "/tmp/unused", allowPrivateNetwork: true });
    await assert.rejects(services.pricing.collect(`http://127.0.0.1:${(a.address() as AddressInfo).port}/go`), { name: "RobotsDisallowed" });
    assert.ok(!hit.includes("/pricing"), "disallowed page must never be requested");
  } finally {
    for (const s of [a, b]) { s.closeAllConnections(); s.close(); }
  }
});

test("private addresses are refused by default through the full stack", async () => {
  const services = createServices({ reportsDir: "/tmp/unused", allowPrivateNetwork: false });
  await assert.rejects(services.pricing.collect("http://169.254.169.254/latest/meta-data"), { name: "FetchError" });
});
