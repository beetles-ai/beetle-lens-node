import { getContext } from '../context';
import { pushEvent } from '../buffer';
import { buildFunctionCallEvent, buildErrorEvent } from '../events';
import { nowNs } from '../utils';
import type { LensConfig } from '../types';

type AnyFn = (...args: unknown[]) => unknown;

let _patched = false;

export function patchMongoose(cfg: LensConfig): void {
  if (_patched) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mongoose: Record<string, any> | undefined;
  try {
    mongoose = require('mongoose') as Record<string, unknown>;
  } catch {
    return;
  }

  // ── Patch Query.prototype.exec ────────────────────────────────────────────
  // Every find/findOne/findById/updateOne/deleteOne/countDocuments etc.
  // resolves through Query.prototype.exec — one patch covers all of them.
  const Query = mongoose['Query'] as { prototype: Record<string, AnyFn> };
  if (typeof Query?.prototype?.['exec'] === 'function') {
    const originalExec = Query.prototype['exec'];
    Query.prototype['exec'] = function patchedExec(this: Record<string, unknown>, ...args: unknown[]) {
      const ctx = getContext();
      if (!ctx) return originalExec.apply(this, args);

      // Query op is readable e.g. 'find', 'findOne', 'updateMany'
      const op    = (this['op'] as string | undefined) ?? 'query';
      const model = (this['model'] as { modelName?: string } | undefined)?.modelName ?? '';
      const label = model ? `mongoose.${op} [${model}]` : `mongoose.${op}`;
      const start = nowNs();

      let result: unknown;
      try {
        result = originalExec.apply(this, args);
      } catch (err) {
        pushEvent(buildErrorEvent(cfg, {
          traceId:      ctx.traceId,
          parentSpanId: ctx.requestSpanId,
          durationNs:   nowNs() - start,
          functionName: label,
          error:        err instanceof Error ? err : new Error(String(err)),
        }));
        throw err;
      }

      if (result !== null && typeof result === 'object' && typeof (result as Record<string, unknown>)['then'] === 'function') {
        return (result as Promise<unknown>).then(
          (value) => {
            pushEvent(buildFunctionCallEvent(cfg, {
              traceId:      ctx.traceId,
              parentSpanId: ctx.requestSpanId,
              durationNs:   nowNs() - start,
              functionName: label,
            }));
            return value;
          },
          (err: unknown) => {
            pushEvent(buildErrorEvent(cfg, {
              traceId:      ctx.traceId,
              parentSpanId: ctx.requestSpanId,
              durationNs:   nowNs() - start,
              functionName: label,
              error:        err instanceof Error ? err : new Error(String(err)),
            }));
            throw err;
          },
        );
      }

      pushEvent(buildFunctionCallEvent(cfg, {
        traceId:      ctx.traceId,
        parentSpanId: ctx.requestSpanId,
        durationNs:   nowNs() - start,
        functionName: label,
      }));
      return result;
    };
  }

  // ── Patch Aggregate.prototype.exec ────────────────────────────────────────
  // Model.aggregate() uses a separate class that also has exec()
  const Aggregate = mongoose['Aggregate'] as { prototype: Record<string, AnyFn> };
  if (typeof Aggregate?.prototype?.['exec'] === 'function') {
    const originalAggExec = Aggregate.prototype['exec'];
    Aggregate.prototype['exec'] = function patchedAggExec(this: Record<string, unknown>, ...args: unknown[]) {
      const ctx = getContext();
      if (!ctx) return originalAggExec.apply(this, args);

      const model = (this['_model'] as { modelName?: string } | undefined)?.modelName ?? '';
      const label = model ? `mongoose.aggregate [${model}]` : 'mongoose.aggregate';
      const start = nowNs();

      let result: unknown;
      try {
        result = originalAggExec.apply(this, args);
      } catch (err) {
        pushEvent(buildErrorEvent(cfg, {
          traceId:      ctx.traceId,
          parentSpanId: ctx.requestSpanId,
          durationNs:   nowNs() - start,
          functionName: label,
          error:        err instanceof Error ? err : new Error(String(err)),
        }));
        throw err;
      }

      if (result !== null && typeof result === 'object' && typeof (result as Record<string, unknown>)['then'] === 'function') {
        return (result as Promise<unknown>).then(
          (value) => {
            pushEvent(buildFunctionCallEvent(cfg, {
              traceId:      ctx.traceId,
              parentSpanId: ctx.requestSpanId,
              durationNs:   nowNs() - start,
              functionName: label,
            }));
            return value;
          },
          (err: unknown) => {
            pushEvent(buildErrorEvent(cfg, {
              traceId:      ctx.traceId,
              parentSpanId: ctx.requestSpanId,
              durationNs:   nowNs() - start,
              functionName: label,
              error:        err instanceof Error ? err : new Error(String(err)),
            }));
            throw err;
          },
        );
      }

      pushEvent(buildFunctionCallEvent(cfg, {
        traceId:      ctx.traceId,
        parentSpanId: ctx.requestSpanId,
        durationNs:   nowNs() - start,
        functionName: label,
      }));
      return result;
    };
  }

  // ── Patch Document.prototype.save ─────────────────────────────────────────
  // save() does not go through Query.exec — it has its own path
  const Document = mongoose['Document'] as { prototype: Record<string, AnyFn> } | undefined;
  if (typeof Document?.prototype?.['save'] === 'function') {
    const originalSave = Document.prototype['save'];
    Document.prototype['save'] = function patchedSave(this: Record<string, unknown>, ...args: unknown[]) {
      const ctx = getContext();
      if (!ctx) return originalSave.apply(this, args);

      const modelName = (this.constructor as { modelName?: string })?.modelName ?? '';
      const label     = modelName ? `mongoose.save [${modelName}]` : 'mongoose.save';
      const start     = nowNs();

      let result: unknown;
      try {
        result = originalSave.apply(this, args);
      } catch (err) {
        pushEvent(buildErrorEvent(cfg, {
          traceId:      ctx.traceId,
          parentSpanId: ctx.requestSpanId,
          durationNs:   nowNs() - start,
          functionName: label,
          error:        err instanceof Error ? err : new Error(String(err)),
        }));
        throw err;
      }

      if (result !== null && typeof result === 'object' && typeof (result as Record<string, unknown>)['then'] === 'function') {
        return (result as Promise<unknown>).then(
          (value) => {
            pushEvent(buildFunctionCallEvent(cfg, {
              traceId:      ctx.traceId,
              parentSpanId: ctx.requestSpanId,
              durationNs:   nowNs() - start,
              functionName: label,
            }));
            return value;
          },
          (err: unknown) => {
            pushEvent(buildErrorEvent(cfg, {
              traceId:      ctx.traceId,
              parentSpanId: ctx.requestSpanId,
              durationNs:   nowNs() - start,
              functionName: label,
              error:        err instanceof Error ? err : new Error(String(err)),
            }));
            throw err;
          },
        );
      }

      pushEvent(buildFunctionCallEvent(cfg, {
        traceId:      ctx.traceId,
        parentSpanId: ctx.requestSpanId,
        durationNs:   nowNs() - start,
        functionName: label,
      }));
      return result;
    };
  }

  _patched = true;
}
