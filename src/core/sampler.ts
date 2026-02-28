import type { ProfilingEvent } from '../types';
import { EventType } from '../types';

export interface SamplerConfig {
  initialSampleRate?: number;
  minSampleRate?: number;
  maxSampleRate?: number;
  alwaysSampleErrors?: boolean;
}

/**
 * AdaptiveSampler — automatically adjusts sample rate based on QPS.
 * High traffic → lower rate to reduce overhead.
 * Errors are ALWAYS sampled regardless of rate.
 */
export class AdaptiveSampler {
  private sampleRate: number;
  private minSampleRate: number;
  private maxSampleRate: number;
  private alwaysSampleErrors: boolean;
  private eventCount = 0;
  private lastAdjustmentTime = Date.now();
  private readonly adjustmentIntervalMs = 60_000; // check every minute

  constructor(config: SamplerConfig = {}) {
    this.sampleRate = config.initialSampleRate ?? 1.0;
    this.minSampleRate = config.minSampleRate ?? 0.01; // 1% minimum
    this.maxSampleRate = config.maxSampleRate ?? 1.0;  // 100% maximum
    this.alwaysSampleErrors = config.alwaysSampleErrors !== false;
  }

  shouldSample(event: ProfilingEvent): boolean {
    // Always capture errors — never drop them
    if (this.alwaysSampleErrors && event.type === EventType.ERROR) {
      return true;
    }

    const sampled = Math.random() < this.sampleRate;
    if (sampled) this.eventCount++;

    this.maybeAdjustRate();
    return sampled;
  }

  private maybeAdjustRate(): void {
    const now = Date.now();
    const elapsed = now - this.lastAdjustmentTime;
    if (elapsed < this.adjustmentIntervalMs) return;

    const eventsPerSecond = (this.eventCount / elapsed) * 1000;

    if (eventsPerSecond > 10_000) {
      // High traffic — reduce sampling to protect overhead
      this.sampleRate = Math.max(this.minSampleRate, this.sampleRate * 0.8);
    } else if (eventsPerSecond < 1_000) {
      // Low traffic — increase sampling for better visibility
      this.sampleRate = Math.min(this.maxSampleRate, this.sampleRate * 1.2);
    }

    this.eventCount = 0;
    this.lastAdjustmentTime = now;
  }

  getCurrentRate(): number {
    return this.sampleRate;
  }

  setSampleRate(rate: number): void {
    this.sampleRate = Math.max(this.minSampleRate, Math.min(this.maxSampleRate, rate));
  }
}
