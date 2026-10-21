import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { BrowserUnavailable, htmlToText } from "@dre/core";
import { findChrome, renderPage } from "./browser.js";

test("findChrome honors DRE_CHROME_PATH and returns undefined when it does not exist", () => {
  assert.equal(findChrome({ DRE_CHROME_PATH: "/x/chrome" }, (p) => p === "/x/chrome"), "/x/chrome");
  assert.equal(findChrome({ DRE_CHROME_PATH: "/nope" }, () => false), undefined);
  assert.equal(findChrome({}, (p) => p === "/usr/bin/chromium"), "/usr/bin/chromium");
});

test("renderPage fails with a clear BrowserUnavailable when Chrome is missing", async () => {
  await assert.rejects(
    renderPage("http://127.0.0.1:1/", { locate: () => undefined, allowPrivate: true }),
    (e: unknown) => e instanceof BrowserUnavailable && /Chrome not found/.test(e.message),
  );
});

const SPA = `<html><body><div id="root"></div><script>
setTimeout(() => { document.getElementById("root").innerHTML = "<h3>Pro</h3><p>$19/month</p>"; }, 100);
</script></body></html>`;

test("renderPage returns the DOM after client-side rendering", { skip: findChrome() ? false : "Chrome not installed" }, async () => {
  const server = http.createServer((_, res) => { res.setHeader("content-type", "text/html"); res.end(SPA); });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  try {
    const page = await renderPage(`http://127.0.0.1:${port}/`, { timeoutMs: 20_000, allowPrivate: true });
    assert.match(htmlToText(page.body), /\$19\/month/);
    assert.equal(page.status, 200);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test("renderPage refuses private addresses by default, before launching a browser", async () => {
  await assert.rejects(renderPage("http://169.254.169.254/", { locate: () => "/does/not/matter" }), /blocked/);
});

test("renderPage aborts when onNavigate rejects a redirect target", { skip: findChrome() ? false : "Chrome not installed" }, async () => {
  const target = http.createServer((_, res) => res.end("<p>$99/month</p>"));
  await new Promise<void>((r) => target.listen(0, "127.0.0.1", r));
  const tport = (target.address() as AddressInfo).port;
  const start = http.createServer((_, res) => { res.statusCode = 302; res.setHeader("location", `http://127.0.0.1:${tport}/pricing`); res.end(); });
  await new Promise<void>((r) => start.listen(0, "127.0.0.1", r));
  const sport = (start.address() as AddressInfo).port;
  try {
    await assert.rejects(
      renderPage(`http://127.0.0.1:${sport}/go`, {
        allowPrivate: true,
        timeoutMs: 20_000,
        onNavigate: async (u) => { if (u.includes("/pricing")) throw new Error("robots disallows /pricing"); },
      }),
      /robots disallows \/pricing/,
    );
  } finally {
    for (const s of [start, target]) { s.closeAllConnections(); s.close(); }
  }
});
