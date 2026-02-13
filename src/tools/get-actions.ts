import { z } from "zod";
import { fetchTrack } from "../api/client.js";
import { TrackToolResult, UserAction, LocationEntry } from "../types.js";
import { formatRelativeTime, truncate, escapeMarkdown } from "../transformers/utils.js";

export const getTrackActionsSchema = z.object({
  url_or_id: z.string().describe("The track URL or ID. Supports URLs like https://app.vibecheck-qa.com/tracks/{id} or just the ID"),
  action_types: z.array(z.string()).optional().describe("Filter by action types (e.g. click, input, scroll, navigation). Omit for all types"),
});

export type GetTrackActionsInput = z.infer<typeof getTrackActionsSchema>;

function getActionIcon(type: string): string {
  switch (type.toLowerCase()) {
    case "click": return "[click]";
    case "input": case "type": return "[input]";
    case "scroll": return "[scroll]";
    case "navigation": case "navigate": return "[nav]";
    case "keypress": case "keyboard": return "[key]";
    case "focus": return "[focus]";
    case "blur": return "[blur]";
    case "submit": return "[submit]";
    default: return `[${type}]`;
  }
}

export async function getTrackActions(input: GetTrackActionsInput): Promise<TrackToolResult> {
  const track = await fetchTrack(input.url_or_id);

  const lines: string[] = [];

  lines.push(`# User Actions: ${track.title || "Untitled"}`);
  lines.push("");
  lines.push(`Track ID: \`${track.id}\``);
  lines.push(`URL: ${track.metadata.url}`);
  lines.push("");

  let actions = track.userActions;

  // Apply type filter
  if (input.action_types && input.action_types.length > 0) {
    const filterTypes = input.action_types.map(t => t.toLowerCase());
    actions = actions.filter(a => filterTypes.includes(a.type.toLowerCase()));
  }

  // Build timeline
  interface TimelineEvent {
    time: number;
    kind: "action" | "location";
    data: UserAction | LocationEntry;
  }

  const timeline: TimelineEvent[] = [
    ...actions.map(a => ({ time: a.time, kind: "action" as const, data: a })),
    ...track.locations.map(l => ({ time: l.time, kind: "location" as const, data: l })),
  ].sort((a, b) => a.time - b.time);

  if (timeline.length === 0) {
    lines.push("No user actions captured.");
    return { text: lines.join("\n") };
  }

  // Action timeline
  lines.push(`## Timeline (${actions.length} actions, ${track.locations.length} navigations)`);
  lines.push("");

  timeline.slice(0, 80).forEach(event => {
    const time = formatRelativeTime(event.time, track.startTs);

    if (event.kind === "location") {
      const loc = event.data as LocationEntry;
      lines.push(`- \`${time}\` [PAGE] Navigated to: ${escapeMarkdown(loc.location)}`);
    } else {
      const action = event.data as UserAction;
      const icon = getActionIcon(action.type);
      const label = truncate(action.label, 100);
      const details = action.details ? ` — ${truncate(action.details, 100)}` : "";
      lines.push(`- \`${time}\` ${icon} ${escapeMarkdown(label)}${escapeMarkdown(details)}`);
    }
  });

  if (timeline.length > 80) {
    lines.push(`- ... and ${timeline.length - 80} more events`);
  }
  lines.push("");

  // Steps to reproduce
  lines.push("## Steps to Reproduce");
  lines.push("");

  let stepNum = 1;
  let currentPage = "";

  timeline.forEach(event => {
    if (event.kind === "location") {
      const loc = event.data as LocationEntry;
      if (loc.location !== currentPage) {
        lines.push(`${stepNum}. Navigate to \`${loc.location}\``);
        stepNum++;
        currentPage = loc.location;
      }
    } else {
      const action = event.data as UserAction;
      const type = action.type.toLowerCase();

      if (type === "scroll") return; // Skip scroll events for steps

      let step = "";
      if (type === "click") {
        step = `Click on "${truncate(action.label, 60)}"`;
      } else if (type === "input" || type === "type") {
        const value = action.details ? ` with value "${truncate(action.details, 40)}"` : "";
        step = `Type in "${truncate(action.label, 60)}"${value}`;
      } else if (type === "submit") {
        step = `Submit "${truncate(action.label, 60)}"`;
      } else if (type === "keypress" || type === "keyboard") {
        step = `Press key${action.details ? ` "${action.details}"` : ""} on "${truncate(action.label, 60)}"`;
      } else if (type === "focus") {
        step = `Focus on "${truncate(action.label, 60)}"`;
      } else {
        step = `${action.type}: "${truncate(action.label, 60)}"`;
      }

      lines.push(`${stepNum}. ${step}`);
      stepNum++;
    }
  });

  lines.push("");

  // Action type breakdown
  const typeCounts: Record<string, number> = {};
  actions.forEach(a => {
    const type = a.type.toLowerCase();
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  });

  if (Object.keys(typeCounts).length > 0) {
    lines.push("## Action Breakdown");
    lines.push("");
    Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, count]) => {
        lines.push(`- **${type}**: ${count}`);
      });
    lines.push("");
  }

  return { text: lines.join("\n") };
}
