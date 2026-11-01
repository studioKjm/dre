import { isPrivateHostname, REVENUE_MODEL_LABELS } from "@dre/core";
import { z } from "zod/v4";

/** 파싱할 수 없는 값은 여기서 판단하지 않는다 (url() 검사가 이미 거부한다). */
function isPrivateUrl(u: string): boolean {
  try {
    return isPrivateHostname(new URL(u).hostname);
  } catch {
    return false;
  }
}

/** MCP 입력은 외부 데이터이므로 http(s) URL만 허용한다. */
export const urlSchema = z
  .url()
  .refine((u) => /^https?:\/\//i.test(u), { message: "only http(s) URLs are allowed" })
  .refine((u) => !isPrivateUrl(u), { message: "private, loopback, and link-local addresses are not allowed" });

export const collectInput = { url: urlSchema };
export const pricingInput = { url: urlSchema, js: z.boolean().optional().describe("render with a browser (falls back to static fetch if unavailable)") };

const evidenceSchema = z.object({
  url: z.string(),
  snapshot: z.string().optional(),
  retrievedAt: z.string(),
  source: z
    .enum(["dre", "agent"])
    .optional()
    .describe(
      "'dre' (default) if a collect_* tool returned this evidence; 'agent' if collection failed or was " +
        "empty and you supplemented with your own web research. 'observed' claims cannot use source:'agent' evidence.",
    ),
});

const claimSchema = z.object({
  claim: z.string(),
  type: z.enum(["observed", "inferred", "estimated"]),
  confidence: z.enum(["high", "medium", "low"]),
  evidence: z.array(evidenceSchema),
  assumptions: z.array(z.string()),
  range: z.object({ low: z.number(), high: z.number(), unit: z.string() }).optional(),
});

const SECTIONS = ["business-model", "positioning", "marketing", "ads", "tech-stack", "domain"] as const;

export const reportSchema = z.object({
  target: z.string(),
  generatedAt: z.string(),
  revenueModelLabels: z.array(z.enum(REVENUE_MODEL_LABELS)).optional(),
  sections: z.object(Object.fromEntries(SECTIONS.map((s) => [s, z.array(claimSchema).optional()])) as Record<(typeof SECTIONS)[number], z.ZodOptional<z.ZodArray<typeof claimSchema>>>),
});

export const submitInput = { report: reportSchema };

export const adLibraryInput = { domain: z.string().min(1).describe("bare domain, e.g. 'notion.com' (no scheme/path)"), region: z.string().length(2).optional().describe("ISO 3166-1 alpha-2 country code, default US") };
