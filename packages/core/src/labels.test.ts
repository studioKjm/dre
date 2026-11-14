import test from "node:test";
import assert from "node:assert/strict";
import { REVENUE_MODEL_LABEL_DEFINITIONS, REVENUE_MODEL_LABELS, SECONDARY_LABELS, isRevenueModelLabel } from "./labels.js";

test("REVENUE_MODEL_LABELS has exactly the 10 seed-v1 labels", () => {
  assert.deepEqual(REVENUE_MODEL_LABELS, [
    "subscription",
    "usage-based",
    "freemium",
    "one-time",
    "ads",
    "marketplace-fee",
    "transaction-fee",
    "in-app-purchase",
    "licensing",
    "enterprise-sales",
  ]);
});

test("every label has a non-empty definition, and no extra definitions exist", () => {
  assert.deepEqual(Object.keys(REVENUE_MODEL_LABEL_DEFINITIONS).sort(), [...REVENUE_MODEL_LABELS].sort());
  for (const label of REVENUE_MODEL_LABELS) assert.ok(REVENUE_MODEL_LABEL_DEFINITIONS[label].length > 0);
});

test("isRevenueModelLabel accepts every taxonomy label", () => {
  for (const label of REVENUE_MODEL_LABELS) assert.equal(isRevenueModelLabel(label), true);
});

test("isRevenueModelLabel rejects strings outside the taxonomy", () => {
  assert.equal(isRevenueModelLabel("not-a-real-label"), false);
  assert.equal(isRevenueModelLabel(""), false);
  assert.equal(isRevenueModelLabel("Subscription"), false); // 대소문자 구분 — 정확히 일치해야 함
});

test("SECONDARY_LABELS is exactly in-app-purchase, and nothing else", () => {
  assert.deepEqual(SECONDARY_LABELS, ["in-app-purchase"]);
  for (const label of REVENUE_MODEL_LABELS) {
    if (label === "in-app-purchase") continue;
    assert.ok(!(SECONDARY_LABELS as readonly string[]).includes(label), `${label} should not be secondary`);
  }
});
