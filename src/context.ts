import { AsyncLocalStorage } from 'async_hooks';
import type { SpanContext } from './types';

/**
 * One singleton AsyncLocalStorage for the entire process.
 * Every request gets its own SpanContext via storage.run().
 * Code running inside that request's async chain calls storage.getStore()
 * to read the current trace/span IDs — even from deep inside a mongoose query.
 */
export const storage = new AsyncLocalStorage<SpanContext>();

export function getContext(): SpanContext | undefined {
  return storage.getStore();
}
