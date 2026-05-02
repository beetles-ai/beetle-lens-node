import { EVENT_TYPE, LensEvent, LensConfig } from './types';
import { newId, wallClockNs, nsToString } from './utils';

/**
 * All builders stamp service metadata from config so patchers
 * never need to know about config directly.
 */
function meta(cfg: LensConfig): Pick<LensEvent, 'serviceName' | 'serviceVersion' | 'environment' | 'instanceId' | 'region' | 'agentVersion'> {
  return {
    serviceName:    cfg.serviceName,
    serviceVersion: cfg.serviceVersion,
    environment:    cfg.environment,
    instanceId:     cfg.instanceId,
    region:         cfg.region,
    agentVersion:   cfg.agentVersion,
  };
}

export function buildHttpRequestEvent(cfg: LensConfig, opts: {
  traceId:  string;
  spanId:   string;
  method:   string;
  path:     string;
  requestSizeBytes?: number;
}): LensEvent {
  return {
    ...meta(cfg),
    traceId:      opts.traceId,
    spanId:       opts.spanId,
    type:         EVENT_TYPE.HTTP_REQUEST,
    timestampNs:  nsToString(wallClockNs()),
    http: {
      method: opts.method,
      path:   opts.path,
      requestSizeBytes: opts.requestSizeBytes,
    },
  };
}

export function buildHttpResponseEvent(cfg: LensConfig, opts: {
  traceId:    string;
  spanId:     string;
  durationNs: bigint;
  method:     string;
  path:       string;
  route:      string;
  statusCode: number;
  requestSizeBytes?:  number;
  responseSizeBytes?: number;
}): LensEvent {
  return {
    ...meta(cfg),
    traceId:     opts.traceId,
    spanId:      opts.spanId,
    type:        EVENT_TYPE.HTTP_RESPONSE,
    timestampNs: nsToString(wallClockNs()),
    durationNs:  nsToString(opts.durationNs),
    http: {
      method:           opts.method,
      path:             opts.path,
      route:            opts.route,
      statusCode:       opts.statusCode,
      requestSizeBytes:  opts.requestSizeBytes,
      responseSizeBytes: opts.responseSizeBytes,
    },
  };
}

export function buildFunctionCallEvent(cfg: LensConfig, opts: {
  traceId:      string;
  parentSpanId: string;
  durationNs:   bigint;
  functionName: string;
  filePath?:    string;
  lineNumber?:  number;
  callerFunctionName?: string;
}): LensEvent {
  return {
    ...meta(cfg),
    traceId:             opts.traceId,
    spanId:              newId(),
    parentSpanId:        opts.parentSpanId,
    type:                EVENT_TYPE.FUNCTION_CALL,
    timestampNs:         nsToString(wallClockNs()),
    durationNs:          nsToString(opts.durationNs),
    functionName:        opts.functionName,
    filePath:            opts.filePath,
    lineNumber:          opts.lineNumber,
    callerFunctionName:  opts.callerFunctionName,
  };
}

export function buildErrorEvent(cfg: LensConfig, opts: {
  traceId:      string;
  parentSpanId: string;
  durationNs:   bigint;
  functionName: string;
  filePath?:    string;
  error:        Error;
}): LensEvent {
  return {
    ...meta(cfg),
    traceId:      opts.traceId,
    spanId:       newId(),
    parentSpanId: opts.parentSpanId,
    type:         EVENT_TYPE.ERROR,
    timestampNs:  nsToString(wallClockNs()),
    durationNs:   nsToString(opts.durationNs),
    functionName: opts.functionName,
    filePath:     opts.filePath,
    error: {
      message:    opts.error.message,
      errorType:  opts.error.name,
      stackTrace: opts.error.stack ?? '',
    },
  };
}
