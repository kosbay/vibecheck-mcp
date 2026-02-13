export type TrackType = "video" | "screenshot";

export interface TrackDetail {
  id: string;
  title: string;
  description: string;
  type: TrackType;
  mediaUrl: string;
  duration: number;
  createdAt: string;
  status: string;
  user: {
    id: string;
    name: string;
    email: string;
    avatar: string;
  };
  metadata: {
    browser: string;
    platform: string;
    url: string;
  };
  stats: {
    consoleErrors: number;
    networkErrors: number;
    userActions: number;
  };
  logs: Array<LogEntry>;
  network: Array<NetworkRequest>;
  userActions: Array<UserAction>;
  clicks: Array<{ time: number; label: string }>;
  locations: Array<LocationEntry>;
  vitals: Array<VitalEntry>;
  preview: string;
  resolution: string;
  startTs: number;
  country?: string;
}

export interface LogEntry {
  level: string;
  msg: string;
  time: number;
}

export interface NetworkRequest {
  url: string;
  method: string;
  statusCode: number;
  time: number;
  duration?: number;
  error?: string;
  type?: string;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  body?: string;
  responseBody?: string;
  encodedBodySize?: number;
  responseBodySize?: number;
}

export interface UserAction {
  type: string;
  time: number;
  label: string;
  details?: string;
}

export interface LocationEntry {
  time: number;
  location: string;
  navTiming: {
    fcpTime: number;
    visuallyComplete: number;
    timeToInteractive: number;
  };
}

export interface VitalEntry {
  name: "CLS" | "FCP" | "FID" | "INP" | "LCP" | "TTFB";
  value: number;
}

export type IncludeSection = "logs" | "network" | "actions" | "vitals" | "all";

export interface TrackToolResult {
  text: string;
  image?: { data: string; mimeType: string };
}
