import { validateReport, type Report } from "@dre/core";
import type { ReportSink } from "./ports.js";

export type SubmitResult = { ok: true; path: string } | { ok: false; errors: string[] };

export class ReportService {
  constructor(private readonly sink: ReportSink) {}

  async submit(report: Report): Promise<SubmitResult> {
    const errors = validateReport(report);
    if (errors.length) return { ok: false, errors };
    return { ok: true, path: await this.sink.save(report) };
  }
}
