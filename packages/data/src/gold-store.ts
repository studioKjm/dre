import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import type { GoldLabel } from "@dre/core";

export class GoldFormatError extends Error {
  constructor(readonly problems: string[]) {
    super(`invalid gold files:\n${problems.join("\n")}`);
    this.name = "GoldFormatError";
  }
}

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

function toGold(file: string, data: unknown, problems: string[]): GoldLabel | null {
  const d = data as Record<string, unknown> | null;
  const before = problems.length;
  if (!d || typeof d !== "object") problems.push(`${file}: not a mapping`);
  else {
    if (typeof d.targetUrl !== "string") problems.push(`${file}: targetUrl must be a string`);
    if (!isStringArray(d.labels) || d.labels.length === 0) problems.push(`${file}: labels must be a non-empty string list`);
    if (d.evidence !== undefined && !isStringArray(d.evidence)) problems.push(`${file}: evidence must be a string list`);
    if (typeof d.labeledAt !== "string") problems.push(`${file}: labeledAt must be a string`);
  }
  if (problems.length > before || !d) return null;
  return {
    targetUrl: d.targetUrl as string,
    country: typeof d.country === "string" ? d.country : undefined,
    labels: d.labels as string[],
    evidence: (d.evidence as string[] | undefined) ?? [],
    labeledAt: d.labeledAt as string,
  };
}

/** dir 안의 *.yaml 정답표를 읽는다. 이름이 _로 시작하는 파일(템플릿)은 건너뛴다. */
export async function loadGold(dir: string): Promise<GoldLabel[]> {
  const files = (await readdir(dir)).filter((f) => /\.ya?ml$/.test(f) && !f.startsWith("_")).sort();
  const problems: string[] = [];
  const out: GoldLabel[] = [];
  for (const f of files) {
    let data: unknown;
    try {
      data = parse(await readFile(join(dir, f), "utf-8"));
    } catch (e) {
      problems.push(`${f}: ${(e as Error).message}`);
      continue;
    }
    const g = toGold(f, data, problems);
    if (g) out.push(g);
  }
  if (problems.length) throw new GoldFormatError(problems);
  return out;
}
