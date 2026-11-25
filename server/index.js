import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import Redis from 'ioredis';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const {
  PORT = 4000,
  MONGO_URI = 'mongodb://127.0.0.1:27017/cornercup',
  REDIS_URL,
  STAFF_PASSWORD = 'buda',
  JWT_SECRET = 'dev-secret',
  CORS_ORIGIN = '*',
} = process.env;
const STATUSES = ['Pending', 'Preparing', 'Ready', 'Collected'];

// MongoDB is the primary database.
const menuSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  category: { type: String, default: 'Other' },
  price: { type: Number, required: true, min: 0 },
  available: { type: Boolean, default: true },
}, { versionKey: false });

const orderSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  number: { type: String, required: true, unique: true },
  customerName: { type: String, required: true, trim: true },
  notes: { type: String, default: '' },
  items: [{ id: String, name: String, price: Number, quantity: Number }],
  total: { type: Number, required: true },
  status: { type: String, enum: STATUSES, default: 'Pending' },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });

const Menu = mongoose.model('Menu', menuSchema);
const Order = mongoose.model('Order', orderSchema);

// Redis is optional and used as a cache, not as the source of truth.
let redis = null;
if (REDIS_URL) {
  redis = new Redis(REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  redis.on('error', (err) => console.warn('Redis cache unavailable:', err.message));
  try {
    await redis.connect();
    console.log('Redis cache connected');
  } catch (err) {
    console.warn('Redis is unavailable; continuing with MongoDB only:', err.message);
    redis.disconnect();
    redis = null;
  }
}

async function getCachedMenu() {
  if (!redis || redis.status !== 'ready') return null;
  try {
    const cached = await redis.get('cornercup:menu');
    return cached ? JSON.parse(cached) : null;
  } catch (err) {
    console.warn('Redis cache read failed:', err.message);
    return null;
  }
}
async function cacheMenu(items) {
  if (!redis || redis.status !== 'ready') return;
  try { await redis.set('cornercup:menu', JSON.stringify(items), 'EX', 60); }
  catch (err) { console.warn('Redis cache write failed:', err.message); }
}
async function clearMenuCache() {
  if (!redis || redis.status !== 'ready') return;
  try { await redis.del('cornercup:menu'); }
  catch (err) { console.warn('Redis cache clear failed:', err.message); }
}

const app = express();
app.use(cors({ origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(',') }));
app.use(express.json());
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const fail = (res, code, error) => res.status(code).json({ error });

const requireStaff = (req, res, next) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  try { jwt.verify(token, JWT_SECRET); next(); }
  catch { fail(res, 401, 'Staff login required'); }
};

app.get('/api/health', (_req, res) => res.json({
  status: 'ok', database: mongoose.connection.readyState === 1 ? 'mongodb' : 'disconnected',
  cache: redis?.status === 'ready' ? 'redis' : 'disabled',
}));

app.post('/api/auth/login', (req, res) => {
  const given = Buffer.from(String(req.body?.password ?? ''));
  const real = Buffer.from(STAFF_PASSWORD);
  if (given.length !== real.length || !crypto.timingSafeEqual(given, real)) return fail(res, 401, 'Wrong password');
  res.json({ token: jwt.sign({ role: 'staff' }, JWT_SECRET, { expiresIn: '8h' }) });
});

// Menu: MongoDB is the source of truth; Redis optionally caches the list.
app.get('/api/menu', h(async (_req, res) => {
  const cached = await getCachedMenu();
  if (cached) return res.json(cached);
  const items = await Menu.find().lean();
  items.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  await cacheMenu(items);
  res.json(items);
}));
app.get('/api/menu/:id', h(async (req, res) => {
  const item = await Menu.findOne({ id: req.params.id }).lean();
  item ? res.json(item) : fail(res, 404, 'Menu item not found');
}));
app.post('/api/menu', requireStaff, h(async (req, res) => {
  const body = req.body || {};
  const item = {
    id: crypto.randomUUID(), name: String(body.name ?? '').trim(),
    description: String(body.description ?? '').trim(),
    category: String(body.category ?? 'Other').trim() || 'Other',
    price: Number(body.price), available: body.available === undefined ? true : Boolean(body.available),
  };
  if (!item.name) return fail(res, 400, 'name is required');
  if (!Number.isFinite(item.price) || item.price < 0) return fail(res, 400, 'price must be a number of 0 or more');
  const saved = await Menu.create(item);
  await clearMenuCache();
  res.status(201).json(saved.toObject());
}));
app.put('/api/menu/:id', requireStaff, h(async (req, res) => {
  const old = await Menu.findOne({ id: req.params.id });
  if (!old) return fail(res, 404, 'Menu item not found');
  const body = req.body || {};
  const item = {
    name: String(body.name ?? old.name).trim(),
    description: String(body.description ?? old.description).trim(),
    category: String(body.category ?? old.category).trim() || 'Other',
    price: Number(body.price ?? old.price),
    available: body.available === undefined ? old.available : Boolean(body.available),
  };
  if (!item.name) return fail(res, 400, 'name is required');
  if (!Number.isFinite(item.price) || item.price < 0) return fail(res, 400, 'price must be a number of 0 or more');
  Object.assign(old, item);
  await old.save();
  await clearMenuCache();
  res.json(old.toObject());
}));
app.delete('/api/menu/:id', requireStaff, h(async (req, res) => {
  const deleted = await Menu.findOneAndDelete({ id: req.params.id });
  if (!deleted) return fail(res, 404, 'Menu item not found');
  await clearMenuCache();
  res.status(204).end();
}));

// Orders are stored in MongoDB.
app.get('/api/orders/summary', requireStaff, h(async (_req, res) => {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  const orders = await Order.find({ createdAt: { $gte: start, $lt: end } }).lean();
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, orders.filter((o) => o.status === s).length]));
  res.json({ date: new Date().toISOString().slice(0, 10), orderCount: orders.length,
    revenue: +orders.reduce((sum, o) => sum + o.total, 0).toFixed(2), byStatus });
}));
app.get('/api/orders', requireStaff, h(async (_req, res) => {
  res.json(await Order.find().sort({ createdAt: -1 }).lean());
}));
app.get('/api/orders/:id', h(async (req, res) => {
  const order = await Order.findOne({ id: req.params.id }).lean();
  order ? res.json(order) : fail(res, 404, 'Order not found');
}));
app.post('/api/orders', h(async (req, res) => {
  const { customerName, notes = '', items } = req.body || {};
  if (!String(customerName || '').trim()) return fail(res, 400, 'customerName is required');
  if (!Array.isArray(items) || !items.length) return fail(res, 400, 'items must be a non-empty array');
  const lines = [];
  for (const line of items) {
    const qty = Number(line.quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > 50) return fail(res, 400, 'quantity must be a whole number from 1 to 50');
    const item = await Menu.findOne({ id: line.id }).lean();
    if (!item) return fail(res, 400, `Menu item ${line.id} does not exist`);
    if (!item.available) return fail(res, 400, `${item.name} is currently unavailable`);
    lines.push({ id: item.id, name: item.name, price: item.price, quantity: qty });
  }
  const count = await Order.countDocuments();
  const order = await Order.create({
    id: crypto.randomUUID(), number: `CS-${1001 + count}`,
    customerName: String(customerName).trim(), notes: String(notes).trim(), items: lines,
    total: +lines.reduce((sum, line) => sum + line.price * line.quantity, 0).toFixed(2),
    status: 'Pending', createdAt: new Date(),
  });
  res.status(201).json(order.toObject());
}));
app.patch('/api/orders/:id/status', requireStaff, h(async (req, res) => {
  const order = await Order.findOne({ id: req.params.id });
  if (!order) return fail(res, 404, 'Order not found');
  if (!STATUSES.includes(req.body?.status)) return fail(res, 400, `status must be one of: ${STATUSES.join(', ')}`);
  order.status = req.body.status;
  await order.save();
  res.json(order.toObject());
}));

app.use((_req, res) => fail(res, 404, 'Route not found'));
app.use((err, _req, res, _next) => {
  console.error(err);
  if (err.type === 'entity.parse.failed') return fail(res, 400, 'Invalid JSON body');
  if (err.code === 11000) return fail(res, 400, 'A record with that unique value already exists');
  fail(res, 500, 'Something went wrong on the server');
});

async function start() {
  await mongoose.connect(MONGO_URI);
  console.log('MongoDB connected successfully');
  if (!(await Menu.exists({}))) {
    const seed = [
      ['Flat White', 'Double espresso, silky steamed milk', 'Coffee', 32],
      ['Americano', 'Espresso topped with hot water', 'Coffee', 25],
      ['Cappuccino', 'Espresso, steamed milk, thick foam', 'Coffee', 30],
      ['Rooibos Tea', 'Caffeine-free South African red bush', 'Tea', 20],
      ['Butter Croissant', 'Baked fresh each morning', 'Pastries', 28],
      ['Blueberry Muffin', 'Soft, with real blueberries', 'Pastries', 24],
    ];
    await Menu.insertMany(seed.map(([name, description, category, price]) => ({
      id: crypto.randomUUID(), name, description, category, price, available: true,
    })));
    console.log('Starter menu added to MongoDB');
  }
  app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
}

start().catch((err) => {
  console.error('Could not start the API. Check that MongoDB is running and MONGO_URI is correct.', err.message);
  process.exit(1);
});
