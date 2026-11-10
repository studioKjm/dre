# dre-agents

**DRE (Domain Reverse Engineering)** — business/revenue-model analysis MCP server for AI coding agents.
The business-side counterpart to [REA](https://github.com/morluto/rea), which covers technical reverse engineering.

> Status: early. 11 MCP tools for pricing, terms, tech stack, ad libraries, SEC/DART financial
> filings, pricing history, and job postings — see the main repo for details and caveats.

## Install

```sh
npx dre-agents setup
```

This auto-detects installed agents — [Claude Code](https://claude.com/claude-code), Cursor,
Gemini CLI, Codex, Grok Build — and registers the DRE MCP server with each. Open a new session
and tools like `collect_pricing`, `analyze_company`, `collect_financials` appear automatically.

Options:
- `npx dre-agents setup --agent=claude,cursor,gemini,codex,grok` — skip detection, target specific agents (or `--agent=all`)
- `npx dre-agents setup --project` — register Claude Code/Cursor/Grok Build for the current project only (default: all projects; Gemini CLI and Codex are user-scope only)

## What it does

Given a company's URL or domain, an agent can call DRE's tools to gather evidence — pricing pages,
terms of service, tech stack signatures, ad library counts, SEC/DART financial filings, pricing
history via archive.org, open job postings — and reason over it to produce a business-model
analysis. DRE collects; the calling agent infers. Every claim it submits must carry evidence,
and estimates must be ranges with stated assumptions, never single invented numbers.

## Principles

- DRE never bypasses robots.txt, bot detection, or login walls. If a site blocks collection, DRE
  reports that honestly instead of working around it.
- DRE never calls an LLM or search engine itself. All reasoning happens in the calling agent.
- Free to run: public APIs and archives only, no paid data sources.

## Optional: deeper integrations

- JS-rendered pages: install Chrome/Chromium, or `npm install -g puppeteer-core` separately.
- US public company financials: works out of the box (SEC EDGAR, no key needed).
- Korean public/large-private company financials: free API key from
  [opendart.fss.or.kr](https://opendart.fss.or.kr), set as `DRE_DART_API_KEY`.

## License

Apache-2.0
