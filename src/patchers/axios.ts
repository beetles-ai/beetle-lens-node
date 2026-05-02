import { getContext } from '../context';
import { pushEvent } from '../buffer';
import { buildFunctionCallEvent, buildErrorEvent } from '../events';
import { nowNs } from '../utils';
import type { LensConfig } from '../types';

type AnyFn = (...args: unknown[]) => unknown;

// Plain string key — survives axios's internal mergeConfig / Object.assign
// Prefixed to avoid colliding with any real axios config property
const LENS_KEY = '__blt_id';

interface AxiosConfig {
  url?:     string;
  baseURL?: string;
  method?:  string;
  [LENS_KEY]?: string;
}

let _patched = false;
let _seq = 0;

// id → { startNs, ctx } — plain Map keyed by the string we stamp on config
const pending = new Map<string, { startNs: bigint; ctx: ReturnType<typeof getContext> }>();

export function patchAxios(cfg: LensConfig): void {
  if (_patched) return;

  let axiosModule: {
    interceptors?: {
      request:  { use: (fn: AnyFn) => void };
      response: { use: (onFulfilled: AnyFn, onRejected: AnyFn) => void };
    };
  } | undefined;

  try {
    axiosModule = require('axios') as typeof axiosModule;
  } catch {
    return;
  }

  if (!axiosModule?.interceptors) return;

  axiosModule.interceptors.request.use(((config: AxiosConfig) => {
    const fullUrl = (config.baseURL ?? '') + (config.url ?? '');
    if (fullUrl.includes('/api/lens/ingest')) return config;

    const id = String(++_seq);
    // Stamp as plain string property — axios preserves custom config keys
    config[LENS_KEY] = id;
    pending.set(id, { startNs: nowNs(), ctx: getContext() });
    return config;
  }) as AnyFn);

  axiosModule.interceptors.response.use(
    ((response: { config: AxiosConfig }) => {
      const id    = response.config[LENS_KEY];
      const entry = id ? pending.get(id) : undefined;

      if (entry) {
        pending.delete(id!);
        const { startNs, ctx } = entry;
        if (ctx) {
          const method = (response.config.method ?? 'GET').toUpperCase();
          const rawUrl = (response.config.baseURL ?? '') + (response.config.url ?? '');
          pushEvent(buildFunctionCallEvent(cfg, {
            traceId:      ctx.traceId,
            parentSpanId: ctx.requestSpanId,
            durationNs:   nowNs() - startNs,
            functionName: buildLabel('axios', method, rawUrl),
          }));
        }
      }
      return response;
    }) as AnyFn,

    ((error: { config?: AxiosConfig; message?: string; stack?: string; name?: string }) => {
      const id    = error.config?.[LENS_KEY];
      const entry = id ? pending.get(id) : undefined;

      if (entry) {
        pending.delete(id!);
        const { startNs, ctx } = entry;
        if (ctx) {
          const method = (error.config?.method ?? 'GET').toUpperCase();
          const rawUrl = (error.config?.baseURL ?? '') + (error.config?.url ?? '');
          pushEvent(buildErrorEvent(cfg, {
            traceId:      ctx.traceId,
            parentSpanId: ctx.requestSpanId,
            durationNs:   nowNs() - startNs,
            functionName: buildLabel('axios', method, rawUrl),
            error: error instanceof Error
              ? error
              : Object.assign(new Error(error.message ?? 'axios error'), {
                  name:  error.name  ?? 'AxiosError',
                  stack: error.stack ?? '',
                }),
          }));
        }
      }
      throw error;
    }) as AnyFn,
  );

  _patched = true;
}

function buildLabel(prefix: string, method: string, rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    return `${prefix} ${method} ${u.hostname}${u.pathname}`;
  } catch {
    return `${prefix} ${method} ${rawUrl}`.trim();
  }
}
