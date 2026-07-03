# VibeCheck MCP — Full Guide

`@vibecheck-mcp/mcp` is an MCP (Model Context Protocol) server that connects AI assistants — Claude Code, Claude Desktop, Cursor, Windsurf, VS Code — to [VibeCheck](https://vibecheck-qa.com).

It gives your AI two capability groups:

1. **Read bug reports** — paste a VibeCheck track link and the AI can inspect the console logs, network requests, user actions, and web vitals captured in it.
2. **Record browser sessions** *(new)* — the AI opens a real browser on your machine, performs a task you describe ("go to this page and validate this value"), and VibeCheck records everything it does. When it finishes, you get a shareable VibeCheck track link with video, console, network, and a step-by-step action timeline — evidence of exactly what happened.

---

## How it works

### Reading tracks

The read tools call VibeCheck's public track API (`GET /api/tracks/{id}`). No authentication is needed — anyone with a track link can read it. The server formats the raw data into markdown reports the AI can reason about (error analysis, network deep-dives, steps to reproduce, performance assessment).

### Recorded browser sessions

The recording tools follow a "**the AI drives, VibeCheck records**" model:

```
You (prompt): "Go to app.example.com/cart and check the total is $42"
      │
      ▼
AI assistant ──── MCP tools ────▶ Local browser (your Chrome/Edge, visible window)
                                        │
                              VibeCheck records passively:
                              • video of the whole session
                              • console logs (incl. JS errors)
                              • network requests (+ response bodies for API calls)
                              • every AI action, labeled ("Clicked: Login button")
                              • page navigations
      │
      ▼ browser_finish
Upload to VibeCheck ──▶ shareable link: https://app.vibecheck-qa.com/tracks/{id}
```

Key design points:

- **No hidden AI loop.** The MCP server never calls an LLM. Your assistant does the reasoning and clicking; the server is a recorded browser plus an uploader. You pay nothing extra.
- **Local browser.** The browser runs on your machine, so it can reach `localhost` dev servers, staging behind VPN — anything you can reach. Your installed Google Chrome or Edge is used automatically (with a fresh, isolated profile); if neither exists, a Chromium build is downloaded on first run.
- **Implicit session start.** The first `browser_navigate` launches the browser and starts recording. There is no separate "start" step.
- **One session at a time.** A session ends with `browser_finish` (upload) or `browser_finish` with `discard: true` (throw away).
- **Normal VibeCheck tracks.** The upload is a standard `type: "video"` track — it appears in your dashboard, works with the track viewer's Console/Network/Actions tabs, counts toward your plan's monthly recordings, and can be fed back into the read tools or AI Fix.
- **Watchable video.** The recording shows a cursor that glides to every element the agent interacts with, a ripple at each click point, and a semi-transparent caption describing the current action (`Click — Place order button`) — so anyone can follow the video without guessing what happened. The overlay is cosmetic only: it can't intercept the page, and it is hidden from the agent's screenshots and snapshots.
- **Auto-condensed video.** If `ffmpeg` is on your PATH, the idle "agent think time" between actions is cut out before upload (keeping a window around every action, navigation, and error) — a 5-minute session typically becomes under a minute. All console/network/action timestamps are remapped so the timeline stays synced to the shorter video. Without ffmpeg, the full-length video is uploaded as-is. Opt out with `VIBECHECK_NO_CONDENSE=1`.
- **Timeline sync.** Every recorded event is timestamped so the track page can seek the video to the exact moment a log line, request, or click happened.
- **Fail fast.** Credentials and your monthly usage limit are checked *before* the browser opens, so you never record a session that can't be uploaded.
- **Nothing is lost.** If the upload fails (network down, etc.), the video file is kept locally and its path is reported.

### How the AI "sees" the page

After every action, tools return an **accessibility snapshot** — a compact text outline of the page with element refs:

```
- heading "Example Domain" [level=1] [ref=e3]
- link "Learn more" [ref=e6]
```

The AI passes a `ref` (e.g. `e6`) to `browser_click` / `browser_type` to target elements precisely. A CSS `selector` works as a fallback, and `browser_screenshot` is available when visual confirmation is needed (e.g. checking colors or layout).

---

## Installation

### Prerequisites

- **Node.js ≥ 18**
- **A browser** — nothing to install if you have Google Chrome or Microsoft Edge (auto-detected, run with a fresh isolated profile). Otherwise a Chromium build is auto-downloaded on first run; to pre-download it instead: `npx playwright install chromium`
- **ffmpeg** *(optional, recommended)* — enables automatic video condensing (idle time between agent actions is cut out). Install with `brew install ffmpeg` (macOS) or `apt install ffmpeg` (Linux). Everything works without it; videos are just longer.
- **A VibeCheck personal API key** (only needed for the recording tools):
  1. Sign in at [app.vibecheck-qa.com](https://app.vibecheck-qa.com)
  2. Go to the **API Keys** page ([app.vibecheck-qa.com/api-keys](https://app.vibecheck-qa.com/api-keys))
  3. Click **Generate key** and copy the `vck_...` value (it is shown only once)

The key-created dialog also gives you **ready-made setup**: a copy-paste Claude Code command with your key already inside, and one-click **Add to Cursor** / **Add to VS Code** buttons — use those and skip the manual configs below.

The read tools work without any key or browser install.

### Claude Code

```bash
claude mcp add vibecheck \
  -e VIBECHECK_API_KEY=vck_your_key_here \
  -- npx -y @vibecheck-mcp/mcp
```

### Claude Desktop / Cursor / Windsurf

Add to your MCP config (`claude_desktop_config.json`, `.cursor/mcp.json`, or `~/.codeium/windsurf/mcp_config.json`):

```json
{
  "mcpServers": {
    "vibecheck": {
      "command": "npx",
      "args": ["-y", "@vibecheck-mcp/mcp"],
      "env": {
        "VIBECHECK_API_KEY": "vck_your_key_here"
      }
    }
  }
}
```

### VS Code

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "vibecheck": {
      "command": "npx",
      "args": ["-y", "@vibecheck-mcp/mcp"],
      "env": {
        "VIBECHECK_API_KEY": "vck_your_key_here"
      }
    }
  }
}
```

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VIBECHECK_API_KEY` | For recording only | Personal API key (`vck_...`) from the API Keys page. Uploads go to this account. |
| `VIBECHECK_API_URL` | No | Override the platform URL (default `https://app.vibecheck-qa.com`). Useful for self-hosted / local dev. |
| `VIBECHECK_HEADLESS` | No | Set to `1` to run the recorded browser without a visible window (CI, servers). Default is headed so you can watch the AI work. |
| `VIBECHECK_NO_CONDENSE` | No | Set to `1` to upload the full-length video instead of cutting out idle time between actions. |

---

## Use cases

### 1. "Go validate this" — QA checks with evidence

> *"Go to staging.myapp.com/pricing and validate that the Pro plan shows $29/month. Record it and give me the link."*

The AI opens the page, finds the value, confirms (or flags) it, finishes the session, and replies with a VibeCheck link. You forward the link to your team — anyone can watch the video, see the console, and check the network calls without installing anything.

### 2. Reproduce a bug from a report

> *"Here's a bug report: https://app.vibecheck-qa.com/tracks/abc123. Analyze it, then try to reproduce it on localhost:3000 and record your attempt."*

The AI reads the original track (steps to reproduce, console errors), replays the same flow against your dev server in a recorded session, and returns a new track showing whether the bug still reproduces.

### 3. Verify a fix before opening a PR

> *"You just fixed the checkout total bug — now prove it. Run through add-to-cart → checkout on localhost and attach the recording link to the PR description."*

Instead of "trust me, it works", the PR carries a link where reviewers watch the fixed flow, with the network tab showing the corrected API responses.

### 4. Smoke-test a deployment

> *"We just deployed. Go through login → dashboard → create project on production and record it. Flag any console errors."*

The recording doubles as a deployment artifact: if something regressed, the console errors and failed requests are already captured at the exact video timestamp.

### 5. Analyze an existing bug report (no recording)

> *"What's wrong in this track? https://app.vibecheck-qa.com/tracks/abc123"*

The classic read-only flow: the AI pulls errors, failed requests, slow endpoints, and steps to reproduce straight into your editor and can jump into your code to fix the cause.

---

## Tool reference

### Read tools (no auth required)

| Tool | Description |
|------|-------------|
| `get_track` | Full bug report — console logs, network, user actions, vitals. Params: `url_or_id`, optional `include` |
| `analyze_track_errors` | Console errors + failed network requests with stack traces and response bodies. Params: `url_or_id` |
| `get_track_network` | Failed/slow request analysis + summary table. Params: `url_or_id`, `slow_threshold_ms`, `status_filter` |
| `get_track_performance` | Web vitals with ratings and suggestions. Params: `url_or_id` |
| `get_track_actions` | Chronological action timeline + auto-generated steps to reproduce. Params: `url_or_id`, `action_types` |

### Recording tools (require `VIBECHECK_API_KEY`)

| Tool | Description |
|------|-------------|
| `browser_navigate` | Open a URL. **First call launches the browser and starts recording.** Params: `url` |
| `browser_snapshot` | Accessibility snapshot of the current page with element refs |
| `browser_click` | Click an element. Params: `element` (human label), `ref` or `selector` |
| `browser_type` | Type into an input. Params: `element`, `ref`/`selector`, `text`, optional `submit` (press Enter) |
| `browser_press_key` | Press a key (Enter, Escape, ArrowDown, Tab…). Params: `key` |
| `browser_select_option` | Select in a `<select>`. Params: `element`, `ref`/`selector`, `values[]` |
| `browser_hover` | Hover an element. Params: `element`, `ref`/`selector` |
| `browser_scroll` | Scroll the page. Params: `direction` (`up`/`down`), optional `amount` px |
| `browser_screenshot` | PNG screenshot of the current page (returned as an image) |
| `browser_wait_for` | Wait for text to appear/disappear or a fixed time. Params: `text`, `textGone`, `time` (s, max 30) |
| `browser_finish` | End the session: close browser, upload, **return the shareable track link**. Params: `title`, optional `notes`, optional `discard` |

Every interaction tool takes an `element` description (e.g. `"Login button"`) — that label is what appears on the track's action timeline, so the recording reads like human-written repro steps.

### What exactly gets recorded

| Data | Details |
|------|---------|
| Video | 1280×720 WebM with a visible cursor, click ripples, and per-action captions. With ffmpeg installed, idle time between actions is cut out automatically (timeline stays synced); otherwise the full session is kept |
| Console | All `console.*` output + uncaught JS errors (capped at 1000 entries, 5000 chars each) |
| Network | Every request with method/status/duration; request+response headers and response bodies (JSON/text, ≤50 KB) for `fetch`/XHR calls (capped at 500 requests) |
| Actions | One labeled entry per tool call: navigations, clicks, typing, key presses, scrolls, hovers |
| Navigations | Every page URL visited, with best-effort First Contentful Paint timing |

Notes:
- Popups that open a new tab are adopted into the main tab (single-video artifact).
- Recordings count toward your plan's monthly recording limit (Free: 25/mo). The limit is checked *before* the browser opens and again at upload.
- Track links are public-by-URL (unguessable ID) — same sharing model as extension-recorded tracks. Don't record pages containing secrets you wouldn't put in a bug report.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Could not find or install a browser` | Install Google Chrome, or run `npx playwright install chromium` |
| `VIBECHECK_API_KEY is not set` | Generate a key at **app.vibecheck-qa.com/api-keys** and add it to your MCP config's `env` |
| `VibeCheck rejected the API key (401)` | Key was revoked or mistyped — generate a new one |
| `Monthly recording limit reached` | You hit your plan's recordings/month cap — upgrade or wait for the monthly reset |
| Upload failed but I need the recording | The error message includes the local path of the saved `.webm` — it is not deleted |
| Video doesn't play in Safari | Recordings are WebM (VP8); watch in Chrome/Edge/Firefox for now |
| Videos are long, mostly idle waiting | Install ffmpeg (`brew install ffmpeg` / `apt install ffmpeg`) — idle time between actions is then cut out automatically |
| I want the full uncut video | Set `VIBECHECK_NO_CONDENSE=1` in the MCP config's `env` |
| I want headless recording (CI) | Set `VIBECHECK_HEADLESS=1` in the MCP config's `env` |

---

## Privacy & security

- The plaintext API key is stored only in your MCP config; VibeCheck stores a SHA-256 hash. Revoke keys anytime on the **API Keys** page.
- The browser session is a fresh, isolated profile — no cookies or logins from your daily browser leak into recordings.
- All recorded data (video, logs, network) is uploaded only when you call `browser_finish` without `discard`. Until then, everything stays on your machine.
