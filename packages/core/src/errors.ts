/** 브라우저(Chrome 또는 puppeteer-core)를 쓸 수 없을 때 Data가 던지고 Logic이 폴백한다. */
export class BrowserUnavailable extends Error {
  constructor(readonly reason: string) {
    super(`browser unavailable: ${reason}`);
    this.name = "BrowserUnavailable";
  }
}
