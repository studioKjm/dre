import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  registerClaudeCode,
  registerCodex,
  registerCursor,
  registerGemini,
  registerGrok,
  selectAgents,
  tomlValue,
  upsertTomlTable,
  writeJsonMcpConfig,
} from "./cli.js";

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "dre-cli-test-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** registerCursor/Gemini/Codex/Grok는 homedir()을 직접 쓴다 — 실제 홈을 건드리지 않도록
 * HOME을 임시 디렉터리로 바꿔서 돌리고 항상 원래 값으로 되돌린다. */
function withTempHome<T>(fn: (home: string) => T): T {
  return withTempDir((home) => {
    const original = process.env.HOME;
    process.env.HOME = home;
    try {
      return fn(home);
    } finally {
      if (original === undefined) delete process.env.HOME;
      else process.env.HOME = original;
    }
  });
}

/** registerCursor/Grok의 --project 경로는 process.cwd()를 쓴다 — 임시 디렉터리로 chdir한다. */
function withTempCwd<T>(fn: (cwd: string) => T): T {
  return withTempDir((cwd) => {
    const original = process.cwd();
    process.chdir(cwd);
    try {
      return fn(cwd);
    } finally {
      process.chdir(original);
    }
  });
}

test("tomlValue quotes strings, renders arrays and inline tables", () => {
  assert.equal(tomlValue("/path/to/x"), '"/path/to/x"');
  assert.equal(tomlValue(["a", "b"]), '["a", "b"]');
  assert.equal(tomlValue({ KEY: "value" }), '{ KEY = "value" }');
});

test("upsertTomlTable creates a fresh file when none exists", () => {
  withTempDir((dir) => {
    const configPath = join(dir, "config.toml");
    upsertTomlTable(configPath, "mcp_servers.dre", { command: "node", args: ["/x.js"] });
    const content = readFileSync(configPath, "utf-8");
    assert.match(content, /^\[mcp_servers\.dre\]\ncommand = "node"\nargs = \["\/x\.js"\]\n$/);
  });
});

test("upsertTomlTable appends after existing unrelated tables, preserving them", () => {
  withTempDir((dir) => {
    const configPath = join(dir, "config.toml");
    writeFileSync(configPath, '[mcp_servers.other]\ncommand = "python"\n\n[sandbox]\nmode = "workspace-write"\n');
    upsertTomlTable(configPath, "mcp_servers.dre", { command: "node" });
    const content = readFileSync(configPath, "utf-8");
    assert.match(content, /\[mcp_servers\.other\]/);
    assert.match(content, /\[sandbox\]/);
    assert.match(content, /\[mcp_servers\.dre\]\ncommand = "node"\n$/);
  });
});

test("upsertTomlTable re-run replaces its own block in place (idempotent, no duplicates)", () => {
  withTempDir((dir) => {
    const configPath = join(dir, "config.toml");
    upsertTomlTable(configPath, "mcp_servers.dre", { command: "node", args: ["/old.js"] });
    upsertTomlTable(configPath, "mcp_servers.dre", { command: "node", args: ["/new.js"] });
    const content = readFileSync(configPath, "utf-8");
    assert.equal(content.match(/\[mcp_servers\.dre\]/g)?.length, 1);
    assert.match(content, /\/new\.js/);
    assert.doesNotMatch(content, /\/old\.js/);
  });
});

test("upsertTomlTable backs up the previous file to <file>.bak", () => {
  withTempDir((dir) => {
    const configPath = join(dir, "config.toml");
    writeFileSync(configPath, 'model = "o3"\n');
    upsertTomlTable(configPath, "mcp_servers.dre", { command: "node" });
    assert.equal(readFileSync(`${configPath}.bak`, "utf-8"), 'model = "o3"\n');
  });
});

test("writeJsonMcpConfig creates mcpServers on a fresh file", () => {
  withTempDir((dir) => {
    const configPath = join(dir, "mcp.json");
    writeJsonMcpConfig(configPath, "dre", { command: "node", args: ["/x.js"] });
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    assert.deepEqual(config.mcpServers.dre, { command: "node", args: ["/x.js"] });
  });
});

test("writeJsonMcpConfig merges in place, preserving unrelated keys and servers", () => {
  withTempDir((dir) => {
    const configPath = join(dir, "settings.json");
    writeFileSync(configPath, JSON.stringify({ theme: "dark", mcpServers: { other: { command: "python" } } }));
    writeJsonMcpConfig(configPath, "dre", { command: "node" });
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    assert.equal(config.theme, "dark");
    assert.deepEqual(config.mcpServers.other, { command: "python" });
    assert.deepEqual(config.mcpServers.dre, { command: "node" });
  });
});

test("writeJsonMcpConfig quarantines an unparseable file instead of discarding it", () => {
  withTempDir((dir) => {
    const configPath = join(dir, "mcp.json");
    writeFileSync(configPath, "{ not valid json");
    writeJsonMcpConfig(configPath, "dre", { command: "node" });
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    assert.deepEqual(config.mcpServers.dre, { command: "node" });
    const quarantined = readdirSync(dir).find((f) => f.includes(".bak-corrupt-"));
    assert.ok(quarantined, "expected a .bak-corrupt-<timestamp> file");
    assert.equal(readFileSync(join(dir, quarantined!), "utf-8"), "{ not valid json");
  });
});

test("selectAgents auto-detects (requested=null) by calling each agent's detect()", () => {
  const agents = [
    { name: "a", detect: () => true, register: () => {} },
    { name: "b", detect: () => false, register: () => {} },
  ];
  assert.deepEqual(selectAgents(agents, null).map((a) => a.name), ["a"]);
});

test("selectAgents with --agent=all ignores detect() and returns everything", () => {
  const agents = [
    { name: "a", detect: () => false, register: () => {} },
    { name: "b", detect: () => false, register: () => {} },
  ];
  assert.deepEqual(selectAgents(agents, ["all"]).map((a) => a.name), ["a", "b"]);
});

test("selectAgents with an explicit list ignores detect() and filters by name", () => {
  const agents = [
    { name: "a", detect: () => false, register: () => {} },
    { name: "b", detect: () => false, register: () => {} },
    { name: "c", detect: () => false, register: () => {} },
  ];
  assert.deepEqual(selectAgents(agents, ["b", "c"]).map((a) => a.name), ["b", "c"]);
});

test("selectAgents with an unknown name returns an empty list", () => {
  const agents = [{ name: "a", detect: () => true, register: () => {} }];
  assert.deepEqual(selectAgents(agents, ["nonexistent"]), []);
});

test("registerClaudeCode calls claude mcp add with the scope and MCP server path, via the injected exec", () => {
  const calls: unknown[] = [];
  registerClaudeCode("project", ((...args: unknown[]) => calls.push(args)) as typeof import("node:child_process").execFileSync);
  const [bin, cmdArgs] = calls[0] as [string, string[]];
  assert.equal(bin, "claude");
  assert.deepEqual(cmdArgs.slice(0, 4), ["mcp", "add", "dre", "-s"]);
  assert.equal(cmdArgs[4], "project");
  assert.ok(cmdArgs.includes("node"));
  assert.ok(cmdArgs.some((a) => a.startsWith("DRE_REPORTS_DIR=")));
});

test("registerClaudeCode wraps a failure with a friendly 'already registered' hint, not the raw error", () => {
  const throwingExec = (() => {
    throw new Error("exit code 1");
  }) as typeof import("node:child_process").execFileSync;
  assert.throws(() => registerClaudeCode("user", throwingExec), /claude mcp remove dre -s user/);
});

test("registerCursor (user scope) writes to ~/.cursor/mcp.json", () => {
  withTempHome((home) => {
    registerCursor("user");
    const config = JSON.parse(readFileSync(join(home, ".cursor", "mcp.json"), "utf-8"));
    assert.equal(config.mcpServers.dre.command, "node");
  });
});

test("registerCursor (project scope) writes to <cwd>/.cursor/mcp.json instead", () => {
  withTempCwd((cwd) => {
    registerCursor("project");
    const config = JSON.parse(readFileSync(join(cwd, ".cursor", "mcp.json"), "utf-8"));
    assert.equal(config.mcpServers.dre.command, "node");
  });
});

test("registerGemini always writes to ~/.gemini/settings.json (no project scope)", () => {
  withTempHome((home) => {
    registerGemini();
    const config = JSON.parse(readFileSync(join(home, ".gemini", "settings.json"), "utf-8"));
    assert.equal(config.mcpServers.dre.command, "node");
  });
});

test("registerCodex writes a [mcp_servers.dre] table to ~/.codex/config.toml", () => {
  withTempHome((home) => {
    registerCodex();
    const toml = readFileSync(join(home, ".codex", "config.toml"), "utf-8");
    assert.match(toml, /\[mcp_servers\.dre\]/);
    assert.match(toml, /command = "node"/);
  });
});

test("registerGrok (user scope) writes to ~/.grok/config.toml", () => {
  withTempHome((home) => {
    registerGrok("user");
    const toml = readFileSync(join(home, ".grok", "config.toml"), "utf-8");
    assert.match(toml, /\[mcp_servers\.dre\]/);
  });
});

test("registerGrok (project scope) writes to <cwd>/.grok/config.toml instead", () => {
  withTempCwd((cwd) => {
    registerGrok("project");
    const toml = readFileSync(join(cwd, ".grok", "config.toml"), "utf-8");
    assert.match(toml, /\[mcp_servers\.dre\]/);
  });
});
