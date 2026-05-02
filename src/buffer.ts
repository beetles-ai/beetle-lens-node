import type { LensEvent } from './types';

type FlushFn = (events: LensEvent[]) => void;

let _buffer: LensEvent[] = [];
let _maxBatch = 100;
let _timer: ReturnType<typeof setInterval> | null = null;
let _flushFn: FlushFn | null = null;

export function initBuffer(opts: {
  flushIntervalMs: number;
  flushMaxBatch:   number;
  onFlush:         FlushFn;
}): void {
  _maxBatch = opts.flushMaxBatch;
  _flushFn  = opts.onFlush;

  if (_timer) clearInterval(_timer);

  _timer = setInterval(() => {
    flush();
  }, opts.flushIntervalMs);

  // Don't block process exit on the timer
  if (_timer.unref) _timer.unref();
}

export function pushEvent(event: LensEvent): void {
  _buffer.push(event);
  if (_buffer.length >= _maxBatch) flush();
}

export function flush(): void {
  if (_buffer.length === 0 || !_flushFn) return;
  const batch = _buffer.splice(0, _buffer.length);
  _flushFn(batch);
}

export function destroyBuffer(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
  flush();
}
