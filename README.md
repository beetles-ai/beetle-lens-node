## @beetleai_dev/beetle-node — Beetle Lens Node.js SDK

Beetle Lens is a **low‑overhead, production‑safe profiler for Node.js services**.  
This package is the Node SDK that captures function spans and HTTP metrics and ships them to the Beetle Lens backend.

It is designed to be:

- **Drop‑in**: one‑line setup for popular frameworks.
- **Safe in prod**: batching + backpressure, no blocking network calls on hot paths.
- **Code‑native**: see real functions, files, and lines in your flame graphs and dashboards.

---

## Installation

```bash
npm install @beetleai_dev/beetle-node
# or
pnpm add @beetleai_dev/beetle-node
```

Node **18+** is required (see `engines` in `package.json`).

---

## Quick start (Express, auto mode)

For most APIs, you only need to initialize the SDK once and it will automatically profile all HTTP handlers.

```ts
// src/server.ts
import express from 'express';
import { initLens } from '@beetleai_dev/beetle-node/express';

const app = express();
app.use(express.json());

initLens(app, {
  serviceName: 'my-express-api',
  environment: process.env.NODE_ENV ?? 'development',
  mode: 'auto',           // auto‑instrument all routes
  debug: false,           // set true to see debug logs in dev
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
```

Once running with the Beetle Lens server configured, you’ll see:

- Per‑route latency (p50/p95/p99), QPS, error rate.
- Per‑function breakdowns inside each route (which lines are slow).

---

## Manual function tracing

You can also instrument individual functions, even outside HTTP frameworks.

```ts
import { withTrace } from '@beetleai_dev/beetle-node';

async function calculateInvoiceTotal(subtotal: number, taxRate: number): Promise<number> {
  // This work will be profiled as "calculateInvoiceTotal"
  return withTrace('calculateInvoiceTotal', async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
    const tax = subtotal * taxRate;
    return Number((subtotal + tax).toFixed(2));
  });
}
```

Every call to `withTrace` produces a span with:

- `function_name`, `file_path`, `line_number`
- `duration_ns`
- Service metadata (service name, environment, version, etc.)

---

## Decorator‑based tracing (classes & methods)

If you prefer decorators, you can use `@Trace()` on class methods:

```ts
import { Trace } from '@beetleai_dev/beetle-node';

class InvoiceService {
  @Trace()
  async calculateInvoiceTotal(subtotal: number, taxRate: number): Promise<number> {
    await new Promise((resolve) => setTimeout(resolve, 25));
    const tax = subtotal * taxRate;
    return Number((subtotal + tax).toFixed(2));
  }
}
```

Enable `experimentalDecorators` in your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true
  }
}
```

---

## Express auto‑mode example (no decorators)

This mirrors the example app in `examples/express-auto-no-decorators`.

```ts
import express from 'express';
import { initLens } from '@beetleai_dev/beetle-node/express';

const app = express();
app.use(express.json());

initLens(app, {
  serviceName: 'example-express-app-no-decorators',
  environment: 'development',
  mode: 'auto',
  debug: true,
});

async function calculateInvoiceTotal(subtotal: number, taxRate: number): Promise<number> {
  await new Promise((resolve) => setTimeout(resolve, 25));
  const tax = subtotal * taxRate;
  return Number((subtotal + tax).toFixed(2));
}

app.get('/invoice/total', async (req, res) => {
  const subtotal = Number(req.query.subtotal ?? 100);
  const taxRate = Number(req.query.taxRate ?? 0.18);

  if (Number.isNaN(subtotal) || Number.isNaN(taxRate)) {
    res.status(400).json({ error: 'subtotal and taxRate must be numbers' });
    return;
  }

  const total = await calculateInvoiceTotal(subtotal, taxRate);
  res.json({ subtotal, taxRate, total });
});

const PORT = parseInt(process.env.PORT ?? '3000', 10);
app.listen(PORT, () => {
  console.log(`Express server running on http://localhost:${PORT}`);
  console.log('API: GET /invoice/total?subtotal=100&taxRate=0.18');
});
```

Run the example locally with:

```bash
pnpm example:no-decorators
```

---

## Configuration reference

`initLens` accepts a config object like:

```ts
initLens(app, {
  serviceName: 'my-service',           // required
  environment: 'production',           // e.g. development | staging | production
  mode: 'auto',                        // 'auto' | 'manual' (depending on integration)
  debug: false,                        // log debug info to console in dev
});
```

Additional options may be added over time; check TypeScript hints from the exported `BeetleLensConfig` type for the most up‑to‑date fields.

---

## How data flows

1. Your code emits spans/events via this SDK.
2. Events are batched by the client and sent to the Beetle Lens ingest endpoint (Kafka + ClickHouse in the example stack).
3. The Beetle Lens UI queries ClickHouse to show:
   - Hot functions in each route/file.
   - Latency and error trends over time.

---

## License

Apache‑2.0

