import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Report } from "@dre/core";
import type { Services } from "@dre/app";
import { collectInput, pricingInput, submitInput } from "./schemas.js";

export const SERVER_INFO = { name: "dre", version: "0.0.1" } as const;

/** 도구가 사용하는 서비스의 최소 형태. 테스트에서는 가짜 구현을 주입한다. */
export interface ToolServices {
  pricing: Pick<Services["pricing"], "collect">;
  appstore: Pick<Services["appstore"], "collect">;
  terms: Pick<Services["terms"], "collect">;
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
        "Fetch a pricing page (robots.txt respected) and return plan/price candidates with evidence. Set js=true for JS-rendered pages. You infer the business model from the result; do not treat candidates as verified facts.",
      inputSchema: pricingInput,
    },
    ({ url, js }) => guarded(() => services.pricing.collect(url, { js })),
  );

  server.registerTool(
    "collect_appstore",
    {
      title: "Collect app store in-app purchases",
      description: "Fetch an App Store or Google Play page and return in-app product names and prices with evidence. Google Play returns a price range only.",
      inputSchema: collectInput,
    },
    ({ url }) => guarded(() => services.appstore.collect(url)),
  );

  server.registerTool(
    "collect_terms",
    {
      title: "Collect terms and refund policy",
      description: "Find the terms/refund pages linked from a site and return billing, renewal, and refund passages with evidence.",
      inputSchema: collectInput,
    },
    ({ url }) => guarded(() => services.terms.collect(url)),
  );

  server.registerTool(
    "submit_report",
    {
      title: "Submit analysis report",
      description:
        "Validate and save a report. observed claims need evidence; estimated claims need a range, assumptions, and cannot be high confidence. Returns the list of violations on failure.",
      inputSchema: submitInput,
    },
    async ({ report }) => {
      const res = await services.reports.submit(report as Report);
      return res.ok ? json({ saved: res.path }) : json({ errors: res.errors }, true);
    },
  );

  return server;
}
