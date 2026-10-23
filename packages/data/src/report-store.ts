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
    const body = JSON.stringify(report, null, 2) + "\n";
    // 같은 대상·같은 시각에 저장해도 덮어쓰지 않도록 "wx"로 쓰고 충돌 시 번호를 붙인다.
    for (let n = 0; ; n++) {
      const path = join(this.dir, `${slug(report.target)}-${stamp}${n ? `-${n}` : ""}.json`);
      try {
        await writeFile(path, body, { encoding: "utf-8", flag: "wx" });
        return path;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      }
    }
  }

  async load(path: string): Promise<Report> {
    return JSON.parse(await readFile(path, "utf-8")) as Report;
  }

  async list(): Promise<string[]> {
    const names = await readdir(this.dir).catch(() => [] as string[]);
    return names.filter((n) => n.endsWith(".json")).sort().map((n) => join(this.dir, n));
  }
}
