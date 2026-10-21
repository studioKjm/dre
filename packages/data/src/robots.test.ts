import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { fetchRobots, parseRobots } from "./robots.js";

const PRIV = { allowPrivate: true };

function serve(handler: http.RequestListener): Promise<{ origin: string; close: () => void }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler).listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ origin: `http://127.0.0.1:${port}`, close: () => server.close() });
    });
  });
}

test("parseRobots groups consecutive user-agents and ignores comments/empty Disallow", () => {
  const groups = parseRobots(
    ["User-agent: A", "User-agent: B", "Disallow: /private # c", "Allow: /private/ok", "", "User-agent: *", "Disallow:"].join("\n"),
  );
  assert.deepEqual(groups, [
    { agents: ["a", "b"], allow: ["/private/ok"], disallow: ["/private"] },
    { agents: ["*"], allow: [], disallow: [] },
  ]);
});

test("fetchRobots returns found with parsed groups", async () => {
  const s = await serve((_, res) => res.end("User-agent: *\nDisallow: /admin\n"));
  try {
    const r = await fetchRobots(s.origin, PRIV);
    assert.deepEqual(r, { kind: "found", groups: [{ agents: ["*"], allow: [], disallow: ["/admin"] }] });
  } finally {
    s.close();
  }
});

test("fetchRobots maps 404 to missing and 503 to unreachable", async () => {
  const s404 = await serve((_, res) => { res.statusCode = 404; res.end(); });
  const s503 = await serve((_, res) => { res.statusCode = 503; res.end(); });
  try {
    assert.deepEqual(await fetchRobots(s404.origin, PRIV), { kind: "missing" });
    assert.deepEqual(await fetchRobots(s503.origin, PRIV), { kind: "unreachable", status: 503 });
  } finally {
    s404.close();
    s503.close();
  }
});

test("fetchRobots maps connection failure to unreachable", async () => {
  const s = await serve((_, res) => res.end());
  s.close();
  assert.deepEqual(await fetchRobots(s.origin, { timeoutMs: 500, allowPrivate: true }), { kind: "unreachable" });
});
