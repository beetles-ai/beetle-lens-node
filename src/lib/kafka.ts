import { Kafka, Producer, logLevel } from 'kafkajs';
import type { ProfilingEvent, EventBatch } from '../types';
import { EventType } from '../types';

// ── Topic names ────────────────────────────────────────────────────────────────
export const TOPICS = {
  HTTP:   'beetle-profiler-http',    // HTTP_REQUEST + HTTP_RESPONSE events
  SPANS:  'beetle-profiler-spans',   // FUNCTION_CALL + ERROR events
} as const;

// ── Kafka client singleton ─────────────────────────────────────────────────────
let kafka: Kafka | null = null;
let producer: Producer | null = null;

function getKafkaClient(brokers: string[]): Kafka {
  if (!kafka) {
    kafka = new Kafka({
      clientId: 'beetle-lens-sdk',
      brokers,
      logLevel: logLevel.ERROR, // show errors, suppress info/debug noise
      retry: { initialRetryTime: 100, retries: 3 },
    });
  }
  return kafka;
}

/**
 * Connect the Kafka producer.
 * Called once when the SDK is initialized with kafkaBrokers.
 */
export async function connectKafkaProducer(brokers: string[]): Promise<void> {
  if (producer) return;
  producer = getKafkaClient(brokers).producer({
    allowAutoTopicCreation: true, // create topics automatically if missing
  });
  await producer.connect();
}

/**
 * Route each event to the correct topic and publish.
 *
 * HTTP events   → beetle-profiler-http
 * Span + errors → beetle-profiler-spans
 *
 * Message key = serviceName → guarantees ordering per service within a partition
 */
export async function publishBatch(batch: EventBatch): Promise<void> {
  if (!producer) return;

  const httpMessages: { key: string; value: string }[] = [];
  const spanMessages: { key: string; value: string }[] = [];

  for (const event of batch.events) {
    const message = {
      key: batch.serviceName,
      value: JSON.stringify(event),
    };

    if (event.type === EventType.HTTP_REQUEST || event.type === EventType.HTTP_RESPONSE) {
      httpMessages.push(message);
    } else {
      // FUNCTION_CALL, ERROR, DB_QUERY → spans topic
      spanMessages.push(message);
    }
  }

  const sends: Promise<unknown>[] = [];

  if (httpMessages.length > 0) {
    sends.push(
      producer.send({ topic: TOPICS.HTTP, messages: httpMessages })
    );
  }

  if (spanMessages.length > 0) {
    sends.push(
      producer.send({ topic: TOPICS.SPANS, messages: spanMessages })
    );
  }

  await Promise.all(sends);
}

/**
 * Disconnect on shutdown.
 */
export async function disconnectKafkaProducer(): Promise<void> {
  if (producer) {
    await producer.disconnect();
    producer = null;
    kafka = null;
  }
}
