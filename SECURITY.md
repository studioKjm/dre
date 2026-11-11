# Security Policy

Report vulnerabilities privately to hello@pysirlabs.com — do not open a public issue for a
security problem.

## Scope

DRE only reads public pages and public APIs; it has no server component and holds no user
credentials. The main risks we care about are:
- SSRF via a collector fetching an attacker-supplied URL (see `packages/core/src/net.ts` for the
  private-address guard; `DRE_ALLOW_PRIVATE_NETWORK` disables it and is dev-only, never set it
  in a shared environment)
- Supply-chain issues in `dre-agents`' published npm bundle or its dependencies
- The MCP server's config-file writers (`dre-agents setup` for Cursor/Gemini CLI/Codex/Grok
  Build) corrupting or leaking something from a user's existing agent config
