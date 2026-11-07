// Dolce - servidor de pedidos (Express + SQLite)
const express = require("express");
const Database = require("better-sqlite3");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 6) {
  console.error("Falta ADMIN_PASSWORD (mínimo 6 caracteres). Ejemplo: ADMIN_PASSWORD=miclave npm start");
  process.exit(1);
}
const SECRET = process.env.SESSION_SECRET || crypto.createHash("sha256").update("dolce:" + ADMIN_PASSWORD).digest("hex");

fs.mkdirSync(path.join(DATA_DIR, "uploads"), { recursive: true });
const db = new Database(path.join(DATA_DIR, "dolce.db"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  sizes TEXT NOT NULL,            -- JSON [{label, price}]
  groups TEXT NOT NULL DEFAULT '[]', -- JSON [{name, choices:[...]}]
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  whatsapp TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  items TEXT NOT NULL,            -- JSON
  total INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendiente', -- pendiente | confirmado | entregado
  paid INTEGER NOT NULL DEFAULT 0,
  delivery_date TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
`);

// Menú inicial (solo se carga si la tabla está vacía). Después se edita desde el panel.
if (db.prepare("SELECT COUNT(*) c FROM products").get().c === 0) {
  const SALSAS = ["Chocolate", "Chocolate derretido", "Fresa", "Arequipe", "Nutella"];
  const TOPPINGS = ["Brownie", "Barquillo", "Oreo", "Minichips", "Chispas de colores"];
  const two = [{ label: "9 oz", price: 12000 }, { label: "12 oz", price: 15000 }];
  const seed = [
    ["Fresas con crema", "Fresas y crema en capas, con tu salsa y tu topping.", "/img/fresas.jpg", two,
      [{ name: "Salsa", choices: SALSAS }, { name: "Topping", choices: TOPPINGS }]],
    ["Torta de chocolate", "Torta, crema de chocolate y brownie.", "/img/chocolate.jpg", two, []],
    ["Torta tres leches", "Torta, crema tres leches, arequipe y crema de frutos rojos.", "/img/tresleches.jpg", two, []],
    ["Napoleón", "Salsa de frutos rojos, Oreo, arequipe y chocolate.", "/img/napoleon.jpg", [{ label: "8 oz", price: 7000 }], []],
  ];
  const ins = db.prepare("INSERT INTO products (name,description,image,sizes,groups,sort) VALUES (?,?,?,?,?,?)");
  seed.forEach((s, i) => ins.run(s[0], s[1], s[2], JSON.stringify(s[3]), JSON.stringify(s[4]), i));
}

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(express.json({ limit: "50kb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});

/* ---------- utilidades ---------- */
const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
const rowToProduct = (r) => ({
  id: r.id, name: r.name, description: r.description, image: r.image,
  sizes: JSON.parse(r.sizes), groups: JSON.parse(r.groups), active: !!r.active, sort: r.sort,
});
const rowToOrder = (r) => ({
  id: r.id, code: r.code, name: r.name, location: r.location, whatsapp: r.whatsapp, notes: r.notes,
  items: JSON.parse(r.items), total: r.total, status: r.status, paid: !!r.paid,
  deliveryDate: r.delivery_date, createdAt: r.created_at,
});
const hits = new Map(); // límite simple por IP
function limit(max, windowMs) {
  return (req, res, next) => {
    const k = req.path + "|" + req.ip, now = Date.now();
    const arr = (hits.get(k) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) return res.status(429).json({ error: "Demasiados intentos. Espera un momento." });
    arr.push(now); hits.set(k, arr); next();
  };
}
setInterval(() => hits.clear(), 60 * 60 * 1000).unref();

/* ---------- sesión de administradora (cookie firmada) ---------- */
const sign = (s) => crypto.createHmac("sha256", SECRET).update(s).digest("base64url");
function makeToken() { const exp = String(Date.now() + 30 * 24 * 3600 * 1000); return exp + "." + sign(exp); }
function validToken(t) {
  if (!t) return false;
  const [exp, sig] = t.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const a = Buffer.from(sig), b = Buffer.from(sign(exp));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function getCookie(req, name) {
  const m = (req.headers.cookie || "").split(";").map((c) => c.trim()).find((c) => c.startsWith(name + "="));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : "";
}
function requireAdmin(req, res, next) {
  if (validToken(getCookie(req, "dolce_admin"))) return next();
  res.status(401).json({ error: "No autorizada" });
}

app.post("/api/admin/login", limit(8, 15 * 60 * 1000), (req, res) => {
  const given = Buffer.from(String(req.body?.password ?? ""));
  const real = Buffer.from(ADMIN_PASSWORD);
  const ok = given.length === real.length && crypto.timingSafeEqual(given, real);
  if (!ok) return res.status(401).json({ error: "Contraseña incorrecta" });
  const secure = req.secure ? "; Secure" : "";
  res.setHeader("Set-Cookie", `dolce_admin=${encodeURIComponent(makeToken())}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${30 * 24 * 3600}${secure}`);
  res.json({ ok: true });
});
app.post("/api/admin/logout", (req, res) => {
  res.setHeader("Set-Cookie", "dolce_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
  res.json({ ok: true });
});
app.get("/api/admin/me", requireAdmin, (req, res) => res.json({ ok: true }));

/* ---------- público: menú y pedidos ---------- */
app.get("/api/products", (req, res) => {
  const rows = db.prepare("SELECT * FROM products WHERE active=1 ORDER BY sort, id").all();
  res.json(rows.map(rowToProduct));
});

function newCode() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let i = 0; i < 20; i++) {
    let c = "D-";
    for (let k = 0; k < 4; k++) c += abc[crypto.randomInt(abc.length)];
    if (!db.prepare("SELECT 1 FROM orders WHERE code=?").get(c)) return c;
  }
  throw new Error("no code");
}

app.post("/api/orders", limit(10, 60 * 60 * 1000), (req, res) => {
  const b = req.body || {};
  const name = clean(b.name, 80), location = clean(b.location, 200);
  const whatsapp = clean(b.whatsapp, 25), notes = clean(b.notes, 400);
  if (!name || !location) return res.status(400).json({ error: "Escribe tu nombre y dónde te lo entregamos." });
  if (whatsapp && !/^[\d\s+()-]{7,25}$/.test(whatsapp)) return res.status(400).json({ error: "El WhatsApp solo debe tener números." });
  if (!Array.isArray(b.items) || !b.items.length || b.items.length > 30) return res.status(400).json({ error: "Tu pedido está vacío." });

  const items = []; let total = 0;
  for (const it of b.items) {
    const row = db.prepare("SELECT * FROM products WHERE id=? AND active=1").get(Number(it.productId));
    if (!row) return res.status(400).json({ error: "Uno de los postres ya no está disponible. Recarga la página." });
    const p = rowToProduct(row);
    const size = p.sizes[Number(it.sizeIndex)];
    const qty = Number(it.qty);
    if (!size || !Number.isInteger(qty) || qty < 1 || qty > 20) return res.status(400).json({ error: "Revisa el tamaño y la cantidad." });
    const opts = [];
    for (const g of p.groups) {
      const v = it.opts?.[g.name];
      if (!g.choices.includes(v)) return res.status(400).json({ error: `Elige ${g.name.toLowerCase()} para ${p.name}.` });
      opts.push({ k: g.name, v });
    }
    // el precio SIEMPRE sale del servidor, nunca del navegador
    items.push({ name: p.name, size: size.label, price: size.price, qty, opts });
    total += size.price * qty;
  }
  const code = newCode();
  db.prepare("INSERT INTO orders (code,name,location,whatsapp,notes,items,total,created_at) VALUES (?,?,?,?,?,?,?,?)")
    .run(code, name, location, whatsapp, notes, JSON.stringify(items), total, Date.now());
  res.status(201).json({ code, name, location, notes, items, total });
});

/* ---------- panel: pedidos ---------- */
app.get("/api/admin/orders", requireAdmin, (req, res) => {
  const rows = db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 500").all();
  res.json(rows.map(rowToOrder));
});
app.patch("/api/admin/orders/:id", requireAdmin, (req, res) => {
  const o = db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);
  if (!o) return res.status(404).json({ error: "No existe" });
  const b = req.body || {};
  let status = o.status, paid = o.paid, date = o.delivery_date;
  if (b.deliveryDate !== undefined) {
    date = clean(b.deliveryDate, 10);
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "Fecha inválida" });
    if (date && status === "pendiente") status = "confirmado";
  }
  if (b.status !== undefined) {
    if (!["pendiente", "confirmado", "entregado"].includes(b.status)) return res.status(400).json({ error: "Estado inválido" });
    status = b.status;
  }
  if (b.paid !== undefined) paid = b.paid ? 1 : 0;
  db.prepare("UPDATE orders SET status=?, paid=?, delivery_date=? WHERE id=?").run(status, paid, date, o.id);
  res.json(rowToOrder(db.prepare("SELECT * FROM orders WHERE id=?").get(o.id)));
});
app.delete("/api/admin/orders/:id", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM orders WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

/* ---------- panel: productos ---------- */
function readProduct(b) {
  const name = clean(b.name, 80);
  if (!name) throw new Error("El producto necesita un nombre.");
  const sizes = (Array.isArray(b.sizes) ? b.sizes : []).map((s) => ({ label: clean(s.label, 30), price: Math.round(Number(s.price)) }))
    .filter((s) => s.label && Number.isFinite(s.price) && s.price > 0);
  if (!sizes.length) throw new Error("Agrega al menos un tamaño con precio.");
  const groups = (Array.isArray(b.groups) ? b.groups : []).map((g) => ({
    name: clean(g.name, 40), choices: (Array.isArray(g.choices) ? g.choices : []).map((c) => clean(c, 50)).filter(Boolean),
  })).filter((g) => g.name && g.choices.length);
  return { name, description: clean(b.description, 300), image: clean(b.image, 200), sizes, groups, active: b.active ? 1 : 0 };
}
app.get("/api/admin/products", requireAdmin, (req, res) => {
  res.json(db.prepare("SELECT * FROM products ORDER BY sort, id").all().map(rowToProduct));
});
app.post("/api/admin/products", requireAdmin, (req, res) => {
  try {
    const p = readProduct(req.body || {});
    const sort = db.prepare("SELECT COALESCE(MAX(sort),0)+1 n FROM products").get().n;
    const r = db.prepare("INSERT INTO products (name,description,image,sizes,groups,active,sort) VALUES (?,?,?,?,?,?,?)")
      .run(p.name, p.description, p.image, JSON.stringify(p.sizes), JSON.stringify(p.groups), p.active, sort);
    res.status(201).json({ id: r.lastInsertRowid });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.put("/api/admin/products/:id", requireAdmin, (req, res) => {
  try {
    const p = readProduct(req.body || {});
    const r = db.prepare("UPDATE products SET name=?,description=?,image=?,sizes=?,groups=?,active=? WHERE id=?")
      .run(p.name, p.description, p.image, JSON.stringify(p.sizes), JSON.stringify(p.groups), p.active, req.params.id);
    if (!r.changes) return res.status(404).json({ error: "No existe" });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete("/api/admin/products/:id", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM products WHERE id=?").run(req.params.id); // los pedidos viejos guardan su propia copia
  res.json({ ok: true });
});

// Subir foto de un producto (JPG, PNG o WebP, máx. 4 MB)
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
app.post("/api/admin/upload", requireAdmin, express.raw({ type: Object.keys(EXT), limit: "4mb" }), (req, res) => {
  const ext = EXT[req.headers["content-type"]?.split(";")[0]];
  if (!ext || !Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: "Sube una imagen JPG, PNG o WebP de hasta 4 MB." });
  const file = crypto.randomBytes(8).toString("hex") + "." + ext;
  fs.writeFileSync(path.join(DATA_DIR, "uploads", file), req.body);
  res.json({ url: "/uploads/" + file });
});

/* ---------- archivos estáticos ---------- */
app.use("/uploads", express.static(path.join(DATA_DIR, "uploads"), { maxAge: "7d" }));
app.use(express.static(path.join(__dirname, "public")));
app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
app.use("/api", (req, res) => res.status(404).json({ error: "No existe" }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.status === 413 ? "Archivo muy grande" : "Error del servidor" });
});

app.listen(PORT, () => console.log(`Dolce listo en http://localhost:${PORT}  (panel: /admin)`));
