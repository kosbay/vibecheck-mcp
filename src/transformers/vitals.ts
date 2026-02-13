import { VitalEntry } from "../types.js";

interface VitalThresholds {
  good: number;
  needsImprovement: number;
}

const VITAL_THRESHOLDS: Record<string, VitalThresholds> = {
  LCP: { good: 2500, needsImprovement: 4000 },
  FID: { good: 100, needsImprovement: 300 },
  CLS: { good: 0.1, needsImprovement: 0.25 },
  FCP: { good: 1800, needsImprovement: 3000 },
  TTFB: { good: 800, needsImprovement: 1800 },
  INP: { good: 200, needsImprovement: 500 },
};

const VITAL_DESCRIPTIONS: Record<string, string> = {
  LCP: "Largest Contentful Paint",
  FID: "First Input Delay",
  CLS: "Cumulative Layout Shift",
  FCP: "First Contentful Paint",
  TTFB: "Time to First Byte",
  INP: "Interaction to Next Paint",
};

function getVitalRating(name: string, value: number): string {
  const thresholds = VITAL_THRESHOLDS[name];
  if (!thresholds) return "";

  if (value <= thresholds.good) return "Good";
  if (value <= thresholds.needsImprovement) return "Needs Improvement";
  return "Poor";
}

function formatVitalValue(name: string, value: number): string {
  if (name === "CLS") {
    return value.toFixed(3);
  }
  return `${Math.round(value)}ms`;
}

export function formatVitals(vitals: VitalEntry[]): string {
  const lines: string[] = [];

  if (vitals.length === 0) {
    lines.push("## Web Vitals");
    lines.push("");
    lines.push("No web vitals data captured.");
    lines.push("");
    return lines.join("\n");
  }

  lines.push("## Web Vitals");
  lines.push("");
  lines.push("| Metric | Value | Rating | Description |");
  lines.push("|--------|-------|--------|-------------|");

  vitals.forEach(vital => {
    const value = formatVitalValue(vital.name, vital.value);
    const rating = getVitalRating(vital.name, vital.value);
    const description = VITAL_DESCRIPTIONS[vital.name] || vital.name;
    lines.push(`| **${vital.name}** | ${value} | ${rating} | ${description} |`);
  });

  lines.push("");

  // Add context about thresholds
  lines.push("### Thresholds Reference");
  lines.push("");
  lines.push("- **Good**: Green, no action needed");
  lines.push("- **Needs Improvement**: Yellow, consider optimizing");
  lines.push("- **Poor**: Red, requires attention");
  lines.push("");

  return lines.join("\n");
}
