import { withTrace } from './tracer';
import { lens } from './lens';
import { getCallerInfo } from './core/utils';

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
  // Capture the definition site once when the decorator is applied to the class.
  // Frame layout:  Error → getCallerInfo → Trace (factory) → class definition file (frame 3).
  // This gives us the file/line of the @Trace() annotation, which sits directly
  // above the method signature — close enough for CodeLens placement.
  const locationHint = getCallerInfo(3);

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

      return withTrace(traceName, () => originalMethod.apply(this, args), locationHint);
    };

    return descriptor;
  };
}
