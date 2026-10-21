import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Report } from "@dre/core";

function slug(target: string): string {
  let host = target;
  try {
    host = new URL(target).hostname;
  } catch {
    // target이 URL이 아니면 그대로 정리해서 쓴다
  }
  return host.replace(/[^a-zA-Z0-9.-]+/g, "_");
}

export class ReportStore {
  constructor(private readonly dir: string) {}

  async save(report: Report): Promise<string> {
    await mkdir(this.dir, { recursive: true });
    const stamp = report.generatedAt.replace(/[^0-9A-Za-z]+/g, "");
    const path = join(this.dir, `${slug(report.target)}-${stamp}.json`);
    await writeFile(path, JSON.stringify(report, null, 2) + "\n", "utf-8");
    return path;
  }

  async load(path: string): Promise<Report> {
    return JSON.parse(await readFile(path, "utf-8")) as Report;
  }

  async list(): Promise<string[]> {
    const names = await readdir(this.dir).catch(() => [] as string[]);
    return names.filter((n) => n.endsWith(".json")).sort().map((n) => join(this.dir, n));
  }
}
