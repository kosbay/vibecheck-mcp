import { readFileSync } from "node:fs";
import { getApiUrl, getApiKey } from "../config.js";
import type { FinishedRecording } from "../browser/session.js";

// Node port of the extension's saveTrack flow (extension/utils/platformApi.ts):
// init → PUT video + metadata to signed Storage URLs → confirm.

interface InitResponse {
  trackId: string;
  downloadToken: string;
  mediaUploadUrl: string;
  metadataUploadUrl: string;
}

function requireApiKey(): string {
  const key = getApiKey();
  if (!key) {
    throw new Error(
      "VIBECHECK_API_KEY is not set (or doesn't start with vck_). " +
        "Generate a personal API key in VibeCheck Settings → API Keys and " +
        "set it as the VIBECHECK_API_KEY environment variable."
    );
  }
  return key;
}

async function callInit(): Promise<InitResponse> {
  const resp = await fetch(`${getApiUrl()}/api/ext/tracks/init`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": requireApiKey(),
    },
    body: JSON.stringify({ type: "video" }),
  });

  const data = await resp.json().catch(() => ({}));
  if (resp.status === 401) {
    throw new Error(
      "VibeCheck rejected the API key (401). Generate a new key in Settings → API Keys."
    );
  }
  if (resp.status === 429) {
    throw new Error(
      "Monthly recording limit reached on your VibeCheck plan. Upgrade or wait for the monthly reset."
    );
  }
  if (!resp.ok) {
    throw new Error(
      `VibeCheck init failed (${resp.status}): ${(data as { error?: string }).error || resp.statusText}`
    );
  }
  return data as InitResponse;
}

/**
 * Cheap credentials + usage-limit check before any recording starts.
 * The returned signed URLs are discarded; no track is created by init alone.
 */
export async function preflightUploadCheck(): Promise<void> {
  await callInit();
}

export async function uploadRecording(
  recording: FinishedRecording,
  title: string,
  notes?: string
): Promise<{ trackId: string; trackUrl: string }> {
  // Init at finish time so the 15-minute signed URLs can't expire mid-session
  const { trackId, downloadToken, mediaUploadUrl, metadataUploadUrl } =
    await callInit();

  const videoBuffer = readFileSync(recording.videoPath);
  const mediaResp = await fetch(mediaUploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "x-goog-meta-firebaseStorageDownloadTokens": downloadToken,
    },
    body: videoBuffer,
  });
  if (!mediaResp.ok) {
    throw new Error(`Video upload failed (${mediaResp.status})`);
  }

  const metadataResp = await fetch(metadataUploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: recording.metadataJson,
  });
  if (!metadataResp.ok) {
    throw new Error(`Metadata upload failed (${metadataResp.status})`);
  }

  const trackFields = {
    name: title,
    comment: notes || "",
    preview: "",
    duration: recording.duration,
    type: "video",
    crop: null,
    vitals: [],
    locations: recording.locations,
    startTs: recording.startTs,
    browserName: recording.browserName,
    browserVersion: recording.browserVersion,
    platform: nodePlatformLabel(),
    resolution: recording.resolution,
    source: "agent",
  };

  let lastError = "Failed to confirm track after retries";
  for (let attempt = 0; attempt < 3; attempt++) {
    const confirmResp = await fetch(`${getApiUrl()}/api/ext/tracks/confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": requireApiKey(),
      },
      body: JSON.stringify({
        trackId,
        downloadToken,
        trackFields,
        metadata: recording.metadataStats,
      }),
    });

    const data = (await confirmResp.json().catch(() => ({}))) as {
      trackId?: string;
      trackUrl?: string;
      error?: string;
    };

    if (confirmResp.ok && data.trackId && data.trackUrl) {
      return { trackId: data.trackId, trackUrl: data.trackUrl };
    }

    lastError = data.error || `Confirm failed (${confirmResp.status})`;
    if (confirmResp.status === 429) {
      throw new Error(
        "Monthly recording limit reached on your VibeCheck plan. Upgrade or wait for the monthly reset."
      );
    }
    if (confirmResp.status < 500) {
      throw new Error(lastError);
    }
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw new Error(lastError);
}

function nodePlatformLabel(): string {
  switch (process.platform) {
    case "darwin":
      return "macOS";
    case "win32":
      return "Windows";
    case "linux":
      return "Linux";
    default:
      return process.platform;
  }
}
