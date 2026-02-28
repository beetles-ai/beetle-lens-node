import type { ProfilingEvent, EventBatch } from '../types';
import { EventType } from '../types';
import { EventBatcher } from './batcher';
import { AdaptiveSampler } from './sampler';
import { sendBatch } from './transport';
import { getContext } from '../context';
import { generateId, getTimestampNs, getInstanceId, getRegion, getServiceVersion } from './utils';
import type { ResolvedConfig } from '../config';

const AGENT_VERSION = '0.1.0';

/**
 * EventCollector — the central hub that connects sampler → batcher → transport.
 * add() is the hot path — it's intentionally minimal.
 */
export class EventCollector {
  private batcher: EventBatcher;
  private sampler: AdaptiveSampler;
  private config: ResolvedConfig;
  private instanceId: string;
  private region: string;
  private serviceVersion: string;

  constructor(config: ResolvedConfig) {
    this.config = config;
    this.instanceId = getInstanceId();
    this.region = getRegion();
    this.serviceVersion = getServiceVersion();

    this.sampler = new AdaptiveSampler({
      initialSampleRate: config.sampleRate,
      alwaysSampleErrors: true,
    });

    this.batcher = new EventBatcher({
      maxBatchSize: config.batchSize,
      maxWaitMs: config.flushIntervalMs,
      serviceName: config.serviceName,
      environment: config.environment,
      onFlush: (batch: EventBatch) => sendBatch(batch, config),
    });
  }

  add(partial: Omit<Partial<ProfilingEvent>, 'language' | 'agentVersion'>): void {
    if (this.config.disabled) return;

    const ctx = getContext();

    const event: ProfilingEvent = {
      traceId: partial.traceId ?? ctx?.traceId ?? generateId(),
      spanId: partial.spanId ?? ctx?.spanId ?? generateId(),
      parentSpanId: partial.parentSpanId ?? ctx?.parentSpanId,
      type: partial.type ?? EventType.FUNCTION_CALL,
      timestampNs: partial.timestampNs ?? getTimestampNs(),
      durationNs: partial.durationNs,
      functionName: partial.functionName,
      filePath: partial.filePath,
      lineNumber: partial.lineNumber,
      metadata: { ...(ctx?.metadata ?? {}), ...(partial.metadata ?? {}) },
      error: partial.error,
      http: partial.http,
      db: partial.db,
      serviceName: this.config.serviceName,
      serviceVersion: this.serviceVersion,
      environment: this.config.environment,
      instanceId: this.instanceId,
      region: this.region,
      language: 'nodejs',
      agentVersion: AGENT_VERSION,
    };

    if (!this.sampler.shouldSample(event)) return;

    this.batcher.add(event);
  }

  async flush(): Promise<void> {
    await this.batcher.flush();
  }

  async destroy(): Promise<void> {
    await this.batcher.destroy();
  }

  getConfig(): ResolvedConfig {
    return this.config;
  }
}
