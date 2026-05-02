import { initBuffer, destroyBuffer } from './buffer';
import { sendBatch } from './transport';
import { writeDebugBatch } from './debugWriter';
import { registerMiddleware } from './middleware';
import { patchMongoose } from './patchers/mongoose';
import { patchAxios } from './patchers/axios';
import { patchFetch } from './patchers/fetch';
import { getInstanceId, getRegion } from './utils';
import type { LensOptions, LensConfig, LensEvent } from './types';

export type { LensOptions, LensEvent } from './types';

const AGENT_VERSION = '1.0.0';
const DEFAULT_INGEST_URL = 'http://localhost:3001/api/lens/ingest';

let _initialised = false;

/**
 * Initialise Beetle Lens profiling for an Express app.
 *
 * Call this once, as early as possible in your entry file,
 * BEFORE any routes are registered.
 *
 * @example
 * ```ts
 * import express from 'express';
 * import { initLens } from 'beetle-lens-node';
 *
 * const app = express();
 *
 * initLens({
 *   app,
 *   serviceName: 'my-api',
 *   apiKey: process.env.BEETLE_API_KEY!,
 * });
 *
 * app.get('/hello', (req, res) => res.json({ ok: true }));
 * app.listen(3000);
 * ```
 */
export function initLens(opts: LensOptions): void {
  if (_initialised) {
    console.warn('[beetle-lens] initLens() called more than once — ignoring duplicate call');
    return;
  }
  _initialised = true;

  const cfg: LensConfig = {
    serviceName:     opts.serviceName,
    apiKey:          opts.apiKey,
    ingestUrl:       opts.ingestUrl       ?? DEFAULT_INGEST_URL,
    environment:     opts.environment     ?? (process.env['NODE_ENV'] ?? 'development'),
    serviceVersion:  opts.serviceVersion  ?? (process.env['npm_package_version'] ?? '0.0.0'),
    flushIntervalMs: opts.flushIntervalMs ?? 2_000,
    flushMaxBatch:   opts.flushMaxBatch   ?? 100,
    instanceId:      getInstanceId(),
    region:          getRegion(),
    agentVersion:    AGENT_VERSION,
    debugFile:       opts.debugFile,
  };

  // 1. Start the in-memory buffer with a flush callback that sends to the server
  initBuffer({
    flushIntervalMs: cfg.flushIntervalMs,
    flushMaxBatch:   cfg.flushMaxBatch,
    onFlush: (events: LensEvent[]) => {
      // Write to local file first (sync, instant) if debugFile is configured
      if (cfg.debugFile) writeDebugBatch(cfg.debugFile, events);

      sendBatch(cfg, events).catch(() => {
        // Silently drop events on persistent failures — profiling must never
        // crash or slow down the host application
      });
    },
  });

  // 2. Register Express middleware (must happen before routes)
  registerMiddleware(opts.app, cfg);

  // 3. Patch I/O libraries
  patchMongoose(cfg);
  patchAxios(cfg);
  patchFetch(cfg);

  // 4. Graceful shutdown — flush remaining events before process exits
  const shutdown = () => destroyBuffer();
  process.once('SIGTERM', shutdown);
  process.once('SIGINT',  shutdown);
  process.once('beforeExit', shutdown);
}
