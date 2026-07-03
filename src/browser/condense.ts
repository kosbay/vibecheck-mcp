import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import type { FinishedRecording } from "./session.js";
import type {
  LogEntry,
  NetworkRequest,
  UserAction,
  LocationEntry,
} from "../types.js";

/**
 * Post-processes a finished recording to cut out the idle "agent think time"
 * between actions, which usually dominates the video. Keeps a window around
 * every action / navigation / error, concatenates the kept segments with
 * ffmpeg, and remaps every metadata timestamp through the same cut map so the
 * platform timeline (logs, network, actions vs. video position) stays in sync.
 *
 * Requires ffmpeg on PATH. Returns null (caller keeps the original video)
 * when ffmpeg is missing, condensing is disabled, the recording is short, or
 * cutting would save little.
 */

const PAD_BEFORE_MS = 1500;
const PAD_AFTER_MS = 2500;
// Below this total length there is nothing meaningful to save
const MIN_DURATION_MS = 15_000;
// Skip when cutting saves less than this fraction of the video
const MIN_SAVINGS_RATIO = 0.2;
const FFMPEG_TIMEOUT_MS = 120_000;

interface Segment {
  start: number; // ms, relative to video start
  end: number;
}

interface TrackMetadata {
  logs: LogEntry[];
  network: NetworkRequest[];
  userActions: UserAction[];
  replayActions: unknown[];
  clicks: Array<{ time: number; label: string }>;
}

export async function condenseRecording(
  recording: FinishedRecording
): Promise<FinishedRecording | null> {
  if (process.env.VIBECHECK_NO_CONDENSE === "1") return null;
  if (recording.duration < MIN_DURATION_MS) return null;
  if (!recording.videoPath || !existsSync(recording.videoPath)) return null;
  if (!(await ffmpegAvailable())) return null;

  const metadata = JSON.parse(recording.metadataJson) as TrackMetadata;
  const segments = buildKeepSegments(recording, metadata);
  if (!segments) return null;

  const keptMs = segments.reduce((sum, s) => sum + (s.end - s.start), 0);
  if (keptMs >= recording.duration * (1 - MIN_SAVINGS_RATIO)) return null;

  const outputPath = join(dirname(recording.videoPath), "condensed.webm");
  await runFfmpegCut(recording.videoPath, outputPath, segments);
  if (!existsSync(outputPath)) return null;

  const mapRel = makeTimeMapper(segments, keptMs);
  const mapAbs = (t: number) => recording.startTs + mapRel(t - recording.startTs);

  const remapped: TrackMetadata = {
    logs: metadata.logs.map((l) => ({ ...l, time: mapAbs(l.time) })),
    network: metadata.network.map((n) => ({ ...n, time: mapAbs(n.time) })),
    userActions: metadata.userActions.map((a) => ({ ...a, time: mapAbs(a.time) })),
    replayActions: metadata.replayActions,
    clicks: metadata.clicks.map((c) => ({ ...c, time: mapAbs(c.time) })),
  };
  const locations = recording.locations.map((l) => ({
    ...l,
    time: mapAbs(l.time),
  })) as LocationEntry[];

  return {
    ...recording,
    videoPath: outputPath,
    duration: keptMs,
    metadataJson: JSON.stringify(remapped),
    locations,
  };
}

/**
 * Windows around every moment worth watching: agent actions, navigations,
 * console errors, failed requests — plus the final seconds so the end state
 * is always visible. Merged and clamped; null when there are no anchors.
 */
function buildKeepSegments(
  recording: FinishedRecording,
  metadata: TrackMetadata
): Segment[] | null {
  const { startTs, duration } = recording;
  const anchors: number[] = [];

  for (const a of metadata.userActions) anchors.push(a.time - startTs);
  for (const l of recording.locations) anchors.push(l.time - startTs);
  for (const l of metadata.logs) {
    if (l.level === "error") anchors.push(l.time - startTs);
  }
  for (const n of metadata.network) {
    if (n.statusCode >= 400 || n.error) anchors.push(n.time - startTs);
  }
  // Always keep the tail — the state the session ended in
  anchors.push(duration);

  const valid = anchors.filter((t) => t >= 0 && t <= duration);
  if (valid.length === 0) return null;
  valid.sort((a, b) => a - b);

  const merged: Segment[] = [];
  for (const t of valid) {
    const start = Math.max(0, t - PAD_BEFORE_MS);
    const end = Math.min(duration, t + PAD_AFTER_MS);
    const last = merged[merged.length - 1];
    if (last && start <= last.end) {
      last.end = Math.max(last.end, end);
    } else {
      merged.push({ start, end });
    }
  }
  return merged;
}

/**
 * Piecewise-linear map from original video time to condensed video time
 * (both ms, relative to video start). Times inside a cut gap snap to the
 * moment the video resumes, so no event ever points past its visual context.
 */
function makeTimeMapper(segments: Segment[], totalKept: number) {
  const offsets: number[] = [];
  let cum = 0;
  for (const s of segments) {
    offsets.push(cum);
    cum += s.end - s.start;
  }
  return (t: number): number => {
    for (let i = 0; i < segments.length; i++) {
      if (t < segments[i].start) return offsets[i];
      if (t <= segments[i].end) return offsets[i] + (t - segments[i].start);
    }
    return totalKept;
  };
}

let ffmpegChecked: boolean | null = null;

async function ffmpegAvailable(): Promise<boolean> {
  if (ffmpegChecked !== null) return ffmpegChecked;
  ffmpegChecked = await new Promise<boolean>((resolve) => {
    const child = spawn("ffmpeg", ["-version"], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
  return ffmpegChecked;
}

function runFfmpegCut(
  inputPath: string,
  outputPath: string,
  segments: Segment[]
): Promise<void> {
  const trims = segments
    .map(
      (s, i) =>
        `[0:v]trim=start=${(s.start / 1000).toFixed(3)}:end=${(s.end / 1000).toFixed(3)},setpts=PTS-STARTPTS[v${i}]`
    )
    .join(";");
  const inputs = segments.map((_, i) => `[v${i}]`).join("");
  const filter = `${trims};${inputs}concat=n=${segments.length}:v=1:a=0[out]`;

  const args = [
    "-y",
    "-loglevel", "error",
    "-i", inputPath,
    "-filter_complex", filter,
    "-map", "[out]",
    "-an",
    // Playwright records vp8/webm — keep the same container and codec
    "-c:v", "libvpx",
    "-b:v", "2M",
    "-crf", "12",
    "-deadline", "realtime",
    "-cpu-used", "5",
    outputPath,
  ];

  return new Promise<void>((resolve, reject) => {
    // stdout must stay untouched — it carries the MCP protocol
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("ffmpeg timed out"));
    }, FFMPEG_TIMEOUT_MS);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-400)}`));
    });
  });
}
