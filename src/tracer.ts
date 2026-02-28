import { EventType } from './types';
import { lens } from './lens';
import { createChildContext, runWithContext } from './context';
import { getTimestampNs, startTimer, getDurationNs } from './core/utils';

/**
 * withTrace — wrap any async or sync function for tracing.
 *
 * @example
 * const user = await withTrace('getUser', () => db.users.findById(id));
 */
export async function withTrace<T>(
  name: string,
  fn: () => T | Promise<T>
): Promise<T> {
  const collector = lens.getCollector();

  // If collector not initialized — just run the function, zero overhead
  if (!collector) return fn() as Promise<T>;

  const ctx = createChildContext();
  const timestampNs = getTimestampNs();
  const timerStart = startTimer();

  return runWithContext(ctx, async () => {
    try {
      const result = await fn();

      collector.add({
        traceId: ctx.traceId,
        spanId: ctx.spanId,
        parentSpanId: ctx.parentSpanId,
        type: EventType.FUNCTION_CALL,
        timestampNs,
        durationNs: getDurationNs(timerStart),
        functionName: name,
      });

      return result;
    } catch (err) {
      collector.add({
        traceId: ctx.traceId,
        spanId: ctx.spanId,
        parentSpanId: ctx.parentSpanId,
        type: EventType.ERROR,
        timestampNs,
        durationNs: getDurationNs(timerStart),
        functionName: name,
        error: {
          message: err instanceof Error ? err.message : String(err),
          stackTrace: err instanceof Error ? err.stack : undefined,
          errorType: err instanceof Error ? err.constructor.name : 'Error',
        },
      });

      throw err; // always re-throw
    }
  });
}
