import test from "node:test";
import assert from "node:assert/strict";
import type { RawPage } from "@dre/core";
import { detectTechStack } from "./techstack.js";

const page = (body: string, headers: Record<string, string> = {}): RawPage => ({
  url: "u", finalUrl: "u", status: 200, contentType: "text/html", body, retrievedAt: "t", headers,
});

test("detects framework/CMS/ecommerce signals from body markup", () => {
  const names = (b: string) => detectTechStack(page(b)).map((s) => s.name);
  assert.deepEqual(names('<script id="__NEXT_DATA__">{}</script>'), ["Next.js"]);
  assert.deepEqual(names('<meta name="generator" content="WordPress 6.4">'), ["WordPress"]);
  assert.deepEqual(names('<script src="https://cdn.shopify.com/s/files/x.js"></script>'), ["Shopify"]);
});

test("detects payment/analytics/support scripts (useful for revenue-model claims)", () => {
  const names = (b: string) => detectTechStack(page(b)).map((s) => s.name);
  assert.deepEqual(names('<script src="https://js.stripe.com/v3/"></script>'), ["Stripe"]);
  assert.deepEqual(names('<script src="https://www.paypal.com/sdk/js?client-id=x"></script>'), ["PayPal Checkout"]);
  assert.deepEqual(names('<script src="https://js.intercomcdn.com/x.js"></script>'), ["Intercom"]);
});

test("detects CDN/hosting from response headers, not just body", () => {
  const signals = detectTechStack(page("<html></html>", { server: "cloudflare", "x-vercel-id": "abc123" }));
  assert.deepEqual(
    signals.map((s) => [s.name, s.evidenceText]).sort(),
    [["Cloudflare", "server: cloudflare"], ["Vercel", "x-vercel-id: abc123"]].sort(),
  );
});

test("returns [] when nothing matches, and does not false-positive on a plain page", () => {
  assert.deepEqual(detectTechStack(page("<html><body><h1>Hello</h1></body></html>")), []);
});

test("multiple independent signals on one page are all reported", () => {
  const html = '<html><head><meta name="generator" content="WordPress 6.4"></head><body><script src="https://js.stripe.com/v3/"></script><script src="https://www.googletagmanager.com/gtag/js"></script></body></html>';
  const names = detectTechStack(page(html)).map((s) => s.name).sort();
  assert.deepEqual(names, ["Google Analytics", "Stripe", "WordPress"]);
});
