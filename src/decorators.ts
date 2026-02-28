import { withTrace } from './tracer';
import { lens } from './lens';

export interface TraceOptions {
  /**
   * Custom name for this trace. Defaults to the method name.
   */
  name?: string;
}

/**
 * @Trace() — method decorator for class methods.
 * Works on both async and sync methods.
 * Use on any class method to track its latency and errors.
 *
 * In 'manual' mode: only decorated methods are tracked.
 * In 'auto' mode: adds additional detail on top of auto-tracking.
 *
 * @example
 * class UserService {
 *   @Trace()
 *   async getUser(id: string) { ... }
 *
 *   @Trace({ name: 'fetch-orders' })
 *   async getOrders() { ... }
 * }
 */
export function Trace(options?: TraceOptions) {
  return function (
    _target: object,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const originalMethod = descriptor.value as (...args: unknown[]) => unknown;
    if (typeof originalMethod !== 'function') return descriptor;

    const traceName = options?.name ?? propertyKey;

    descriptor.value = async function (...args: unknown[]) {
      // Skip if SDK not initialized — zero overhead
      if (!lens.isInitialized()) {
        return originalMethod.apply(this, args);
      }

      return withTrace(traceName, () => originalMethod.apply(this, args));
    };

    return descriptor;
  };
}
