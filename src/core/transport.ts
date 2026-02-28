import type { EventBatch } from '../types';
import type { ResolvedConfig } from '../config';

const AGENT_VERSION = '0.1.0';
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [200, 400, 800];

/**
 * Send a batch of events to the Beetle Ingest API.
 * The Ingest API then writes to Kafka — the SDK never touches Kafka directly.
 *
 * Retries up to 3 times with exponential backoff.
 * On final failure: warns and drops (never silently drops without warning).
 */
export async function sendBatch(batch: EventBatch, config: ResolvedConfig): Promise<void> {
  // Debug mode — save to local file instead of sending
  if (config.debug || !config.apiKey) {
    await saveToFile(batch, config);
    return;
  }

  const url = `${config.endpoint}/api/lens/ingest`;
  const body = JSON.stringify({ ...batch, agentVersion: AGENT_VERSION });

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
          'X-Beetle-Agent': `lens-node/${AGENT_VERSION}`,
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) return;

      // 4xx errors — don't retry (bad request, invalid api key, etc.)
      if (response.status >= 400 && response.status < 500) {
        console.warn(`[Beetle Lens] Ingest API rejected batch: ${response.status} ${response.statusText}`);
        return;
      }

      // 5xx — retryable
      throw new Error(`HTTP ${response.status}`);
    } catch (err) {
      if (attempt === MAX_RETRIES) {
        console.warn(
          `[Beetle Lens] Failed to send batch after ${MAX_RETRIES} retries. Events dropped.`,
          err instanceof Error ? err.message : err
        );
        return;
      }
      await sleep(RETRY_DELAYS_MS[attempt]!);
    }
  }
}

/**
 * Save batch to .beetle-lens/ folder (debug mode only)
 */
async function saveToFile(batch: EventBatch, config: ResolvedConfig): Promise<void> {
  const fs = await import('fs');
  const path = await import('path');

  const dir = config.outputDir
    ? path.resolve(config.outputDir)
    : path.join(process.cwd(), '.beetle-lens');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `events-${ts}.json`);
  fs.writeFileSync(file, JSON.stringify(batch, null, 2));

  if (config.debug) {
    console.log(`[Beetle Lens] Debug: saved ${batch.events.length} events to ${file}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
