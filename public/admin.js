/* Dolce - panel de la dueña: pedidos y productos */
const $app = document.getElementById("app");
const money = (n) => "$" + n.toLocaleString("es-CO");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const itemText = (i) => `${i.qty} × ${i.name} ${i.size}` + (i.opts.length ? ` (${i.opts.map((o) => o.k + ": " + o.v).join(", ")})` : "");
const fmtDate = (d) => (d ? new Date(d + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" }) : "");
const waNum = (n) => { const d = String(n || "").replace(/\D/g, ""); return d.length === 10 ? "57" + d : d; };
const waLink = (num, text) => `https://wa.me/${num}?text=${encodeURIComponent(text)}`;

let tab = "pedidos", orders = [], products = [], editing = null, msg = "", knownMax = null, audioCtx = null, timer = null;

async function api(url, opts = {}) {
  const r = await fetch(url, { credentials: "same-origin", ...opts, headers: { ...(opts.json ? { "Content-Type": "application/json" } : {}), ...opts.headers }, body: opts.json ? JSON.stringify(opts.json) : opts.body });
  if (r.status === 401 && !url.includes("login")) { showLogin(); throw new Error("auth"); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Error");
  return data;
}

function showLogin(err = "") {
  clearInterval(timer);
  $app.innerHTML = `<header><img src="/img/logo.png" alt="Dolce"><h1 style="font-size:2rem">Panel de pedidos</h1></header>
  <form class="panel" id="login"><label class="f" for="pw" style="margin-top:0">Contraseña</label>
  <input type="password" id="pw" autocomplete="current-password" required autofocus>
  ${err ? `<div class="err" role="alert">${esc(err)}</div>` : ""}
  <div style="margin-top:16px"><button class="btn full" type="submit">Entrar</button></div></form>`;
  document.getElementById("login").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api("/api/admin/login", { method: "POST", json: { password: document.getElementById("pw").value } });
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
      start();
    } catch (er) { showLogin(er.message); }
  };
}

function beep() {
  try {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination); o.frequency.value = 880; g.gain.value = 0.15;
    o.start(); o.stop(audioCtx.currentTime + 0.25);
  } catch {}
}

async function loadOrders(first) {
  orders = await api("/api/admin/orders");
  const max = orders.reduce((m, o) => Math.max(m, o.id), 0);
  if (knownMax !== null && max > knownMax) beep();
  knownMax = max;
  const pend = orders.filter((o) => o.status === "pendiente").length;
  document.title = (pend ? `(${pend}) ` : "") + "Panel Dolce";
  if (tab === "pedidos" && !editingDate()) render();
}
const editingDate = () => document.activeElement && document.activeElement.matches("[data-date]");

async function start() {
  try { await api("/api/admin/me"); } catch { return; }
  try { await Promise.all([loadOrders(true), loadProducts()]); } catch (e) { if (e.message === "auth") return; }
  render();
  clearInterval(timer);
  timer = setInterval(() => loadOrders().catch(() => {}), 20000);
}
async function loadProducts() { products = await api("/api/admin/products"); }

function render() {
  const pend = orders.filter((o) => o.status === "pendiente").length;
  $app.innerHTML = `<header><img src="/img/logo.png" alt="Dolce" style="width:90px"><h1 style="font-size:1.8rem">Panel de Dolce</h1></header>
  <div class="tabs" role="tablist"><button role="tab" aria-selected="${tab === "pedidos"}" data-tab="pedidos">Pedidos${pend ? `<span class="badge">${pend}</span>` : ""}</button>
  <button role="tab" aria-selected="${tab === "productos"}" data-tab="productos">Productos</button>
  <button id="logout" style="background:none">Salir</button></div>
  ${msg ? `<div class="err" role="alert" style="text-align:center">${esc(msg)}</div>` : ""}
  ${tab === "pedidos" ? ordersHTML() : editing ? productForm() : productsHTML()}`;
  bind();
}

function ordersHTML() {
  const rank = { pendiente: 0, confirmado: 1, entregado: 2 };
  const list = [...orders].sort((a, b) => rank[a.status] - rank[b.status] || b.createdAt - a.createdAt);
  if (!list.length) return `<div class="panel empty">Todavía no hay pedidos. Cuando alguien envíe uno, aparece aquí y suena un aviso (con esta página abierta).</div>`;
  return list.map((o) => `<div class="order" data-o="${o.id}"><div class="row"><b>${esc(o.name)} · ${esc(o.code)}</b>
  <span class="chips"><span class="chip ${o.status === "pendiente" ? "warn" : "ok"}">${o.status}</span><span class="chip ${o.paid ? "ok" : "warn"}">${o.paid ? "pagado" : "sin pagar"}</span></span></div>
  <div style="color:var(--muted);font-size:.9rem">📍 ${esc(o.location)}${o.whatsapp ? " · WhatsApp " + esc(o.whatsapp) : ""}<br>${new Date(o.createdAt).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}</div>
  <div style="margin:8px 0">${o.items.map((i) => `<div>• ${esc(itemText(i))}</div>`).join("")}</div>
  ${o.notes ? `<div class="note" style="margin:6px 0">${esc(o.notes)}</div>` : ""}
  <div class="row"><b class="price">${money(o.total)}</b>${o.deliveryDate ? `<span>Entrega: <b>${esc(fmtDate(o.deliveryDate))}</b></span>` : ""}</div>
  <div class="act"><label style="font-size:.85rem;font-weight:700">Fecha de entrega<br><input type="date" data-date value="${esc(o.deliveryDate)}"></label>
  <button class="btn sm" data-act="confirm">${o.deliveryDate ? "Cambiar fecha" : "Confirmar fecha"}</button>
  <button class="btn sm ghost" data-act="paid">${o.paid ? "Marcar sin pagar" : "Marcar pagado"}</button>
  ${o.status === "confirmado" ? `<button class="btn sm ghost" data-act="delivered">Entregado</button>` : ""}
  ${o.whatsapp && o.deliveryDate ? `<a class="btn sm ghost" target="_blank" rel="noopener" href="${waLink(waNum(o.whatsapp), `Hola ${o.name}, tu pedido de Dolce (${o.code}) te lo entrego el ${fmtDate(o.deliveryDate)} en ${o.location}. Total: ${money(o.total)}.`)}">Avisar por WhatsApp</a>` : ""}
  <button class="rm" data-act="del">Eliminar</button></div></div>`).join("");
}

function productsHTML() {
  return `<div style="text-align:center;margin-bottom:14px"><button class="btn" id="newp">+ Nuevo producto</button></div>` +
    products.map((p) => `<div class="prow" data-pid="${p.id}"><img src="${esc(p.image)}" alt=""><div class="t"><b>${esc(p.name)}</b> ${p.active ? "" : '<span class="chip warn">oculto</span>'}<br><small style="color:var(--muted)">${p.sizes.map((s) => esc(s.label) + " " + money(s.price)).join(" · ")}${p.groups.length ? " · " + p.groups.map((g) => esc(g.name)).join(" + ") : ""}</small></div>
    <button class="btn sm ghost" data-edit="${p.id}">Editar</button></div>`).join("");
}
function productForm() {
  const p = editing;
  return `<form class="panel" id="pform"><h2 style="margin-top:0">${p.id ? "Editar producto" : "Nuevo producto"}</h2>
  <label class="f" for="p-name">Nombre</label><input type="text" id="p-name" required maxlength="80" value="${esc(p.name)}">
  <label class="f" for="p-desc">Descripción corta</label><input type="text" id="p-desc" maxlength="300" value="${esc(p.description)}">
  <label class="f" for="p-img">Foto</label>${p.image ? `<img src="${esc(p.image)}" alt="" style="width:96px;height:96px;object-fit:cover;border-radius:12px;display:block;margin-top:6px">` : ""}
  <input type="file" id="p-img" accept="image/jpeg,image/png,image/webp">
  <label class="f" for="p-sizes">Tamaños y precios <small>(uno por línea: tamaño | precio)</small></label>
  <textarea id="p-sizes" placeholder="9 oz | 12000&#10;12 oz | 15000">${esc(p.sizes.map((s) => s.label + " | " + s.price).join("\n"))}</textarea>
  <label class="f" for="p-groups">Opciones a elegir <small>(opcional, una por línea: Nombre: opción, opción)</small></label>
  <textarea id="p-groups" placeholder="Salsa: Chocolate, Fresa, Arequipe&#10;Topping: Oreo, Brownie">${esc(p.groups.map((g) => g.name + ": " + g.choices.join(", ")).join("\n"))}</textarea>
  <label class="f" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="p-active" ${p.active ? "checked" : ""}> Mostrar en el menú</label>
  <div class="act" style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap"><button class="btn" type="submit">Guardar</button><button class="btn ghost" type="button" id="pcancel">Cancelar</button>
  ${p.id ? `<button class="rm" type="button" id="pdel">Eliminar producto</button>` : ""}</div></form>`;
}

function bind() {
  const g = (id) => document.getElementById(id);
  $app.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => { tab = b.dataset.tab; editing = null; msg = ""; render(); }));
  g("logout").onclick = async () => { await api("/api/admin/logout", { method: "POST" }).catch(() => {}); showLogin(); };
  $app.querySelectorAll("[data-act]").forEach((b) => (b.onclick = async () => {
    const card = b.closest("[data-o]"), id = card.dataset.o, o = orders.find((x) => x.id == id), a = b.dataset.act;
    try {
      msg = "";
      if (a === "confirm") { const d = card.querySelector("[data-date]").value; if (!d) { msg = "Elige una fecha primero."; render(); return; } await api(`/api/admin/orders/${id}`, { method: "PATCH", json: { deliveryDate: d } }); }
      if (a === "paid") await api(`/api/admin/orders/${id}`, { method: "PATCH", json: { paid: !o.paid } });
      if (a === "delivered") await api(`/api/admin/orders/${id}`, { method: "PATCH", json: { status: "entregado" } });
      if (a === "del") {
        if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = "¿Seguro? Toca otra vez"; setTimeout(() => { b.dataset.sure = ""; b.textContent = "Eliminar"; }, 4000); return; }
        await api(`/api/admin/orders/${id}`, { method: "DELETE" });
      }
      await loadOrders();
    } catch (e) { if (e.message !== "auth") { msg = e.message; render(); } }
  }));
  if (g("newp")) g("newp").onclick = () => { editing = { name: "", description: "", image: "", sizes: [], groups: [], active: true }; render(); };
  $app.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => { editing = structuredClone(products.find((p) => p.id == b.dataset.edit)); render(); }));
  if (g("pcancel")) g("pcancel").onclick = () => { editing = null; msg = ""; render(); };
  if (g("pdel")) g("pdel").onclick = async (e) => {
    if (!e.target.dataset.sure) { e.target.dataset.sure = 1; e.target.textContent = "¿Seguro? Toca otra vez"; return; }
    await api(`/api/admin/products/${editing.id}`, { method: "DELETE" }); editing = null; await loadProducts(); render();
  };
  if (g("pform")) g("pform").onsubmit = saveProduct;
}

async function saveProduct(e) {
  e.preventDefault();
  const g = (id) => document.getElementById(id);
  try {
    msg = "";
    let image = editing.image;
    const file = g("p-img").files[0];
    if (file) image = (await api("/api/admin/upload", { method: "POST", body: file, headers: { "Content-Type": file.type } })).url;
    const sizes = g("p-sizes").value.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
      const [label, price] = l.split("|").map((s) => s.trim());
      return { label, price: Number(String(price || "").replace(/[^\d]/g, "")) };
    });
    const groups = g("p-groups").value.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
      const i = l.indexOf(":");
      return { name: l.slice(0, i).trim(), choices: l.slice(i + 1).split(",").map((c) => c.trim()).filter(Boolean) };
    }).filter((x) => x.name && x.choices.length);
    const body = { name: g("p-name").value, description: g("p-desc").value, image, sizes, groups, active: g("p-active").checked };
    if (editing.id) await api(`/api/admin/products/${editing.id}`, { method: "PUT", json: body });
    else await api("/api/admin/products", { method: "POST", json: body });
    editing = null; await loadProducts(); render();
  } catch (er) { if (er.message !== "auth") { msg = er.message; render(); } }
}

start();
