const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " ",
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));
}

// 태그 내부 길이를 제한한다 — CodeQL(js/polynomial-redos)이 실제로 찾아낸 문제다: 닫는
// ">"가 전혀 없는 입력(예: "<" 수만 개)에서 무제한 [^>]* 는 시작 위치마다 끝까지 훑고
// 실패하기를 반복해 O(n²)가 된다. 진짜 태그는 이보다 훨씬 짧으므로, 못 찾으면 그냥 안
// 지워지는 쪽(저하)이 멈추는 것보다 낫다.
const TAG = /<[^>]{0,10000}>/g;

/**
 * 태그를 지운 "뒤에" 엔티티를 디코딩하면, &lt;script&gt;처럼 인코딩된 태그가 결과에
 * 그대로 살아있다가 디코딩으로 다시 "<script>"가 돼버린다(CodeQL js/incomplete-
 * multi-character-sanitization이 실제로 찾아낸 문제) — 디코딩된 텍스트를 한 번 더
 * 태그 제거에 통과시킨다. 디코딩된 "<"/">"가 수식 비교(예: "5 < 10")처럼 진짜 꺾쇠인
 * 경우 이 2차 제거가 그 구간을 지워버릴 수 있지만, 가격/약관 페이지 본문에서는 드물고
 * 태그 재구성을 막는 쪽이 더 안전하다.
 */
function stripReconstructedTags(s: string): string {
  const decoded = decodeEntities(s);
  return decoded === s ? decoded : decoded.replace(TAG, "");
}

export function stripTags(s: string): string {
  return stripReconstructedTags(s.replace(TAG, "")).replace(/\s+/g, " ").trim();
}

/** HTML을 줄 단위 텍스트로 변환한다 (script/style 제거, 블록 태그는 줄바꿈). */
export function htmlToText(html: string): string {
  const withoutNoise = html
    .replace(/<!--[\s\S]{0,100000}?-->/g, "")
    .replace(/<(script|style|noscript)[\s\S]{0,1000000}?<\/\1>/gi, "");
  const withBreaks = withoutNoise.replace(
    /<\/?(?:p|div|li|ul|ol|br|h[1-6]|tr|section|article|header|footer|table|dl|dt|dd)\b[^>]{0,10000}>/gi,
    "\n",
  );
  return stripReconstructedTags(withBreaks.replace(TAG, ""))
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}
