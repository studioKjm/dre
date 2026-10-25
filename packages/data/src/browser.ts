import { existsSync } from "node:fs";
import { AutomationBlocked, BrowserUnavailable, isPrivateHostname, type RawPage } from "@dre/core";
import { assertPublicUrl } from "./net-guard.js";

// 자동화된 브라우저를 감지해 실제 콘텐츠 대신 보여주는, 실제로 관측된 페이지의 <title> 문구.
// 느슨한 패턴(예: "please enable javascript")은 일반 페이지에도 흔해 오탐이 크므로 넣지 않는다.
const AUTOMATION_BLOCK_TITLES = [/^지원되지\s*않는\s*클라이언트/i, /^unsupported\s*client/i];

export function detectAutomationBlock(html: string): string | undefined {
  const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim();
  if (title && AUTOMATION_BLOCK_TITLES.some((re) => re.test(title))) return `title="${title}"`;
  return undefined;
}

const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
];

/** DRE_CHROME_PATH 환경변수 → 일반 설치 경로 순으로 Chrome 실행 파일을 찾는다. */
export function findChrome(
  env: NodeJS.ProcessEnv = process.env,
  exists: (p: string) => boolean = existsSync,
): string | undefined {
  const fromEnv = env.DRE_CHROME_PATH;
  if (fromEnv) return exists(fromEnv) ? fromEnv : undefined;
  return CHROME_PATHS.find(exists);
}

export interface RenderOptions {
  timeoutMs?: number;
  userAgent?: string;
  allowPrivate?: boolean;
  /** 최상위 페이지 이동(리다이렉트 포함)마다 호출된다. 던지면 이동을 중단하고 그 오류를 던진다. */
  onNavigate?: (url: string) => Promise<void>;
  /** 테스트에서 탐지 로직을 대체하기 위한 주입 지점 */
  locate?: () => string | undefined;
}

/** 렌더링된 DOM을 RawPage.body로 반환한다. Chrome 또는 puppeteer-core가 없으면 BrowserUnavailable. */
export async function renderPage(url: string, opts: RenderOptions = {}): Promise<RawPage> {
  const { timeoutMs = 30_000, userAgent = "DREBot", locate = findChrome, allowPrivate = false, onNavigate } = opts;
  await assertPublicUrl(url, allowPrivate);
  const executablePath = locate();
  if (!executablePath) {
    throw new BrowserUnavailable("Chrome not found (install Chrome or set DRE_CHROME_PATH)");
  }

  let puppeteer: typeof import("puppeteer-core");
  try {
    // CJS/ESM interop: 모듈 네임스페이스 또는 default 어느 쪽으로든 launch를 찾는다.
    const mod = (await import("puppeteer-core")) as unknown as { default?: typeof puppeteer } & typeof puppeteer;
    puppeteer = typeof mod.launch === "function" ? mod : mod.default!;
  } catch {
    throw new BrowserUnavailable("puppeteer-core is not installed (npm i puppeteer-core)");
  }

  const browser = await puppeteer.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    await page.setUserAgent({ userAgent });

    // 최상위 이동은 주소 검사와 onNavigate(robots 재검사)를 통과해야 한다.
    // 하위 리소스(스크립트·XHR)는 robots 검사를 하지 않고, 사설 주소 리터럴만 막는다.
    let violation: unknown;
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      void (async () => {
        try {
          const target = req.url();
          if (!/^https?:/i.test(target)) return await req.continue();
          if (req.isNavigationRequest() && req.frame() === page.mainFrame()) {
            await assertPublicUrl(target, allowPrivate);
            await onNavigate?.(target);
          } else if (!allowPrivate && isPrivateHostname(new URL(target).hostname)) {
            return await req.abort("blockedbyclient");
          }
          await req.continue();
        } catch (e) {
          violation ??= e;
          await req.abort("blockedbyclient").catch(() => undefined);
        }
      })();
    });

    let response;
    try {
      response = await page.goto(url, { waitUntil: "networkidle2", timeout: timeoutMs });
    } catch (e) {
      throw violation ?? e;
    }
    if (violation) throw violation;
    const body = await page.content();
    const blockSignal = detectAutomationBlock(body);
    if (blockSignal) throw new AutomationBlocked(page.url(), blockSignal);
    return {
      url,
      finalUrl: page.url(),
      status: response?.status() ?? 0,
      contentType: "text/html",
      body,
      retrievedAt: new Date().toISOString(),
    };
  } finally {
    await browser.close();
  }
}
