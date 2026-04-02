/**
 * SSE stream event types for the JUST DROP IT ingest pipeline.
 * Shared between the server-side route and the client log panel.
 */

export type IngestStreamEvent =
  | { type: 'session_created'; sessionId: string; ts: number }
  | { type: 'pipeline_event'; event: string; detail?: string; ts: number }
  | { type: 'llm_call'; step: string; model: string; promptPreview?: string; responsePreview?: string; tokens: { prompt: number; completion: number }; ts: number }
  | { type: 'url_fetch'; url: string; status: 'started' | 'done' | 'error'; ts: number }
  | { type: 'complete'; sessionId: string; blueprint: unknown; evidence: unknown; ts: number }
  | { type: 'error'; message: string; ts: number };

export type StreamEmit = (event: IngestStreamEvent) => void;
