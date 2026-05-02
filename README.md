# @beetleai_dev/lens-node

Production profiler for Node.js Express apps. Automatically tracks route latency, MongoDB queries, axios calls, and fetch() calls — with zero code changes to your routes.

Works with the [Beetle Lens VS Code extension](https://marketplace.visualstudio.com/items?itemName=Beetle.beetle) to show real production metrics inline above your code as CodeLens annotations.

```
🪲 142 calls  |  87ms avg  |  p95 210ms
router.get('/users', async (req, res) => { ... })
```

---

## Install

```bash
npm install @beetleai_dev/lens-node
```

---

## Quick start

Call `initLens()` once in your entry file, **before** any routes are registered:

```ts
import express from 'express';
import { initLens } from '@beetleai_dev/lens-node';

const app = express();

initLens({
  app,
  serviceName: 'my-api',
  apiKey: process.env.BEETLE_API_KEY,
});

app.get('/users', async (req, res) => {
  // your route code — no changes needed
});

app.listen(3000);
```

That's it. The SDK patches Express, Mongoose, axios, and fetch automatically.

---

## What it tracks

| Source | What's recorded |
|--------|----------------|
| Express routes | Request duration, route pattern, HTTP status, response size |
| Mongoose | Query duration per model (`find`, `findOne`, `save`, `aggregate`, etc.) |
| axios | Outbound HTTP call duration, URL, method |
| fetch() | Outbound HTTP call duration, URL, method |

All events are linked via `traceId` so you can see which DB queries and outbound calls happened inside each request.

---

## Options

```ts
initLens({
  // Required
  app: express(),           // Your Express app instance
  serviceName: 'my-api',   // Identifies your service in the metrics store

  // Optional
  apiKey: 'blt_...',        // API key for the Beetle Lens server
  ingestUrl: 'http://...',  // Default: http://localhost:3001/api/lens/ingest
  environment: 'production',// Default: process.env.NODE_ENV ?? 'development'
  serviceVersion: '1.2.0',  // Default: process.env.npm_package_version
  flushIntervalMs: 2000,    // How often to batch-send events. Default: 2000ms
  flushMaxBatch: 100,       // Max events per batch. Default: 100
  debugFile: './lens.jsonl', // Optional: write all events to a local NDJSON file
});
```

---

## Debug mode

Set `debugFile` to write every event to a local file for inspection:

```ts
initLens({
  app,
  serviceName: 'my-api',
  apiKey: '...',
  debugFile: './beetle-lens-events.jsonl',
});
```

Each line is a JSON event. Tail it while hitting routes:

```bash
tail -f beetle-lens-events.jsonl | python3 -m json.tool
```

---

## VS Code extension

Install the [Beetle extension](https://marketplace.visualstudio.com/items?itemName=Beetle.beetle) and configure:

```
Beetle > Lens: Service Name  →  my-api
Beetle > Lens: Api Key       →  blt_...
Beetle > Lens: Server Url    →  http://localhost:3001
```

Open any route file and metrics appear inline above each route and async function.

---

## Architecture

```
Your Express app
    ↓  (beetle-lens-node SDK — zero-config patching)
Batched events → POST /api/lens/ingest
    ↓
beetle-lens-server → Kafka → ClickHouse
    ↓
VS Code extension fetches aggregated metrics (avg, p95, error rate)
    ↓
CodeLens annotations shown inline in your editor
```

---

## License

MIT © [Beetle AI](https://beetleai.dev)
