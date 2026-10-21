export type FetchErrorKind = "timeout" | "too-large" | "http" | "network" | "blocked" | "too-many-redirects";

export class FetchError extends Error {
  constructor(
    readonly url: string,
    readonly kind: FetchErrorKind,
    readonly status?: number,
    detail?: string,
  ) {
    super(`fetch ${kind} for ${url}${status ? ` (${status})` : ""}${detail ? `: ${detail}` : ""}`);
    this.name = "FetchError";
  }
}
