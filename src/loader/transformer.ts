import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import path from 'path';

interface FunctionInfo {
  name: string;
  bodyStart: number; // position of opening `{`
  bodyEnd: number;   // position of closing `}`
  isAsync: boolean;
  line: number;
}

interface Replacement {
  start: number;
  end: number;
  text: string;
}

/**
 * Apply a list of non-overlapping replacements to `source`.
 * Replacements must be sorted descending by start so that applying each one
 * does not shift the positions of subsequent replacements.
 */
function applyReplacements(source: string, replacements: Replacement[]): string {
  const sorted = [...replacements].sort((a, b) => b.start - a.start);
  let result = source;
  for (const { start, end, text } of sorted) {
    result = result.slice(0, start) + text + result.slice(end);
  }
  return result;
}

/**
 * Resolve the best display name for a function node given its parent in the AST.
 * Returns null for anonymous functions we cannot name reliably.
 */
function resolveName(node: any, parent: any): string | null {
  let name: string | null = null;

  if (node.id?.name) {
    name = node.id.name as string;
  } else if (parent?.type === 'VariableDeclarator' && parent.id?.name) {
    name = parent.id.name as string;
  } else if (parent?.type === 'MethodDefinition' && parent.key?.name) {
    if (parent.key.name === 'constructor') return null;
    name = parent.key.name as string;
  } else if (parent?.type === 'Property' && parent.key?.name) {
    name = parent.key.name as string;
  }

  if (!name) return null;
  // Skip bundler/compiler-generated helpers (esbuild: __copyProps, __toESM, etc.)
  if (name.startsWith('_')) return null;

  return name;
}

/**
 * Transform JS source by wrapping every named function body with the
 * `__beetleTrace` global injected by register.ts.
 *
 * Arrow-function wrapper preserves `this` and works for both sync and async:
 *
 *   async function foo(x) { return x + 1; }
 *   →
 *   async function foo(x) {return __beetleTrace('foo','src/a.ts',5,async () => {return x + 1;});}
 *
 * Line numbers are baked in as static literals taken directly from the original
 * AST — no source-map support needed.
 */
export function transformSource(source: string, filePath: string): string {
  // Show a relative path in the event payload for readability
  const displayPath = path.isAbsolute(filePath)
    ? filePath.replace(process.cwd() + path.sep, '')
    : filePath;

  let ast: acorn.Node;
  try {
    ast = acorn.parse(source, { ecmaVersion: 2022, sourceType: 'script', locations: true });
  } catch {
    try {
      ast = acorn.parse(source, { ecmaVersion: 2022, sourceType: 'module', locations: true });
    } catch {
      // Cannot parse (e.g. TypeScript source before transpile) — return unchanged
      return source;
    }
  }

  const functions: FunctionInfo[] = [];

  (walk.ancestor as Function)(ast, {
    Function(node: any, _state: unknown, ancestors: any[]) {
      if (node.generator) return; // skip generators
      if (node.body?.type !== 'BlockStatement') return; // skip expression-body arrows

      const parent = ancestors[ancestors.length - 2];
      const name = resolveName(node, parent);
      if (!name) return;

      functions.push({
        name,
        bodyStart: node.body.start,
        bodyEnd: node.body.end,
        isAsync: !!node.async,
        line: node.loc?.start?.line ?? 0,
      });
    },
  });

  if (functions.length === 0) return source;

  const replacements: Replacement[] = [];

  for (const fn of functions) {
    const asyncKw = fn.isAsync ? 'async ' : '';
    const nameJson = JSON.stringify(fn.name);
    const pathJson = JSON.stringify(displayPath);

    // Replace the opening `{` of the function body
    replacements.push({
      start: fn.bodyStart,
      end: fn.bodyStart + 1,
      text: `{return __beetleTrace(${nameJson},${pathJson},${fn.line},${asyncKw}() => {`,
    });

    // Replace the closing `}` of the function body
    replacements.push({
      start: fn.bodyEnd - 1,
      end: fn.bodyEnd,
      text: `});}`,
    });
  }

  return applyReplacements(source, replacements);
}
