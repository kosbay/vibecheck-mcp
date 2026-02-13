import { z } from "zod";
import { fetchTrack } from "../api/client.js";
import { TrackToolResult } from "../types.js";
import { formatVitals } from "../transformers/vitals.js";

export const getTrackPerformanceSchema = z.object({
  url_or_id: z.string().describe("The track URL or ID. Supports URLs like https://app.vibecheck-qa.com/tracks/{id} or just the ID"),
});

export type GetTrackPerformanceInput = z.infer<typeof getTrackPerformanceSchema>;

export async function getTrackPerformance(input: GetTrackPerformanceInput): Promise<TrackToolResult> {
  const track = await fetchTrack(input.url_or_id);

  const lines: string[] = [];

  lines.push(`# Performance Report: ${track.title || "Untitled"}`);
  lines.push("");
  lines.push(`Track ID: \`${track.id}\``);
  lines.push(`URL: ${track.metadata.url}`);
  lines.push("");

  // Web vitals (reuse existing formatter)
  lines.push(formatVitals(track.vitals));

  // Navigation timing per page
  if (track.locations && track.locations.length > 0) {
    lines.push("## Navigation Timing");
    lines.push("");
    lines.push("| Page | FCP | Visually Complete | Time to Interactive |");
    lines.push("|------|-----|-------------------|---------------------|");

    track.locations.forEach(loc => {
      const nav = loc.navTiming;
      const fcp = nav.fcpTime ? `${Math.round(nav.fcpTime)}ms` : "-";
      const vc = nav.visuallyComplete ? `${Math.round(nav.visuallyComplete)}ms` : "-";
      const tti = nav.timeToInteractive ? `${Math.round(nav.timeToInteractive)}ms` : "-";
      const page = loc.location.length > 60 ? loc.location.slice(0, 60) + "..." : loc.location;
      lines.push(`| ${page} | ${fcp} | ${vc} | ${tti} |`);
    });

    lines.push("");
  }

  // Performance assessment
  lines.push("## Assessment");
  lines.push("");

  const poorVitals = track.vitals.filter(v => {
    const thresholds: Record<string, number> = {
      LCP: 4000, FID: 300, CLS: 0.25, FCP: 3000, TTFB: 1800, INP: 500,
    };
    return v.value > (thresholds[v.name] || Infinity);
  });

  const needsImprovementVitals = track.vitals.filter(v => {
    const good: Record<string, number> = {
      LCP: 2500, FID: 100, CLS: 0.1, FCP: 1800, TTFB: 800, INP: 200,
    };
    const poor: Record<string, number> = {
      LCP: 4000, FID: 300, CLS: 0.25, FCP: 3000, TTFB: 1800, INP: 500,
    };
    return v.value > (good[v.name] || 0) && v.value <= (poor[v.name] || Infinity);
  });

  if (track.vitals.length === 0) {
    lines.push("No web vitals data available for assessment.");
  } else if (poorVitals.length > 0) {
    lines.push(`**Needs attention**: ${poorVitals.map(v => v.name).join(", ")} rated **Poor**.`);
    lines.push("");
    poorVitals.forEach(v => {
      const descriptions: Record<string, string> = {
        LCP: "Largest Contentful Paint is too slow — optimize images, fonts, and critical rendering path",
        FID: "First Input Delay is too high — reduce JavaScript execution time on the main thread",
        CLS: "Cumulative Layout Shift is too high — add dimensions to images/embeds and avoid dynamic content insertion",
        FCP: "First Contentful Paint is too slow — reduce server response time and render-blocking resources",
        TTFB: "Time to First Byte is too slow — optimize server response time, use CDN",
        INP: "Interaction to Next Paint is too slow — optimize event handlers and reduce main thread work",
      };
      lines.push(`- **${v.name}**: ${descriptions[v.name] || "Requires optimization"}`);
    });
  } else if (needsImprovementVitals.length > 0) {
    lines.push(`**Moderate**: ${needsImprovementVitals.map(v => v.name).join(", ")} could be improved.`);
  } else {
    lines.push("All web vitals are in the **Good** range.");
  }

  lines.push("");

  return { text: lines.join("\n") };
}
