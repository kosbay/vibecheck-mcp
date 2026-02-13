import { UserAction, LocationEntry } from "../types.js";
import { formatRelativeTime, truncate, escapeMarkdown } from "./utils.js";

function getActionIcon(type: string): string {
  switch (type.toLowerCase()) {
    case "click":
      return "[click]";
    case "input":
    case "type":
      return "[input]";
    case "scroll":
      return "[scroll]";
    case "navigation":
    case "navigate":
      return "[nav]";
    case "keypress":
    case "keyboard":
      return "[key]";
    case "focus":
      return "[focus]";
    case "blur":
      return "[blur]";
    case "submit":
      return "[submit]";
    default:
      return `[${type}]`;
  }
}

export function formatUserActions(
  actions: UserAction[],
  locations: LocationEntry[],
  startTs: number
): string {
  const lines: string[] = [];

  if (actions.length === 0 && locations.length === 0) {
    lines.push("## User Actions");
    lines.push("");
    lines.push("No user actions captured.");
    lines.push("");
    return lines.join("\n");
  }

  lines.push("## User Actions");
  lines.push("");
  lines.push(`Total: ${actions.length} actions, ${locations.length} page navigations`);
  lines.push("");

  // Merge actions and locations into a timeline
  interface TimelineEvent {
    time: number;
    type: "action" | "location";
    data: UserAction | LocationEntry;
  }

  const timeline: TimelineEvent[] = [
    ...actions.map(a => ({ time: a.time, type: "action" as const, data: a })),
    ...locations.map(l => ({ time: l.time, type: "location" as const, data: l })),
  ].sort((a, b) => a.time - b.time);

  // Show timeline (first 50 events)
  const displayEvents = timeline.slice(0, 50);

  displayEvents.forEach(event => {
    const time = formatRelativeTime(event.time, startTs);

    if (event.type === "location") {
      const loc = event.data as LocationEntry;
      lines.push(`- \`${time}\` [PAGE] Navigated to: ${escapeMarkdown(loc.location)}`);
    } else {
      const action = event.data as UserAction;
      const icon = getActionIcon(action.type);
      const label = truncate(action.label, 100);
      const details = action.details ? ` - ${truncate(action.details, 100)}` : "";
      lines.push(`- \`${time}\` ${icon} ${escapeMarkdown(label)}${escapeMarkdown(details)}`);
    }
  });

  if (timeline.length > 50) {
    lines.push(`- ... and ${timeline.length - 50} more events`);
  }

  lines.push("");

  return lines.join("\n");
}
