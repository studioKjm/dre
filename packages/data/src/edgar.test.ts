import test from "node:test";
import assert from "node:assert/strict";
import { parseFilingSummary, parseRevenueSegments } from "./edgar.js";

// 실제 duolingo 10-K R46.htm을 htmlToText로 거친 결과를 압축한 고정물. SEC XBRL 뷰어가
// 렌더링하는 "날짜 헤더 -> (세그먼트 이름 -> Disaggregation of Revenue [Line Items] ->
// 개념 이름 -> 연도별 숫자들)*" 패턴을 그대로 따른다 — 실측 확인(2026-11-11).
const DUOLINGO_FIXTURE = `
REVENUE - Schedule of Disaggregation of Revenue (Details) - USD ($)
$ in Thousands
12 Months Ended
Dec. 31, 2025
Dec. 31, 2024
Dec. 31, 2023
Disaggregation of Revenue [Line Items]
Revenue from contract with customer, excluding assessed tax
1,037,589
748,024
531,109
Subscription
Disaggregation of Revenue [Line Items]
Revenue from contract with customer, excluding assessed tax
873,442
607,531
404,684
Advertising
Disaggregation of Revenue [Line Items]
Revenue from contract with customer, excluding assessed tax
79,725
54,907
49,858
`;

test("parseRevenueSegments extracts per-segment facts, skipping the company-wide total", () => {
  const segments = parseRevenueSegments(DUOLINGO_FIXTURE);
  assert.deepEqual(segments, [
    { label: "Subscription", valueUsd: 873_442_000, periodEnd: "2025-12-31" },
    { label: "Advertising", valueUsd: 79_725_000, periodEnd: "2025-12-31" },
  ]);
});

test("parseRevenueSegments applies the '$ in Millions' scale", () => {
  const text = DUOLINGO_FIXTURE.replace("$ in Thousands", "$ in Millions");
  const segments = parseRevenueSegments(text);
  assert.equal(segments[0]!.valueUsd, 873_442_000_000);
});

test("parseRevenueSegments returns [] when there's no disaggregation table", () => {
  assert.deepEqual(parseRevenueSegments("Some unrelated filing text.\nNo tables here."), []);
});

test("parseFilingSummary finds the report whose ShortName mentions revenue disaggregation", () => {
  const xml = `<FilingSummary>
    <Report><ShortName>Cover Page</ShortName><HtmlFileName>R1.htm</HtmlFileName></Report>
    <Report><ShortName>REVENUE - Schedule of Disaggregation of Revenue (Details)</ShortName><HtmlFileName>R46.htm</HtmlFileName></Report>
  </FilingSummary>`;
  const reports = parseFilingSummary(xml);
  assert.equal(reports.length, 2);
  assert.ok(reports.find((r) => r.shortName.includes("Disaggregation") && r.htmlFile === "R46.htm"));
});
