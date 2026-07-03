import type { Page } from "playwright";
import { LogEntry, NetworkRequest, UserAction, LocationEntry } from "../types.js";

const MAX_LOGS = 1000;
const MAX_NETWORK = 500;
const MAX_RESPONSE_BODY = 50_000;

/**
 * Passively collects console logs, network requests, user actions, and page
 * navigations from a driven Playwright page, in the exact shape the platform
 * track viewer expects (all timestamps are absolute epoch ms — the viewer
 * subtracts track.startTs to place them on the video timeline).
 */
export class TrackRecorder {
  readonly logs: LogEntry[] = [];
  readonly network: NetworkRequest[] = [];
  readonly userActions: UserAction[] = [];
  readonly clicks: Array<{ time: number; label: string }> = [];
  readonly locations: LocationEntry[] = [];

  attach(page: Page): void {
    page.on("console", (msg) => {
      if (this.logs.length >= MAX_LOGS) return;
      const type = msg.type();
      const level = type === "warning" ? "warn" : type;
      this.logs.push({
        level,
        msg: msg.text().slice(0, 5000),
        time: Date.now(),
      });
    });

    page.on("pageerror", (error) => {
      if (this.logs.length >= MAX_LOGS) return;
      this.logs.push({
        level: "error",
        msg: String(error.stack || error.message || error).slice(0, 5000),
        time: Date.now(),
      });
    });

    page.on("request", (request) => {
      if (this.network.length >= MAX_NETWORK) return;
      const entry: NetworkRequest = {
        url: request.url(),
        method: request.method(),
        statusCode: 0,
        time: Date.now(),
        type: request.resourceType(),
        body: request.postData()?.slice(0, MAX_RESPONSE_BODY) || undefined,
      };
      this.network.push(entry);

      request
        .response()
        .then(async (response) => {
          if (!response) return;
          entry.statusCode = response.status();
          entry.duration = Date.now() - entry.time;
          const resourceType = request.resourceType();
          if (resourceType === "xhr" || resourceType === "fetch") {
            entry.requestHeaders = request.headers();
            entry.responseHeaders = response.headers();
            const contentType = response.headers()["content-type"] || "";
            if (/json|text/i.test(contentType)) {
              const body = await response.text().catch(() => null);
              if (body) {
                entry.responseBody = body.slice(0, MAX_RESPONSE_BODY);
                entry.responseBodySize = body.length;
              }
            }
          }
        })
        .catch(() => {});
    });

    page.on("requestfailed", (request) => {
      const entry = this.network.find(
        (n) => n.url === request.url() && n.statusCode === 0 && !n.error
      );
      if (entry) {
        entry.error = request.failure()?.errorText || "failed";
        entry.duration = Date.now() - entry.time;
      }
    });

    page.on("framenavigated", (frame) => {
      if (frame !== page.mainFrame()) return;
      const url = frame.url();
      if (url === "about:blank") return;
      // Skip same-document duplicates the viewer doesn't need
      const last = this.locations[this.locations.length - 1];
      if (last && last.location === url && Date.now() - last.time < 500) return;
      this.locations.push({
        time: Date.now(),
        location: url,
        navTiming: { fcpTime: 0, visuallyComplete: 0, timeToInteractive: 0 },
      });
      this.captureFcp(page, this.locations[this.locations.length - 1]);
    });
  }

  /** Best-effort first-contentful-paint for the latest navigation. */
  private captureFcp(page: Page, entry: LocationEntry): void {
    page
      .waitForLoadState("load", { timeout: 15_000 })
      .then(() =>
        page.evaluate(() => {
          const paint = performance
            .getEntriesByType("paint")
            .find((e) => e.name === "first-contentful-paint");
          return paint ? Math.round(paint.startTime) : 0;
        })
      )
      .then((fcp) => {
        entry.navTiming.fcpTime = fcp;
      })
      .catch(() => {});
  }

  /** Record an agent-performed action so it shows on the track timeline. */
  recordAction(type: string, label: string, details?: string): void {
    const time = Date.now();
    this.userActions.push({ type, time, label, details });
    if (type === "click") {
      this.clicks.push({ time, label });
    }
  }

  buildMetadataJson(): string {
    return JSON.stringify({
      logs: this.logs,
      network: this.network,
      userActions: this.userActions,
      replayActions: [],
      clicks: this.clicks,
    });
  }

  buildMetadataStats() {
    return {
      consoleErrors: this.logs.filter((l) => l.level === "error").length,
      networkErrors: this.network.filter((r) => r.statusCode >= 400 || r.error)
        .length,
      userActionsCount: this.userActions.length,
      replayActionsCount: 0,
    };
  }
}
