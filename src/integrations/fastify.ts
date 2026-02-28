import type { FastifyPluginCallback } from 'fastify';
import type { BeetleLensConfig } from '../config';
import { lens } from '../lens';
import { createContext } from '../context';
import { sanitizeHeaders, getTimestampNs, startTimer, getDurationNs } from '../core/utils';
import { EventType } from '../types';

/**
 * beetlePlugin — Fastify plugin for Beetle Lens.
 *
 * @example
 * import Fastify from 'fastify';
 * import { beetlePlugin } from '@beetle/lens/fastify';
 *
 * const fastify = Fastify();
 * await fastify.register(beetlePlugin, { apiKey: 'blt_xxx' });
 */
export const beetlePlugin: FastifyPluginCallback<BeetleLensConfig> = (
  fastify,
  userConfig,
  done
) => {
  const collector = lens.init(userConfig);
  const config = collector.getConfig();

  if (config.disabled) return done();

  fastify.addHook('onRequest', async (request) => {
    const ctx = createContext();
    const timestampNs = getTimestampNs();
    const timerStart = startTimer();

    // Store on request for use in onResponse hook
    (request as never as Record<string, unknown>)['_beetleCtx'] = ctx;
    (request as never as Record<string, unknown>)['_beetleStart'] = timerStart;
    (request as never as Record<string, unknown>)['_beetleTs'] = timestampNs;

    const requestSizeBytes = request.headers['content-length']
      ? parseInt(request.headers['content-length'])
      : 0;

    collector.add({
      traceId: ctx.traceId,
      spanId: ctx.spanId,
      type: EventType.HTTP_REQUEST,
      timestampNs,
      http: {
        method: request.method,
        path: request.url,
        headers: sanitizeHeaders(request.headers as Record<string, string>),
        requestSizeBytes,
      },
    });
  });

  fastify.addHook('onResponse', async (request, reply) => {
    const r = request as never as Record<string, unknown>;
    const ctx = r['_beetleCtx'] as ReturnType<typeof createContext> | undefined;
    const timerStart = r['_beetleStart'] as bigint | undefined;
    if (!ctx || timerStart === undefined) return;

    // Fastify provides the matched route pattern via routeOptions.url
    const route: string | undefined = (request as unknown as { routeOptions?: { url?: string } }).routeOptions?.url;

    const rawLen = reply.getHeader('content-length');
    const responseSizeBytes = rawLen ? parseInt(String(rawLen)) : undefined;

    collector.add({
      traceId: ctx.traceId,
      spanId: ctx.spanId,
      type: EventType.HTTP_RESPONSE,
      timestampNs: getTimestampNs(),
      durationNs: getDurationNs(timerStart),
      http: {
        method: request.method,
        path: request.url,
        route,
        statusCode: reply.statusCode,
        responseSizeBytes,
      },
    });
  });

  if (config.debug) {
    console.log('[Beetle Lens] ✅ Fastify plugin registered:', {
      service: config.serviceName,
      mode: config.mode,
    });
  }

  done();
};
