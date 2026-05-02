import { v4 as uuidv4 } from 'uuid';
import * as os from 'os';

export function newId(): string {
  return uuidv4();
}

export function nowNs(): bigint {
  return process.hrtime.bigint();
}

export function nsToString(ns: bigint): string {
  return ns.toString();
}

/** Absolute wall-clock time in nanoseconds */
export function wallClockNs(): bigint {
  return BigInt(Date.now()) * 1_000_000n;
}

export function getInstanceId(): string {
  return os.hostname();
}

export function getRegion(): string {
  return process.env['AWS_REGION'] ?? process.env['REGION'] ?? 'unknown';
}
