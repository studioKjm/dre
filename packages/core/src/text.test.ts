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
