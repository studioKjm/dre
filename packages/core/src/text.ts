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
 * multi-character-sanitization이 실제로 찾아낸 문제). 닫는 ">"가 있는 완전한 태그만
 * 다시 지우는 걸로는 부족하다 — "<!--"나 "<script"는 ">"가 없어도(또는 멀리 떨어져
 * 있어도) 그 자체로 위험하다고 CodeQL이 본다. 그래서 디코딩 후에는 남은 "<" 자체를
 * 전부 지운다. 디코딩된 "<"/">"가 수식 비교(예: "5 < 10")인 드문 경우는 그 부호가
 * 지워지는 대가를 감수한다 — 태그 재구성을 막는 쪽이 더 안전하다.
 */
function stripReconstructedTags(s: string): string {
  const decoded = decodeEntities(s);
  return decoded === s ? decoded : decoded.replace(/</g, "");
}

export function stripTags(s: string): string {
  return stripReconstructedTags(s.replace(TAG, "")).replace(/\s+/g, " ").trim();
}

/**
 * 한 번만 지우면 "<scr<!---->ipt>" 같은 겹친 입력에서 제거 후 "<script>"가 다시
 * 만들어질 수 있다(CodeQL js/incomplete-multi-character-sanitization). 더 이상
 * 안 바뀔 때까지(또는 과도한 입력에 대비해 상한 횟수까지) 반복 적용해서 완전히 없앤다.
 */
function replaceToFixedPoint(s: string, pattern: RegExp, maxIterations = 5): string {
  let prev = s;
  for (let i = 0; i < maxIterations; i++) {
    const next = prev.replace(pattern, "");
    if (next === prev) return next;
    prev = next;
  }
  return prev;
}

/** HTML을 줄 단위 텍스트로 변환한다 (script/style 제거, 블록 태그는 줄바꿈). */
export function htmlToText(html: string): string {
  const withoutNoise = replaceToFixedPoint(
    replaceToFixedPoint(html, /<!--[\s\S]{0,100000}?-->/g),
    /<(script|style|noscript)[\s\S]{0,1000000}?<\/\1>/gi,
  );
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
