import { EventCollector } from './core/collector';
import { resolveConfig } from './config';
import type { BeetleLensConfig } from './config';

/**
 * BeetleLens singleton — holds the global collector instance.
 * Initialized once via initLens() or via framework integration.
 */
export class BeetleLens {
  private collector: EventCollector | null = null;
  private initialized = false;

  init(userConfig: BeetleLensConfig): EventCollector {
    if (this.initialized && this.collector) {
      return this.collector;
    }

    const config = resolveConfig(userConfig);
    this.collector = new EventCollector(config);
    this.initialized = true;

    // Graceful shutdown — flush remaining events on process exit
    process.once('SIGTERM', () => this.shutdown());
    process.once('SIGINT', () => this.shutdown());
    process.once('beforeExit', () => this.shutdown());

    return this.collector;
  }

  getCollector(): EventCollector | null {
    return this.collector;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async flush(): Promise<void> {
    await this.collector?.flush();
  }

  async shutdown(): Promise<void> {
    if (this.collector) {
      await this.collector.destroy();
      this.collector = null;
      this.initialized = false;
    }
  }
}

/**
 * Global singleton instance
 */
export const lens = new BeetleLens();
