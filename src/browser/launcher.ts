import { chromium, Browser } from "playwright";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

export interface LaunchedBrowser {
  browser: Browser;
  /** Human-readable browser name for the track ("Chrome" | "Edge" | "Chromium") */
  browserName: string;
}

/**
 * Launch a browser with zero-setup fallbacks so users don't need to run
 * `npx playwright install chromium` manually:
 *   1. System Google Chrome (already on most machines)
 *   2. System Microsoft Edge
 *   3. Playwright's bundled Chromium, if previously installed
 *   4. Auto-download bundled Chromium, then launch it
 * All of them run with a fresh, isolated profile — never the user's own.
 */
export async function launchBrowser(headless: boolean): Promise<LaunchedBrowser> {
  const candidates: Array<{ channel?: string; browserName: string }> = [
    { channel: "chrome", browserName: "Chrome" },
    { channel: "msedge", browserName: "Edge" },
    { browserName: "Chromium" },
  ];

  let lastError: unknown = null;
  for (const { channel, browserName } of candidates) {
    try {
      const browser = await chromium.launch({ channel, headless });
      return { browser, browserName };
    } catch (error) {
      lastError = error;
    }
  }

  // Nothing installed — download the bundled Chromium once (~1 min) and retry
  try {
    await installBundledChromium();
    const browser = await chromium.launch({ headless });
    return { browser, browserName: "Chromium" };
  } catch (installError) {
    const detail =
      installError instanceof Error ? installError.message : String(installError);
    const launchDetail = lastError instanceof Error ? lastError.message : "";
    throw new Error(
      `Could not find or install a browser. Install Google Chrome, or run: npx playwright install chromium\n` +
        `Auto-install failed: ${detail.slice(0, 300)}\n${launchDetail.slice(0, 200)}`
    );
  }
}

function resolvePlaywrightCli(): string {
  const require = createRequire(import.meta.url);
  try {
    return require.resolve("playwright/cli.js");
  } catch {
    // Fall back via the package root if the exports map blocks cli.js
    const pkgJson = require.resolve("playwright/package.json");
    return join(dirname(pkgJson), "cli.js");
  }
}

function installBundledChromium(): Promise<void> {
  const cli = resolvePlaywrightCli();
  return new Promise((resolve, reject) => {
    // stdio must not touch process.stdout — it carries the MCP protocol
    const child = spawn(process.execPath, [cli, "install", "chromium"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout?.on("data", (d) => (output += d));
    child.stderr?.on("data", (d) => (output += d));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`playwright install exited ${code}: ${output.slice(-400)}`));
    });
  });
}
