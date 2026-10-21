export class RobotsDisallowed extends Error {
  constructor(
    readonly url: string,
    readonly reason: string,
  ) {
    super(`robots.txt disallows ${url}: ${reason}`);
    this.name = "RobotsDisallowed";
  }
}

export class UnsupportedStore extends Error {
  constructor(readonly url: string) {
    super(`unsupported store url: ${url} (expected apps.apple.com or play.google.com)`);
    this.name = "UnsupportedStore";
  }
}
