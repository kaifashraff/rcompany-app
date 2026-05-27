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
const WORKSHOP_IMAGE = 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=1200&q=80';

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

function ensureInvestorDemoData() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM orders').get().count;
  if (count >= 14) return;

  const demoHash = bcrypt.hashSync('Demo@123', 10);
  const insertUser = db.prepare('INSERT OR IGNORE INTO users (email, password_hash, role, shop_name, contact_number) VALUES (?, ?, ?, ?, ?)');
  insertUser.run('noor@bridalstudio.in', demoHash, 'shopkeeper', 'Noor Bridal Studio', '+91 98111 22110');
  insertUser.run('mehta@couture.in', demoHash, 'shopkeeper', 'Mehta Couture House', '+91 98222 44220');
  insertUser.run('royal@menswear.in', demoHash, 'shopkeeper', 'Royal Menswear', '+91 98333 66330');

  const shop = (email) => db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
  const rows = [
    ['RC-20260527-006', shop('noor@bridalstudio.in'), 'Sana Mirza', 'Bridal Lehenga', 'Banarasi Silk', 'Wine', 'Dense hand zardozi with kundan neckline and scallop border', 'Bust 34, Waist 28, Skirt length 44', '2026-06-03', 'urgent', 68000, 25000, 'quality_check', 'Investor demo job: premium bridal order with approval checkpoint'],
    ['RC-20260527-007', shop('mehta@couture.in'), 'Kavya Rao', 'Reception Gown', 'Organza', 'Pearl', 'Tone-on-tone threadwork with sequin trail', 'Bust 35, Waist 29, Length 58', '2026-06-11', 'high', 52000, 20000, 'embroidery', 'Send progress photos before stitching'],
    ['RC-20260527-008', shop('royal@menswear.in'), 'Zeeshan Ali', 'Indo-Western Set', 'Raw Silk', 'Midnight Blue', 'Metallic collar motif and asymmetric panel embroidery', 'Chest 41, Shoulder 18.5, Length 42', '2026-06-06', 'high', 34000, 12000, 'stitching', 'Needs trial slot before final dispatch'],
    ['RC-20260527-009', shop('noor@bridalstudio.in'), 'Ritika Bansal', 'Sangeet Cape', 'Net', 'Rose Gold', 'Crystal spray with embroidered shoulder structure', 'Cape 52, Sleeve 23', '2026-06-14', 'normal', 26000, 8000, 'fabric_procurement', 'Check net shade before work starts'],
    ['RC-20260527-010', shop('mehta@couture.in'), 'Nazia Khan', 'Bridal Dupatta', 'Tulle', 'Ivory', 'Four-side border, naam embroidery, small bootis', '2.8m x 1.15m', '2026-06-02', 'urgent', 24000, 10000, 'ready', 'Ready but balance pending before dispatch'],
    ['RC-20260527-011', shop('royal@menswear.in'), 'Arjun Sethi', 'Sherwani', 'Brocade', 'Antique Gold', 'Hand-done buttons, cuff, and pocket detail', 'Chest 40, Shoulder 18, Length 43', '2026-06-18', 'normal', 30000, 10000, 'pending', 'Awaiting final measurement confirmation'],
    ['RC-20260527-012', shop('noor@bridalstudio.in'), 'Misha Kapoor', 'Mehendi Set', 'Chanderi', 'Lime', 'Mirror-work border and gota highlights', 'Bust 33, Waist 27, Length 40', '2026-06-09', 'high', 21000, 7000, 'dispatched', 'Courier tracking shared with shopkeeper'],
    ['RC-20260527-013', shop('mehta@couture.in'), 'Anaya Jain', 'Cocktail Saree', 'Crepe', 'Black', 'Minimal crystal linework on pallu', '6.3m saree, blouse 1m', '2026-06-21', 'normal', 19000, 6000, 'pending', 'Low complexity, can batch with black thread jobs'],
    ['RC-20260527-014', shop('royal@menswear.in'), 'Kabir Malhotra', 'Kurta Jacket', 'Linen Silk', 'Sage', 'Fine resham vines on jacket placket', 'Chest 42, Waist 36, Length 41', '2026-06-13', 'normal', 14500, 4500, 'embroidery', 'Karigar assigned: Rafiq']
  ];

  const insertOrder = db.prepare(`
    INSERT OR IGNORE INTO orders (order_number, user_id, customer_name, product_type, fabric_type, color, embroidery_details, measurements, deadline, priority, estimated_cost, advance_amount, status, special_instructions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    const result = insertOrder.run(...row);
    if (result.changes) {
      db.prepare('INSERT INTO order_timeline (order_id, status, note) VALUES (?, ?, ?)').run(result.lastInsertRowid, row[12], 'Investor-grade demo seed');
    }
  }

  const insertFabric = db.prepare('INSERT INTO fabric_inventory (fabric_name, color, meters_available, reorder_level) VALUES (?, ?, ?, ?)');
  const fabricCount = db.prepare('SELECT COUNT(*) AS count FROM fabric_inventory').get().count;
  if (fabricCount < 8) {
    [
      ['Banarasi Silk', 'Wine', 16, 8],
      ['Organza', 'Pearl', 24, 10],
      ['Brocade', 'Antique Gold', 6, 8],
      ['Chanderi', 'Lime', 31, 12]
    ].forEach((fabric) => insertFabric.run(...fabric));
  }
}

ensureInvestorDemoData();

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

function deadlineDays(dateValue) {
  if (!dateValue) return null;
  const today = new Date();
  const deadline = new Date(`${dateValue}T00:00:00`);
  return Math.ceil((deadline - today) / 86400000);
}

function daysUntil(dateValue) {
  const diff = deadlineDays(dateValue);
  if (diff === null) return 'No deadline';
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
    <a href="/investor">Investor Demo</a>
    <a href="/dashboard">Dashboard</a>
    ${user.role === 'admin' ? '<a href="/admin/orders">Admin</a>' : '<a href="/orders/new">New Order</a>'}
    <a href="/logout">Logout</a>
  ` : '<a href="/investor">Investor Demo</a><a href="/login">Login</a>';
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

function getAllOrders() {
  return db.prepare('SELECT o.*, u.shop_name FROM orders o JOIN users u ON u.id = o.user_id ORDER BY o.updated_at DESC').all();
}

function businessSnapshot() {
  const orders = getAllOrders();
  const buyers = new Set(orders.map((order) => order.shop_name)).size;
  const totalValue = orders.reduce((sum, order) => sum + Number(order.estimated_cost || 0), 0);
  const advance = orders.reduce((sum, order) => sum + Number(order.advance_amount || 0), 0);
  const outstanding = Math.max(0, totalValue - advance);
  const active = orders.filter((order) => order.status !== 'delivered').length;
  const risk = orders.filter((order) => {
    const days = deadlineDays(order.deadline);
    return ['urgent', 'high'].includes(order.priority) || (days !== null && days <= 7);
  }).length;
  const overdue = orders.filter((order) => {
    const days = deadlineDays(order.deadline);
    return days !== null && days < 0 && order.status !== 'delivered';
  }).length;
  const dueThisWeek = orders.filter((order) => {
    const days = deadlineDays(order.deadline);
    return days !== null && days >= 0 && days <= 7 && order.status !== 'delivered';
  }).length;
  return {
    orders,
    buyers,
    totalValue,
    advance,
    outstanding,
    active,
    risk,
    overdue,
    dueThisWeek,
    avgTicket: orders.length ? Math.round(totalValue / orders.length) : 0,
    conversionLift: 38,
    whatsappReduction: 64,
    onTime: 91,
    repeatIntent: 72,
    grossMargin: 31
  };
}

function riskClass(order) {
  const days = deadlineDays(order.deadline);
  if (days !== null && days < 0) return 'danger';
  if (order.priority === 'urgent' || (days !== null && days <= 3)) return 'hot';
  if (order.priority === 'high' || (days !== null && days <= 7)) return 'watch';
  return 'clear';
}

function riskText(order) {
  const days = deadlineDays(order.deadline);
  if (days !== null && days < 0) return `${Math.abs(days)}d late`;
  if (days === 0) return 'due today';
  if (order.priority === 'urgent') return 'urgent job';
  if (days !== null && days <= 7) return `${days}d left`;
  return 'on track';
}

function workflowRail(activeStatus) {
  return `<div class="workflow-rail">${STATUSES.map(([key, label], index) => `
    <span class="${STATUSES.findIndex(([status]) => status === activeStatus) >= index ? 'done' : ''}">
      <b>${index + 1}</b>${label}
    </span>
  `).join('')}</div>`;
}

function compactOrderRow(order) {
  return `<a class="ops-row ${riskClass(order)}" href="/orders/${order.id}">
    <span>
      <strong>${order.customer_name}</strong>
      <small>${order.shop_name} · ${order.product_type}</small>
    </span>
    <b>${statusLabel(order.status)}</b>
    <em>${riskText(order)}</em>
    <i>${money(order.estimated_cost)}</i>
  </a>`;
}

function moduleCard(title, copy, tags) {
  return `<article class="module-card">
    <h3>${title}</h3>
    <p>${copy}</p>
    <div>${tags.map(tag => `<span>${tag}</span>`).join('')}</div>
  </article>`;
}

function investorPage(req) {
  const snapshot = businessSnapshot();
  const topOrders = snapshot.orders
    .slice()
    .sort((a, b) => Number(b.estimated_cost || 0) - Number(a.estimated_cost || 0))
    .slice(0, 4);
  const heroOrder = topOrders[0] || snapshot.orders[0];
  const riskQueue = snapshot.orders
    .slice()
    .sort((a, b) => {
      const aDays = deadlineDays(a.deadline) ?? 999;
      const bDays = deadlineDays(b.deadline) ?? 999;
      return aDays - bDays;
    })
    .slice(0, 5);
  const lowStock = db.prepare('SELECT * FROM fabric_inventory ORDER BY meters_available ASC LIMIT 4').all();
  const stagePreview = STATUSES.map(([key, label]) => {
    const count = snapshot.orders.filter((order) => order.status === key).length;
    return `<div><strong>${count}</strong><span>${label}</span></div>`;
  }).join('');

  return layout(req, 'Investor demo', `
    <section class="command-hero" style="--hero-image:url('${WORKSHOP_IMAGE}')">
      <aside class="investor-sidebar">
        <p class="eyebrow">R Company Investor Room</p>
        <h1>Premium fashion production, controlled like a real operating system.</h1>
        <p>Built for boutiques and embroidery workshops where every missed measurement, fabric delay, unpaid balance, and WhatsApp follow-up costs money.</p>
        <div class="actions">
          <a class="button" href="/demo/admin">Enter admin demo</a>
          <a class="button secondary" href="/demo/shopkeeper">Shopkeeper view</a>
        </div>
        <div class="proof-stack">
          <span><b>${snapshot.orders.length}</b> live demo orders</span>
          <span><b>${money(snapshot.totalValue)}</b> booked pipeline</span>
          <span><b>${snapshot.buyers}</b> B2B shopkeeper accounts</span>
        </div>
      </aside>

      <section class="live-console">
        <div class="console-top">
          <span>Live product surface</span>
          <b>Investor demo mode</b>
        </div>
        <div class="console-grid">
          <article class="active-packet">
            <p class="eyebrow">Production packet</p>
            <h2>${heroOrder.customer_name}</h2>
            <p>${heroOrder.product_type} for ${heroOrder.shop_name}. ${heroOrder.fabric_type} / ${heroOrder.color}. ${heroOrder.embroidery_details}</p>
            <div class="packet-facts">
              <div><span>Order value</span><strong>${money(heroOrder.estimated_cost)}</strong></div>
              <div><span>Advance</span><strong>${money(heroOrder.advance_amount)}</strong></div>
              <div><span>Deadline</span><strong>${daysUntil(heroOrder.deadline)}</strong></div>
              <div><span>Risk</span><strong>${riskText(heroOrder)}</strong></div>
            </div>
            ${workflowRail(heroOrder.status)}
            <a class="button ghost full-button" href="/demo/order/${heroOrder.id}">Open this order packet</a>
          </article>
          <aside class="triage-panel">
            <h2>Owner triage</h2>
            ${riskQueue.map(compactOrderRow).join('')}
          </aside>
        </div>
      </section>
    </section>

    <section class="metric-wall">
      ${statCard('Booked pipeline', money(snapshot.totalValue), `${snapshot.orders.length} active and historical jobs`)}
      ${statCard('Advance collected', money(snapshot.advance), `${money(snapshot.outstanding)} balance visible`)}
      ${statCard('Due this week', snapshot.dueThisWeek, `${snapshot.risk} jobs need owner attention`)}
      ${statCard('Gross margin target', `${snapshot.grossMargin}%`, 'premium custom production model')}
    </section>

    <section class="section-head">
      <p class="eyebrow">Built from actual market pattern</p>
      <h2>The app proves the workflow, not just the brand.</h2>
    </section>
    <section class="module-grid">
      ${moduleCard('Shopkeeper order desk', 'A boutique can create a rich order packet with garment, fabric, measurement, deadline, priority, and instructions instead of sending scattered WhatsApp messages.', ['intake', 'measurements', 'repeat orders'])}
      ${moduleCard('Production command center', 'The owner sees every order by production stage, risk level, due date, value, and next action before it becomes a late delivery.', ['kanban', 'deadlines', 'handoffs'])}
      ${moduleCard('Payment and delivery control', 'Advance, balance, delivery readiness, dispatch status, and internal notes stay tied to the order instead of living in memory.', ['advance', 'balance', 'dispatch'])}
      ${moduleCard('Inventory watchlist', 'Fabric stock and reorder alerts show the operational wedge investors expect from a real workshop system.', ['fabric', 'reorder', 'risk'])}
    </section>

    <section class="ops-demo">
      <article class="panel stage-panel">
        <h2>Stage distribution</h2>
        <div class="stage-preview">${stagePreview}</div>
      </article>
      <article class="panel">
        <h2>Fabric risk</h2>
        <div class="fabric-watch">${lowStock.map(f => `<div class="${f.meters_available <= f.reorder_level ? 'warn' : ''}"><strong>${f.fabric_name}</strong><span>${f.color}</span><b>${f.meters_available}m</b><small>reorder at ${f.reorder_level}m</small></div>`).join('')}</div>
      </article>
      <article class="panel thesis-panel">
        <h2>Investor thesis</h2>
        <ul>
          <li>Tailoring software references converge on the same pain: measurements, promised dates, production tracking, payments, and customer status calls.</li>
          <li>R Company can start as its own workshop OS, then expand into a B2B portal for boutiques that already bring repeat premium orders.</li>
          <li>The data moat is operational: measurement history, fabric demand, karigar capacity, payment discipline, and delivery reliability.</li>
        </ul>
      </article>
    </section>

    <section class="section-head">
      <p class="eyebrow">Investor demo orders</p>
      <h2>High-value jobs with operational detail.</h2>
    </section>
    <section class="grid cards featured">${topOrders.map(orderCard).join('')}</section>
  `);
}

app.get('/', (req, res) => res.send(investorPage(req)));
app.get('/investor', (req, res) => res.send(investorPage(req)));

app.get('/demo/:role', (req, res) => {
  const email = req.params.role === 'shopkeeper' ? 'arif@textiles.com' : 'admin@rcompany.com';
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.redirect('/login');
  req.session.user = { id: user.id, email: user.email, role: user.role, shop_name: user.shop_name };
  res.redirect(user.role === 'admin' ? '/admin/orders' : '/dashboard');
});

app.get('/demo/order/:id', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get('admin@rcompany.com');
  if (!user) return res.redirect('/login');
  req.session.user = { id: user.id, email: user.email, role: user.role, shop_name: user.shop_name };
  res.redirect(`/orders/${req.params.id}`);
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
  const nextOrder = orders
    .slice()
    .sort((a, b) => (deadlineDays(a.deadline) ?? 999) - (deadlineDays(b.deadline) ?? 999))[0];
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
    ${nextOrder ? `<section class="buyer-status panel wide">
      <div>
        <p class="eyebrow">Client-ready status</p>
        <h2>${nextOrder.customer_name} · ${nextOrder.product_type}</h2>
        <p>${statusLabel(nextOrder.status)}. ${daysUntil(nextOrder.deadline)}. Advance ${money(nextOrder.advance_amount)} against ${money(nextOrder.estimated_cost)} estimate.</p>
      </div>
      ${workflowRail(nextOrder.status)}
      <a class="button ghost" href="/orders/${nextOrder.id}">Open status page</a>
    </section>` : ''}
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
  const outstanding = allOrders.reduce((sum, order) => sum + Math.max(0, Number(order.estimated_cost || 0) - Number(order.advance_amount || 0)), 0);
  const activeCount = allOrders.filter(order => order.status !== 'delivered').length;
  const dueSoon = allOrders.filter(order => order.deadline && new Date(`${order.deadline}T00:00:00`) - new Date() < 7 * 86400000).length;
  const urgentOrders = allOrders
    .filter(order => riskClass(order) !== 'clear')
    .sort((a, b) => (deadlineDays(a.deadline) ?? 999) - (deadlineDays(b.deadline) ?? 999))
    .slice(0, 4);
  const readyOrders = allOrders.filter(order => ['ready', 'dispatched'].includes(order.status)).slice(0, 4);
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
    <section class="ops-grid admin-grid">
      <article class="panel">
        <h2>Today owner must decide</h2>
        <div class="ops-list">${urgentOrders.map(compactOrderRow).join('') || '<p class="muted">No urgent jobs right now.</p>'}</div>
      </article>
      <article class="panel">
        <h2>Cash and dispatch lock</h2>
        <div class="cash-lock">
          <strong>${money(outstanding)}</strong>
          <span>open balance before all current jobs are closed</span>
        </div>
        <div class="ops-list">${readyOrders.map(compactOrderRow).join('') || '<p class="muted">No ready/dispatch jobs.</p>'}</div>
      </article>
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
