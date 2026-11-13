import test from "node:test";
import assert from "node:assert/strict";
import { htmlToText, stripTags } from "./text.js";

test("htmlToText drops scripts/styles and splits blocks into lines", () => {
  const html = "<style>.a{}</style><div>Pro</div><p>$9.99 &amp; tax</p><script>x()</script>";
  assert.equal(htmlToText(html), "Pro\n$9.99 & tax");
});

test("stripTags removes tags and decodes entities", () => {
  assert.equal(stripTags("<span>Pro&nbsp;Plan &#39;A&#39;</span>"), "Pro Plan 'A'");
});

test("htmlToText fully removes a script tag reconstructed from overlapping comment markers (CodeQL js/incomplete-multi-character-sanitization)", () => {
  // 한 번만 지우면 "<!---->"를 없애는 순간 양옆이 붙어 "<script>"가 새로 만들어진다.
  const html = "<scr<!---->ipt>alert(1)</script>Pro";
  const text = htmlToText(html);
  assert.ok(!text.includes("<script"));
  assert.ok(!text.includes("alert(1)"));
});

test("htmlToText removes a tag reconstructed from an HTML-entity-encoded <script>", () => {
  const html = "Pro&lt;script&gt;alert(1)&lt;/script&gt;Plan";
  assert.ok(!htmlToText(html).includes("<script"));
});
