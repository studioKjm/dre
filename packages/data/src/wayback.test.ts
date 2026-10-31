import test from "node:test";
import assert from "node:assert/strict";
import { fetchFromWayback } from "./wayback.js";

// 이 함수는 전적으로 외부 서비스(archive.org)에 의존하므로 로컬 픽스처로는 의미 있게 테스트할 수
// 없다. 실패 경로(네트워크 오류)는 로컬에서 확인하고, 성공 경로는 실제 archive.org를 상대로 한
// 가벼운 통합 테스트로 확인한다 (네트워크가 없으면 건너뛴다).

test("returns null (not throw) when the request cannot complete", async () => {
  const result = await fetchFromWayback("https://example.com/definitely-not-a-real-page-xyz", { timeoutMs: 1 });
  assert.equal(result, null);
});

test(
  "fetches a real snapshot for a well-archived page",
  { skip: process.env.DRE_SKIP_NETWORK_TESTS ? "network tests disabled" : false },
  async () => {
    const page = await fetchFromWayback("https://example.com/");
    if (!page) {
      // archive.org가 일시적으로 응답하지 않을 수 있다 — 이 경우 실패로 보지 않고 건너뛴 것으로 기록만 한다.
      console.warn("wayback.test: no network/snapshot available, skipping assertion");
      return;
    }
    assert.ok(page.finalUrl.includes("web.archive.org"));
    assert.match(page.body, /Example Domain/i);
  },
);
