#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServices } from "@dre/app";
import { createDreServer } from "./server.js";

// stdout은 MCP 프로토콜 전용이다. 로그는 stderr로만 출력한다.
const services = createServices({ reportsDir: process.env.DRE_REPORTS_DIR ?? "reports" });
await createDreServer(services).connect(new StdioServerTransport());
console.error("dre mcp server ready");
