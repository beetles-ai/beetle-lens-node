import { randomBytes } from 'crypto';
import os from 'os';
import path from 'path';

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
