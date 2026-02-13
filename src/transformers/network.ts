import { NetworkRequest } from "../types.js";
import { formatRelativeTime, truncate, formatBytes, getStatusEmoji } from "./utils.js";

function isErrorRequest(req: NetworkRequest): boolean {
  return req.statusCode >= 400 || !!req.error;
}

function formatUrl(url: string, maxLength: number = 60): string {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname + urlObj.search;
    if (path.length > maxLength) {
      return path.slice(0, maxLength) + "...";
    }
    return path;
  } catch {
    if (url.length > maxLength) {
      return url.slice(0, maxLength) + "...";
    }
    return url;
  }
}

function formatRequestDetails(req: NetworkRequest, startTs: number): string {
  const lines: string[] = [];

  lines.push(`#### ${req.method} ${req.url}`);
  lines.push("");
  lines.push(`- **Status**: ${req.statusCode} ${getStatusEmoji(req.statusCode)}`);
  lines.push(`- **Time**: ${formatRelativeTime(req.time, startTs)}`);
  if (req.duration) {
    lines.push(`- **Duration**: ${req.duration}ms`);
  }
  if (req.type) {
    lines.push(`- **Type**: ${req.type}`);
  }
  if (req.responseBodySize) {
    lines.push(`- **Size**: ${formatBytes(req.responseBodySize)}`);
  }
  if (req.error) {
    lines.push(`- **Error**: ${req.error}`);
  }

  // Show response body for errors (truncated)
  if (req.responseBody && isErrorRequest(req)) {
    lines.push("");
    lines.push("**Response Body:**");
    lines.push("```");
    lines.push(truncate(req.responseBody, 500));
    lines.push("```");
  }

  lines.push("");
  return lines.join("\n");
}

export function formatNetworkRequests(requests: NetworkRequest[], startTs: number): string {
  const lines: string[] = [];

  if (requests.length === 0) {
    lines.push("## Network Requests");
    lines.push("");
    lines.push("No network requests captured.");
    lines.push("");
    return lines.join("\n");
  }

  const errors = requests.filter(isErrorRequest);
  const successful = requests.filter(req => !isErrorRequest(req));

  lines.push("## Network Requests");
  lines.push("");
  lines.push(`Total: ${requests.length} requests (${errors.length} failed)`);
  lines.push("");

  // Failed requests first (detailed)
  if (errors.length > 0) {
    lines.push("### Failed Requests");
    lines.push("");
    errors.forEach(req => {
      lines.push(formatRequestDetails(req, startTs));
    });
  }

  // All requests summary table
  lines.push("### All Requests");
  lines.push("");
  lines.push("| Time | Method | Status | URL | Duration |");
  lines.push("|------|--------|--------|-----|----------|");

  // Show first 30 requests
  const displayRequests = requests.slice(0, 30);
  displayRequests.forEach(req => {
    const time = formatRelativeTime(req.time, startTs);
    const status = `${req.statusCode} ${getStatusEmoji(req.statusCode)}`;
    const url = formatUrl(req.url, 40);
    const duration = req.duration ? `${req.duration}ms` : "-";
    lines.push(`| ${time} | ${req.method} | ${status} | ${url} | ${duration} |`);
  });

  if (requests.length > 30) {
    lines.push(`| ... | ... | ... | ${requests.length - 30} more requests | ... |`);
  }

  lines.push("");

  return lines.join("\n");
}
