import { stripTags } from "@dre/core";

export interface Link {
  href: string;
  text: string;
}

export function extractLinks(html: string, baseUrl: string): Link[] {
  const links: Link[] = [];
  for (const m of html.matchAll(/<a\s[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      links.push({ href: new URL(m[1]!, baseUrl).toString(), text: stripTags(m[2]!) });
    } catch {
      // 잘못된 href는 건너뛴다
    }
  }
  return links;
}
