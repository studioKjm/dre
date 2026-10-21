/** robots.txt 한 그룹 (같은 User-agent 목록에 적용되는 규칙 묶음) */
export interface RobotsGroup {
  agents: string[];
  allow: string[];
  disallow: string[];
}

/** Data 레이어가 반환하는 원시 robots 조회 결과. 허용 여부 판단은 Logic이 한다. */
export type RobotsResult =
  | { kind: "found"; groups: RobotsGroup[] }
  | { kind: "missing" } // 4xx: 제한 없음으로 간주(RFC 9309)
  | { kind: "unreachable"; status?: number }; // 5xx/네트워크 오류: 전체 불허로 간주
