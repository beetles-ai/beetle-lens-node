/**
 * Express Auto Mode Example
 * Run: pnpm example
 */
import express from 'express';
import path from 'path';
import { initLens } from '../../src/integrations/express';
import { withTrace, Trace } from '../../src/index';

const app = express();
app.use(express.json());

// ── BEETLE LENS — one liner ───────────────────────────────────────────
initLens(app, {
  serviceName: 'example-express-app',
  mode: 'auto',
  kafkaBrokers: process.env.KAFKA_BROKERS || 'localhost:9092',
  debug: true, // also log to console when publishing
  outputDir: path.join(__dirname, '../../profiler-output'),
});

// ── Routes ────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({ hello: 'world', ts: new Date().toISOString() });
});

app.get('/users/:id', async (req, res) => {
  const user = await withTrace('fetchUserFromDB', async () => {
    await new Promise(r => setTimeout(r, 10)); // simulate DB call
    return { id: req.params.id, name: 'Alice' };
  });
  res.json(user);
});

app.get('/error', (_req, _res) => {
  throw new Error('Test error — should appear in profiler-output/');
});

// ── Class with @Trace decorator ───────────────────────────────────────
class OrderService {
  @Trace()
  async getOrders() {
    await new Promise(r => setTimeout(r, 5));
    return [{ id: 1, item: 'Widget' }, { id: 2, item: 'Gadget' }];
  }
}

const orderService = new OrderService();

app.get('/orders', async (_req, res) => {
  const orders = await orderService.getOrders();
  res.json(orders);
});

// ── Start ─────────────────────────────────────────────────────────────
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`\n🐛 Beetle Lens Example running`);
  console.log(`   GET http://localhost:${PORT}/`);
  console.log(`   GET http://localhost:${PORT}/users/42`);
  console.log(`   GET http://localhost:${PORT}/orders`);
  console.log(`   GET http://localhost:${PORT}/error`);
  console.log(`\n📁 Events will appear in: profiler-output/\n`);
});
