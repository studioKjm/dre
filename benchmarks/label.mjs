#!/usr/bin/env node
// 정답표(gold label) 작성을 돕는 대화형 CLI.
// 20곳을 순서대로 보여주고, 페이지를 자동으로 열고, 숫자만 입력받아 YAML을 바로 저장한다.
// 사용자가 직접 판단해야 하는 "레이블 선택"만 남기고 나머지는 전부 이 스크립트가 채운다.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { parse } from "yaml";

const ROOT = new URL("..", import.meta.url).pathname;
const { targets } = parse(readFileSync(`${ROOT}benchmarks/targets.yaml`, "utf-8"));
const GOLD_DIR = `${ROOT}benchmarks/gold`;

const LABELS = [
  ["subscription", "정기 구독 요금"],
  ["usage-based", "사용량 과금"],
  ["freemium", "무료 티어 + 유료 업그레이드"],
  ["one-time", "건별 단발 결제"],
  ["ads", "광고 수익"],
  ["marketplace-fee", "중개 수수료"],
  ["transaction-fee", "결제·거래 건당 수수료"],
  ["in-app-purchase", "앱스토어 인앱 결제"],
  ["licensing", "라이선스 판매"],
  ["enterprise-sales", "기업 영업(견적·계약)"],
];

function openInBrowser(url) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  execFile(cmd, [url], () => {});
}

function hostFile(url) {
  return `${new URL(url).hostname}.yaml`;
}

function writeGold(target, labels, labeledBy) {
  const evidence = [target.pricing, target.home].filter(Boolean);
  const yaml = [
    `targetUrl: "${target.home}"`,
    `country: "${target.country}"`,
    `labels: [${labels.join(", ")}]`,
    `evidence:`,
    ...evidence.map((u) => `  - "${u}"`),
    `labeledAt: "${new Date().toISOString().slice(0, 10)}"`,
    `labeledBy: "${labeledBy}"`,
    "",
  ].join("\n");
  writeFileSync(`${GOLD_DIR}/${hostFile(target.home)}`, yaml, "utf-8");
}

const rl = createInterface({ input: process.stdin, output: process.stdout });

console.log("=== DRE 정답표 라벨링 ===");
console.log("각 사이트의 가격/홈 페이지가 자동으로 열립니다. 페이지를 보고 해당하는 레이블 번호를");
console.log("공백으로 구분해 입력하세요 (예: 1 3). 모르면 엔터만 누르면 건너뜁니다.\n");
console.log("레이블 목록:");
LABELS.forEach(([k, desc], i) => console.log(`  ${i + 1}. ${k.padEnd(18)} - ${desc}`));
console.log("");

const labeledBy = (await rl.question("본인 이름/아이디 (엔터 시 'jimin'): ")).trim() || "jimin";

let done = 0;
const skipped = [];

for (const t of targets) {
  const file = `${GOLD_DIR}/${hostFile(t.home)}`;
  const already = existsSync(file) ? parse(readFileSync(file, "utf-8")) : null;
  const doneByUser = already?.labeledBy && already.labeledBy !== "model (provisional — pending user review, see README)";
  if (doneByUser) {
    console.log(`[skip] ${t.id} — 이미 라벨링됨 (labeledBy: ${already.labeledBy})`);
    continue;
  }

  console.log(`\n--- ${t.id} (${t.country}) ---`);
  console.log(`  pricing: ${t.pricing ?? "-"}`);
  console.log(`  home:    ${t.home}`);
  if (t.apple) console.log(`  apple:   ${t.apple}`);
  openInBrowser(t.pricing ?? t.home);

  const answer = (await rl.question("레이블 번호 (공백 구분, 엔터=건너뛰기): ")).trim();
  if (!answer) {
    skipped.push(t.id);
    continue;
  }
  const picked = answer
    .split(/\s+/)
    .map((n) => LABELS[Number(n) - 1]?.[0])
    .filter(Boolean);
  if (!picked.length) {
    console.log("  입력을 레이블로 변환하지 못했습니다. 건너뜁니다.");
    skipped.push(t.id);
    continue;
  }
  writeGold(t, picked, labeledBy);
  console.log(`  저장됨: [${picked.join(", ")}]`);
  done++;
}

rl.close();

console.log(`\n완료: ${done}곳 라벨링, ${skipped.length}곳 건너뜀${skipped.length ? ` (${skipped.join(", ")})` : ""}`);
console.log("나중에 이 스크립트를 다시 실행하면 이미 라벨링한 곳은 건너뛰고 나머지만 물어봅니다.");
console.log("\n모두 끝나면: node packages/cli/dist/index.js eval reports benchmarks/gold");
