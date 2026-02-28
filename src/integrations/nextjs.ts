import type { BeetleLensConfig } from '../config';
import { lens } from '../lens';
import { createContext } from '../context';
import { sanitizeHeaders, getTimestampNs, startTimer, getDurationNs } from '../core/utils';
import { EventType } from '../types';

/**
 * initLens — call this in your instrumentation.ts (Next.js)
 *
 * @example
 * // instrumentation.ts
 * import { initLens } from '@beetle/lens/next';
 * export function register() {
 *   initLens({ apiKey: process.env.BEETLE_API_KEY, mode: 'auto' });
 * }
 */
export function initLens(userConfig: BeetleLensConfig = {}): void {
  const collector = lens.init(userConfig);
  const config = collector.getConfig();

  if (config.debug) {
    console.log('[Beetle Lens] ✅ Next.js initialized:', {
      service: config.serviceName,
      mode: config.mode,
    });
  }
}

/**
 * withLens — wrap individual Next.js App Router route handlers.
 * Use as per-route middleware to track specific routes.
 *
 * @example
 * // app/api/orders/route.ts
 * import { withLens } from '@beetle/lens/next';
 * export const GET = withLens(async (req) => Response.json(await getOrders()));
 */
export function withLens<T extends (request: Request) => Promise<Response>>(handler: T): T {
  return (async function wrappedHandler(request: Request): Promise<Response> {
    const collector = lens.getCollector();
    if (!collector || collector.getConfig().disabled) return handler(request);

    const ctx = createContext();
    const timestampNs = getTimestampNs();
    const timerStart = startTimer();

    const url = new URL(request.url);
    const headersRecord: Record<string, string> = {};
    request.headers.forEach((v, k) => { headersRecord[k] = v; });

    const requestSizeBytes = request.headers.get('content-length')
      ? parseInt(request.headers.get('content-length')!)
      : 0;

    collector.add({
      traceId: ctx.traceId,
      spanId: ctx.spanId,
      type: EventType.HTTP_REQUEST,
      timestampNs,
      http: {
        method: request.method,
        path: url.pathname,
        headers: sanitizeHeaders(headersRecord),
        requestSizeBytes,
      },
    });

    try {
      const response = await handler(request);

      const responseSizeBytes = response.headers.get('content-length')
        ? parseInt(response.headers.get('content-length')!)
        : undefined;

      collector.add({
        traceId: ctx.traceId,
        spanId: ctx.spanId,
        type: EventType.HTTP_RESPONSE,
        timestampNs: getTimestampNs(),
        durationNs: getDurationNs(timerStart),
        http: {
          method: request.method,
          path: url.pathname,
          statusCode: response.status,
          responseSizeBytes,
        },
      });

      return response;
    } catch (err) {
      collector.add({
        traceId: ctx.traceId,
        spanId: ctx.spanId,
        type: EventType.ERROR,
        timestampNs: getTimestampNs(),
        durationNs: getDurationNs(timerStart),
        http: {
          method: request.method,
          path: url.pathname,
          statusCode: 500,
        },
        error: {
          message: err instanceof Error ? err.message : String(err),
          stackTrace: err instanceof Error ? err.stack : undefined,
          errorType: err instanceof Error ? err.constructor.name : 'Error',
        },
      });
      throw err;
    }
  }) as T;
}
