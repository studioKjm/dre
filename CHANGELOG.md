# Changelog

Format loosely follows [Keep a Changelog](https://keepachangelog.com/). No version has been
tagged yet — everything below is unreleased, pre-1.0 work on `master`. Once releases start,
new entries land under a version heading (see `docs/adr.yaml` ADR-011 for the publishing setup).

## [Unreleased]

### Added
- Core claim schema (`observed`/`inferred`/`estimated`, evidence, assumptions) and the
  10-label revenue-model taxonomy with precise definitions (`packages/core/src/labels.ts`)
- Collectors: pricing (with pricing-page auto-discovery and archive.org fallback), terms,
  app store, tech stack, Google Ads Transparency, SEC EDGAR, DART (Korean FSS), price history
  (archive.org CDX), job boards (Greenhouse/Lever)
- `analyze_company` orchestrator tool combining pricing+terms+techstack+ads in one call
- 11 MCP tools exposed via `packages/mcp`, installable with `npx dre-agents setup`
- Multi-agent setup: auto-detects and registers with Claude Code, Cursor, Gemini CLI, Codex,
  and Grok Build (`--agent=`/`--project` flags)
- `dre-agents` published to npm as a single esbuild-bundled package
- GitHub Actions CI: all 7 default harness gates (secrets/boundaries/structure/spec/layers/
  security/deps) plus build+test on Node 20.x/22.x
- Automated tests for the `dre-agents` CLI itself (TOML/JSON config writers, agent selection)
- `examples/` — a golden-path run and an honest-failure (bot-blocked) run

### Fixed
- AC-008 eval scoring counted the secondary `in-app-purchase` label against the core
  revenue-model match score, contrary to its own documented recommendation; excluding it moved
  the measured score from 71.5% to 77.0% on the same reports/gold (see ADR-017)
- Ad-count regex missed exact/zero counts ("광고 0개") that don't use "약" ("about")
- SEC EDGAR 403s from a non-email-shaped default `User-Agent`
- 9 high-severity transitive `npm audit` findings via a `puppeteer-core` bump (24→25,
  non-breaking); `check-security.sh`'s built-in patterns had two false positives
  (`RegExp.exec()` read as `child_process.exec`, a `testing.ts` fixture named `allowAll` read
  as a Spring `@PermitAll` bypass)

### Changed
- Taxonomy: `subscription` vs `in-app-purchase`/`transaction-fee` scope clarified after
  independent-labeler disagreement on Substack-like platforms (ADR-002)

See `docs/adr.yaml` for the full set of architecture decisions behind each change, and
`.harness/ouroboros/evaluations/` for the AC-008 accuracy history.
