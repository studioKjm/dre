import test from "node:test";
import assert from "node:assert/strict";
import { extractStructuredFacts } from "./structured-data.js";

const ldJson = (obj: unknown) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;

test("extracts Organization fields (AC-001)", () => {
  const html = ldJson({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Acme Inc.",
    foundingDate: "2015-03-01",
    numberOfEmployees: 42,
    industry: "Software",
  });
  assert.deepEqual(extractStructuredFacts(html), [
    { kind: "organization", name: "Acme Inc.", foundingDate: "2015-03-01", numberOfEmployees: "42", industry: "Software" },
  ]);
});

test("normalizes a QuantitativeValue numberOfEmployees to a \"min-max\" string", () => {
  const html = ldJson({ "@type": "Organization", numberOfEmployees: { "@type": "QuantitativeValue", minValue: 50, maxValue: 100 } });
  const [fact] = extractStructuredFacts(html);
  assert.equal(fact!.kind, "organization");
  assert.equal((fact as { numberOfEmployees?: string }).numberOfEmployees, "50-100");
});

test("extracts Product/Offer fields, using only the first offer when offers is an array (AC-002)", () => {
  const html = ldJson({
    "@type": "Product",
    name: "Widget Pro",
    offers: [
      { "@type": "Offer", price: "29.99", priceCurrency: "USD", availability: "https://schema.org/InStock" },
      { "@type": "Offer", price: "299.99", priceCurrency: "USD", availability: "https://schema.org/InStock" },
    ],
  });
  assert.deepEqual(extractStructuredFacts(html), [
    { kind: "product", name: "Widget Pro", price: "29.99", priceCurrency: "USD", availability: "https://schema.org/InStock" },
  ]);
});

test("returns an empty array when the page has no JSON-LD at all (AC-003)", () => {
  assert.deepEqual(extractStructuredFacts("<html><body><h1>Hi</h1></body></html>"), []);
});

test("ignores JSON-LD blocks whose @type isn't Organization or Product (AC-003)", () => {
  const html = ldJson({ "@type": "BreadcrumbList", itemListElement: [] });
  assert.deepEqual(extractStructuredFacts(html), []);
});

test("skips a malformed JSON-LD block but still extracts the valid ones around it (AC-004)", () => {
  const html =
    ldJson({ "@type": "Organization", name: "Acme Inc." }) +
    `<script type="application/ld+json">{not valid json</script>` +
    ldJson({ "@type": "Product", name: "Widget" });
  const facts = extractStructuredFacts(html);
  assert.deepEqual(
    facts.map((f) => f.kind),
    ["organization", "product"],
  );
});

test("reads nodes nested inside an @graph array", () => {
  const html = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [{ "@type": "Organization", name: "Acme Inc." }, { "@type": "Product", name: "Widget" }],
  })}</script>`;
  const facts = extractStructuredFacts(html);
  assert.deepEqual(
    facts.map((f) => f.kind),
    ["organization", "product"],
  );
});
