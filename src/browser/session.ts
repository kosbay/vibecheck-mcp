import { chromium, Browser, BrowserContext, Page, Locator } from "playwright";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TrackRecorder } from "./recorder.js";

const VIEWPORT = { width: 1280, height: 720 };
const SNAPSHOT_MAX_CHARS = 30_000;

export interface FinishedRecording {
  videoPath: string;
  videoDir: string;
  startTs: number;
  duration: number;
  browserVersion: string;
  resolution: string;
  metadataJson: string;
  metadataStats: {
    consoleErrors: number;
    networkErrors: number;
    userActionsCount: number;
    replayActionsCount: number;
  };
  locations: Array<{ time: number; location: string; navTiming: object }>;
}

export interface ElementTarget {
  element: string;
  ref?: string;
  selector?: string;
}

/**
 * A single recorded browser session. The MCP client (Claude Code) drives the
 * page through the public methods; everything is recorded for the track.
 */
export class BrowserSession {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private videoDir: string | null = null;
  private startTs = 0;
  private dead = false;
  recorder = new TrackRecorder();

  get active(): boolean {
    return this.page !== null;
  }

  /** True when the user closed the window/browser out from under us. */
  get crashed(): boolean {
    return this.active && this.dead;
  }

  async start(): Promise<void> {
    if (this.active) return;

    this.recorder = new TrackRecorder();
    this.videoDir = mkdtempSync(join(tmpdir(), "vibecheck-mcp-"));
    try {
      this.browser = await chromium.launch({
        headless: process.env.VIBECHECK_HEADLESS === "1",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/executable doesn't exist|browserType.launch/i.test(message)) {
        throw new Error(
          "Chromium is not installed for Playwright. Run: npx playwright install chromium"
        );
      }
      throw error;
    }

    this.context = await this.browser.newContext({
      viewport: VIEWPORT,
      recordVideo: { dir: this.videoDir, size: VIEWPORT },
    });

    // Video frame 0 corresponds to page creation — stamp startTs right before
    this.startTs = Date.now();
    this.page = await this.context.newPage();
    this.recorder.attach(this.page);

    // Detect the user manually closing the window/browser so the session
    // doesn't get stuck in a dead state
    this.browser.on("disconnected", () => {
      this.dead = true;
    });
    this.page.on("close", () => {
      this.dead = true;
    });

    // v1 keeps a single-tab, single-video artifact: adopt popup URLs into the
    // main tab and close the popup
    this.context.on("page", (popup) => {
      if (popup === this.page) return;
      popup
        .waitForLoadState("domcontentloaded", { timeout: 10_000 })
        .then(async () => {
          const url = popup.url();
          await popup.close();
          if (url && url !== "about:blank" && this.page) {
            await this.page.goto(url);
          }
        })
        .catch(() => {});
    });
  }

  private requirePage(): Page {
    if (!this.page) {
      throw new Error("No active browser session. Call browser_navigate first.");
    }
    if (this.dead || this.page.isClosed()) {
      throw new Error(
        "The browser window was closed. The recording so far is lost — call browser_navigate to start a fresh session."
      );
    }
    return this.page;
  }

  private resolveTarget(target: ElementTarget): Locator {
    const page = this.requirePage();
    if (target.ref) {
      return page.locator(`aria-ref=${target.ref}`);
    }
    if (target.selector) {
      return page.locator(target.selector).first();
    }
    throw new Error(
      `Provide a ref (from browser_snapshot) or a CSS selector for "${target.element}"`
    );
  }

  async snapshot(): Promise<string> {
    const page = this.requirePage();
    let text: string;
    const internal = page as unknown as {
      _snapshotForAI?: () => Promise<string>;
    };
    if (typeof internal._snapshotForAI === "function") {
      text = await internal._snapshotForAI();
    } else {
      text = await page.locator("body").ariaSnapshot();
    }
    if (text.length > SNAPSHOT_MAX_CHARS) {
      text =
        text.slice(0, SNAPSHOT_MAX_CHARS) +
        "\n… (snapshot truncated — use browser_screenshot or a narrower selector)";
    }
    const url = page.url();
    const title = await page.title().catch(() => "");
    return `Page: ${title}\nURL: ${url}\n\n${text}`;
  }

  async navigate(url: string): Promise<void> {
    const page = this.requirePage();
    this.recorder.recordAction("navigation", `Navigated to ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  }

  async click(target: ElementTarget): Promise<void> {
    const locator = this.resolveTarget(target);
    this.recorder.recordAction("click", target.element);
    await locator.click({ timeout: 10_000 });
  }

  async type(target: ElementTarget, text: string, submit = false): Promise<void> {
    const locator = this.resolveTarget(target);
    this.recorder.recordAction("input", target.element, `Typed "${text}"`);
    await locator.fill(text, { timeout: 10_000 });
    if (submit) {
      this.recorder.recordAction("keypress", target.element, "Pressed Enter");
      await locator.press("Enter");
    }
  }

  async pressKey(key: string): Promise<void> {
    const page = this.requirePage();
    this.recorder.recordAction("keypress", `Pressed ${key}`);
    await page.keyboard.press(key);
  }

  async selectOption(target: ElementTarget, values: string[]): Promise<void> {
    const locator = this.resolveTarget(target);
    this.recorder.recordAction(
      "input",
      target.element,
      `Selected ${values.join(", ")}`
    );
    await locator.selectOption(values, { timeout: 10_000 });
  }

  async hover(target: ElementTarget): Promise<void> {
    const locator = this.resolveTarget(target);
    this.recorder.recordAction("hover", target.element);
    await locator.hover({ timeout: 10_000 });
  }

  async scroll(direction: "up" | "down", amount?: number): Promise<void> {
    const page = this.requirePage();
    const pixels = amount ?? VIEWPORT.height * 0.8;
    const dy = direction === "down" ? pixels : -pixels;
    this.recorder.recordAction("scroll", `Scrolled ${direction}`);
    await page.mouse.wheel(0, dy);
  }

  async screenshot(): Promise<{ data: string; mimeType: string }> {
    const page = this.requirePage();
    const buffer = await page.screenshot({ type: "png" });
    return { data: buffer.toString("base64"), mimeType: "image/png" };
  }

  async waitFor(opts: {
    text?: string;
    textGone?: string;
    time?: number;
  }): Promise<void> {
    const page = this.requirePage();
    if (opts.time) {
      await page.waitForTimeout(Math.min(opts.time, 30) * 1000);
    }
    if (opts.text) {
      await page
        .getByText(opts.text)
        .first()
        .waitFor({ state: "visible", timeout: 30_000 });
    }
    if (opts.textGone) {
      await page
        .getByText(opts.textGone)
        .first()
        .waitFor({ state: "hidden", timeout: 30_000 });
    }
  }

  /** Stop recording, close the browser, and return the finished artifacts. */
  async finish(): Promise<FinishedRecording> {
    if (!this.page) {
      throw new Error("No active browser session. Call browser_navigate first.");
    }
    const page = this.page;
    const browserVersion = this.browser?.version() || "";
    const endTs = Date.now();
    const video = page.video();

    // If the user already closed the window, the video was finalized on close
    // — still try to salvage and upload it
    await this.context?.close().catch(() => {});
    const videoPath = video ? await video.path().catch(() => null) : null;
    await this.browser?.close().catch(() => {});

    const result: FinishedRecording = {
      videoPath: videoPath || "",
      videoDir: this.videoDir || "",
      startTs: this.startTs,
      duration: endTs - this.startTs,
      browserVersion,
      resolution: `${VIEWPORT.width}x${VIEWPORT.height}`,
      metadataJson: this.recorder.buildMetadataJson(),
      metadataStats: this.recorder.buildMetadataStats(),
      locations: this.recorder.locations,
    };

    this.reset();
    if (!result.videoPath || !existsSync(result.videoPath)) {
      if (result.videoDir) {
        rmSync(result.videoDir, { recursive: true, force: true });
      }
      throw new Error(
        "Recording video file was not produced — the browser may have been closed before anything was recorded."
      );
    }
    return result;
  }

  /** Close everything and delete any recorded video without uploading. */
  async discard(): Promise<void> {
    await this.context?.close().catch(() => {});
    await this.browser?.close().catch(() => {});
    if (this.videoDir) {
      rmSync(this.videoDir, { recursive: true, force: true });
    }
    this.reset();
  }

  private reset(): void {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.videoDir = null;
    this.startTs = 0;
    this.dead = false;
  }
}
