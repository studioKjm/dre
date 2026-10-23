import { stripTags, type RawProduct } from "@dre/core";

// App Store 웹 페이지는 <script id="serialized-server-data"> 안에 페이지 데이터를 JSON으로 싣는다.
// 인앱 상품은 data[0].data.shelfMapping.information.items 중 title이 "In-App Purchases"인 항목의
// items(textPair: leadingText=상품명, trailingText=가격)에 있다 (Duolingo·Notion·Canva 실제 페이지로 확인).
// 구조는 Apple이 언제든 바꿀 수 있으므로 못 찾으면 빈 배열을 반환한다.

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : undefined);

/** App Store 웹 페이지의 "In-App Purchases" 목록에서 상품명과 가격을 추출한다. */
export function parseAppStore(html: string): RawProduct[] {
  const raw = /<script[^>]*id="serialized-server-data"[^>]*>([\s\S]*?)<\/script>/i.exec(html)?.[1];
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  const page = obj((obj(data)?.data as unknown[] | undefined)?.[0]);
  const infoItems = obj(obj(obj(page?.data)?.shelfMapping)?.information)?.items;
  if (!Array.isArray(infoItems)) return [];
  const iap = infoItems.map(obj).find((i) => i?.title === "In-App Purchases");
  if (!Array.isArray(iap?.items)) return [];

  const products: RawProduct[] = [];
  for (const item of iap.items.map(obj)) {
    if (item?.$kind === "textPair" && typeof item.leadingText === "string" && typeof item.trailingText === "string") {
      products.push({ name: item.leadingText, priceText: item.trailingText });
    }
  }
  return products;
}

/** Google Play는 개별 상품 대신 가격 범위만 공개하므로 범위 한 줄로 반환한다. */
export function parsePlay(html: string): RawProduct[] {
  const m = /In-app purchases\s*<\/div>\s*<div[^>]*>([^<]+)</i.exec(html);
  return m ? [{ name: "In-app purchases", priceText: stripTags(m[1]!) }] : [];
}
