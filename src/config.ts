const DEFAULT_API_URL = "https://app.vibecheck-qa.com";

export function getApiUrl(): string {
  return process.env.VIBECHECK_API_URL?.replace(/\/$/, "") || DEFAULT_API_URL;
}

export function getApiKey(): string | null {
  const key = process.env.VIBECHECK_API_KEY;
  return key && key.startsWith("vck_") ? key : null;
}
