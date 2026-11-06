#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const [cmd, ...rest] = process.argv.slice(2);
const mcpServerPath = fileURLToPath(new URL("./mcp-server.js", import.meta.url));

function hasClaudeCli(): boolean {
  try {
    execFileSync("claude", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** REA의 `npx rea-agents setup`과 같은 자리 — Claude Code에 DRE MCP 서버를 등록한다. */
function setup(): void {
  if (!hasClaudeCli()) {
    console.error("Claude Code CLI('claude')를 찾을 수 없습니다. https://claude.com/claude-code 설치 후 다시 시도하세요.");
    process.exit(1);
  }
  const scope = rest.includes("--project") ? "project" : "user";
  console.log(`DRE MCP 서버를 Claude Code에 등록합니다 (scope: ${scope})...`);
  try {
    execFileSync(
      "claude",
      ["mcp", "add", "dre", "-s", scope, "-e", `DRE_REPORTS_DIR=${process.cwd()}/reports`, "--", "node", mcpServerPath],
      { stdio: "inherit" },
    );
    console.log("\n완료. 새 Claude Code 세션을 열면 DRE 도구(collect_pricing 등)가 보입니다.");
    console.log("DART(한국 금융감독원) 연동을 쓰려면 DRE_DART_API_KEY 환경변수를 설정하세요 (무료 가입: opendart.fss.or.kr).");
  } catch {
    console.error("등록에 실패했습니다. 이미 등록돼 있다면 'claude mcp remove dre -s " + scope + "' 후 다시 시도하세요.");
    process.exit(1);
  }
}

function runMcpServer(): void {
  execFileSync(process.execPath, [mcpServerPath, ...rest], { stdio: "inherit" });
}

switch (cmd) {
  case "setup":
    setup();
    break;
  case "mcp":
    runMcpServer();
    break;
  default:
    console.log("사용법: dre-agents <setup|mcp>");
    console.log("  setup  Claude Code에 DRE MCP 서버를 등록합니다 (--project로 프로젝트 범위 등록)");
    console.log("  mcp    MCP 서버를 직접 실행합니다 (보통 setup이 자동으로 연결하므로 직접 쓸 일은 적습니다)");
    process.exit(cmd ? 1 : 0);
}
