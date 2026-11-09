# DRE — Domain Reverse Engineering

[![CI](https://github.com/studioKjm/dre/actions/workflows/ci.yml/badge.svg)](https://github.com/studioKjm/dre/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/dre-agents?color=cb3837)](https://www.npmjs.com/package/dre-agents)

Analyze the business and domain side of a reference site, platform, or product:
business model, positioning, marketing, ads, tech stack, financials, and pricing history —
with evidence and explicit uncertainty on every claim. The business-side counterpart to
[REA](https://github.com/morluto/rea), which covers the technical side.

> Status: pre-release. 11 MCP tools built and tested; AC-008 (independent accuracy benchmark)
> is still pending real user labeling. See `docs/adr.yaml` for the design decisions behind
> each feature and `.harness/ouroboros/` for the spec/eval history.

## Install

```sh
npx dre-agents setup
```

Auto-detects installed agents (Claude Code, Cursor, Gemini CLI, Codex) and registers the DRE
MCP server with each. Open a new session and the tools below appear automatically.

Options:
- `npx dre-agents setup --agent=claude,cursor,gemini,codex` — skip detection, target specific agents (or `--agent=all`)
- `npx dre-agents setup --project` — register Claude Code/Cursor for the current project only (default: all projects; Gemini CLI and Codex are user-scope only)

## Tools

| Tool | What it does | Blocking resistance |
|---|---|---|
| `analyze_company` | pricing + terms + tech stack + ads in one call, from just a domain | — |
| `collect_pricing` | plan/price text; auto-discovers the pricing page from a home URL | archive.org fallback on bot blocks |
| `collect_terms` | billing/refund passages, following same- and cross-origin links | medium |
| `collect_appstore` | iOS/Play in-app purchase listings | high |
| `collect_techstack` | frameworks, CMS, payment/analytics scripts from headers+HTML | very high (can't be blocked without breaking the page) |
| `collect_ad_library` | Google Ads Transparency Center ad counts | high (Google only — Meta is excluded, see below) |
| `collect_financials` | SEC EDGAR revenue/net income (US public companies) | high (free, no key) |
| `collect_financials_kr` | DART (Korean FSS) revenue/net income | high (free, needs your own API key) |
| `collect_price_history` | pricing over time via archive.org snapshots | — (REA has no equivalent) |
| `collect_jobs` | open postings via Greenhouse/Lever | very high |
| `submit_report` | validates and saves a claim-based report | — |

## Principles
1. Only directly observed facts are labeled `observed`; the rest is `inferred` or `estimated`.
2. Estimates are ranges with stated assumptions, never single numbers.
3. Works with public sources and your own LLM key (BYOK). No paid data required.
4. DRE never bypasses robots.txt, bot/CAPTCHA detection, or login walls — see `docs/adr.yaml`
   ADR-004/005 for why (and why Meta's ad library is deliberately not covered: facebook.com's
   robots.txt specifically disallows `ClaudeBot`).
5. DRE never calls an LLM or search engine itself. When a collector is blocked, the calling
   agent may supplement with its own research, but must mark it `source: "agent"` and
   `inferred`/`estimated` — never `observed` (ADR-003).

## Claim schema
Each claim has `type` (`observed | inferred | estimated`), `confidence`, `evidence[]` (each with
an optional `source: "dre" | "agent"`), `assumptions[]`. Revenue-model labels are a fixed taxonomy
with precise definitions — see [`packages/core/src/labels.ts`](packages/core/src/labels.ts) and
[`packages/core/src/schema.ts`](packages/core/src/schema.ts).

## Develop
```sh
npm install
npm test
node packages/cli/dist/index.js eval reports benchmarks/gold   # AC-008 accuracy check
```

To rebuild the publishable `dre-agents` bundle after changing any package:
```sh
cd packages/dre-agents && npm run build
```

## Optional environment variables
- `DRE_DART_API_KEY` — free key from opendart.fss.or.kr, enables `collect_financials_kr`
- `DRE_SEC_USER_AGENT` — your own "org contact@email" string for SEC EDGAR (recommended over the default)
- `DRE_CHROME_PATH` — Chrome/Chromium path, for JS-rendered pages (`collect_pricing` with `js: true`)
- `DRE_ALLOW_PRIVATE_NETWORK=1` — local dev/testing only; disables the SSRF guard

## Roadmap
- Done: pricing/terms/appstore/techstack/ad-library/financials(US+KR)/price-history/jobs collectors, analyze_company orchestrator, npm packaging prep
- Next: traffic/CPC/CTR/CVR/ROAS scenario estimates (user-supplied external API keys, stated assumptions — see non_goals in `.harness/ouroboros/seeds/seed-v1.yaml` for what DRE deliberately does not do)
