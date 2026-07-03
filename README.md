# @vibecheck-mcp/mcp

MCP server for [VibeCheck](https://vibecheck-qa.com) bug reports. Gives AI assistants direct access to screen recordings, console logs, network requests, user actions, and web vitals — right inside your editor.

Just paste a VibeCheck track URL and your AI can analyze the bug report. It can also **record its own browser sessions**: tell your AI "go to this page and validate this value" and it drives a local browser while VibeCheck records everything, returning a shareable track link as evidence.

📖 **[Full guide — features, installation, use cases → DOCS.md](./DOCS.md)**

## Tools

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

## Screenshot Support

For **screenshot** tracks, `get_track` and `analyze_track_errors` return the screenshot image alongside the text report using MCP's `ImageContent` type. Video tracks return text data only (no video fetch).

## Setup

### Claude Code

```bash
claude mcp add vibecheck -- npx -y @vibecheck-mcp/mcp
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "vibecheck": {
      "command": "npx",
      "args": ["-y", "@vibecheck-mcp/mcp"]
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "vibecheck": {
      "command": "npx",
      "args": ["-y", "@vibecheck-mcp/mcp"]
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "vibecheck": {
      "command": "npx",
      "args": ["-y", "@vibecheck-mcp/mcp"]
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
      "args": ["-y", "@vibecheck-mcp/mcp"]
    }
  }
}
```

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
