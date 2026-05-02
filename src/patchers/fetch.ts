import { getContext } from '../context';
import { pushEvent } from '../buffer';
import { buildFunctionCallEvent, buildErrorEvent } from '../events';
import { nowNs } from '../utils';
import type { LensConfig } from '../types';

let _patched = false;

export function patchFetch(cfg: LensConfig): void {
  if (_patched) return;

  if (typeof globalThis.fetch !== 'function') return;

  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async function patchedFetch(
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> {
    const ctx = getContext();
    if (!ctx) return originalFetch(input, init);

    const method = (init?.method ?? 'GET').toUpperCase();
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : (input as Request).url;

    // Never track beetle-lens's own ingest calls — would create infinite loop
    if (url.startsWith(cfg.ingestUrl) || url.includes('/api/lens/ingest')) {
      return originalFetch(input, init);
    }

    // Label: "GET hostname/pathname" — clean and recognisable in the IDE
    let label = `fetch ${method}`;
    try {
      const u = new URL(url);
      label = `fetch ${method} ${u.hostname}${u.pathname}`;
    } catch { /* relative URL, keep short label */ }

    const start = nowNs();

    try {
      const response = await originalFetch(input, init);
      pushEvent(buildFunctionCallEvent(cfg, {
        traceId:      ctx.traceId,
        parentSpanId: ctx.requestSpanId,
        durationNs:   nowNs() - start,
        functionName: label,
      }));
      return response;
    } catch (err) {
      pushEvent(buildErrorEvent(cfg, {
        traceId:      ctx.traceId,
        parentSpanId: ctx.requestSpanId,
        durationNs:   nowNs() - start,
        functionName: label,
        error:        err instanceof Error ? err : new Error(String(err)),
      }));
      throw err;
    }
  };

  _patched = true;
}
