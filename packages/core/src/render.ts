import type { Report } from "./schema.js";

export function renderMarkdown(r: Report): string {
  const lines = [`# DRE Report: ${r.target}`, "", `_generated ${r.generatedAt}_`, ""];
  for (const [section, claims] of Object.entries(r.sections)) {
    lines.push(`## ${section}`, "");
    for (const c of claims ?? []) {
      const range = c.range ? ` (${c.range.low}–${c.range.high} ${c.range.unit})` : "";
      lines.push(`- **[${c.type}/${c.confidence}]** ${c.claim}${range}`);
      for (const e of c.evidence) lines.push(`  - evidence: ${e.url}`);
      for (const a of c.assumptions) lines.push(`  - assumption: ${a}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
