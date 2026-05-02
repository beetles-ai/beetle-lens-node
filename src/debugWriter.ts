import * as fs from 'fs';
import * as path from 'path';
import type { LensEvent } from './types';

/**
 * Appends a batch of events to a local .jsonl file (one JSON object per line).
 * Called alongside sendBatch() when LensOptions.debugFile is set.
 * Failures are swallowed — debug writing must never affect the host app.
 */
export function writeDebugBatch(filePath: string, events: LensEvent[]): void {
  if (events.length === 0) return;

  try {
    const resolved = path.resolve(filePath);
    const lines = events.map(e => JSON.stringify(e)).join('\n') + '\n';
    fs.appendFileSync(resolved, lines, 'utf8');
  } catch {
    // silently ignore — e.g. permission error, disk full
  }
}
