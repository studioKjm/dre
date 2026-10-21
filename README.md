# DRE — Domain Reverse Engineering

Analyze the business and domain side of a reference site, platform, or product:
business model, positioning, marketing, ads, and domain info — with evidence and
explicit uncertainty on every claim. The business-side counterpart to
[REA](https://github.com/morluto/rea), which covers the technical side.

> Status: v0.0.1 scaffold. Collectors and analyzers are not implemented yet.

## Principles
1. Only directly observed facts are labeled `observed`; the rest is `inferred` or `estimated`.
2. Estimates are ranges with stated assumptions, never single numbers.
3. Works with public sources and your own LLM key (BYOK). No paid data required.

## Claim schema
Each claim has `type` (`observed | inferred | estimated`), `confidence`, `evidence[]`, `assumptions[]`.
See [`packages/core/src/schema.ts`](packages/core/src/schema.ts).

## Develop
```sh
npm install
npm test
node packages/cli/dist/index.js analyze https://example.com
```

## Roadmap
- v0.1: pricing / business model, positioning, marketing channels, ad creatives, tech stack summary, MCP server
- v0.2: traffic/revenue ranges via user-supplied external API keys
- v0.3: CPC/CTR/CVR/ROAS scenario estimates from stated benchmarks

## Intended use
Lawful market research, education, and improving your own product.
Not for scraping in violation of platform terms, impersonation, or fake reviews.

## License
Apache-2.0. See [LICENSE](LICENSE), [TRADEMARK.md](TRADEMARK.md).
