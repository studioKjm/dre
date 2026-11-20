import { createServices, type Services } from "@dre/app";

const PASS_THRESHOLD = 0.85; // seed AC-008

export interface Io {
  out: (line: string) => void;
  err: (line: string) => void;
}

export async function runEval(args: string[], io: Io, services: Pick<Services, "evalDirs"> = createServices()): Promise<number> {
  const [reportsDir, goldDir] = args;
  if (!reportsDir || !goldDir) {
    io.err("usage: dre eval <reports-dir> <gold-dir>");
    return 1;
  }
  try {
    const res = await services.evalDirs(reportsDir, goldDir);
    for (const t of res.perTarget) {
      const pct = (t.score * 100).toFixed(0).padStart(3);
      const diff = [t.missing.length ? `missing: ${t.missing.join(",")}` : "", t.extra.length ? `extra: ${t.extra.join(",")}` : ""].filter(Boolean).join(" | ");
      io.out(`${pct}%  ${t.targetUrl}${diff ? `  (${diff})` : ""}`);
    }
    for (const u of res.unmatchedGold) io.out(`no report for gold target: ${u}`);
    for (const u of res.unmatchedReports) io.out(`ignored (no gold): ${u}`);
    const mean = res.mean * 100;
    io.out(`mean match: ${mean.toFixed(1)}% over ${res.perTarget.length} targets (${mean >= PASS_THRESHOLD * 100 ? "PASS" : "below"} ${PASS_THRESHOLD * 100}% target)`);
    return 0;
  } catch (e) {
    io.err((e as Error).message);
    return 1;
  }
}

export async function runAnalyze(
  args: string[],
  io: Io,
  services: { company: Pick<Services["company"], "analyze"> } = createServices(),
): Promise<number> {
  const [target] = args;
  if (!target) {
    io.err("usage: dre analyze <domain>");
    return 1;
  }
  try {
    const domain = /^https?:\/\//i.test(target) ? new URL(target).hostname : target;
    const snapshot = await services.company.analyze(domain);
    // DRE는 스스로 LLM을 불러 증거를 claim/레이블로 바꾸지 않는다(ADR-003) — 원시 수집
    // 결과(JSON)를 그대로 보여준다. 라벨링된 리포트가 필요하면 analyze_company MCP 툴을
    // 에이전트가 직접 호출한다 — examples/README.md의 "Golden path" 예시가 그 결과물이다.
    io.out(JSON.stringify(snapshot, null, 2));
    return 0;
  } catch (e) {
    io.err((e as Error).message);
    return 1;
  }
}
