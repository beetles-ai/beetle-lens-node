'use strict';
/**
 * Beetle Lens — automatic function instrumentation loader.
 *
 * Usage (add -r flag before your app entry):
 *   tsx -r dotenv/config -r ./src/loader/register.js app.ts
 *   node -r @beetleai/beetle-node/register app.js
 *
 * This file is intentionally plain CJS JavaScript (no TypeScript) so that
 * Node.js loads it natively without going through tsx's ESM hooks, which
 * avoids the ERR_METHOD_NOT_IMPLEMENTED issue on Node.js 24.
 */

const Module = require('module');
const path   = require('path');
const fs     = require('fs');

// ── Filter ────────────────────────────────────────────────────────────────────

const SKIP_RE = [
  /[/\\]node_modules[/\\]/,
  /[/\\](dist|build|out|\.next|\.nuxt|\.turbo)[/\\]/i,
  /\.(test|spec)\.(js|ts|jsx|tsx|mjs|cjs)$/,
  /\.(min)\.(js|mjs)$/,
];

// Never instrument the SDK source files (src/) — but allow examples and user apps.
// __dirname here is src/loader/, so one level up is src/.
const SDK_SRC_ROOT = path.resolve(__dirname, '..');

function shouldInstrument(filePath) {
  if (!filePath) return false;
  if (!/\.(js|ts|jsx|tsx|mjs|cjs)$/.test(filePath)) return false;
  if (filePath.startsWith(SDK_SRC_ROOT + path.sep)) return false;
  for (const re of SKIP_RE) if (re.test(filePath)) return false;
  return true;
}

// ── Transformer ───────────────────────────────────────────────────────────────

const acorn     = require('acorn');
const acornWalk = require('acorn-walk');

function resolveName(node, parent) {
  let name = null;

  if (node.id && node.id.name) {
    name = node.id.name;
  } else if (parent && parent.type === 'VariableDeclarator' && parent.id && parent.id.name) {
    name = parent.id.name;
  } else if (parent && parent.type === 'MethodDefinition' && parent.key && parent.key.name) {
    if (parent.key.name === 'constructor') return null;
    name = parent.key.name;
  } else if (parent && parent.type === 'Property' && parent.key && parent.key.name) {
    name = parent.key.name;
  }

  if (!name) return null;
  // Skip bundler/compiler-generated helpers (esbuild: __copyProps, __toESM, etc.)
  if (name.startsWith('_')) return null;

  return name;
}

/** Simple string splice — apply replacements sorted descending by start pos. */
function applyReplacements(source, replacements) {
  const sorted = replacements.slice().sort((a, b) => b.start - a.start);
  let result = source;
  for (const { start, end, text } of sorted) {
    result = result.slice(0, start) + text + result.slice(end);
  }
  return result;
}

function transformSource(source, filePath) {
  const displayPath = path.isAbsolute(filePath)
    ? filePath.replace(process.cwd() + path.sep, '')
    : filePath;

  let ast;
  try {
    ast = acorn.parse(source, { ecmaVersion: 2022, sourceType: 'script', locations: true });
  } catch (_) {
    try {
      ast = acorn.parse(source, { ecmaVersion: 2022, sourceType: 'module', locations: true });
    } catch (_) {
      return source; // unparseable — leave unchanged
    }
  }

  const functions = [];

  acornWalk.ancestor(ast, {
    Function(node, _state, ancestors) {
      if (node.generator) return;
      if (!node.body || node.body.type !== 'BlockStatement') return;

      const parent = ancestors[ancestors.length - 2];
      const name = resolveName(node, parent);
      if (!name) return;

      functions.push({
        name,
        bodyStart: node.body.start,
        bodyEnd:   node.body.end,
        isAsync:   !!node.async,
        line:      (node.loc && node.loc.start && node.loc.start.line) || 0,
      });
    },
  });

  if (functions.length === 0) return source;

  const replacements = [];

  for (const fn of functions) {
    const asyncKw  = fn.isAsync ? 'async ' : '';
    const nameJson = JSON.stringify(fn.name);
    const pathJson = JSON.stringify(displayPath);

    replacements.push({
      start: fn.bodyStart,
      end:   fn.bodyStart + 1,
      text:  `{return __beetleTrace(${nameJson},${pathJson},${fn.line},${asyncKw}() => {`,
    });
    replacements.push({
      start: fn.bodyEnd - 1,
      end:   fn.bodyEnd,
      text:  `});}`,
    });
  }

  return applyReplacements(source, replacements);
}

// ── Global __beetleTrace helper ───────────────────────────────────────────────

if (!global.__beetleTrace) {
  global.__beetleTrace = function beetleTrace(name, file, line, fn) {
    // Lazy-require so loader can be registered before initLens is called.
    const { withTrace } = require('../tracer');
    return withTrace(name, fn, { filePath: file, lineNumber: line });
  };
}

// ── Module._compile hook ──────────────────────────────────────────────────────

let hooked = false;

function installHook() {
  if (hooked) return;
  hooked = true;

  const proto           = Module.prototype;
  const originalCompile = proto._compile;

  proto._compile = function beetlePatchedCompile(content, filename) {
    let source = content;
    if (shouldInstrument(filename)) {
      try { source = transformSource(content, filename); }
      catch (_) { source = content; }
    }
    return originalCompile.call(this, source, filename);
  };
}

installHook();
