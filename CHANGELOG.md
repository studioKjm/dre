# Changelog

Format loosely follows [Keep a Changelog](https://keepachangelog.com/). No version has been
tagged yet — everything below is unreleased, pre-1.0 work on `master`. Once releases start,
new entries land under a version heading (see `docs/adr.yaml` ADR-011 for the publishing setup).

## [Unreleased]

### Investigated and declined
- Expanding mutation testing to `packages/data`: a trial run hit 1049/1272 mutants timing out
  over 38 minutes (vs. 51 seconds for `packages/core` alone), because `browser.test.ts` launches
  real Chrome with 20s-per-test timeouts and a broken-by-mutation `browser.ts` repeatedly stalls
  near that timeout across hundreds of mutants. Reverted to `packages/core`-only (no net diff in
  `stryker.config.json`); see ADR-031 for what would need to change first (excluding `browser.ts`
  from mutation, or a cheaper test runner) before this is worth attempting again

### Added
- `collect_structured_data`: reads schema.org `Organization`/`Product` JSON-LD
  (`<script type="application/ld+json">`) that sites already embed for SEO — employee-count
  range, founding date, industry, and an independent price/currency/availability check against
  `collect_pricing`. Static fetch only (no JS rendering needed), archive.org fallback on bot
  blocks (same pattern as `collect_pricing`/`collect_terms`). 12th MCP tool. See ADR-032 and
  `.harness/ouroboros/seeds/seed-structured-data-v1.yaml`
- `.github/dependabot.yml` (npm workspace root + github-actions, weekly, minor/patch grouped)
  and `.github/ISSUE_TEMPLATE/` (bug report, feature request, security-report redirect) — repo
  hygiene that was just missing, not a design decision

### Changed
- `packages/core` mutation score: 80.17% -> 84.84%, driven by `text.ts`'s score going from
  56.67% to 83.33% (it was the weakest file called out when Stryker was first introduced).
  14 new tests closed real gaps — entity-decoding table coverage, numeric entity precision,
  and several block-tag regex cases that the first pass of tests accidentally masked by always
  pairing them with another tag that supplied the same line break (see ADR-030)
- AC-008 accuracy: 83.7% -> 87.4%, passing the 85% target for the first time. Driven by the
  three collector fixes below plus re-running the independent-labeler process (3 subagents with
  no access to benchmarks/gold/, one per weak target) on the newly-recovered evidence — see
  `.harness/ouroboros/evaluations/ac-008-provisional-2026-11-21.yaml` for the full breakdown

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
- `collect_terms` had no archive.org fallback at all (unlike `collect_pricing`, which already
  had one) — a blocked home page (e.g. coupang.com's 403) failed the whole collector instead of
  degrading gracefully, and even after adding a home-page fallback, a candidate terms link that
  403s on the live site (while the home page itself was only recoverable via archive.org) still
  killed the whole result. Both are now handled the same way `collect_pricing` handles them: the
  home page falls back to archive.org, and an individual blocked candidate link is skipped with
  a warning instead of aborting everything already found (see ADR-029)
- `dre analyze <url>` was a stub that always printed an empty report regardless of the target
  (a placeholder left over from before the collectors were wired up) — it now actually calls
  `CompanyAnalyzer` and prints the raw collector snapshot as JSON. It still doesn't produce a
  labeled claim-based report the way `analyze_company` does when called by an agent — DRE never
  labels claims itself (ADR-003) — but it's real data instead of always-empty markdown (see
  ADR-028)
- `collect_techstack` actually failed outright on the exact case its "can't be blocked" claim
  is about: a 4xx/5xx block response's headers (e.g. a WAF's `server` header) were discarded
  before the collector ever saw them, because the shared fetcher threw on any error status
  before reading headers. Found live-testing coupang.com (403, `server: AkamaiGHost` — also
  added as a new signature); fixed via an opt-in `allowErrorStatus` fetch mode used only by
  `collect_techstack` (see ADR-027)
- `collect_pricing`'s automatic JS-rendering retry (for SPA pages that return no price-like
  text statically) could throw on any error other than `BrowserUnavailable`/`AutomationBlocked`
  — e.g. a plain navigation timeout on a slow page with heavy tracking scripts — discarding an
  already-successful static fetch result and reporting the whole collector as failed instead of
  degrading gracefully with a warning (found live-testing duolingo.com, see ADR-026)
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
