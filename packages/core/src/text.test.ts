import test from "node:test";
import assert from "node:assert/strict";
import { decodeEntities, htmlToText, stripTags } from "./text.js";

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

test("decodeEntities decodes every entity in the table, not just &amp;/&nbsp;", () => {
  assert.equal(decodeEntities("&lt;&gt;&quot;&apos;"), '<>"\'');
});

test("decodeEntities decodes a multi-digit numeric entity to the exact character", () => {
  // &#8217; is U+2019 RIGHT SINGLE QUOTATION MARK — a single-digit-only regex would miss this.
  assert.equal(decodeEntities("It&#8217;s"), "It’s");
});

test("a plain string with a literal < but no HTML entity is left untouched (no decode happened)", () => {
  // decodeEntities(s) === s일 때만 그대로 반환한다 — 디코딩이 일어나지 않았으면 "<"를 지울 이유가 없다.
  assert.equal(stripTags("5 < 10"), "5 < 10");
});

test("stripTags collapses runs of whitespace to one space and trims the ends", () => {
  assert.equal(stripTags("  <p>a   b\tc</p>  "), "a b c");
});

test("htmlToText breaks on an opening block tag even with no matching closing tag", () => {
  // TAG 정규식의 '?'(닫는 태그도 매치)가 제거되는 뮤턴트를 잡는다 — 여는 태그만으로는
  // 줄바꿈이 안 생기면 실패한다.
  assert.equal(htmlToText("<div>a<div>b"), "a\nb");
});

test("htmlToText breaks on an h1-h6 heading with no other block tag nearby to mask it", () => {
  // h[1-6] -> h[^1-6] 뮤턴트를 잡는다. 바로 뒤에 <p>처럼 줄바꿈을 주는 다른 블록 태그가
  // 있으면 그게 분리를 대신 해줘서 뮤턴트가 안 잡힌다 — 그래서 일부러 단독으로 둔다.
  assert.equal(htmlToText("Title<h2>Body"), "Title\nBody");
});

test("htmlToText breaks on a block tag that carries attributes, with no other break nearby to mask it", () => {
  // [^>]* 가 [>]* 로 바뀌는 뮤턴트를 잡는다 — 속성이 있으면 태그 안에 '>' 아닌 문자가 있어
  // 그 자리에서 매치가 실패한다. 닫는 태그(속성 없음)가 옆에서 대신 줄바꿈을 주면 뮤턴트가
  // 가려지므로, 여는 태그 하나만 두고 닫는 태그는 생략한다.
  assert.equal(htmlToText('a<div class="x">b'), "a\nb");
});

test("htmlToText strips an HTML comment that actually has content, not just <!---->", () => {
  assert.equal(htmlToText("<p>a</p><!-- a real comment with text --><p>b</p>"), "a\nb");
});

test("htmlToText removes inline (non-block) tags entirely, leaving no residual markup", () => {
  assert.equal(htmlToText("<p>a<span>b</span>c</p>"), "abc");
});

test("htmlToText collapses runs of whitespace and trims each line, not just stripTags", () => {
  // stripTags 테스트와 같은 패턴이지만 htmlToText의 .map((l) => ...) 단계(별도 정규식 위치)를 겨냥한다.
  assert.equal(htmlToText("<p>  a   b  </p>"), "a b");
});
