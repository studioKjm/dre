# Examples

Two real runs from this project's own development, kept as-is (not cleaned up or cherry-picked
for a better result) to show what DRE actually produces, including when it fails honestly.

## 1. Golden path — Notion

Prompt to the agent: *"analyze_company for notion.com, then tell me its revenue model."*

`analyze_company` ran pricing + terms + tech stack + ad-library collection and returned, among
others, these evidence-backed claims:

```json
{
  "claim": "[freemium] Free 플랜과 유료 플랜이 함께 제공된다 (Free, 좌석당 월 요금)",
  "type": "observed",
  "confidence": "high",
  "evidence": [{
    "url": "https://www.notion.com/pricing",
    "snapshot": "Free₩0 per seat/monthSign up\nPlus₩14,000 per seat/monthGet started\nBusiness₩30,000 per seat/monthGet started ...",
    "retrievedAt": "2026-10-23T01:58:18.771Z"
  }],
  "assumptions": []
}
```

```json
{
  "claim": "[in-app-purchase] iOS 인앱 결제로 Plus/Business 구독이 판매된다",
  "type": "observed",
  "confidence": "high",
  "evidence": [{
    "url": "https://apps.apple.com/us/app/notion-notes-tasks-ai/id1232780281",
    "snapshot": "Notion – Plus Monthly: $11.99\nNotion Business: $23.99\n...",
    "retrievedAt": "2026-10-23T01:58:21.020Z"
  }],
  "assumptions": []
}
```

Final `revenueModelLabels`: `["freemium", "subscription", "usage-based", "in-app-purchase", "enterprise-sales"]`
— each backed by its own evidence snapshot and source URL, not asserted from general knowledge
about Notion.

## 2. Honest failure — Cafe24 (bot-challenge detection)

Prompt: *"collect_pricing for cafe24.com"*

Cafe24's homepage serves a CAPTCHA/bot-challenge page instead of real content. DRE does not try
to bypass it (see `docs/adr.yaml` ADR-004/005/008) — it detects the challenge pattern and reports
that collection failed, instead of silently returning an empty result that looks like "no pricing
info exists":

```json
{
  "target": "https://www.cafe24.com/",
  "revenueModelLabels": [],
  "sections": {
    "business-model": [{
      "claim": "[수집 상태] page appears to be a CAPTCHA/bot-challenge screen (matched /보안\\s*문자/), not real content — results are empty, not just missing prices",
      "type": "inferred",
      "confidence": "low",
      "evidence": [{ "url": "https://www.cafe24.com/", "retrievedAt": "2026-10-29T10:18:16.164Z", "source": "dre" }],
      "assumptions": []
    }]
  }
}
```

The calling agent can then fall back to its own research for this one target (marking it
`source: "agent"`, never `observed`) — see ADR-003 — rather than DRE quietly making something up
or circumventing the block.
