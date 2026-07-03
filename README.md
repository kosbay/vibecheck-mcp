# @vibecheck-mcp/mcp

MCP server for [VibeCheck](https://vibecheck-qa.com) — connect AI assistants (Claude Code, Claude Desktop, Cursor, Windsurf, VS Code) to your bug reports, and let them **record their own browser sessions** as shareable bug reports.

📖 **[Full guide — features, installation, use cases → DOCS.md](https://github.com/kosbay/vibecheck-mcp/blob/main/DOCS.md)**

## 🎬 Record browser sessions (new)

Give your AI agent a task in plain English — it drives a real browser on your machine while VibeCheck records everything, then returns a shareable link:

```
You:   Go to staging.myapp.com/cart, add a product and check the total
       updates. Record it and send me the link.

Agent: ⏺ Opening browser — recording started
       ⏺ Clicked: Add to cart
       ⏺ Validated: total updated to $42.00 ✓

       Recording uploaded to VibeCheck.
       Shareable link: https://app.vibecheck-qa.com/tracks/1783…
```

The link opens a full bug report: **video** of the session, **console logs**, **network requests** (with response bodies), and a labeled **action timeline** — all synced. Anyone can watch it, no account needed.

- **No AI inside** — your assistant does the reasoning and clicking; this server is a recorded browser plus an uploader. No extra LLM costs.
- **Local browser** — works against `localhost` dev servers and VPN-only staging. Uses your installed Chrome/Edge automatically (fresh isolated profile); auto-downloads a browser if neither exists.
- **11 tools** — `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_press_key`, `browser_select_option`, `browser_hover`, `browser_scroll`, `browser_screenshot`, `browser_wait_for`, `browser_finish` (uploads + returns the link).

Perfect for: "go validate this page", reproducing a bug from an existing report, proving a fix before a PR, smoke-testing a deploy.

## Installation

### Requirements

- **Node.js 18+**
- **A browser** — nothing to install if you have Google Chrome or Microsoft Edge (auto-detected). Otherwise one is auto-downloaded on first run (or pre-download: `npx playwright install chromium`)
- **A VibeCheck API key** (recording only — the read tools below need no key):
  1. Sign in at [app.vibecheck-qa.com](https://app.vibecheck-qa.com)
  2. Open **Settings → API Keys** → **Generate key**
  3. The dialog gives you a ready-made setup: a copy-paste Claude Code command with your key already inside, plus one-click **Add to Cursor** / **Add to VS Code** buttons — use those and skip the manual configs below

### Claude Code

```bash
claude mcp add vibecheck \
  -e VIBECHECK_API_KEY=vck_your_key_here \
  -- npx -y @vibecheck-mcp/mcp
```

### Claude Desktop

Add to `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/`, Windows: `%APPDATA%\Claude\`), then restart Claude Desktop:

```json
{
  "mcpServers": {
    "vibecheck": {
      "command": "npx",
      "args": ["-y", "@vibecheck-mcp/mcp"],
      "env": { "VIBECHECK_API_KEY": "vck_your_key_here" }
    }
  }
}
```

### Cursor

Add the same block to `.cursor/mcp.json` (or use the one-click **Add to Cursor** button in VibeCheck Settings):

```json
{
  "mcpServers": {
    "vibecheck": {
      "command": "npx",
      "args": ["-y", "@vibecheck-mcp/mcp"],
      "env": { "VIBECHECK_API_KEY": "vck_your_key_here" }
    }
  }
}
```

### Windsurf

Add the same `mcpServers` block to `~/.codeium/windsurf/mcp_config.json`.

### VS Code

Add to `.vscode/mcp.json` (note the key is `servers`):

```json
{
  "servers": {
    "vibecheck": {
      "command": "npx",
      "args": ["-y", "@vibecheck-mcp/mcp"],
      "env": { "VIBECHECK_API_KEY": "vck_your_key_here" }
    }
  }
}
```

### Verify it works

Open a **new** session in your AI tool and paste:

```
Go to https://example.com, then finish the recording titled "Setup test"
and give me the link.
```

A browser window opens, and within ~15 seconds the agent replies with a `.../tracks/...` link. If the video plays — you're set. 🎉

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VIBECHECK_API_KEY` | For recording | Personal API key (`vck_...`) from Settings → API Keys |
| `VIBECHECK_API_URL` | No | Override platform URL (default `https://app.vibecheck-qa.com`) |
| `VIBECHECK_HEADLESS` | No | Set `1` to hide the browser window (CI) |

## 🔍 Analyze bug reports

Paste a VibeCheck track URL and your AI pulls in the full debugging context — no API key needed:

| Tool | Description | Image? |
|------|-------------|--------|
| `get_track` | Full bug report — console logs, network, user actions, vitals | Yes (screenshots) |
| `analyze_track_errors` | Focused error analysis — console errors + failed network requests | Yes (screenshots) |
| `get_track_network` | Network deep-dive — failed requests, slow requests, summary table | No |
| `get_track_performance` | Performance report — web vitals, navigation timing, assessment | No |
| `get_track_actions` | User action timeline + auto-generated steps to reproduce | No |

### `get_track`

Fetch and format a complete VibeCheck bug report.

**Parameters:**
- `url_or_id` (required) — Track URL or ID
- `include` (optional) — Sections to include: `logs`, `network`, `actions`, `vitals`, `all`

### `analyze_track_errors`

Focused view of errors only — console errors with stack traces and failed network requests with response bodies.

**Parameters:**
- `url_or_id` (required) — Track URL or ID

### `get_track_network`

Deep analysis of network requests with failed/slow request detection.

**Parameters:**
- `url_or_id` (required) — Track URL or ID
- `slow_threshold_ms` (optional, default: 1000) — Threshold in ms to flag slow requests
- `status_filter` (optional, default: `all`) — Filter: `all`, `errors`, `success`

### `get_track_performance`

Web vitals analysis with ratings and optimization suggestions.

**Parameters:**
- `url_or_id` (required) — Track URL or ID

### `get_track_actions`

User action timeline with auto-generated steps to reproduce.

**Parameters:**
- `url_or_id` (required) — Track URL or ID
- `action_types` (optional) — Filter by type: `click`, `input`, `scroll`, `navigation`, etc.

### Screenshot support

For **screenshot** tracks, `get_track` and `analyze_track_errors` return the screenshot image alongside the text report using MCP's `ImageContent` type. Video tracks return text data only (no video fetch).

## Development

```bash
git clone https://github.com/kosbay/vibecheck-mcp.git
cd vibecheck-mcp
npm install
npm run build
npm start
```

## License

MIT
