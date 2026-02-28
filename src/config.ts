import { getServiceName, getEnvironment } from './core/utils';

export type ProfilingMode = 'auto' | 'manual';

export interface BeetleLensConfig {
  /**
   * API key — get this from your Beetle dashboard
   */
  apiKey?: string;

  /**
   * Service name — auto-detected from package.json if not set
   */
  serviceName?: string;

  /**
   * Environment — defaults to NODE_ENV
   */
  environment?: string;

  /**
   * 'auto'   — tracks all HTTP routes, DB calls, outgoing HTTP automatically
   * 'manual' — only tracks what you decorate with @Trace() or withTrace()
   * Default: 'auto'
   */
  mode?: ProfilingMode;

  /**
   * Sample rate 0.0–1.0 (default: 1.0 = 100%)
   * Errors are always captured regardless of this value
   */
  sampleRate?: number;

  /**
   * Max events per batch before flushing (default: 100)
   */
  batchSize?: number;

  /**
   * How often to flush in ms (default: 1000)
   */
  flushIntervalMs?: number;

  /**
   * Beetle Ingest API endpoint
   */
  endpoint?: string;

  /**
   * Debug mode — saves events to .beetle-lens/ folder locally instead of sending
   */
  debug?: boolean;

  /**
   * Disable SDK entirely (useful in test environments)
   */
  disabled?: boolean;

  /**
   * Directory to save debug event files (debug mode only)
   * Default: <cwd>/.beetle-lens
   */
  outputDir?: string;
}

export interface ResolvedConfig extends Required<BeetleLensConfig> {}

export function resolveConfig(userConfig: BeetleLensConfig): ResolvedConfig {
  return {
    apiKey: userConfig.apiKey ?? '',
    serviceName: userConfig.serviceName ?? getServiceName(),
    environment: userConfig.environment ?? getEnvironment(),
    mode: userConfig.mode ?? 'auto',
    sampleRate: userConfig.sampleRate ?? 1.0,
    batchSize: userConfig.batchSize ?? 100,
    flushIntervalMs: userConfig.flushIntervalMs ?? 1000,
    endpoint: userConfig.endpoint ?? 'https://api.beetleai.dev',
    debug: userConfig.debug ?? false,
    disabled: userConfig.disabled ?? false,
    outputDir: userConfig.outputDir ?? '',
  };
}
