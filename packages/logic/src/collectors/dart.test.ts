import test from "node:test";
import assert from "node:assert/strict";
import { ApiKeyMissing } from "@dre/core";
import type { DartSource } from "./dart.js";
import { DartCollector } from "./dart.js";

test("returns an empty, non-error result when the API key is not configured", async () => {
  const source: DartSource = {
    findCorpCode: async () => { throw new ApiKeyMissing("DART"); },
    fetchFinancialStatement: async () => { throw new Error("should not be called"); },
  };
  const r = await new DartCollector(source).collect("카카오페이");
  assert.deepEqual(r.items, []);
  assert.deepEqual(r.evidence, []);
  assert.match(r.warnings[0]!, /DRE_DART_API_KEY/);
});

test("returns an empty, non-error result when no DART filer matches (most companies aren't listed)", async () => {
  const source: DartSource = {
    findCorpCode: async () => null,
    fetchFinancialStatement: async () => { throw new Error("should not be called"); },
  };
  const r = await new DartCollector(source).collect("동네빵집");
  assert.deepEqual(r.items, []);
  assert.match(r.warnings[0]!, /no DART-listed corporation found/);
});

test("extracts revenue (매출액) and net income (당기순이익) for the requested year", async () => {
  const source: DartSource = {
    findCorpCode: async () => ({ corpCode: "00111222", corpName: "테스트주식회사", stockCode: "123456" }),
    fetchFinancialStatement: async (corpCode, year) => {
      assert.equal(corpCode, "00111222");
      assert.equal(year, 2024);
      return {
        status: "000",
        message: "정상",
        list: [
          { account_nm: "자산총계", thstrm_amount: "999,999" },
          { account_nm: "매출액", thstrm_amount: "1,234,000" },
          { account_nm: "당기순이익", thstrm_amount: "-56,000" },
        ],
      };
    },
  };
  const r = await new DartCollector(source).collect("테스트주식회사", { year: 2024 });
  assert.deepEqual(r.items, [
    { accountName: "매출액", amountKrw: 1234000, fiscalYear: 2024 },
    { accountName: "당기순이익", amountKrw: -56000, fiscalYear: 2024 },
  ]);
  assert.match(r.evidence[0]!.snapshot!, /테스트주식회사/);
});

test("accepts the alternate 당기순이익(손실) label", async () => {
  const source: DartSource = {
    findCorpCode: async () => ({ corpCode: "1", corpName: "x" }),
    fetchFinancialStatement: async () => ({
      status: "000", message: "정상",
      list: [{ account_nm: "당기순이익(손실)", thstrm_amount: "100" }],
    }),
  };
  const r = await new DartCollector(source).collect("x");
  assert.deepEqual(r.items, [{ accountName: "당기순이익(손실)", amountKrw: 100, fiscalYear: new Date().getFullYear() - 1 }]);
});

test("a non-success DART status yields a warning, not fabricated data", async () => {
  const source: DartSource = {
    findCorpCode: async () => ({ corpCode: "1", corpName: "x" }),
    fetchFinancialStatement: async () => ({ status: "013", message: "조회된 데이터가 없습니다" }),
  };
  const r = await new DartCollector(source).collect("x");
  assert.deepEqual(r.items, []);
  assert.match(r.warnings[0]!, /DART status 013/);
});
