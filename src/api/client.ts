import { TrackDetail } from "../types.js";

export { getApiUrl } from "../config.js";
import { getApiUrl } from "../config.js";

export function extractTrackId(urlOrId: string): string {
  // If it's just an ID, return it directly
  if (!urlOrId.includes("/")) {
    return urlOrId;
  }

  // Try to extract ID from URL patterns like:
  // - https://app.vibecheck-qa.com/tracks/{id}
  // - https://vibecheck-qa.com/tracks/{id}
  // - /tracks/{id}
  const patterns = [
    /\/tracks\/([a-zA-Z0-9_-]+)/,
    /tracks\/([a-zA-Z0-9_-]+)/,
  ];

  for (const pattern of patterns) {
    const match = urlOrId.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  // If no pattern matched, treat the whole string as an ID
  return urlOrId;
}

export async function fetchTrack(urlOrId: string): Promise<TrackDetail> {
  const id = extractTrackId(urlOrId);
  const apiUrl = getApiUrl();
  const url = `${apiUrl}/api/tracks/${id}`;

  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Track not found: ${id}`);
    }
    throw new Error(`Failed to fetch track: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data as TrackDetail;
}

export async function fetchImage(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || "image/png";
    return { data: buffer.toString("base64"), mimeType: contentType.split(";")[0].trim() };
  } catch {
    return null; // image failure should not block the text report
  }
}
