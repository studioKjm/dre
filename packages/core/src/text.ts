const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " ",
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));
}

export function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

/** HTML을 줄 단위 텍스트로 변환한다 (script/style 제거, 블록 태그는 줄바꿈). */
export function htmlToText(html: string): string {
  const withoutNoise = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, "");
  const withBreaks = withoutNoise.replace(
    /<\/?(?:p|div|li|ul|ol|br|h[1-6]|tr|section|article|header|footer|table|dl|dt|dd)\b[^>]*>/gi,
    "\n",
  );
  return decodeEntities(withBreaks.replace(/<[^>]*>/g, ""))
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}
