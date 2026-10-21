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

export interface ProductParser {
  parseAppStore(html: string): RawProduct[];
  parsePlay(html: string): RawProduct[];
}

export interface ReportSink {
  save(report: Report): Promise<string>;
}
