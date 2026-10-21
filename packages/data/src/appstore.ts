import { stripTags, type RawProduct } from "@dre/core";

// 주의: 아래 마커는 공개 스토어 페이지 구조에 대한 가정이며 테스트는 직접 만든 픽스처 기준이다.
// 실제 페이지 구조는 수시로 바뀌므로 라이브 수집은 최선 노력(best effort)으로 취급한다.

/** App Store 웹 페이지의 "In-App Purchases" 목록에서 상품명과 가격을 추출한다. */
export function parseAppStore(html: string): RawProduct[] {
  const products: RawProduct[] = [];
  const items = html.matchAll(/<li[^>]*list-with-numbers__item(?:\s|")[^>]*>([\s\S]*?)<\/li>/gi);
  for (const [, inner] of items) {
    const name = /<span[^>]*truncate-single-line[^>]*>([\s\S]*?)<\/span>/i.exec(inner!)?.[1];
    const price = /<span[^>]*list-with-numbers__item__price[^>]*>([\s\S]*?)<\/span>/i.exec(inner!)?.[1];
    if (name && price) products.push({ name: stripTags(name), priceText: stripTags(price) });
  }
  return products;
}

/** Google Play는 개별 상품 대신 가격 범위만 공개하므로 범위 한 줄로 반환한다. */
export function parsePlay(html: string): RawProduct[] {
  const m = /In-app purchases\s*<\/div>\s*<div[^>]*>([^<]+)</i.exec(html);
  return m ? [{ name: "In-app purchases", priceText: stripTags(m[1]!) }] : [];
}
