/**
 * Event types tracked by Beetle Lens
 */
export enum EventType {
  FUNCTION_CALL = 0,
  HTTP_REQUEST = 1,
  HTTP_RESPONSE = 2,
  ERROR = 3,
  DB_QUERY = 4,
}

export interface ErrorInfo {
  message: string;
  stackTrace?: string;
  errorType?: string;
}

export interface HttpInfo {
  method: string;
  path: string;                   // exact path e.g. /users/42
  route?: string;                 // normalized pattern e.g. /users/:id
  statusCode?: number;
  headers?: Record<string, string>;
  requestSizeBytes?: number;
  responseSizeBytes?: number;
}

export interface DbInfo {
  system: string; // 'mongoose' | 'prisma' | 'pg' | 'redis'
  operation: string;
  collection?: string;
  durationNs?: string;
}

export interface ProfilingEvent {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  type: EventType;
  timestampNs: string;            // Unix epoch nanoseconds (wall clock)
  durationNs?: string;
  functionName?: string;
  filePath?: string;        // absolute path of the file where the traced function is defined
  lineNumber?: number;      // line in that file (withTrace call site or @Trace annotation line)
  callerFunctionName?: string; // JS function that contains the withTrace() call
  metadata?: Record<string, string>;
  error?: ErrorInfo;
  http?: HttpInfo;
  db?: DbInfo;
  serviceName?: string;
  serviceVersion?: string;        // from user's package.json
  environment?: string;
  instanceId?: string;            // hostname / pod name
  region?: string;                // AWS_REGION / FLY_REGION etc.
  language: 'nodejs';
  agentVersion: string;
}

export interface EventBatch {
  events: ProfilingEvent[];
  serviceName: string;
  environment: string;
  batchTimestampNs: string;
  agentVersion: string;
}
