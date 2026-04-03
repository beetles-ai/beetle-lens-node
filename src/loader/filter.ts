import path from 'path';

const SKIP_PATTERNS = [
  /[/\\]node_modules[/\\]/,
  /[/\\](dist|build|out|\.next|\.nuxt|\.turbo)[/\\]/i,
  /\.(test|spec)\.(js|ts|jsx|tsx|mjs|cjs)$/,
  /\.(min)\.(js|mjs)$/,
];

// Never instrument the SDK source files (src/) — but allow examples and user apps.
// __dirname here is src/loader, so one level up is src/.
const SDK_SRC_ROOT = path.resolve(__dirname, '..');

/**
 * Returns true when the file at `filePath` should be instrumented by the
 * loader.  We only want to touch user application code, never:
 *   • node_modules
 *   • compiled output (dist / build)
 *   • test files
 *   • the beetle-lens SDK itself
 */
export function shouldInstrument(filePath: string): boolean {
  if (!filePath) return false;

  // Only JS / TS source files
  if (!/\.(js|ts|jsx|tsx|mjs|cjs)$/.test(filePath)) return false;

  // Never instrument the SDK itself
  if (filePath.startsWith(SDK_SRC_ROOT + path.sep)) return false;

  for (const pattern of SKIP_PATTERNS) {
    if (pattern.test(filePath)) return false;
  }

  return true;
}
