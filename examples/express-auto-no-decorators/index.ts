import express from 'express';
import { initLens } from '../../src/integrations/express';

const app = express();
app.use(express.json());

// One-line setup — initLens auto-tracks all HTTP routes (method, path, status, duration).
// No decorators, no withTrace needed.
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
