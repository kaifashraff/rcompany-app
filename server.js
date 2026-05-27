const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'rcompany.db');

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON');

const STATUSES = [
  ['pending', 'Order Placed'],
  ['fabric_procurement', 'Fabric Procurement'],
  ['embroidery', 'Embroidery'],
  ['stitching', 'Stitching'],
  ['quality_check', 'Quality Check'],
  ['ready', 'Ready'],
  ['dispatched', 'Dispatched'],
  ['delivered', 'Delivered']
];

const STUDIO_IMAGE = 'https://images.unsplash.com/photo-1606760227091-3dd870d97f1d?auto=format&fit=crop&w=1600&q=80';

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'shopkeeper')),
      shop_name TEXT NOT NULL,
      contact_number TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      customer_name TEXT NOT NULL,
      product_type TEXT NOT NULL,
      fabric_type TEXT NOT NULL,
      color TEXT NOT NULL,
      embroidery_details TEXT NOT NULL,
      measurements TEXT,
      deadline TEXT,
      priority TEXT DEFAULT 'normal',
      estimated_cost INTEGER DEFAULT 0,
      advance_amount INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      special_instructions TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS order_timeline (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      note TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS internal_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      note TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS fabric_inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fabric_name TEXT NOT NULL,
      color TEXT NOT NULL,
      meters_available REAL NOT NULL DEFAULT 0,
      reorder_level REAL NOT NULL DEFAULT 10,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function seed() {
  const users = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (users > 0) return;

  const adminHash = bcrypt.hashSync('Admin@123', 10);
  const demoHash = bcrypt.hashSync('Demo@123', 10);
  const insertUser = db.prepare('INSERT INTO users (email, password_hash, role, shop_name, contact_number) VALUES (?, ?, ?, ?, ?)');
  const admin = insertUser.run('admin@rcompany.com', adminHash, 'admin', 'R Company HQ', '+91 90000 00000').lastInsertRowid;
  const arif = insertUser.run('arif@textiles.com', demoHash, 'shopkeeper', 'Arif Textiles', '+91 98765 43210').lastInsertRowid;
  void admin;

  const insertOrder = db.prepare(`
    INSERT INTO orders (order_number, user_id, customer_name, product_type, fabric_type, color, embroidery_details, measurements, deadline, priority, estimated_cost, advance_amount, status, special_instructions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const rows = [
    ['RC-20260527-001', arif, 'Fatima Shaikh', 'Lehenga', 'Velvet', 'Maroon', 'Heavy zardozi border with pearl highlights', 'Bust 36, Waist 30, Length 42', '2026-06-08', 'urgent', 42000, 15000, 'embroidery', 'Bridal finish, photo approval before stitching'],
    ['RC-20260527-002', arif, 'Imran Khan', 'Sherwani', 'Raw Silk', 'Ivory', 'Gold zari chest motif and cuff detailing', 'Chest 40, Shoulder 18, Length 43', '2026-06-12', 'high', 28000, 10000, 'fabric_procurement', 'Matching stole needed'],
    ['RC-20260527-003', arif, 'Priya Sharma', 'Saree', 'Georgette', 'Emerald', 'Scattered butti with ornate pallu', '6.3m saree, blouse 1m', '2026-06-20', 'normal', 18000, 5000, 'pending', 'Keep work lightweight'],
    ['RC-20260527-004', arif, 'Rahul Verma', 'Kurta', 'Cotton Silk', 'Black', 'Minimal collar embroidery', 'Chest 42, Length 41', '2026-06-15', 'normal', 8500, 2500, 'stitching', 'Slim fit'],
    ['RC-20260527-005', arif, 'Aisha Patel', 'Dupatta', 'Net', 'Champagne', 'Four-side border with sequin spray', '2.5m x 1m', '2026-06-05', 'high', 11000, 4000, 'quality_check', 'Check border symmetry']
  ];
  for (const row of rows) {
    const result = insertOrder.run(...row);
    db.prepare('INSERT INTO order_timeline (order_id, status, note) VALUES (?, ?, ?)').run(result.lastInsertRowid, row[12], 'Seed status');
  }

  const fabrics = [
    ['Velvet', 'Maroon', 28, 12],
    ['Raw Silk', 'Ivory', 42, 15],
    ['Georgette', 'Emerald', 18, 10],
    ['Net', 'Champagne', 9, 10]
  ];
  const insertFabric = db.prepare('INSERT INTO fabric_inventory (fabric_name, color, meters_available, reorder_level) VALUES (?, ?, ?, ?)');
  for (const fabric of fabrics) insertFabric.run(...fabric);
}

migrate();
seed();

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'rcompany-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 12 }
}));

function statusLabel(status) {
  return (STATUSES.find(([key]) => key === status) || [status, status])[1];
}

function money(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN')}`;
}

function daysUntil(dateValue) {
  if (!dateValue) return 'No deadline';
  const today = new Date();
  const deadline = new Date(`${dateValue}T00:00:00`);
  const diff = Math.ceil((deadline - today) / 86400000);
  if (diff < 0) return `${Math.abs(diff)}d late`;
  if (diff === 0) return 'Due today';
  return `${diff}d left`;
}

function progress(status) {
  const index = Math.max(0, STATUSES.findIndex(([key]) => key === status));
  return Math.round(((index + 1) / STATUSES.length) * 100);
}

function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/dashboard');
  next();
}

function layout(req, title, body) {
  const user = req.session.user;
  const nav = user ? `
    <a href="/dashboard">Dashboard</a>
    ${user.role === 'admin' ? '<a href="/admin/orders">Admin</a>' : '<a href="/orders/new">New Order</a>'}
    <a href="/logout">Logout</a>
  ` : '<a href="/login">Login</a>';
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${title} · R Company</title>
      <link rel="stylesheet" href="/css/style.css">
    </head>
    <body>
      <header class="topbar">
        <a class="brand" href="/"><span>R</span><strong>R Company</strong><small>atelier ops</small></a>
        <nav>${nav}</nav>
      </header>
      <main>${body}</main>
    </body>
  </html>`;
}

function orderCard(order) {
  return `<article class="order-card">
    <div class="order-top">
      <div>
        <p class="eyebrow">${order.order_number}</p>
        <h3>${order.customer_name}</h3>
        <p class="shopline">${order.shop_name || 'Shopkeeper'} · ${order.product_type}</p>
      </div>
      <span class="badge ${order.priority}">${order.priority}</span>
    </div>
    <p class="brief">${order.fabric_type} in ${order.color}. ${order.embroidery_details}</p>
    <div class="meter"><span style="width:${progress(order.status)}%"></span></div>
    <div class="order-meta">
      <span>${statusLabel(order.status)}</span>
      <span>${daysUntil(order.deadline)}</span>
      <span>${money(order.estimated_cost)}</span>
    </div>
    <a class="button ghost full-button" href="/orders/${order.id}">Open production packet</a>
  </article>`;
}

function statCard(label, value, detail) {
  return `<article class="stat-card"><span>${label}</span><strong>${value}</strong><small>${detail}</small></article>`;
}

function workflowRail(activeStatus) {
  return `<div class="workflow-rail">${STATUSES.map(([key, label], index) => `
    <span class="${STATUSES.findIndex(([status]) => status === activeStatus) >= index ? 'done' : ''}">
      <b>${index + 1}</b>${label}
    </span>
  `).join('')}</div>`;
}

app.get('/', (req, res) => {
  const stats = {
    orders: db.prepare('SELECT COUNT(*) AS count FROM orders').get().count,
    active: db.prepare("SELECT COUNT(*) AS count FROM orders WHERE status NOT IN ('delivered')").get().count,
    revenue: db.prepare('SELECT SUM(estimated_cost) AS value FROM orders').get().value || 0,
    urgent: db.prepare("SELECT COUNT(*) AS count FROM orders WHERE priority IN ('urgent', 'high')").get().count
  };
  const featured = db.prepare('SELECT o.*, u.shop_name FROM orders o JOIN users u ON u.id = o.user_id ORDER BY o.estimated_cost DESC LIMIT 3').all();
  res.send(layout(req, 'Order command center', `
    <section class="hero premium-hero" style="--hero-image:url('${STUDIO_IMAGE}')">
      <div class="hero-copy">
        <p class="eyebrow">Premium tailoring operations suite</p>
        <h1>R Company Production OS</h1>
        <p class="lede">A live command center for bridal embroidery, tailoring jobs, shopkeeper orders, fabric stock, payments, timelines, and dispatch control.</p>
        <div class="actions">
          <a class="button" href="/login">Enter command center</a>
          <a class="button secondary" href="/admin/orders">Admin board</a>
        </div>
      </div>
      <aside class="live-panel">
        <div class="panel-head"><span></span><p>Live production pulse</p></div>
        ${statCard('Pipeline value', money(stats.revenue), 'across active orders')}
        ${statCard('Active jobs', stats.active, `${stats.urgent} high priority`)}
        ${statCard('Workflow stages', STATUSES.length, 'from order to delivery')}
      </aside>
    </section>
    <section class="section-head">
      <p class="eyebrow">Featured jobs</p>
      <h2>High-value production packets</h2>
    </section>
    <section class="grid cards featured">${featured.map(orderCard).join('')}</section>
  `));
});

app.get('/login', (req, res) => {
  res.send(layout(req, 'Login', `
    <section class="auth">
      <form method="post" action="/login" class="panel">
        <p class="eyebrow">Demo credentials</p>
        <h1>Sign in</h1>
        <label>Email <input name="email" value="admin@rcompany.com" required></label>
        <label>Password <input name="password" type="password" value="Admin@123" required></label>
        <button class="button" type="submit">Login</button>
        <p class="muted">Admin: admin@rcompany.com / Admin@123<br>Shopkeeper: arif@textiles.com / Demo@123</p>
      </form>
    </section>
  `));
});

app.post('/login', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(req.body.email);
  if (!user || !bcrypt.compareSync(req.body.password, user.password_hash)) return res.status(401).send(layout(req, 'Login failed', '<section class="auth"><div class="panel"><h1>Login failed</h1><a class="button" href="/login">Try again</a></div></section>'));
  req.session.user = { id: user.id, email: user.email, role: user.role, shop_name: user.shop_name };
  res.redirect('/dashboard');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

app.get('/dashboard', requireAuth, (req, res) => {
  if (req.session.user.role === 'admin') return res.redirect('/admin/orders');
  const orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY updated_at DESC').all(req.session.user.id);
  const value = orders.reduce((sum, order) => sum + Number(order.estimated_cost || 0), 0);
  res.send(layout(req, 'Shopkeeper dashboard', `
    <section class="page-head">
      <div><p class="eyebrow">${req.session.user.shop_name}</p><h1>Shopkeeper workspace</h1></div>
      <a class="button" href="/orders/new">Create order</a>
    </section>
    <section class="stats-strip">
      ${statCard('Orders', orders.length, 'submitted by your shop')}
      ${statCard('Pipeline', money(value), 'estimated total')}
      ${statCard('Next deadline', orders[0] ? daysUntil(orders[0].deadline) : 'None', 'latest active job')}
    </section>
    <section class="grid cards">${orders.map(orderCard).join('')}</section>
  `));
});

app.get('/orders/new', requireAuth, (req, res) => {
  res.send(layout(req, 'New order', `
    <section class="page-head"><div><p class="eyebrow">Shopkeeper portal</p><h1>Create order</h1></div></section>
    <form class="form-grid panel wide" method="post" action="/orders">
      <label>Customer name <input name="customer_name" required></label>
      <label>Product type <input name="product_type" placeholder="Lehenga, Sherwani, Saree" required></label>
      <label>Fabric type <input name="fabric_type" required></label>
      <label>Color <input name="color" required></label>
      <label>Deadline <input name="deadline" type="date"></label>
      <label>Priority <select name="priority"><option>normal</option><option>high</option><option>urgent</option><option>low</option></select></label>
      <label class="full">Embroidery details <textarea name="embroidery_details" required></textarea></label>
      <label class="full">Measurements <textarea name="measurements"></textarea></label>
      <label class="full">Special instructions <textarea name="special_instructions"></textarea></label>
      <button class="button" type="submit">Submit order</button>
    </form>
  `));
});

app.post('/orders', requireAuth, (req, res) => {
  const count = db.prepare("SELECT COUNT(*) AS count FROM orders WHERE date(created_at) = date('now')").get().count + 1;
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const orderNumber = `RC-${date}-${String(count).padStart(3, '0')}`;
  const result = db.prepare(`
    INSERT INTO orders (order_number, user_id, customer_name, product_type, fabric_type, color, embroidery_details, measurements, deadline, priority, special_instructions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(orderNumber, req.session.user.id, req.body.customer_name, req.body.product_type, req.body.fabric_type, req.body.color, req.body.embroidery_details, req.body.measurements, req.body.deadline, req.body.priority, req.body.special_instructions);
  db.prepare('INSERT INTO order_timeline (order_id, status, note) VALUES (?, ?, ?)').run(result.lastInsertRowid, 'pending', 'Order submitted by shopkeeper');
  res.redirect(`/orders/${result.lastInsertRowid}`);
});

app.get('/orders/:id', requireAuth, (req, res) => {
  const order = db.prepare('SELECT o.*, u.shop_name FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = ?').get(req.params.id);
  if (!order) return res.status(404).send('Not found');
  if (req.session.user.role !== 'admin' && order.user_id !== req.session.user.id) return res.status(403).send('Forbidden');
  const timeline = db.prepare('SELECT * FROM order_timeline WHERE order_id = ? ORDER BY created_at DESC').all(order.id);
  const notes = db.prepare('SELECT * FROM internal_notes WHERE order_id = ? ORDER BY created_at DESC').all(order.id);
  res.send(layout(req, order.order_number, `
    <section class="page-head">
      <div><p class="eyebrow">${order.order_number}</p><h1>${order.customer_name}</h1><p>${order.shop_name} · ${order.product_type} · ${daysUntil(order.deadline)}</p></div>
      <span class="status">${statusLabel(order.status)}</span>
    </section>
    ${workflowRail(order.status)}
    <section class="detail-grid">
      <article class="panel production-packet">
        <h2>Order brief</h2>
        <dl>
          <dt>Fabric</dt><dd>${order.fabric_type} / ${order.color}</dd>
          <dt>Embroidery</dt><dd>${order.embroidery_details}</dd>
          <dt>Measurements</dt><dd>${order.measurements || 'Not added'}</dd>
          <dt>Deadline</dt><dd>${order.deadline || 'Not set'}</dd>
          <dt>Estimate</dt><dd>${money(order.estimated_cost)} · Advance ${money(order.advance_amount)}</dd>
        </dl>
      </article>
      <article class="panel">
        <h2>Timeline</h2>
        <ol class="timeline">${timeline.map(item => `<li><strong>${statusLabel(item.status)}</strong><span>${item.note || ''}</span><small>${item.created_at}</small></li>`).join('')}</ol>
      </article>
      ${req.session.user.role === 'admin' ? `
      <article class="panel">
        <h2>Admin controls</h2>
        <form method="post" action="/admin/orders/${order.id}/status" class="stack">
          <select name="status">${STATUSES.map(([key, label]) => `<option value="${key}" ${key === order.status ? 'selected' : ''}>${label}</option>`).join('')}</select>
          <input name="note" placeholder="Timeline note">
          <button class="button" type="submit">Update status</button>
        </form>
        <form method="post" action="/admin/orders/${order.id}/note" class="stack">
          <textarea name="note" placeholder="Internal note" required></textarea>
          <button class="button secondary" type="submit">Add note</button>
        </form>
      </article>
      <article class="panel"><h2>Internal notes</h2>${notes.map(note => `<p class="note">${note.note}<small>${note.created_at}</small></p>`).join('') || '<p class="muted">No notes yet.</p>'}</article>` : ''}
    </section>
  `));
});

app.get('/admin/orders', requireAdmin, (req, res) => {
  const status = req.query.status || '';
  const orders = status
    ? db.prepare('SELECT o.*, u.shop_name FROM orders o JOIN users u ON u.id = o.user_id WHERE o.status = ? ORDER BY o.updated_at DESC').all(status)
    : db.prepare('SELECT o.*, u.shop_name FROM orders o JOIN users u ON u.id = o.user_id ORDER BY o.updated_at DESC').all();
  const fabrics = db.prepare('SELECT * FROM fabric_inventory ORDER BY meters_available ASC').all();
  const allOrders = db.prepare('SELECT o.*, u.shop_name FROM orders o JOIN users u ON u.id = o.user_id ORDER BY o.updated_at DESC').all();
  const totalValue = allOrders.reduce((sum, order) => sum + Number(order.estimated_cost || 0), 0);
  const activeCount = allOrders.filter(order => order.status !== 'delivered').length;
  const dueSoon = allOrders.filter(order => order.deadline && new Date(`${order.deadline}T00:00:00`) - new Date() < 7 * 86400000).length;
  const board = STATUSES.map(([key, label]) => {
    const items = allOrders.filter(order => order.status === key);
    return `<section class="kanban-column"><header><span>${label}</span><b>${items.length}</b></header>${items.map(orderCard).join('') || '<p class="empty">No jobs in this stage</p>'}</section>`;
  }).join('');
  res.send(layout(req, 'Admin board', `
    <section class="page-head">
      <div><p class="eyebrow">Admin workflow</p><h1>Production command center</h1></div>
      <form method="get"><select name="status" onchange="this.form.submit()"><option value="">All statuses</option>${STATUSES.map(([key, label]) => `<option value="${key}" ${key === status ? 'selected' : ''}>${label}</option>`).join('')}</select></form>
    </section>
    <section class="stats-strip">
      ${statCard('Pipeline value', money(totalValue), 'current booked value')}
      ${statCard('Active jobs', activeCount, `${allOrders.length} total orders`)}
      ${statCard('Due within 7 days', dueSoon, 'needs supervision')}
      ${statCard('Fabric alerts', fabrics.filter(f => f.meters_available <= f.reorder_level).length, 'below reorder level')}
    </section>
    ${status ? `<section class="grid cards">${orders.map(order => orderCard(order).replace('Open production packet', `${order.shop_name} · Open`)).join('')}</section>` : `<section class="kanban-board">${board}</section>`}
    <section class="panel wide">
      <h2>Fabric inventory</h2>
      <div class="table">
        ${fabrics.map(f => `<div class="${f.meters_available <= f.reorder_level ? 'warn' : ''}"><strong>${f.fabric_name}</strong><span>${f.color}</span><span>${f.meters_available}m</span><span>reorder ${f.reorder_level}m</span></div>`).join('')}
      </div>
    </section>
  `));
});

app.post('/admin/orders/:id/status', requireAdmin, (req, res) => {
  db.prepare('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.body.status, req.params.id);
  db.prepare('INSERT INTO order_timeline (order_id, status, note) VALUES (?, ?, ?)').run(req.params.id, req.body.status, req.body.note || 'Status updated by admin');
  res.redirect(`/orders/${req.params.id}`);
});

app.post('/admin/orders/:id/note', requireAdmin, (req, res) => {
  db.prepare('INSERT INTO internal_notes (order_id, note) VALUES (?, ?)').run(req.params.id, req.body.note);
  res.redirect(`/orders/${req.params.id}`);
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, app: 'rcompany-app', time: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`R Company app running on http://localhost:${PORT}`);
});
