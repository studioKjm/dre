import type { RawPage, RawProduct, Report, RobotsResult } from "@dre/core";

/** Logic이 필요로 하는 Data 기능. 구현체는 Data 패키지가 제공하고 조립 지점에서 주입한다. */
export interface RobotsSource {
  get(origin: string): Promise<RobotsResult>;
}

export interface PageFetcher {
  get(url: string): Promise<RawPage>;
}

export interface PageRenderer {
  render(url: string): Promise<RawPage>;
}

/**
 * 대상 사이트가 봇 차단으로 막혔을 때(robots.txt 불허는 해당하지 않음 — 그건 그대로 존중한다)
 * archive.org 같은 독립된 제3자 사본에서 보충 조회한다. 원본 사이트에 요청을 보내지 않는다.
 */
export interface PageArchive {
  get(url: string): Promise<RawPage | null>;
}

export interface ProductParser {
  parseAppStore(html: string): RawProduct[];
  parsePlay(html: string): RawProduct[];
}

export interface ReportSink {
  save(report: Report): Promise<string>;
}
