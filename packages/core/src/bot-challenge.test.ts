import test from "node:test";
import assert from "node:assert/strict";
import { detectBotChallenge } from "./bot-challenge.js";

test("detects common CAPTCHA/bot-challenge phrasing", () => {
  assert.ok(detectBotChallenge("접속하신 사이트를 임시 보호 중에 있습니다.\n보안문자를 정확히 입력 후 접속하시면"));
  assert.ok(detectBotChallenge("Please verify you are a human to continue."));
  assert.ok(detectBotChallenge("We have detected unusual traffic from your network."));
  assert.ok(detectBotChallenge("Checking your browser before accessing the site."));
  assert.ok(detectBotChallenge("Just a moment...\nmedium.com needs to review the security of your connection."));
});

test("does not flag ordinary pricing/terms text", () => {
  assert.equal(detectBotChallenge("Pro plan $12/month. Cancel anytime."), undefined);
  assert.equal(detectBotChallenge("이용약관 제3조 결제 및 환불"), undefined);
});

test("only looks at the first part of the page to avoid false positives deep in content", () => {
  const text = "x".repeat(3000) + "보안문자 확인";
  assert.equal(detectBotChallenge(text), undefined);
});
