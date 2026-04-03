import { EventType } from './types';
import { lens } from './lens';
import { createChildContext, runWithContext } from './context';
import { getTimestampNs, startTimer, getDurationNs, getCallerInfo, CallerInfo } from './core/utils';

/**
 * withTrace — wrap any async or sync function for tracing.
 *
 * @example
 * const user = await withTrace('getUser', () => db.users.findById(id));
 *
 * @param _locationHint  Pre-captured location from @Trace() decorator; skips
 *                       auto-detection when provided (internal use only).
 */
export async function withTrace<T>(
  name: string,
  fn: () => T | Promise<T>,
  _locationHint?: Pick<CallerInfo, 'filePath' | 'lineNumber'>
): Promise<T> {
  const collector = lens.getCollector();

  // If collector not initialized — just run the function, zero overhead
  if (!collector) return fn() as Promise<T>;

  // Capture the call-site synchronously before any async hops.
  // Frame layout:  Error → getCallerInfo → withTrace → user code (frame 3).
  // When called from @Trace() or the loader hook, _locationHint is pre-captured
  // so we skip stack inspection entirely (faster + more accurate).
  const location: CallerInfo = _locationHint ?? getCallerInfo(3);

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
        filePath: location.filePath,
        lineNumber: location.lineNumber,
        callerFunctionName: location.callerFunctionName,
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
        filePath: location.filePath,
        lineNumber: location.lineNumber,
        callerFunctionName: location.callerFunctionName,
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
