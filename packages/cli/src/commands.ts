import { renderMarkdown, type Report } from "@dre/core";
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

export function runAnalyze(args: string[], io: Io): number {
  const [target] = args;
  if (!target) {
    io.err("usage: dre analyze <url>");
    return 1;
  }
  // 수집기·분석기 연결 전까지는 빈 리포트를 출력한다.
  const report: Report = { target, generatedAt: new Date().toISOString(), sections: {} };
  io.out(renderMarkdown(report));
  return 0;
}
