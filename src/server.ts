import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  getTrack, getTrackSchema,
  analyzeTrackErrors, analyzeTrackErrorsSchema,
  getTrackNetwork, getTrackNetworkSchema,
  getTrackPerformance, getTrackPerformanceSchema,
  getTrackActions, getTrackActionsSchema,
} from "./tools/index.js";
import { TrackToolResult } from "./types.js";

function buildContent(result: TrackToolResult) {
  const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [
    { type: "text", text: result.text },
  ];
  if (result.image) {
    content.push({ type: "image", data: result.image.data, mimeType: result.image.mimeType });
  }
  return content;
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: "vibecheck",
    version: "0.1.0",
  });

  // Register get_track tool
  server.tool(
    "get_track",
    "Fetch and format a VibeCheck bug report. Returns a comprehensive markdown report including console logs, network requests, user actions, and web vitals. For screenshot tracks, also returns the screenshot image.",
    getTrackSchema.shape,
    async (input) => {
      try {
        const result = await getTrack(input as any);
        return { content: buildContent(result) };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  // Register analyze_track_errors tool
  server.tool(
    "analyze_track_errors",
    "Analyze errors in a VibeCheck bug report. Returns a focused view of console errors and failed network requests with stack traces and response bodies.",
    analyzeTrackErrorsSchema.shape,
    async (input) => {
      try {
        const result = await analyzeTrackErrors(input as any);
        return { content: buildContent(result) };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  // Register get_track_network tool
  server.tool(
    "get_track_network",
    "Analyze network requests in a VibeCheck bug report. Returns failed requests with response bodies, slow requests sorted by duration, and a summary table of all requests.",
    getTrackNetworkSchema.shape,
    async (input) => {
      try {
        const result = await getTrackNetwork(input as any);
        return { content: buildContent(result) };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  // Register get_track_performance tool
  server.tool(
    "get_track_performance",
    "Analyze performance of a VibeCheck bug report. Returns web vitals with ratings, navigation timing per page, and a performance assessment with optimization suggestions.",
    getTrackPerformanceSchema.shape,
    async (input) => {
      try {
        const result = await getTrackPerformance(input as any);
        return { content: buildContent(result) };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  // Register get_track_actions tool
  server.tool(
    "get_track_actions",
    "Get user action timeline from a VibeCheck bug report. Returns a chronological timeline of user interactions, auto-generated steps to reproduce, and an action type breakdown.",
    getTrackActionsSchema.shape,
    async (input) => {
      try {
        const result = await getTrackActions(input as any);
        return { content: buildContent(result) };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    }
  );

  return server;
}
