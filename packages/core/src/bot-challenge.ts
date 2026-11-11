/**
 * 페이지 텍스트가 CAPTCHA/봇 차단 안내문처럼 보이는지 판별한다.
 * AutomationBlocked(브라우저 자체를 감지해 대체 페이지를 주는 경우)와는 다른 신호다 — 이건
 * "정상적으로 받아온 HTML인데 내용이 봇 검증 페이지"인 경우를 가리킨다. 둘 다 우회하지 않고
 * 원인을 명확히 알리는 것이 목적이라는 점은 같다.
 * 느슨한 패턴(예: "verify")은 일반 페이지에도 흔해 오탐이 크므로 넣지 않는다.
 */
const BOT_CHALLENGE_PATTERNS = [
  /보안\s*문자/i, // "보안문자를 입력 후 접속하시면" (국내 WAF 흔한 문구)
  /캡차/i,
  /captcha/i,
  /you are (?:a )?human/i,
  /unusual traffic/i,
  /i'?m not a robot/i,
  /checking (?:your browser|if the site connection is secure)/i, // Cloudflare (older phrasing)
  /just a moment/i, // Cloudflare's current interstitial title, shown before its JS challenge resolves
];

export function detectBotChallenge(text: string): string | undefined {
  const sample = text.slice(0, 2000); // 페이지 앞부분만 본다 — 본문 뒤쪽 우연한 일치를 줄인다
  const hit = BOT_CHALLENGE_PATTERNS.find((re) => re.test(sample));
  return hit ? `matched /${hit.source}/` : undefined;
}
