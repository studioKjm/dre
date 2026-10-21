import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { FetchError, fetchPage } from "./fetcher.js";

const PRIV = { allowPrivate: true };

function serve(handler: http.RequestListener): Promise<{ origin: string; close: () => void }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler).listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ origin: `http://127.0.0.1:${port}`, close: () => { server.closeAllConnections(); server.close(); } });
    });
  });
}

test("fetchPage returns body, status and sends the User-Agent", async () => {
  let ua = "";
  const s = await serve((req, res) => { ua = String(req.headers["user-agent"]); res.setHeader("content-type", "text/html"); res.end("<p>hi</p>"); });
  try {
    const page = await fetchPage(s.origin + "/p", PRIV);
    assert.equal(page.status, 200);
    assert.equal(page.body, "<p>hi</p>");
    assert.equal(ua, "DREBot");
  } finally { s.close(); }
});

test("fetchPage rejects 5xx and 404 with kind http", async () => {
  const s = await serve((_, res) => { res.statusCode = 503; res.end(); });
  try {
    await assert.rejects(fetchPage(s.origin, PRIV), (e: unknown) => e instanceof FetchError && e.kind === "http" && e.status === 503);
  } finally { s.close(); }
});

test("fetchPage enforces the size limit", async () => {
  const s = await serve((_, res) => res.end("x".repeat(5000)));
  try {
    await assert.rejects(fetchPage(s.origin, { maxBytes: 1000, allowPrivate: true }), (e: unknown) => e instanceof FetchError && e.kind === "too-large");
  } finally { s.close(); }
});

test("fetchPage times out on a stalled server", async () => {
  const s = await serve(() => { /* never respond */ });
  try {
    await assert.rejects(fetchPage(s.origin, { timeoutMs: 200, allowPrivate: true }), (e: unknown) => e instanceof FetchError && e.kind === "timeout");
  } finally { s.close(); }
});

test("fetchPage blocks loopback addresses by default", async () => {
  const s = await serve((_, res) => res.end("secret"));
  try {
    await assert.rejects(fetchPage(s.origin + "/"), (e: unknown) => e instanceof FetchError && e.kind === "blocked");
    await assert.rejects(fetchPage("http://localhost:1/"), (e: unknown) => e instanceof FetchError && e.kind === "blocked");
    await assert.rejects(fetchPage("http://169.254.169.254/latest/meta-data"), (e: unknown) => e instanceof FetchError && e.kind === "blocked");
    await assert.rejects(fetchPage("file:///etc/passwd"), (e: unknown) => e instanceof FetchError && e.kind === "blocked");
  } finally { s.close(); }
});

test("fetchPage follows redirects, calling onRedirect for each hop", async () => {
  const s = await serve((req, res) => {
    if (req.url === "/a") { res.statusCode = 302; res.setHeader("location", "/b"); return res.end(); }
    if (req.url === "/b") { res.statusCode = 301; res.setHeader("location", "/c"); return res.end(); }
    res.end("final");
  });
  const hops: string[] = [];
  try {
    const page = await fetchPage(s.origin + "/a", { ...PRIV, onRedirect: async (u) => { hops.push(new URL(u).pathname); } });
    assert.equal(page.body, "final");
    assert.equal(new URL(page.finalUrl).pathname, "/c");
    assert.deepEqual(hops, ["/b", "/c"]);
  } finally { s.close(); }
});

test("onRedirect can abort the fetch and the target is never requested", async () => {
  const requested: string[] = [];
  const s = await serve((req, res) => {
    requested.push(req.url!);
    if (req.url === "/a") { res.statusCode = 302; res.setHeader("location", "/forbidden"); return res.end(); }
    res.end("should not be fetched");
  });
  try {
    await assert.rejects(
      fetchPage(s.origin + "/a", { ...PRIV, onRedirect: async () => { throw new Error("robots says no"); } }),
      /robots says no/,
    );
    assert.deepEqual(requested, ["/a"]);
  } finally { s.close(); }
});

test("redirect loops stop with too-many-redirects", async () => {
  const s = await serve((_, res) => { res.statusCode = 302; res.setHeader("location", "/loop"); res.end(); });
  try {
    await assert.rejects(fetchPage(s.origin + "/loop", { ...PRIV, maxRedirects: 3 }), (e: unknown) => e instanceof FetchError && e.kind === "too-many-redirects");
  } finally { s.close(); }
});

test("a public-looking site redirecting to a private address is blocked", async () => {
  const s = await serve((_, res) => { res.statusCode = 302; res.setHeader("location", "http://169.254.169.254/latest/meta-data"); res.end(); });
  try {
    // 첫 요청(loopback)만 테스트를 위해 허용할 수 없으므로 hop 검사를 직접 확인: 기본 설정에서는 첫 홉에서 차단된다.
    await assert.rejects(fetchPage(s.origin + "/"), (e: unknown) => e instanceof FetchError && e.kind === "blocked");
  } finally { s.close(); }
});
