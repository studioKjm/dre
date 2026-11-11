# Contributing

## Ground rules

- Sign off every commit (`git commit -s`) to agree to the [DCO](https://developercertificate.org/).
- Every `observed` claim in a report must carry evidence; see `packages/core/src/schema.ts`.
- Collectors must use official APIs or publicly accessible pages and respect robots.txt and platform terms.
- DRE never bypasses bot/CAPTCHA detection or login walls — report the block honestly instead
  (see `docs/adr.yaml` ADR-004/005/008). Fallback via archive.org is fine; evasion is not.
- Do not add collectors for personal data (individual accounts, reviewer identities).
- DRE never calls an LLM or search engine itself — it only collects; the calling agent infers
  (ADR-003). Don't add that back in.

## Dev setup

```sh
npm install
npm run build        # tsc -b across packages/{core,data,logic,app,cli,mcp}
npm test             # node:test against each package's dist/*.test.js
npm test -w dre-agents  # the publishable CLI package has its own test script (see below)
```

`packages/dre-agents` is intentionally outside the `tsc -b` project references — it's bundled
directly from TypeScript with esbuild (ADR-011), not type-checked against the other packages.
After changing anything under `packages/dre-agents/src/`, rebuild its bundle before testing it
manually: `cd packages/dre-agents && npm run build`.

## Before opening a PR

- Run the harness gates locally: `.harness/detect-violations.sh` (or the individual
  `.harness/gates/check-*.sh` scripts — see `.harness/gates/GATES.md`). CI runs all 7 default
  gates plus build+test on Node 20/22; a PR won't merge if any of them fail.
- Respect the 3-tier layer boundaries (Presentation → Logic → Data, no skipping, no reverse
  deps) — see `ARCHITECTURE_INVARIANTS.md` and `.harness/gates/rules/boundaries.yaml`.
- If the change is a non-trivial design decision (new collector, new claim type, a scoring or
  taxonomy change), add an entry to `docs/adr.yaml` explaining the context/decision/consequence.
  Skim a recent entry for the format.
- Write tests alongside the implementation, not after. Logic-layer code should have little to
  no mocking; data-layer code should hit the real external surface where practical.

## Adding a collector

A collector lives in `packages/logic/src/collectors/`, wraps a `packages/data/src/*.ts` fetcher,
and returns `Claim[]` with evidence. Look at `pricing.ts` or `techstack.ts` for the shape. New
collectors need a corresponding MCP tool in `packages/mcp/src/server.ts` + `schemas.ts`.
