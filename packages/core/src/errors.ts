/** 브라우저(Chrome 또는 puppeteer-core)를 쓸 수 없을 때 Data가 던지고 Logic이 폴백한다. */
export class BrowserUnavailable extends Error {
  constructor(readonly reason: string) {
    super(`browser unavailable: ${reason}`);
    this.name = "BrowserUnavailable";
  }
}

/**
 * 대상 사이트가 자동화된 브라우저임을 감지해 실제 콘텐츠 대신 차단/대체 페이지를 돌려줄 때 던진다.
 * DRE는 이 탐지를 우회하지 않는다 — 정적 수집으로도 폴백하지 않고 명확한 실패로 보고한다.
 * (robots.txt 준수와 같은 원칙: 사이트가 자동 접근을 거부하면 그 의사를 존중한다.)
 */
export class AutomationBlocked extends Error {
  constructor(
    readonly url: string,
    readonly signal: string,
  ) {
    super(`automated browser detected and blocked at ${url} (signal: ${signal})`);
    this.name = "AutomationBlocked";
  }
}
