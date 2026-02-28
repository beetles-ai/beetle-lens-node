/**
 * @beetle/lens — Beetle Lens Node.js SDK
 *
 * Collects function/API events and sends them to the Beetle Ingest API.
 *
 * Quick start (Express):
 *   import { initLens } from '@beetle/lens/express';
 *   initLens(app, { apiKey: 'blt_xxx', serviceName: 'my-api' });
 *
 * Manual tracing:
 *   import { withTrace, Trace } from '@beetle/lens';
 *
 *   // Wrap any function
 *   const result = await withTrace('getUser', () => db.users.findById(id));
 *
 *   // Decorate class methods
 *   class UserService {
 *     @Trace()
 *     async getUser(id: string) { ... }
 *   }
 */

export { lens, BeetleLens } from './lens';
export { withTrace } from './tracer';
export { Trace } from './decorators';
export type { TraceOptions } from './decorators';
export type { BeetleLensConfig, ProfilingMode } from './config';
export type { ProfilingEvent, EventBatch, EventType } from './types';
export { getContext, addMetadata } from './context';
