import test from "node:test";
import assert from "node:assert/strict";
import { ApiKeyMissing, AutomationBlocked, BrowserUnavailable, FetchError } from "./errors.js";

test("BrowserUnavailable carries the reason in both the message and a readonly property", () => {
  const e = new BrowserUnavailable("Chrome not found");
  assert.equal(e.name, "BrowserUnavailable");
  assert.equal(e.reason, "Chrome not found");
  assert.equal(e.message, "browser unavailable: Chrome not found");
});

test("AutomationBlocked carries url and signal, both in the message and as properties", () => {
  const e = new AutomationBlocked("https://a.com/", 'title="Unsupported Client"');
  assert.equal(e.name, "AutomationBlocked");
  assert.equal(e.url, "https://a.com/");
  assert.equal(e.signal, 'title="Unsupported Client"');
  assert.equal(e.message, 'automated browser detected and blocked at https://a.com/ (signal: title="Unsupported Client")');
});

test("ApiKeyMissing names the service in both the message and a property", () => {
  const e = new ApiKeyMissing("DART");
  assert.equal(e.name, "ApiKeyMissing");
  assert.equal(e.service, "DART");
  assert.equal(e.message, "DART API key is not configured");
});

test("FetchError formats the message with kind, url, optional status and detail", () => {
  const minimal = new FetchError("https://a.com/", "timeout");
  assert.equal(minimal.message, "fetch timeout for https://a.com/");
  assert.equal(minimal.kind, "timeout");
  assert.equal(minimal.status, undefined);

  const withStatus = new FetchError("https://a.com/", "http", 403);
  assert.equal(withStatus.message, "fetch http for https://a.com/ (403)");
  assert.equal(withStatus.status, 403);

  const full = new FetchError("https://a.com/", "network", undefined, "ECONNRESET");
  assert.equal(full.message, "fetch network for https://a.com/: ECONNRESET");

  const everything = new FetchError("https://a.com/", "too-large", 200, "body exceeded limit");
  assert.equal(everything.message, "fetch too-large for https://a.com/ (200): body exceeded limit");
});
