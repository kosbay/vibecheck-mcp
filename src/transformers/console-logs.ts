import { LogEntry } from "../types.js";
import { formatRelativeTime, truncate, escapeMarkdown } from "./utils.js";

interface GroupedLogs {
  errors: LogEntry[];
  warnings: LogEntry[];
  info: LogEntry[];
  other: LogEntry[];
}

function groupLogsByLevel(logs: LogEntry[]): GroupedLogs {
  return logs.reduce<GroupedLogs>(
    (acc, log) => {
      switch (log.level) {
        case "error":
          acc.errors.push(log);
          break;
        case "warn":
          acc.warnings.push(log);
          break;
        case "info":
        case "log":
          acc.info.push(log);
          break;
        default:
          acc.other.push(log);
      }
      return acc;
    },
    { errors: [], warnings: [], info: [], other: [] }
  );
}

function formatLogEntry(log: LogEntry, startTs: number): string {
  const time = formatRelativeTime(log.time, startTs);
  const levelIcon = log.level === "error" ? "[ERROR]" : log.level === "warn" ? "[WARN]" : `[${log.level.toUpperCase()}]`;
  const message = truncate(log.msg, 300);
  return `\`${time}\` ${levelIcon} ${escapeMarkdown(message)}`;
}

export function formatConsoleLogs(logs: LogEntry[], startTs: number): string {
  const lines: string[] = [];

  if (logs.length === 0) {
    lines.push("## Console Logs");
    lines.push("");
    lines.push("No console logs captured.");
    lines.push("");
    return lines.join("\n");
  }

  const grouped = groupLogsByLevel(logs);

  lines.push("## Console Logs");
  lines.push("");
  lines.push(`Total: ${logs.length} entries (${grouped.errors.length} errors, ${grouped.warnings.length} warnings)`);
  lines.push("");

  // Errors first (most important)
  if (grouped.errors.length > 0) {
    lines.push("### Errors");
    lines.push("");
    grouped.errors.forEach(log => {
      lines.push(`- ${formatLogEntry(log, startTs)}`);
    });
    lines.push("");
  }

  // Then warnings
  if (grouped.warnings.length > 0) {
    lines.push("### Warnings");
    lines.push("");
    grouped.warnings.forEach(log => {
      lines.push(`- ${formatLogEntry(log, startTs)}`);
    });
    lines.push("");
  }

  // Info/log messages (show first 20)
  if (grouped.info.length > 0) {
    lines.push("### Info/Log");
    lines.push("");
    const displayLogs = grouped.info.slice(0, 20);
    displayLogs.forEach(log => {
      lines.push(`- ${formatLogEntry(log, startTs)}`);
    });
    if (grouped.info.length > 20) {
      lines.push(`- ... and ${grouped.info.length - 20} more`);
    }
    lines.push("");
  }

  // Other levels (show first 10)
  if (grouped.other.length > 0) {
    lines.push("### Other");
    lines.push("");
    const displayLogs = grouped.other.slice(0, 10);
    displayLogs.forEach(log => {
      lines.push(`- ${formatLogEntry(log, startTs)}`);
    });
    if (grouped.other.length > 10) {
      lines.push(`- ... and ${grouped.other.length - 10} more`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
