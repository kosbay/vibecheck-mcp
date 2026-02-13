import { TrackDetail } from "../types.js";
import { formatDuration, formatTimestamp } from "./utils.js";

export function formatSummary(track: TrackDetail): string {
  const lines: string[] = [];

  lines.push(`# Bug Report: ${track.title || "Untitled"}`);
  lines.push("");

  // Overview section
  lines.push("## Overview");
  lines.push("");
  lines.push(`| Property | Value |`);
  lines.push(`|----------|-------|`);
  lines.push(`| **Track ID** | \`${track.id}\` |`);
  lines.push(`| **Type** | ${track.type} |`);
  lines.push(`| **URL** | ${track.metadata.url} |`);
  lines.push(`| **Browser** | ${track.metadata.browser} |`);
  lines.push(`| **Platform** | ${track.metadata.platform} |`);
  lines.push(`| **Duration** | ${formatDuration(track.duration)} |`);
  lines.push(`| **Resolution** | ${track.resolution || "Unknown"} |`);
  lines.push(`| **Created** | ${formatTimestamp(track.createdAt)} |`);
  if (track.country) {
    lines.push(`| **Country** | ${track.country} |`);
  }
  lines.push("");

  // Description if present
  if (track.description) {
    lines.push("### Description");
    lines.push("");
    lines.push(track.description);
    lines.push("");
  }

  // Error summary
  lines.push("## Error Summary");
  lines.push("");

  const consoleErrors = track.logs.filter(log => log.level === "error").length;
  const consoleWarnings = track.logs.filter(log => log.level === "warn").length;
  const networkErrors = track.network.filter(req => req.statusCode >= 400 || req.error).length;

  if (consoleErrors === 0 && networkErrors === 0) {
    lines.push("No errors detected.");
  } else {
    lines.push(`- **Console Errors**: ${consoleErrors}`);
    lines.push(`- **Console Warnings**: ${consoleWarnings}`);
    lines.push(`- **Network Errors**: ${networkErrors}`);
  }
  lines.push("");

  return lines.join("\n");
}
