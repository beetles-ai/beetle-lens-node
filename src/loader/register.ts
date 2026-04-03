/**
 * Beetle Lens — automatic function instrumentation via Node.js module hook.
 *
 * Register this BEFORE your app starts:
 *
 *   node -r @beetleai/beetle-node/register app.js
 *   tsx  -r @beetleai/beetle-node/register app.ts
 *
 * What it does:
 *   • Patches Module.prototype._compile so every loaded CJS module passes
 *     through the AST transformer before execution.
 *   • Injects a tiny `__beetleTrace` global that proxies to withTrace().
 *   • No changes needed in application code.
 *
 * Performance:
 *   • Transform runs ONCE per file at load time; result is cached by Node.
 *   • Per-call overhead is ~1–3 µs (AsyncLocalStorage + timer + buffer append).
 *   • If beetle-lens is not initialised (initLens not called), __beetleTrace
 *     is a zero-overhead passthrough — the function runs with no wrapping.
 */

import Module from 'module';
import { shouldInstrument } from './filter';
import { transformSource } from './transformer';

function installGlobal(): void {
  if ((globalThis as any).__beetleTrace) return; // already installed

  (globalThis as any).__beetleTrace = function beetleTrace(
    name: string,
    file: string,
    line: number,
    fn: () => unknown,
  ) {
    // Lazy-require withTrace so the loader can be registered before initLens.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { withTrace } = require('../tracer') as typeof import('../tracer');
    return withTrace(name, fn as () => unknown, { filePath: file, lineNumber: line });
  };
}

// ── Module._compile hook ───────────────────────────────────────────────────────

// `_compile` is an internal Node.js method — cast through `any` to access it.
type NodeModuleInternal = NodeModule & { _compile(content: string, filename: string): void };

let hooked = false;

function installHook(): void {
  if (hooked) return;
  hooked = true;

  const proto = Module.prototype as unknown as NodeModuleInternal;
  const originalCompile = proto._compile.bind(proto);

  proto._compile = function patchedCompile(content, filename) {
    let source = content;

    if (shouldInstrument(filename)) {
      try {
        source = transformSource(content, filename);
      } catch {
        // Transform failed — run original source untouched
        source = content;
      }
    }

    return originalCompile.call(this, source, filename);
  };
}

// ── Entry point ───────────────────────────────────────────────────────────────

installGlobal();
installHook();
