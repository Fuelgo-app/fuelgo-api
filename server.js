import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;

// Health
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Auth stubs
app.post('/api/auth/signup', (req, res) => {
  const { companyName, email } = req.body || {};
  return res.status(201).json({ token: 'demo-token', userId: 'u_demo', companyId: 'c_demo', email, companyName });
});
app.post('/api/auth/login', (req, res) => {
  return res.json({ token: 'demo-token', userId: 'u_demo', companyId: 'c_demo' });
});

// Wallet provision stub
app.post('/api/wallet/provision', (req, res) => {
  const { platform, cardId } = req.body || {};
  return res.status(202).json({ started: true, platform, cardId });
});

// Webhook stub
app.post('/api/transactions/webhook', (req, res) => {
  // TODO: verify signature header X-FuelGo-Signature
  console.log('Webhook event:', req.body);
  return res.json({ received: true });
});

// Vehicles
let vehicles = [
  { id: 'V-001', plate: 'XX-123-K', label: 'Sprinter #1', limitDaily: 200, geofenceRequired: true },
  { id: 'V-002', plate: 'ZZ-987-P', label: 'Model 3', limitDaily: 250, geofenceRequired: true }
];
app.get('/api/vehicles', (req, res) => res.json(vehicles));
app.post('/api/vehicles', (req, res) => {
  const v = { id: `V-${String(vehicles.length+1).padStart(3,'0')}`, ...req.body };
  vehicles.push(v);
  res.status(201).json(v);
});
app.put('/api/vehicles/:id', (req, res) => {
  const idx = vehicles.findIndex(v => v.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'not found' });
  vehicles[idx] = { ...vehicles[idx], ...req.body };
  res.json(vehicles[idx]);
});

// Transactions
const transactions = [
  { id: 'TX-10021', when: new Date().toISOString(), merchant: 'Shell Almere Poort', amount: 82.4, kind: 'Fuel', plate: 'XX-123-K' }
];
app.get('/api/transactions', (req, res) => res.json(transactions));

// Km-log
app.post('/api/km-log', (req, res) => {
  const { transactionId, km } = req.body || {};
  if (!transactionId || typeof km !== 'number') return res.status(400).json({ error: 'bad_request' });
  return res.status(201).json({ ok: true, transactionId, km });
});

// Invoices
app.get('/api/invoices', (req, res) => res.json([{ id: 'INV-2025-09', month: '2025-09', url: 'https://example.com/inv.pdf' }]));

app.listen(PORT, () => console.log(`FuelGo API running on http://localhost:${PORT}`));
