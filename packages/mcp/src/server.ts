import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Report } from "@dre/core";
import type { Services } from "@dre/app";
import { adLibraryInput, collectInput, pricingInput, submitInput } from "./schemas.js";

export const SERVER_INFO = { name: "dre", version: "0.0.1" } as const;

/** 세 collect_* 도구 설명에 공통으로 붙는 안내: 수집이 막히면 우회하지 말고, 에이전트 리서치로만 보충하라. */
const FALLBACK =
  " If this errors (RobotsDisallowed, AutomationBlocked, FetchError) or returns zero items, " +
  "do not retry or work around it — that reflects a real access limit (robots.txt, bot detection, " +
  "a login wall). Instead you may supplement with your own web research, but cite it as evidence " +
  "with source:'agent' and use claim type 'inferred' or 'estimated', never 'observed' (submit_report " +
  "rejects 'observed' claims backed by source:'agent' evidence).";

/** 도구가 사용하는 서비스의 최소 형태. 테스트에서는 가짜 구현을 주입한다. */
export interface ToolServices {
  pricing: Pick<Services["pricing"], "collect">;
  appstore: Pick<Services["appstore"], "collect">;
  terms: Pick<Services["terms"], "collect">;
  techstack: Pick<Services["techstack"], "collect">;
  adlibrary: Pick<Services["adlibrary"], "collect">;
  company: Pick<Services["company"], "analyze">;
  reports: Pick<Services["reports"], "submit">;
}

const json = (value: unknown, isError = false): CallToolResult => ({
  content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  ...(isError ? { isError: true } : {}),
});

/** 수집기 예외(robots 불허, 네트워크 오류 등)를 MCP 오류 결과로 변환한다. */
async function guarded(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return json(await fn());
  } catch (e) {
    const err = e as Error;
    return json({ error: err.name, message: err.message }, true);
  }
}

export function createDreServer(services: ToolServices): McpServer {
  const server = new McpServer(SERVER_INFO);

  server.registerTool(
    "collect_pricing",
    {
      title: "Collect pricing",
      description:
        "Fetch a pricing page (robots.txt respected) and return evidence[0].snapshot: the full cleaned page text (not truncated to a preview). Read that text yourself to find plans, prices, and billing terms — it is far more reliable than the included 'items' field, which is a best-effort regex guess that can miss non-English currency formats or pick up unrelated page chrome (CSS, nav text) as a false match. Treat 'items' as a quick hint only, never as verified facts. If the live site blocks the request (403, bot/CAPTCHA detection), this may transparently fall back to an archive.org snapshot instead — check evidence[0].url and the warnings array; an archive.org URL there means the content may be stale. Set js=true for JS-rendered pages." + FALLBACK,
      inputSchema: pricingInput,
    },
    ({ url, js }) => guarded(() => services.pricing.collect(url, { js })),
  );

  server.registerTool(
    "collect_appstore",
    {
      title: "Collect app store in-app purchases",
      description: "Fetch an App Store or Google Play page and return in-app product names and prices with evidence. Google Play returns a price range only." + FALLBACK,
      inputSchema: collectInput,
    },
    ({ url }) => guarded(() => services.appstore.collect(url)),
  );

  server.registerTool(
    "collect_terms",
    {
      title: "Collect terms and refund policy",
      description: "Find the terms/refund pages linked from a site and return billing, renewal, and refund passages with evidence." + FALLBACK,
      inputSchema: collectInput,
    },
    ({ url }) => guarded(() => services.terms.collect(url)),
  );

  server.registerTool(
    "collect_techstack",
    {
      title: "Detect technology stack",
      description:
        "Fetch a page and look for known technology signatures in its response headers and HTML (frameworks, CMS, e-commerce platform, payment/checkout scripts like Stripe or PayPal, CDN/hosting, analytics, support widgets). This only reads what the server already sends in a normal response, so it is not something a site can bot-block without breaking the page for real visitors too — it should work even on pages where collect_pricing is blocked. The signature set is small and best-effort: absence of a signal does not mean the technology isn't used, only that it wasn't detected this way. Payment-script signals (e.g. js.stripe.com) are useful supporting evidence for transaction-fee/marketplace-fee claims." +
        FALLBACK,
      inputSchema: collectInput,
    },
    ({ url }) => guarded(() => services.techstack.collect(url)),
  );

  server.registerTool(
    "collect_ad_library",
    {
      title: "Look up Google Ads Transparency Center",
      description:
        "Look up a domain in Google's Ads Transparency Center (adstransparency.google.com) and return the full page text as evidence, plus a best-effort 'items' count phrase (e.g. an ad-count string) if one could be parsed. Read evidence[0].snapshot yourself for advertiser names and details — do not trust an empty 'items' as proof of zero ads; check the snapshot first. Covers Google-served ads only (Google/YouTube network); this intentionally does not cover Meta/Facebook ads — facebook.com's robots.txt explicitly disallows automated collection (and names ClaudeBot specifically), so DRE does not query it." +
        FALLBACK,
      inputSchema: adLibraryInput,
    },
    ({ domain, region }) => guarded(() => services.adlibrary.collect(domain, { region })),
  );

  server.registerTool(
    "analyze_company",
    {
      title: "Analyze a company by domain (pricing + terms + tech stack + ad library)",
      description:
        "Given just a bare domain (e.g. 'notion.com'), runs collect_pricing, collect_terms, collect_techstack, and collect_ad_library against it in one call, so you don't have to hunt down each exact sub-page URL yourself first (collect_pricing already follows a same-origin 'pricing/plans' link from the home page automatically). Each of the four results is reported independently as {ok:true, result} or {ok:false, error} — one failing (e.g. terms blocked by robots.txt) does not hide the others. This does not cover App Store/Play Store (use collect_appstore separately with the actual store URL, which can't be derived from a domain alone)." +
        FALLBACK,
      inputSchema: adLibraryInput,
    },
    ({ domain, region }) => guarded(() => services.company.analyze(domain, { region })),
  );

  server.registerTool(
    "submit_report",
    {
      title: "Submit analysis report",
      description:
        "Validate and save a report. observed claims need evidence (and that evidence must come from a collect_* tool, i.e. source:'dre' or unset); estimated claims need a range, assumptions, and cannot be high confidence. If a collect_* call failed or was empty, you may include evidence with source:'agent' (your own web research) but only on inferred/estimated claims, not observed. Returns the list of violations on failure.",
      inputSchema: submitInput,
    },
    async ({ report }) => {
      const res = await services.reports.submit(report as Report);
      return res.ok ? json({ saved: res.path }) : json({ errors: res.errors }, true);
    },
  );

  return server;
}
