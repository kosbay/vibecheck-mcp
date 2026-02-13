import { z } from "zod";
import { fetchTrack, fetchImage } from "../api/client.js";
import { formatTrack, formatErrorsOnly } from "../transformers/index.js";
import { IncludeSection, TrackToolResult } from "../types.js";

export const getTrackSchema = z.object({
  url_or_id: z.string().describe("The track URL or ID. Supports URLs like https://app.vibecheck-qa.com/tracks/{id} or just the ID"),
  include: z.array(z.enum(["logs", "network", "actions", "vitals", "all"]))
    .optional()
    .describe("Sections to include in the output. Defaults to all sections. Options: logs, network, actions, vitals, all"),
});

export type GetTrackInput = z.infer<typeof getTrackSchema>;

export async function getTrack(input: GetTrackInput): Promise<TrackToolResult> {
  const track = await fetchTrack(input.url_or_id);

  const include = input.include as IncludeSection[] | undefined;
  const text = formatTrack(track, { include });

  // For screenshot tracks, include the image
  let image: TrackToolResult["image"];
  if (track.type === "screenshot" && track.mediaUrl) {
    image = await fetchImage(track.mediaUrl) ?? undefined;
  }

  return { text, image };
}

export const analyzeTrackErrorsSchema = z.object({
  url_or_id: z.string().describe("The track URL or ID. Supports URLs like https://app.vibecheck-qa.com/tracks/{id} or just the ID"),
});

export type AnalyzeTrackErrorsInput = z.infer<typeof analyzeTrackErrorsSchema>;

export async function analyzeTrackErrors(input: AnalyzeTrackErrorsInput): Promise<TrackToolResult> {
  const track = await fetchTrack(input.url_or_id);
  const text = formatErrorsOnly(track);

  // For screenshot tracks, include the image
  let image: TrackToolResult["image"];
  if (track.type === "screenshot" && track.mediaUrl) {
    image = await fetchImage(track.mediaUrl) ?? undefined;
  }

  return { text, image };
}
