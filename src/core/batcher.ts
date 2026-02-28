import type { ProfilingEvent, EventBatch } from '../types';
import { getTimestampNs } from './utils';

export interface BatcherConfig {
  maxBatchSize?: number;
  maxWaitMs?: number;
  serviceName: string;
  environment: string;
  onFlush: (batch: EventBatch) => Promise<void>;
}

/**
 * EventBatcher — collects events in memory and flushes them in bulk.
 * Non-blocking: events are pushed into an array. Flush happens async on a timer.
 */
export class EventBatcher {
  private batch: ProfilingEvent[] = [];
  private pendingEvents: ProfilingEvent[] = [];
  private maxBatchSize: number;
  private maxWaitMs: number;
  private flushTimer: NodeJS.Timeout | null = null;
  private onFlush: (batch: EventBatch) => Promise<void>;
  private isFlushing = false;
  private serviceName: string;
  private environment: string;

  constructor(config: BatcherConfig) {
    this.maxBatchSize = config.maxBatchSize ?? 100;
    this.maxWaitMs = config.maxWaitMs ?? 1000;
    this.onFlush = config.onFlush;
    this.serviceName = config.serviceName;
    this.environment = config.environment;
  }

  /**
   * Add an event — takes ~1 microsecond, never blocks your code
   */
  add(event: ProfilingEvent): void {
    if (this.isFlushing) {
      this.pendingEvents.push(event);
      return;
    }

    this.batch.push(event);

    if (this.batch.length >= this.maxBatchSize) {
      this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), this.maxWaitMs);
    }
  }

  /**
   * Flush the current batch — called by timer or when batch is full
   */
  async flush(): Promise<void> {
    if (this.isFlushing || this.batch.length === 0) return;

    this.isFlushing = true;

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const eventsToFlush = [...this.batch];
    this.batch = [];

    const eventBatch: EventBatch = {
      events: eventsToFlush,
      serviceName: this.serviceName,
      environment: this.environment,
      batchTimestampNs: getTimestampNs().toString(),
      agentVersion: '0.1.0',
    };

    try {
      await this.onFlush(eventBatch);
    } catch {
      // Put events back on failure — they'll be retried next flush
      this.batch = [...eventsToFlush, ...this.batch];
    } finally {
      this.isFlushing = false;

      if (this.pendingEvents.length > 0) {
        this.batch.push(...this.pendingEvents);
        this.pendingEvents = [];

        if (this.batch.length >= this.maxBatchSize) {
          this.flush();
        } else if (!this.flushTimer && this.batch.length > 0) {
          this.flushTimer = setTimeout(() => this.flush(), this.maxWaitMs);
        }
      }
    }
  }

  size(): number {
    return this.batch.length + this.pendingEvents.length;
  }

  /**
   * Graceful shutdown — flush remaining events before process exits
   */
  async destroy(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    // Wait for any in-progress flush
    while (this.isFlushing) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    await this.flush();
  }
}
