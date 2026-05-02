import type { Request, Response, NextFunction, Application } from 'express';
import { storage } from './context';
import { pushEvent, flush } from './buffer';
import { buildHttpRequestEvent, buildHttpResponseEvent } from './events';
import { newId, nowNs } from './utils';
import type { LensConfig, SpanContext } from './types';

/**
 * Registers the Beetle Lens middleware on the Express app.
 *
 * Must be registered BEFORE any routes so that every request
 * enters the AsyncLocalStorage context.
 */
export function registerMiddleware(app: Application, cfg: LensConfig): void {
  app.use(lensMiddleware(cfg));
}

function lensMiddleware(cfg: LensConfig) {
  return function beetleLens(req: Request, res: Response, next: NextFunction): void {
    const traceId       = newId();
    const requestSpanId = newId();
    const startNs       = nowNs();

    // originalUrl always has the full path e.g. /external/slow
    // req.path strips the router mount prefix so it would give /slow
    const fullPath = req.originalUrl.split('?')[0] ?? req.path;

    const ctx: SpanContext = {
      traceId,
      requestSpanId,
      startNs,
      method: req.method,
      path:   fullPath,
    };

    // Emit HTTP_REQUEST event immediately
    pushEvent(buildHttpRequestEvent(cfg, {
      traceId,
      spanId:           requestSpanId,
      method:           req.method,
      path:             fullPath,
      requestSizeBytes: contentLength(req.headers['content-length']),
    }));

    // Intercept res.end to emit HTTP_RESPONSE when the response is sent
    const originalEnd = res.end.bind(res);

    (res as unknown as Record<string, unknown>)['end'] = function patchedEnd(
      ...args: Parameters<typeof res.end>
    ): ReturnType<typeof res.end> {
      const durationNs = nowNs() - startNs;

      // req.route.path is only the sub-router segment e.g. '/slow'.
      // req.baseUrl is the router mount prefix e.g. '/external'.
      // Concatenating gives the full matched pattern e.g. '/external/slow'.
      const routeSegment = (req.route?.path as string | undefined) ?? '';
      const route = routeSegment ? (req.baseUrl ?? '') + routeSegment : req.path;

      // Update ctx.route so patchers can also read it if needed
      ctx.route = route;

      pushEvent(buildHttpResponseEvent(cfg, {
        traceId,
        spanId:            requestSpanId,
        durationNs,
        method:            req.method,
        path:              fullPath,
        route,
        statusCode:        res.statusCode,
        requestSizeBytes:  contentLength(req.headers['content-length']),
        responseSizeBytes: contentLength(res.getHeader('content-length') as string | undefined),
      }));

      // Flush this trace's events immediately rather than waiting for the timer
      flush();

      return originalEnd(...args);
    };

    // Run the rest of the request pipeline inside the AsyncLocalStorage context
    storage.run(ctx, () => next());
  };
}

function contentLength(header: string | undefined): number | undefined {
  if (!header) return undefined;
  const n = parseInt(header, 10);
  return Number.isFinite(n) ? n : undefined;
}
