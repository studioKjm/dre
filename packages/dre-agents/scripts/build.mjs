#!/usr/bin/env node
// dre-agents 패키지 빌드: 5개 내부 @dre/* 패키지를 한 번만 번들링해서 npm publish 단위를
// 하나로 만든다 (REA의 "npx 한 줄 설치" UX를 위해). puppeteer-core는 자체 설치 스크립트가
// 있어서 번들에 포함하지 않고 optionalDependencies로만 선언한다(package.json).
import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";

await rm(new URL("../dist", import.meta.url), { recursive: true, force: true });
await mkdir(new URL("../dist", import.meta.url), { recursive: true });

const common = {
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  // 우리 모노레포 안의 @dre/* 코드만 번들링한다 — 서드파티 패키지는 외부로 두고 package.json의
  // 진짜 npm 의존성으로 선언한다. 안 그러면 CJS 패키지를 ESM으로 번들링할 때 esbuild가
  // "Dynamic require is not supported" 오류를 내는 경우가 있다(실제로 확인함).
  external: ["puppeteer-core", "@modelcontextprotocol/sdk", "@modelcontextprotocol/sdk/*", "zod", "zod/*", "yaml", "adm-zip"],
  logLevel: "info",
};

await build({ ...common, entryPoints: ["../mcp/src/main.ts"], outfile: "dist/mcp-server.js" });
await build({ ...common, entryPoints: ["src/cli.ts"], outfile: "dist/cli.js" });

console.log("dre-agents build complete: dist/mcp-server.js, dist/cli.js");
