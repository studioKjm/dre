import test from "node:test";
import assert from "node:assert/strict";
import { parseAppStore, parsePlay } from "./appstore.js";

// 실제 App Store 페이지(Duolingo·Notion)에서 관찰한 구조를 줄여 만든 픽스처
const page = (items: unknown[]) =>
  `<html><script type="application/json" id="serialized-server-data">${JSON.stringify({
    data: [{ data: { shelfMapping: { information: { items } } } }],
  })}</script></html>`;
const APPLE = page([
  { $kind: "Annotation", title: "Seller", summary: "Notion Labs", items: [] },
  {
    $kind: "Annotation",
    title: "In-App Purchases",
    summary: "Yes",
    items: [
      { $kind: "textPair", leadingText: "Notion – Plus Monthly", trailingText: "$11.99" },
      { $kind: "textPair", leadingText: "Notion Business", trailingText: "$23.99" },
      { $kind: "textPair", leadingText: "Notion Business", trailingText: "$239.99" },
      { $kind: "button", action: { title: "Learn More" } },
    ],
  },
]);

test("parseAppStore extracts textPair name/price from the In-App Purchases annotation", () => {
  assert.deepEqual(parseAppStore(APPLE), [
    { name: "Notion – Plus Monthly", priceText: "$11.99" },
    { name: "Notion Business", priceText: "$23.99" },
    { name: "Notion Business", priceText: "$239.99" },
  ]);
});

test("parseAppStore returns [] for apps without in-app purchases or unexpected JSON", () => {
  assert.deepEqual(parseAppStore(page([{ $kind: "Annotation", title: "Seller", items: [] }])), []);
  assert.deepEqual(parseAppStore('<script id="serialized-server-data" type="application/json">{not json</script>'), []);
  assert.deepEqual(parseAppStore(page([{ title: "In-App Purchases", items: "oops" }])), []);
});

test("parseAppStore returns [] when no in-app list exists", () => {
  assert.deepEqual(parseAppStore("<html></html>"), []);
});

test("parsePlay returns the in-app price range", () => {
  const html = '<div class="x"><div>In-app purchases</div><div class="y">$0.99 - $99.99 per item</div></div>';
  assert.deepEqual(parsePlay(html), [{ name: "In-app purchases", priceText: "$0.99 - $99.99 per item" }]);
  assert.deepEqual(parsePlay("<div></div>"), []);
});
