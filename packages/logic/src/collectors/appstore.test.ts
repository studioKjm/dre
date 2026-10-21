import test from "node:test";
import assert from "node:assert/strict";
import { UnsupportedStore } from "../errors.js";
import type { ProductParser } from "../ports.js";
import { FakeFetcher, allowAll } from "../testing.js";
import { AppStoreCollector } from "./appstore.js";

const parser: ProductParser = {
  // 개인정보 같은 여분 필드가 섞여 나와도 수집기가 걸러내야 한다.
  parseAppStore: () => [{ name: "Pro", priceText: "$9.99", reviewer: "jane" } as never],
  parsePlay: () => [{ name: "In-app purchases", priceText: "$0.99 - $9.99 per item" }],
};

test("apple store url uses the apple parser and keeps only name and price", async () => {
  const url = "https://apps.apple.com/us/app/x/id1";
  const r = await new AppStoreCollector(new FakeFetcher({ [url]: "<html/>" }), allowAll(), parser).collect(url);
  assert.deepEqual(r.items, [{ name: "Pro", priceText: "$9.99" }]);
  assert.equal(r.evidence[0]!.url, url);
});

test("play store url uses the play parser", async () => {
  const url = "https://play.google.com/store/apps/details?id=x";
  const r = await new AppStoreCollector(new FakeFetcher({ [url]: "<html/>" }), allowAll(), parser).collect(url);
  assert.equal(r.items[0]!.priceText, "$0.99 - $9.99 per item");
});

test("unknown host is rejected before any fetch", async () => {
  const fetcher = new FakeFetcher({});
  await assert.rejects(new AppStoreCollector(fetcher, allowAll(), parser).collect("https://example.com/app"), UnsupportedStore);
  assert.deepEqual(fetcher.calls, []);
});
