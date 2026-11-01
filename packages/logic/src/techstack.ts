import type { RawPage } from "@dre/core";

export type TechCategory = "framework" | "cms" | "ecommerce" | "payment" | "cdn-hosting" | "analytics" | "support-widget";

export interface TechSignal {
  name: string;
  category: TechCategory;
  /** 실제로 매치된 헤더 값 또는 본문 조각 (근거) */
  evidenceText: string;
}

interface Rule {
  name: string;
  category: TechCategory;
  /** 헤더 키 이름(소문자). valuePattern이 없으면 존재만으로 매치 */
  header?: { key: string; valuePattern?: RegExp };
  bodyPattern?: RegExp;
}

// 서버가 평소 응답에 이미 포함시키는 헤더/HTML 조각만 본다 — 숨길 수 없는 신호라 봇 차단으로
// 막히지 않는다. Wappalyzer류의 유료/독점 지문 DB를 쓰지 않고, 널리 알려진 공개 사실
// (예: Next.js 앱은 __NEXT_DATA__를 심는다, Shopify 스토어는 cdn.shopify.com을 로드한다)만
// 직접 정리한 작은 집합이다. 결제·전자상거래 스크립트는 수익모델 추론에도 직접 쓸모가 있다
// (예: js.stripe.com이 보이면 transaction-fee 주장의 보조 근거가 된다).
const RULES: Rule[] = [
  { name: "Next.js", category: "framework", bodyPattern: /__NEXT_DATA__|\/_next\/static\// },
  { name: "Nuxt", category: "framework", bodyPattern: /window\.__NUXT__|\/_nuxt\// },
  { name: "React", category: "framework", bodyPattern: /data-reactroot|react-dom(?:\.production)?\.min\.js/ },
  { name: "Vue.js", category: "framework", bodyPattern: /data-v-app|\/vue(?:\.global)?(?:\.prod)?\.js/ },
  { name: "WordPress", category: "cms", bodyPattern: /<meta[^>]+name=["']generator["'][^>]+content=["']WordPress/i },
  { name: "Shopify", category: "ecommerce", bodyPattern: /cdn\.shopify\.com|Shopify\.theme/ },
  { name: "Webflow", category: "cms", bodyPattern: /assets-global\.website-files\.com|data-wf-page=/ },
  { name: "Stripe", category: "payment", bodyPattern: /js\.stripe\.com/ },
  { name: "PayPal Checkout", category: "payment", bodyPattern: /paypal\.com\/sdk\/js/ },
  { name: "Google Analytics", category: "analytics", bodyPattern: /googletagmanager\.com\/gtag|google-analytics\.com\/analytics\.js/ },
  { name: "Segment", category: "analytics", bodyPattern: /cdn\.segment\.com\/analytics\.js/ },
  { name: "Intercom", category: "support-widget", bodyPattern: /js\.intercomcdn\.com|widget\.intercom\.io/ },
  { name: "Zendesk", category: "support-widget", bodyPattern: /static\.zdassets\.com/ },
  { name: "Cloudflare", category: "cdn-hosting", header: { key: "server", valuePattern: /cloudflare/i } },
  { name: "Vercel", category: "cdn-hosting", header: { key: "x-vercel-id" } },
  { name: "AWS CloudFront", category: "cdn-hosting", header: { key: "x-amz-cf-id" } },
  { name: "Express (Node.js)", category: "framework", header: { key: "x-powered-by", valuePattern: /express/i } },
];

export function detectTechStack(page: RawPage): TechSignal[] {
  const out: TechSignal[] = [];
  for (const rule of RULES) {
    if (rule.header) {
      const value = page.headers?.[rule.header.key];
      if (value !== undefined && (!rule.header.valuePattern || rule.header.valuePattern.test(value))) {
        out.push({ name: rule.name, category: rule.category, evidenceText: `${rule.header.key}: ${value}` });
        continue;
      }
    }
    const m = rule.bodyPattern?.exec(page.body);
    if (m) out.push({ name: rule.name, category: rule.category, evidenceText: m[0] });
  }
  return out;
}
