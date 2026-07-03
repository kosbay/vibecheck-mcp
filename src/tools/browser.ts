import { z } from "zod";
import { rmSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BrowserSession, ElementTarget } from "../browser/session.js";
import { condenseRecording } from "../browser/condense.js";
import { preflightUploadCheck, uploadRecording } from "../api/upload.js";

// One recorded browser session per MCP server process. Recording starts
// implicitly on the first browser_navigate and ends with browser_finish.
const session = new BrowserSession();

export function getActiveSession(): BrowserSession {
  return session;
}

const targetShape = {
  element: z
    .string()
    .describe(
      "Human-readable description of the element (e.g. 'Login button'). Shown on the recorded track timeline."
    ),
  ref: z
    .string()
    .optional()
    .describe("Element ref from the latest browser_snapshot (e.g. 'e12'). Preferred."),
  selector: z
    .string()
    .optional()
    .describe("CSS selector fallback when no ref is available."),
};

type ToolContent = Array<
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
>;

function textResult(text: string): { content: ToolContent } {
  return { content: [{ type: "text", text }] };
}

function errorResult(error: unknown): { content: ToolContent; isError: true } {
  const message = error instanceof Error ? error.message : "Unknown error";
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}

async function withSnapshot(prefix: string): Promise<{ content: ToolContent }> {
  // The action itself succeeded — never let a flaky snapshot (e.g. a click
  // that triggered a navigation) make it look failed
  try {
    const snapshot = await session.snapshot();
    return textResult(`${prefix}\n\n${snapshot}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    return textResult(
      `${prefix}\n\n(Page snapshot unavailable right now: ${message}. Call browser_snapshot to retry.)`
    );
  }
}

export function registerBrowserTools(server: McpServer): void {
  server.tool(
    "browser_navigate",
    "Open a URL in the recorded VibeCheck browser session. The first call launches a local Chromium window and starts recording video, console logs, network requests, and actions. End the session with browser_finish to upload the recording and get a shareable VibeCheck link.",
    { url: z.string().describe("The URL to open (http/https, localhost is fine)") },
    async ({ url }) => {
      try {
        let recovered = false;
        if (session.crashed) {
          // User closed the window mid-session — drop the dead session and
          // start over instead of staying stuck
          await session.discard();
          recovered = true;
        }
        if (!session.active) {
          // Fail fast on bad API key / usage limit before recording anything
          await preflightUploadCheck();
          await session.start();
        }
        await session.navigate(url);
        const note = recovered
          ? `Previous browser window was closed by the user — started a fresh recording session.\nNavigated to ${url}`
          : `Navigated to ${url}`;
        return await withSnapshot(note);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "browser_snapshot",
    "Get an accessibility snapshot of the current page with element refs usable in browser_click / browser_type / etc.",
    {},
    async () => {
      try {
        return textResult(await session.snapshot());
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "browser_click",
    "Click an element on the page in the recorded session.",
    targetShape,
    async (input) => {
      try {
        await session.click(input as ElementTarget);
        return await withSnapshot(`Clicked: ${input.element}`);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "browser_type",
    "Type text into an input/textarea in the recorded session.",
    {
      ...targetShape,
      text: z.string().describe("The text to type"),
      submit: z
        .boolean()
        .optional()
        .describe("Press Enter after typing (default false)"),
    },
    async (input) => {
      try {
        await session.type(input as ElementTarget, input.text, input.submit);
        return await withSnapshot(`Typed into: ${input.element}`);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "browser_press_key",
    "Press a keyboard key (e.g. Enter, Escape, ArrowDown, Tab) in the recorded session.",
    { key: z.string().describe("Key name, e.g. Enter, Escape, ArrowDown") },
    async ({ key }) => {
      try {
        await session.pressKey(key);
        return await withSnapshot(`Pressed ${key}`);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "browser_select_option",
    "Select option(s) in a <select> dropdown in the recorded session.",
    {
      ...targetShape,
      values: z
        .array(z.string())
        .describe("Option values or labels to select"),
    },
    async (input) => {
      try {
        await session.selectOption(input as ElementTarget, input.values);
        return await withSnapshot(`Selected in: ${input.element}`);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "browser_hover",
    "Hover over an element in the recorded session.",
    targetShape,
    async (input) => {
      try {
        await session.hover(input as ElementTarget);
        return await withSnapshot(`Hovered: ${input.element}`);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "browser_scroll",
    "Scroll the page up or down in the recorded session.",
    {
      direction: z.enum(["up", "down"]).describe("Scroll direction"),
      amount: z
        .number()
        .optional()
        .describe("Pixels to scroll (default ~one viewport)"),
    },
    async ({ direction, amount }) => {
      try {
        await session.scroll(direction, amount);
        return await withSnapshot(`Scrolled ${direction}`);
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "browser_screenshot",
    "Take a screenshot of the current page in the recorded session. Use to visually verify state; the aria snapshot is usually enough for navigation.",
    {},
    async () => {
      try {
        const image = await session.screenshot();
        return {
          content: [
            { type: "text" as const, text: "Screenshot of the current page:" },
            { type: "image" as const, data: image.data, mimeType: image.mimeType },
          ],
        };
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "browser_wait_for",
    "Wait for text to appear/disappear or for a fixed time in the recorded session.",
    {
      text: z.string().optional().describe("Wait until this text is visible"),
      textGone: z
        .string()
        .optional()
        .describe("Wait until this text disappears"),
      time: z.number().optional().describe("Seconds to wait (max 30)"),
    },
    async (input) => {
      try {
        await session.waitFor(input);
        return await withSnapshot("Wait finished");
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "browser_finish",
    "End the recorded browser session: closes the browser, uploads the recording (video + console logs + network + actions) to VibeCheck, and returns a shareable track link. Use discard to throw the recording away instead.",
    {
      title: z
        .string()
        .describe("Track title, e.g. 'Validate checkout total on /cart'"),
      notes: z
        .string()
        .optional()
        .describe(
          "Result notes shown on the track, e.g. what was validated and the outcome"
        ),
      discard: z
        .boolean()
        .optional()
        .describe("Discard the recording without uploading (default false)"),
    },
    async ({ title, notes, discard }) => {
      try {
        if (!session.active) {
          return discard
            ? textResult("No active browser session — nothing to discard.")
            : errorResult(
                new Error("No active browser session — nothing was recorded.")
              );
        }
        if (discard) {
          await session.discard();
          return textResult("Session discarded. Nothing was uploaded.");
        }

        let recording = await session.finish();
        let condensedNote = "";
        try {
          // Cut out idle "think time" between actions so the video is short
          // and watchable; falls back to the full video when ffmpeg is missing
          const condensed = await condenseRecording(recording);
          if (condensed) {
            condensedNote = ` (condensed from ${Math.round(recording.duration / 1000)}s — idle time between actions removed)`;
            recording = condensed;
          }
        } catch {
          // Condensing is best-effort — upload the original video instead
        }
        try {
          const { trackUrl, trackId } = await uploadRecording(
            recording,
            title,
            notes
          );
          rmSync(recording.videoDir, { recursive: true, force: true });
          return textResult(
            [
              `Recording uploaded to VibeCheck.`,
              ``,
              `Shareable link: ${trackUrl}`,
              `Track ID: ${trackId}`,
              `Duration: ${Math.round(recording.duration / 1000)}s${condensedNote}`,
              `Console errors: ${recording.metadataStats.consoleErrors}, network errors: ${recording.metadataStats.networkErrors}, actions: ${recording.metadataStats.userActionsCount}`,
            ].join("\n")
          );
        } catch (uploadError) {
          // Keep the local files so the recording isn't lost
          const message =
            uploadError instanceof Error
              ? uploadError.message
              : "Unknown upload error";
          return errorResult(
            new Error(
              `${message}\nThe recording was kept locally at: ${recording.videoPath}`
            )
          );
        }
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
