import test from "node:test";
import assert from "node:assert/strict";
import { parseAppStore, parsePlay } from "./appstore.js";

// 직접 만든 픽스처 (실제 스토어 페이지 아님)
const APPLE = `
<section><ul>
  <li class="list-with-numbers__item"><span class="truncate-single-line truncate-single-line--block">Pro Monthly</span><span class="list-with-numbers__item__price medium-show-tablecell">$9.99</span></li>
  <li class="list-with-numbers__item"><span class="truncate-single-line">Pro &amp; Yearly</span><span class="list-with-numbers__item__price">$79.99</span></li>
  <li class="other-item"><span class="truncate-single-line">Reviewer Jane</span></li>
</ul></section>`;

test("parseAppStore extracts name and price only", () => {
  assert.deepEqual(parseAppStore(APPLE), [
    { name: "Pro Monthly", priceText: "$9.99" },
    { name: "Pro & Yearly", priceText: "$79.99" },
  ]);
});

test("parseAppStore returns [] when no in-app list exists", () => {
  assert.deepEqual(parseAppStore("<html></html>"), []);
});

test("parsePlay returns the in-app price range", () => {
  const html = '<div class="x"><div>In-app purchases</div><div class="y">$0.99 - $99.99 per item</div></div>';
  assert.deepEqual(parsePlay(html), [{ name: "In-app purchases", priceText: "$0.99 - $99.99 per item" }]);
  assert.deepEqual(parsePlay("<div></div>"), []);
});
