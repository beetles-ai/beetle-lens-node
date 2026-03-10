import { randomBytes } from 'crypto';
import os from 'os';
import path from 'path';

// Resolved once at startup — used to strip absolute prefix from caller paths
const PROJECT_ROOT = process.cwd();

/**
 * Generate a unique ID using crypto (no external deps)
 */
export function generateId(): string {
  return randomBytes(16).toString('hex');
}

// ─── Timestamps ───────────────────────────────────────────────────────────────

// Anchor hrtime to wall clock once at module load
const _startMs = Date.now();
const _startHr = process.hrtime.bigint();

/**
 * Unix epoch timestamp in nanoseconds (wall clock, millisecond precision).
 * Safe for ClickHouse time-series queries.
 */
export function getTimestampNs(): string {
  const elapsedNs = process.hrtime.bigint() - _startHr;
  return (BigInt(_startMs) * 1_000_000n + elapsedNs).toString();
}

/**
 * Start a high-precision timer for duration measurement.
 * Use this for measuring elapsed time, NOT for timestamps.
 */
export function startTimer(): bigint {
  return process.hrtime.bigint();
}

/**
 * Get elapsed duration in nanoseconds from a startTimer() result.
 */
export function getDurationNs(startHr: bigint): string {
  return (process.hrtime.bigint() - startHr).toString();
}

// ─── Caller info ──────────────────────────────────────────────────────────────

export interface CallerInfo {
  filePath?: string;
  lineNumber?: number;
  callerFunctionName?: string;
}

/**
 * Convert an absolute file path to a path relative to the project root.
 * Produces a stable identifier across machines and containers.
 *   /Users/alice/project/src/service.ts  →  src/service.ts
 *   /app/src/service.ts                  →  src/service.ts  (Docker)
 */
function toRelativePath(absPath: string): string {
  const sep = PROJECT_ROOT.endsWith(path.sep) ? PROJECT_ROOT : PROJECT_ROOT + path.sep;
  return absPath.startsWith(sep) ? absPath.slice(sep.length) : absPath;
}

/**
 * Parse `new Error().stack` to find the call site that is `framesToSkip`
 * frames above this function.
 *
 * Frame layout when called from withTrace():
 *   [0]  Error
 *   [1]  at getCallerInfo (utils.ts)
 *   [2]  at withTrace (tracer.ts)
 *   [3]  at <user code>            ← framesToSkip = 3
 *
 * Same layout when called from the Trace() decorator factory:
 *   [3]  at <class definition file>
 */
export function getCallerInfo(framesToSkip: number): CallerInfo {
  const stack = new Error().stack;
  if (!stack) return {};

  const lines = stack.split('\n');
  const frame = lines[framesToSkip];
  if (!frame) return {};

  // "    at async? Name (filePath:line:col)"
  const withName = frame.match(/^\s+at\s+(?:async\s+)?(.+?)\s+\((.+):(\d+):\d+\)$/);
  if (withName) {
    const raw = withName[1];
    // Collapse "Object.foo", "Class.foo", "new Foo" → just the rightmost name
    const fnName = raw.split('.').pop()?.replace(/^new\s+/, '') ?? raw;
    return {
      callerFunctionName: fnName === '<anonymous>' ? undefined : fnName,
      filePath: toRelativePath(withName[2]),
      lineNumber: parseInt(withName[3], 10),
    };
  }

  // "    at filePath:line:col"  (module-level / anonymous)
  const anon = frame.match(/^\s+at\s+(.+):(\d+):\d+$/);
  if (anon) {
    return { filePath: toRelativePath(anon[1]), lineNumber: parseInt(anon[2], 10) };
  }

  return {};
}

// ─── Headers ──────────────────────────────────────────────────────────────────

/**
 * Sanitize sensitive headers — strips auth tokens and cookies
 */
export function sanitizeHeaders(
  headers: Record<string, string | string[] | undefined>
): Record<string, string> {
  const sensitive = new Set(['authorization', 'cookie', 'x-api-key', 'api-key', 'x-auth-token']);
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    result[key] = sensitive.has(key.toLowerCase())
      ? '[REDACTED]'
      : Array.isArray(value) ? value.join(', ') : value;
  }
  return result;
}

// ─── Service / Runtime info ───────────────────────────────────────────────────

/**
 * Auto-detect service name from the USER's package.json (not the SDK's)
 */
export function getServiceName(): string {
  if (process.env.BEETLE_SERVICE_NAME) return process.env.BEETLE_SERVICE_NAME;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require(path.join(process.cwd(), 'package.json')) as { name?: string; version?: string };
    return pkg.name || 'unknown-service';
  } catch {
    return 'unknown-service';
  }
}

/**
 * Get service version from the user's package.json
 */
export function getServiceVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require(path.join(process.cwd(), 'package.json')) as { version?: string };
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * Get environment from env vars
 */
export function getEnvironment(): string {
  return process.env.NODE_ENV || process.env.BEETLE_ENV || 'development';
}

/**
 * Instance ID — for identifying which pod/container this is (in K8s, ECS, etc.)
 * Reads from common platform env vars before falling back to hostname.
 */
export function getInstanceId(): string {
  return (
    process.env.POD_NAME ||
    process.env.HOSTNAME ||
    process.env.ECS_CONTAINER_METADATA_URI?.split('/').pop() ||
    os.hostname()
  );
}

/**
 * Region — AWS, GCP, Fly.io, Render, etc.
 */
export function getRegion(): string {
  return (
    process.env.AWS_REGION ||
    process.env.AWS_DEFAULT_REGION ||
    process.env.GCLOUD_REGION ||
    process.env.FLY_REGION ||
    process.env.RENDER_REGION ||
    process.env.BEETLE_REGION ||
    'unknown'
  );
}
