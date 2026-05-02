import type { LensEvent, LensConfig } from './types';

const AGENT_VERSION = '1.0.0';

/**
 * Fire-and-forget HTTP POST to the ingest endpoint.
 * Uses native fetch (Node 18+). Retries once on transient 5xx/network errors.
 */
export async function sendBatch(cfg: LensConfig, events: LensEvent[]): Promise<void> {
  if (events.length === 0) return;

  const body = JSON.stringify({ events });
  const headers: Record<string, string> = {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${cfg.apiKey}`,
    'User-Agent':    `beetle-lens-node/${AGENT_VERSION}`,
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(cfg.ingestUrl, { method: 'POST', headers, body });
      if (res.ok) return;

      // Don't retry client errors (4xx) — they indicate a bug, not transient failure
      if (res.status < 500) {
        console.warn(`[beetle-lens] ingest rejected: ${res.status} ${res.statusText}`);
        return;
      }

      // 5xx: fall through to retry
    } catch {
      // Network error: fall through to retry on attempt 0, give up on attempt 1
    }

    if (attempt === 0) await sleep(500);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
