import { z } from "zod";
import { fetchTrack } from "../api/client.js";
import { TrackToolResult } from "../types.js";
import { formatRelativeTime, truncate, formatBytes, getStatusEmoji } from "../transformers/utils.js";

export const getTrackNetworkSchema = z.object({
  url_or_id: z.string().describe("The track URL or ID. Supports URLs like https://app.vibecheck-qa.com/tracks/{id} or just the ID"),
  slow_threshold_ms: z.number().optional().default(1000).describe("Threshold in ms to flag slow requests. Default: 1000"),
  status_filter: z.enum(["all", "errors", "success"]).optional().default("all").describe("Filter by status: all, errors (4xx/5xx), success (2xx/3xx). Default: all"),
});

export type GetTrackNetworkInput = z.infer<typeof getTrackNetworkSchema>;

export async function getTrackNetwork(input: GetTrackNetworkInput): Promise<TrackToolResult> {
  const track = await fetchTrack(input.url_or_id);
  const slowThreshold = input.slow_threshold_ms ?? 1000;
  const statusFilter = input.status_filter ?? "all";

  const lines: string[] = [];

  lines.push(`# Network Analysis: ${track.title || "Untitled"}`);
  lines.push("");
  lines.push(`Track ID: \`${track.id}\``);
  lines.push(`URL: ${track.metadata.url}`);
  lines.push("");

  let requests = track.network;

  // Apply status filter
  if (statusFilter === "errors") {
    requests = requests.filter(r => r.statusCode >= 400 || r.error);
  } else if (statusFilter === "success") {
    requests = requests.filter(r => r.statusCode >= 200 && r.statusCode < 400 && !r.error);
  }

  if (requests.length === 0) {
    lines.push("No network requests match the filter.");
    return { text: lines.join("\n") };
  }

  // Failed requests (detailed)
  const failed = requests.filter(r => r.statusCode >= 400 || r.error);
  if (failed.length > 0) {
    lines.push(`## Failed Requests (${failed.length})`);
    lines.push("");

    failed.forEach(req => {
      const time = formatRelativeTime(req.time, track.startTs);
      lines.push(`### ${req.method} ${req.url}`);
      lines.push("");
      lines.push(`- **Status**: ${req.statusCode} ${getStatusEmoji(req.statusCode)}`);
      lines.push(`- **Time**: ${time}`);
      if (req.duration) lines.push(`- **Duration**: ${req.duration}ms`);
      if (req.type) lines.push(`- **Type**: ${req.type}`);
      if (req.error) lines.push(`- **Error**: ${req.error}`);

      if (req.responseBody) {
        lines.push("");
        lines.push("**Response Body:**");
        lines.push("```");
        lines.push(truncate(req.responseBody, 800));
        lines.push("```");
      }
      lines.push("");
    });
  }

  // Slow requests
  const slow = requests
    .filter(r => r.duration && r.duration > slowThreshold && r.statusCode < 400)
    .sort((a, b) => (b.duration || 0) - (a.duration || 0));

  if (slow.length > 0) {
    lines.push(`## Slow Requests (>${slowThreshold}ms) — ${slow.length} found`);
    lines.push("");
    lines.push("| Duration | Method | Status | URL |");
    lines.push("|----------|--------|--------|-----|");

    slow.slice(0, 20).forEach(req => {
      const url = truncate(req.url, 60);
      lines.push(`| ${req.duration}ms | ${req.method} | ${req.statusCode} | ${url} |`);
    });

    if (slow.length > 20) {
      lines.push(`| ... | ... | ... | ${slow.length - 20} more slow requests |`);
    }
    lines.push("");
  }

  // Summary table
  lines.push(`## All Requests Summary (${requests.length} total)`);
  lines.push("");
  lines.push("| Time | Method | Status | Duration | Size | URL |");
  lines.push("|------|--------|--------|----------|------|-----|");

  requests.slice(0, 50).forEach(req => {
    const time = formatRelativeTime(req.time, track.startTs);
    const status = `${req.statusCode} ${getStatusEmoji(req.statusCode)}`;
    const duration = req.duration ? `${req.duration}ms` : "-";
    const size = req.responseBodySize ? formatBytes(req.responseBodySize) : "-";
    const url = truncate(req.url, 50);
    lines.push(`| ${time} | ${req.method} | ${status} | ${duration} | ${size} | ${url} |`);
  });

  if (requests.length > 50) {
    lines.push(`| ... | ... | ... | ... | ... | ${requests.length - 50} more |`);
  }
  lines.push("");

  // Stats
  const totalFailed = track.network.filter(r => r.statusCode >= 400 || r.error).length;
  const totalSlow = track.network.filter(r => r.duration && r.duration > slowThreshold).length;
  const avgDuration = track.network.reduce((sum, r) => sum + (r.duration || 0), 0) / (track.network.length || 1);

  lines.push("## Summary Stats");
  lines.push("");
  lines.push(`- **Total requests**: ${track.network.length}`);
  lines.push(`- **Failed**: ${totalFailed}`);
  lines.push(`- **Slow (>${slowThreshold}ms)**: ${totalSlow}`);
  lines.push(`- **Average duration**: ${Math.round(avgDuration)}ms`);
  lines.push("");

  return { text: lines.join("\n") };
}
