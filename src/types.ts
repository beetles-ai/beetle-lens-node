import type { Application } from 'express';

// ── Event type codes — must stay in sync with beetle-lens-server constants.ts ──
export const EVENT_TYPE = {
  FUNCTION_CALL:  0,
  HTTP_REQUEST:   1,
  HTTP_RESPONSE:  2,
  ERROR:          3,
} as const;

export type EventType = typeof EVENT_TYPE[keyof typeof EVENT_TYPE];

// ── The event shape the ingest server expects ─────────────────────────────────
export interface LensEvent {
  traceId:           string;
  spanId:            string;
  parentSpanId?:     string;
  type:              EventType;
  timestampNs:       string;   // bigint as decimal string (safe for JSON)
  durationNs?:       string;   // bigint as decimal string

  // Function / DB span fields (type 0 and 3)
  functionName?:     string;
  filePath?:         string;
  lineNumber?:       number;
  callerFunctionName?: string;

  // HTTP fields (type 1 and 2)
  http?: {
    method:           string;
    path:             string;
    route?:           string;
    statusCode?:      number;
    requestSizeBytes?:  number;
    responseSizeBytes?: number;
  };

  // Error fields (type 3)
  error?: {
    message:    string;
    errorType:  string;
    stackTrace: string;
  };

  // Service metadata — set once from LensOptions
  serviceName:    string;
  serviceVersion: string;
  environment:    string;
  instanceId:     string;
  region:         string;
  agentVersion:   string;
}

// ── Per-request async context ─────────────────────────────────────────────────
export interface SpanContext {
  traceId:       string;
  requestSpanId: string;   // span ID of the HTTP_REQUEST span
  startNs:       bigint;   // hrtime.bigint() at request start
  method:        string;
  path:          string;
  route?:        string;
}

// ── Public options passed to initLens() ───────────────────────────────────────
export interface LensOptions {
  /** Your service name, e.g. 'my-api' */
  serviceName: string;

  /** API key issued by beetle-lens (blt_svc_...) */
  apiKey: string;

  /**
   * Full URL of your beetle-lens-server ingest endpoint.
   * Defaults to 'http://localhost:3001/api/lens/ingest'
   */
  ingestUrl?: string;

  /** 'production' | 'staging' | 'development' — defaults to NODE_ENV */
  environment?: string;

  /** Semver string, defaults to '0.0.0' */
  serviceVersion?: string;

  /**
   * How often (ms) to flush the event buffer even if not full.
   * Defaults to 2000 (2 seconds).
   */
  flushIntervalMs?: number;

  /**
   * Flush when buffer reaches this many events.
   * Defaults to 100.
   */
  flushMaxBatch?: number;

  /**
   * If set, every flushed batch is also appended to this local file as
   * newline-delimited JSON (one event per line). Useful for debugging
   * without needing Kafka or ClickHouse running.
   * e.g. debugFile: './beetle-lens-events.jsonl'
   */
  debugFile?: string;

  /** Express app instance */
  app: Application;
}

// ── Internal resolved config (all fields guaranteed) ─────────────────────────
export interface LensConfig {
  serviceName:     string;
  apiKey:          string;
  ingestUrl:       string;
  debugFile?:      string;
  environment:     string;
  serviceVersion:  string;
  flushIntervalMs: number;
  flushMaxBatch:   number;
  instanceId:      string;
  region:          string;
  agentVersion:    string;
}
