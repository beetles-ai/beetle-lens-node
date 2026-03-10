import type { EventBatch } from '../types';
import type { ResolvedConfig } from '../config';
import { connectKafkaProducer, publishBatch, disconnectKafkaProducer } from '../lib/kafka';

const AGENT_VERSION = '0.1.0';
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [200, 400, 800];

let kafkaConnected = false;

/**
 * Send a batch of events.
 *
 * Priority:
 *   1. kafkaBrokers set → publish directly to Kafka
 *   2. apiKey set       → HTTP POST to ingest API
 *   3. debug/fallback   → save to local file
 */
export async function sendBatch(batch: EventBatch, config: ResolvedConfig): Promise<void> {
  if (config.disabled) return;

  // ── Kafka mode ───────────────────────────────────────────────────────
  if (config.kafkaBrokers) {
    try {
      if (!kafkaConnected) {
        const brokers = config.kafkaBrokers.split(',').map(b => b.trim());
        console.log(`[Beetle Lens] Kafka: connecting to ${config.kafkaBrokers}...`);
        await connectKafkaProducer(brokers);
        kafkaConnected = true;
        console.log('[Beetle Lens] Kafka: connected ✅');

        process.once('SIGTERM', disconnectKafkaProducer);
        process.once('SIGINT', disconnectKafkaProducer);
        process.once('beforeExit', disconnectKafkaProducer);
      }

      await publishBatch(batch);
      if (config.debug) {
        console.log(`[Beetle Lens] Kafka: published ${batch.events.length} events`);
      }
    } catch (err) {
      kafkaConnected = false; // reset so next flush retries the connection
      console.warn('[Beetle Lens] Kafka error:', (err as Error).message);
      if (config.debug) {
        console.warn('[Beetle Lens] Falling back to local file for this batch');
        await saveToFile(batch, config);
      }
    }
    return;
  }

  // ── Debug / no API key — save to file ────────────────────────────────
  if (config.debug || !config.apiKey) {
    await saveToFile(batch, config);
    return;
  }

  // ── HTTP ingest API mode ─────────────────────────────────────────────
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

      if (response.status >= 400 && response.status < 500) {
        console.warn(`[Beetle Lens] Ingest API rejected: ${response.status}`);
        return;
      }
      throw new Error(`HTTP ${response.status}`);
    } catch (err) {
      if (attempt === MAX_RETRIES) {
        console.warn('[Beetle Lens] Failed after retries. Events dropped.', (err as Error).message);
        return;
      }
      await sleep(RETRY_DELAYS_MS[attempt]!);
    }
  }
}

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
