import express from 'express';
import path from 'path';
import { initLens } from '../../src/integrations/express';
import { withTrace, Trace } from '../../src/index';

const app = express();
app.use(express.json());

const KAFKA_BROKERS  = process.env.KAFKA_BROKERS;
const BEETLE_API_KEY = process.env.BEETLE_API_KEY;
const BEETLE_ENDPOINT = process.env.BEETLE_ENDPOINT ?? 'http://localhost:3001';

initLens(app, {
  serviceName:  'example-express-app',
  environment:  'development',
  mode:         'auto',
  kafkaBrokers: KAFKA_BROKERS,
  apiKey:       BEETLE_API_KEY,
  endpoint:     BEETLE_ENDPOINT,
  debug:        true,
  outputDir:    path.join(__dirname, '../../profiler-output'),
});

// ── Services ──────────────────────────────────────────────────────────────────

class UserService {
  async findById(id: string) {
    return withTrace('fetchUserFromDB', async () => {
      await new Promise(r => setTimeout(r, 10 + Math.random() * 20));
      if (id === '0') throw new Error('User not found');
      return { id, name: 'Alice', email: 'alice@example.com' };
    });
  }
}

class OrderService {
  @Trace()
  async getOrders() {
    await new Promise(r => setTimeout(r, 5 + Math.random() * 10));
    return [
      { id: 1, item: 'Widget',  price: 9.99  },
      { id: 2, item: 'Gadget',  price: 24.99 },
      { id: 3, item: 'Doohickey', price: 4.99 },
    ];
  }

  @Trace()
  async createOrder(item: string, price: number) {
    await withTrace('validateInventory', async () => {
      await new Promise(r => setTimeout(r, 3 + Math.random() * 5));
    });
    await withTrace('chargePayment', async () => {
      await new Promise(r => setTimeout(r, 15 + Math.random() * 30));
    });
    return { id: Math.floor(Math.random() * 10000), item, price, status: 'confirmed' };
  }
}

const userService  = new UserService();
const orderService = new OrderService();

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/', (_req, res) => {
  res.json({ service: 'example-express-app', status: 'ok', ts: new Date().toISOString() });
});

app.get('/users/:id', async (req, res) => {
  try {
    const user = await userService.findById(req.params.id);
    res.json(user);
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

app.get('/orders', async (_req, res) => {
  const orders = await orderService.getOrders();
  res.json(orders);
});

app.post('/orders', async (req, res) => {
  const { item = 'Unknown', price = 0 } = req.body as { item?: string; price?: number };
  const order = await orderService.createOrder(item, price);
  res.status(201).json(order);
});

app.get('/error', (_req, _res) => {
  throw new Error('Intentional test error');
});

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '3000', 10);

const mode =
  KAFKA_BROKERS  ? `Kafka  → ${KAFKA_BROKERS}` :
  BEETLE_API_KEY ? `HTTP   → ${BEETLE_ENDPOINT}/api/lens/ingest` :
                   'Debug  → profiler-output/';

app.listen(PORT, () => {
  console.log(`\n🐛  Beetle Lens — example-express-app`);
  console.log(`    Transport : ${mode}`);
  console.log(`    App       : http://localhost:${PORT}\n`);
  console.log(`    GET  /`);
  console.log(`    GET  /users/:id   (use id=0 to trigger an error)`);
  console.log(`    GET  /orders`);
  console.log(`    POST /orders      body: { "item": "Widget", "price": 9.99 }`);
  console.log(`    GET  /error\n`);
});
