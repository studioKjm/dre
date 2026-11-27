/**
 * schema.org JSON-LD(<script type="application/ld+json">)에서 Organization/Product만
 * 화이트리스트 필드로 뽑는다. 응답 헤더(techstack.ts)와 달리 페이지 본문 구조라 JS 렌더링
 * 없이 정적 HTML만으로 충분하고, archive.org 스냅샷에도 그대로 보존된다.
 */

// [^>]* 를 길이 제한 없이 두면(CodeQL js/polynomial-redos — packages/core/src/text.ts에서
// 이미 한 번 고친 문제와 같은 패턴) 닫는 ">"가 없는 입력에서 느려진다. 실제 속성은 이보다
// 훨씬 짧으므로 2000자로 자른다.
const LD_JSON = /<script[^>]{0,2000}type=["']application\/ld\+json["'][^>]{0,2000}>([\s\S]{0,100000}?)<\/script>/gi;

export type StructuredFact =
  | { kind: "organization"; name?: string; foundingDate?: string; numberOfEmployees?: string; industry?: string }
  | { kind: "product"; name?: string; price?: string; priceCurrency?: string; availability?: string };

/** QuantitativeValue({minValue,maxValue})든 단순 숫자/문자열이든 "min-max" 또는 그대로의 문자열로 통일한다. */
function normalizeEmployeeCount(v: unknown): string | undefined {
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (v && typeof v === "object" && ("minValue" in v || "maxValue" in v)) {
    const { minValue, maxValue } = v as { minValue?: unknown; maxValue?: unknown };
    if (minValue !== undefined && maxValue !== undefined) return `${minValue}-${maxValue}`;
    return minValue !== undefined ? String(minValue) : maxValue !== undefined ? String(maxValue) : undefined;
  }
  return undefined;
}

// 값이 undefined인 필드는 객체에 아예 안 넣는다 — JSON.stringify는 어차피 생략하지만,
// 메모리상 표현과 동등성 비교(테스트)도 깔끔해진다.
function withDefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

function toOrganization(node: Record<string, unknown>): StructuredFact {
  return withDefined({
    kind: "organization",
    name: typeof node.name === "string" ? node.name : undefined,
    foundingDate: typeof node.foundingDate === "string" ? node.foundingDate : undefined,
    numberOfEmployees: normalizeEmployeeCount(node.numberOfEmployees),
    industry: typeof node.industry === "string" ? node.industry : undefined,
  }) as StructuredFact;
}

function toProduct(node: Record<string, unknown>): StructuredFact {
  // offers는 단일 객체 또는 배열일 수 있다 — 여러 SKU 전체를 다루는 건 이번 범위 밖이라 첫 원소만 쓴다.
  const offersRaw = node.offers;
  const offer = (Array.isArray(offersRaw) ? offersRaw[0] : offersRaw) as Record<string, unknown> | undefined;
  return withDefined({
    kind: "product",
    name: typeof node.name === "string" ? node.name : undefined,
    price: offer && (typeof offer.price === "string" || typeof offer.price === "number") ? String(offer.price) : undefined,
    priceCurrency: offer && typeof offer.priceCurrency === "string" ? offer.priceCurrency : undefined,
    availability: offer && typeof offer.availability === "string" ? offer.availability : undefined,
  }) as StructuredFact;
}

/** 하나의 JSON-LD 노드(@type이 배열일 수도 있다)에서 Organization/Product만 변환한다. 그 외 타입은 무시. */
function fromNode(node: unknown): StructuredFact | undefined {
  if (!node || typeof node !== "object") return undefined;
  const obj = node as Record<string, unknown>;
  const types = Array.isArray(obj["@type"]) ? obj["@type"] : [obj["@type"]];
  if (types.includes("Organization")) return toOrganization(obj);
  if (types.includes("Product")) return toProduct(obj);
  return undefined;
}

export function extractStructuredFacts(html: string): StructuredFact[] {
  const facts: StructuredFact[] = [];
  for (const m of html.matchAll(LD_JSON)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(m[1]!.trim());
    } catch {
      continue; // 한 블록이 깨져도 나머지는 계속 시도한다 (best-effort).
    }
    // @graph로 여러 노드를 한 블록에 담는 경우도 있다.
    const nodes = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>)["@graph"]) ? (parsed as Record<string, unknown>)["@graph"] as unknown[] : [parsed];
    for (const node of nodes) {
      const fact = fromNode(node);
      if (fact) facts.push(fact);
    }
  }
  return facts;
}
