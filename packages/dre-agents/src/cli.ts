#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [cmd, ...rest] = process.argv.slice(2);
const mcpServerPath = fileURLToPath(new URL("./mcp-server.js", import.meta.url));
const reportsDir = `${process.cwd()}/reports`;

function hasCli(bin: string): boolean {
  try {
    execFileSync(bin, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** REA의 `npx rea-agents setup`과 같은 자리 — DRE MCP 서버를 agent별 설정에 등록한다. */
function setup(): void {
  const scope = rest.includes("--project") ? "project" : "user";
  const agentArg = rest.find((a) => a.startsWith("--agent="))?.split("=")[1];
  const requested = agentArg ? agentArg.split(",") : null;

  const agents: { name: string; detect: () => boolean; register: () => void }[] = [
    { name: "claude", detect: () => hasCli("claude"), register: () => registerClaudeCode(scope) },
    { name: "cursor", detect: () => existsSync(join(homedir(), ".cursor")), register: () => registerCursor(scope) },
    { name: "gemini", detect: () => existsSync(join(homedir(), ".gemini")) || hasCli("gemini"), register: () => registerGemini() },
    { name: "codex", detect: () => existsSync(join(homedir(), ".codex")) || hasCli("codex"), register: () => registerCodex() },
    { name: "grok", detect: () => existsSync(join(homedir(), ".grok")) || hasCli("grok"), register: () => registerGrok(scope) },
  ];

  const targets = requested
    ? requested.includes("all")
      ? agents
      : agents.filter((a) => requested.includes(a.name))
    : agents.filter((a) => a.detect());

  if (targets.length === 0) {
    console.error(
      requested
        ? `알 수 없는 --agent 값입니다. 지원: ${agents.map((a) => a.name).join(", ")}, all`
        : "설치된 에이전트(Claude Code / Cursor / Gemini CLI / Codex / Grok Build)를 찾지 못했습니다. " +
            "--agent=claude|cursor|gemini|codex|grok|all 로 직접 지정하세요.",
    );
    process.exit(1);
  }

  const results: { name: string; ok: boolean }[] = [];
  for (const agent of targets) {
    try {
      agent.register();
      results.push({ name: agent.name, ok: true });
    } catch (err) {
      console.error(`[${agent.name}] 등록 실패: ${err instanceof Error ? err.message : err}`);
      results.push({ name: agent.name, ok: false });
    }
  }

  console.log("");
  for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name}`);
  console.log("\n등록된 에이전트를 새 세션으로 열면 DRE 도구(collect_pricing 등)가 보입니다.");
  console.log("DART(한국 금융감독원) 연동을 쓰려면 DRE_DART_API_KEY 환경변수를 설정하세요 (무료 가입: opendart.fss.or.kr).");

  if (results.some((r) => !r.ok)) process.exit(1);
}

function registerClaudeCode(scope: "user" | "project"): void {
  console.log(`[claude] DRE MCP 서버를 등록합니다 (scope: ${scope})...`);
  try {
    execFileSync(
      "claude",
      ["mcp", "add", "dre", "-s", scope, "-e", `DRE_REPORTS_DIR=${reportsDir}`, "--", "node", mcpServerPath],
      { stdio: "inherit" },
    );
  } catch {
    throw new Error(`이미 등록돼 있다면 'claude mcp remove dre -s ${scope}' 후 다시 시도하세요.`);
  }
}

/** Cursor/Gemini CLI 공통 설정 형식: { mcpServers: { <name>: { command, args, env } } } */
function writeJsonMcpConfig(configPath: string, serverName: string, serverConfig: Record<string, unknown>): void {
  mkdirSync(dirname(configPath), { recursive: true });

  let config: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    const raw = readFileSync(configPath, "utf-8");
    try {
      config = JSON.parse(raw);
      copyFileSync(configPath, `${configPath}.bak`);
    } catch {
      copyFileSync(configPath, `${configPath}.bak-corrupt-${Date.now()}`);
      console.warn(`[경고] ${configPath} 파싱 실패 — 백업 후 새로 씁니다.`);
      config = {};
    }
  }

  const mcpServers = (config.mcpServers as Record<string, unknown> | undefined) ?? {};
  mcpServers[serverName] = serverConfig;
  config.mcpServers = mcpServers;

  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

function registerCursor(scope: "user" | "project"): void {
  const configPath = scope === "project" ? join(process.cwd(), ".cursor", "mcp.json") : join(homedir(), ".cursor", "mcp.json");
  console.log(`[cursor] DRE MCP 서버를 등록합니다 (${configPath})...`);
  writeJsonMcpConfig(configPath, "dre", {
    command: "node",
    args: [mcpServerPath],
    env: { DRE_REPORTS_DIR: reportsDir },
  });
}

function registerGemini(): void {
  const configPath = join(homedir(), ".gemini", "settings.json");
  console.log(`[gemini] DRE MCP 서버를 등록합니다 (${configPath})... (프로젝트 범위는 지원하지 않습니다)`);
  writeJsonMcpConfig(configPath, "dre", {
    command: "node",
    args: [mcpServerPath],
    env: { DRE_REPORTS_DIR: reportsDir },
  });
}

/**
 * Codex CLI는 설정이 TOML(~/.codex/config.toml)이다. 범용 파서 없이, 우리가 쓰는
 * `[mcp_servers.dre]` 테이블 하나만 찾아서 교체하거나 끝에 덧붙인다 — 다음 `[`로
 * 시작하는 줄 전까지를 "우리 테이블"로 보고, 그 밖의 내용은 손대지 않는다.
 */
function tomlValue(val: unknown): string {
  if (typeof val === "string") return JSON.stringify(val);
  if (Array.isArray(val)) return `[${val.map(tomlValue).join(", ")}]`;
  if (val && typeof val === "object") {
    const entries = Object.entries(val as Record<string, unknown>).map(([k, v]) => `${k} = ${tomlValue(v)}`);
    return `{ ${entries.join(", ")} }`;
  }
  return String(val);
}

function upsertTomlTable(configPath: string, tableName: string, fields: Record<string, unknown>): void {
  mkdirSync(dirname(configPath), { recursive: true });

  let lines: string[] = [];
  if (existsSync(configPath)) {
    copyFileSync(configPath, `${configPath}.bak`);
    lines = readFileSync(configPath, "utf-8").split("\n");
  }

  const header = `[${tableName}]`;
  const block = [header, ...Object.entries(fields).map(([k, v]) => `${k} = ${tomlValue(v)}`)];

  const startIdx = lines.findIndex((l) => l.trim() === header);
  let newLines: string[];
  if (startIdx === -1) {
    const existing = lines.join("\n").replace(/\s+$/, "");
    newLines = (existing ? [...existing.split("\n"), ""] : []).concat(block);
  } else {
    let endIdx = startIdx + 1;
    while (endIdx < lines.length && !lines[endIdx].trim().startsWith("[")) endIdx++;
    newLines = [...lines.slice(0, startIdx), ...block, ...lines.slice(endIdx)];
  }

  writeFileSync(configPath, `${newLines.join("\n").replace(/\s+$/, "")}\n`);
}

function registerCodex(): void {
  const configPath = join(homedir(), ".codex", "config.toml");
  console.log(`[codex] DRE MCP 서버를 등록합니다 (${configPath})... (프로젝트 범위는 지원하지 않습니다)`);
  upsertTomlTable(configPath, "mcp_servers.dre", {
    command: "node",
    args: [mcpServerPath],
    env: { DRE_REPORTS_DIR: reportsDir },
  });
}

/**
 * Grok Build도 config.toml의 [mcp_servers.<name>] 테이블이라 Codex와 같은
 * upsertTomlTable()을 그대로 쓴다. 공식 문서 기준 프로젝트 범위(.grok/config.toml)가
 * 사용자 범위를 완전히 덮어쓰므로(병합 아님) 우리도 테이블 단위 전체 교체면 충분하다.
 */
function registerGrok(scope: "user" | "project"): void {
  const configPath = scope === "project" ? join(process.cwd(), ".grok", "config.toml") : join(homedir(), ".grok", "config.toml");
  console.log(`[grok] DRE MCP 서버를 등록합니다 (${configPath})...`);
  upsertTomlTable(configPath, "mcp_servers.dre", {
    command: "node",
    args: [mcpServerPath],
    env: { DRE_REPORTS_DIR: reportsDir },
  });
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
    console.log("  setup  DRE MCP 서버를 에이전트에 등록합니다");
    console.log("           --project           Claude Code/Cursor/Grok Build를 프로젝트 범위로 등록 (기본: 사용자 범위)");
    console.log("           --agent=<목록|all>   설치 감지를 건너뛰고 claude,cursor,gemini,codex,grok 중 지정 (쉼표 구분)");
    console.log("  mcp    MCP 서버를 직접 실행합니다 (보통 setup이 자동으로 연결하므로 직접 쓸 일은 적습니다)");
    process.exit(cmd ? 1 : 0);
}
