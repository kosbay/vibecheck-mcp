import { TrackDetail, IncludeSection } from "../types.js";
import { formatSummary } from "./summary.js";
import { formatConsoleLogs } from "./console-logs.js";
import { formatNetworkRequests } from "./network.js";
import { formatUserActions } from "./user-actions.js";
import { formatVitals } from "./vitals.js";

export interface FormatOptions {
  include?: IncludeSection[];
}

function shouldInclude(section: IncludeSection, options: FormatOptions): boolean {
  if (!options.include || options.include.length === 0) {
    return true; // Include all by default
  }
  return options.include.includes("all") || options.include.includes(section);
}

export function formatTrack(track: TrackDetail, options: FormatOptions = {}): string {
  const sections: string[] = [];

  // Always include summary
  sections.push(formatSummary(track));

  // Conditionally include other sections
  if (shouldInclude("logs", options)) {
    sections.push(formatConsoleLogs(track.logs, track.startTs));
  }

  if (shouldInclude("network", options)) {
    sections.push(formatNetworkRequests(track.network, track.startTs));
  }

  if (shouldInclude("actions", options)) {
    sections.push(formatUserActions(track.userActions, track.locations, track.startTs));
  }

  if (shouldInclude("vitals", options)) {
    sections.push(formatVitals(track.vitals));
  }

  // Add footer with media URL
  sections.push("---");
  sections.push("");
  sections.push(`**Video/Screenshot**: ${track.mediaUrl}`);
  sections.push("");

  return sections.join("\n");
}

export function formatErrorsOnly(track: TrackDetail): string {
  const sections: string[] = [];

  sections.push(`# Error Analysis: ${track.title || "Untitled"}`);
  sections.push("");
  sections.push(`Track ID: \`${track.id}\``);
  sections.push(`URL: ${track.metadata.url}`);
  sections.push("");

  // Console errors
  const consoleErrors = track.logs.filter(log => log.level === "error");
  sections.push("## Console Errors");
  sections.push("");

  if (consoleErrors.length === 0) {
    sections.push("No console errors.");
  } else {
    sections.push(`Found ${consoleErrors.length} error(s):`);
    sections.push("");

    consoleErrors.forEach((error, index) => {
      const relativeTime = Math.floor((error.time - track.startTs) / 1000);
      const minutes = Math.floor(relativeTime / 60);
      const seconds = relativeTime % 60;
      const timeStr = `${minutes}:${seconds.toString().padStart(2, "0")}`;

      sections.push(`### Error ${index + 1} (at ${timeStr})`);
      sections.push("");
      sections.push("```");
      sections.push(error.msg);
      sections.push("```");
      sections.push("");
    });
  }

  // Network errors
  const networkErrors = track.network.filter(req => req.statusCode >= 400 || req.error);
  sections.push("## Network Errors");
  sections.push("");

  if (networkErrors.length === 0) {
    sections.push("No network errors.");
  } else {
    sections.push(`Found ${networkErrors.length} failed request(s):`);
    sections.push("");

    networkErrors.forEach((req, index) => {
      const relativeTime = Math.floor((req.time - track.startTs) / 1000);
      const minutes = Math.floor(relativeTime / 60);
      const seconds = relativeTime % 60;
      const timeStr = `${minutes}:${seconds.toString().padStart(2, "0")}`;

      sections.push(`### Request ${index + 1} (at ${timeStr})`);
      sections.push("");
      sections.push(`- **URL**: ${req.url}`);
      sections.push(`- **Method**: ${req.method}`);
      sections.push(`- **Status**: ${req.statusCode}`);
      if (req.error) {
        sections.push(`- **Error**: ${req.error}`);
      }

      if (req.responseBody) {
        sections.push("");
        sections.push("**Response Body:**");
        sections.push("```");
        sections.push(req.responseBody.slice(0, 1000));
        if (req.responseBody.length > 1000) {
          sections.push("... (truncated)");
        }
        sections.push("```");
      }
      sections.push("");
    });
  }

  return sections.join("\n");
}

export { formatSummary, formatConsoleLogs, formatNetworkRequests, formatUserActions, formatVitals };
