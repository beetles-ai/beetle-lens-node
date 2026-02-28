import type { Request, Response, NextFunction, Application } from 'express';
import type { BeetleLensConfig } from '../config';
import { lens } from '../lens';
import { createContext, runWithContext } from '../context';
import { sanitizeHeaders, getTimestampNs, startTimer, getDurationNs } from '../core/utils';
import { EventType } from '../types';

/**
 * initLens — one-liner setup for Express.
 *
 * @example
 * import express from 'express';
 * import { initLens } from '@beetle/lens/express';
 *
 * const app = express();
 * initLens(app, { apiKey: 'blt_xxx', serviceName: 'my-api' });
 */
export function initLens(app: Application, userConfig: BeetleLensConfig = {}): void {
  const collector = lens.init(userConfig);
  const config = collector.getConfig();

  if (config.disabled) return;

  // Request/response tracking middleware (must come early)
  app.use(createMiddleware());

  // Global error handler (must come AFTER all routes — Express requires 4-param signature)
  app.use(createErrorHandler());

  if (config.debug) {
    console.log('[Beetle Lens] ✅ Express initialized:', {
      service: config.serviceName,
      mode: config.mode,
    });
  }
}

/**
 * createMiddleware — for manual middleware setup.
 * initLens() calls this internally.
 */
export function createMiddleware() {
  return function beetleLensMiddleware(req: Request, res: Response, next: NextFunction): void {
    const collector = lens.getCollector();
    if (!collector || collector.getConfig().disabled) return next();

    const ctx = createContext();
    const timestampNs = getTimestampNs();
    const timerStart = startTimer();
    let responseSent = false;

    // Emit HTTP_REQUEST event
    collector.add({
      traceId: ctx.traceId,
      spanId: ctx.spanId,
      type: EventType.HTTP_REQUEST,
      timestampNs,
      http: {
        method: req.method,
        path: req.path || req.url,
        headers: sanitizeHeaders(req.headers as Record<string, string>),
        requestSizeBytes: req.headers['content-length']
          ? parseInt(req.headers['content-length'])
          : 0,
      },
    });

    const emitResponse = () => {
      if (responseSent) return;
      responseSent = true;

      // req.route is available by res.finish time — route handler has already run
      const route: string | undefined =
        (req.route?.path as string | undefined) ??
        (req as Request & { baseUrl?: string }).baseUrl ??
        undefined;

      // Try to read content-length for response size
      const rawLen = res.getHeader('content-length');
      const responseSizeBytes = rawLen ? parseInt(String(rawLen)) : undefined;

      collector.add({
        traceId: ctx.traceId,
        spanId: ctx.spanId,
        type: EventType.HTTP_RESPONSE,
        timestampNs: getTimestampNs(),
        durationNs: getDurationNs(timerStart),
        http: {
          method: req.method,
          path: req.path || req.url,
          route,
          statusCode: res.statusCode,
          responseSizeBytes,
        },
      });
    };

    res.on('finish', emitResponse);

    runWithContext(ctx, () => next());
  };
}

/**
 * createErrorHandler — catches unhandled Express errors.
 * Must be registered AFTER all routes.
 * initLens() registers this automatically.
 */
export function createErrorHandler() {
  // 4-parameter signature is required by Express to recognise this as an error handler
  return function beetleLensErrorHandler(
    err: Error,
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    const collector = lens.getCollector();
    const ctx = createContext();

    if (collector && !collector.getConfig().disabled) {
      collector.add({
        traceId: ctx.traceId,
        spanId: ctx.spanId,
        type: EventType.ERROR,
        timestampNs: getTimestampNs(),
        http: {
          method: req.method,
          path: req.path || req.url,
          route: req.route?.path as string | undefined,
          statusCode: res.statusCode || 500,
        },
        error: {
          message: err.message,
          stackTrace: err.stack,
          errorType: err.constructor?.name || 'Error',
        },
      });
    }

    next(err);
  };
}
