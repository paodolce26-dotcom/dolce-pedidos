/* Dolce - página de pedidos (cliente). Los precios los recalcula el servidor. */
const WHATSAPP = "573017043537", WHATSAPP_SHOW = "301 704 3537", PAGO = "3017043537";
const $app = document.getElementById("app");
const money = (n) => "$" + n.toLocaleString("es-CO");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const logo = "/img/logo.png";

let products = [], loadErr = "";
let cart = [], sheet = null, done = null, sending = false, errMsg = "";
let draft = { name: "", loc: "", wa: "", notes: "" };
try { Object.assign(draft, JSON.parse(localStorage.getItem("dolce_draft") || "{}")); } catch {}
const saveDraft = () => { try { localStorage.setItem("dolce_draft", JSON.stringify({ name: draft.name, loc: draft.loc, wa: draft.wa })); } catch {} };

const itemText = (i) => `${i.qty} × ${i.name} ${i.size}` + (i.opts.length ? ` (${i.opts.map((o) => o.k + ": " + o.v).join(", ")})` : "");
const total = () => cart.reduce((s, i) => s + i.price * i.qty, 0);
const waLink = (text) => `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}`;
function orderMsg(o) {
  return `Hola Dolce, soy ${o.name}. Mi pedido (${o.code}):\n` + o.items.map((i) => "• " + itemText(i)).join("\n") +
    `\nTotal: ${money(o.total)}\nEntrega en: ${o.location}` + (o.notes ? `\nNota: ${o.notes}` : "") + `\n¿Para qué fecha me lo confirmas?`;
}

function render() {
  if (done) { $app.innerHTML = renderDone(); bind(); return; }
  const cards = products.map((p) => `<button class="card" data-p="${p.id}"><img src="${esc(p.image)}" alt="${esc(p.name)}"><span class="t"><h3>${esc(p.name)}</h3><p>${esc(p.description)}</p><span class="price">desde ${money(Math.min(...p.sizes.map((s) => s.price)))}</span></span></button>`).join("");
  $app.innerHTML = `
  <header><img src="${logo}" alt="Dolce"><h1>Menú de postres</h1><p class="slogan">Un antojo en cada capa</p></header>
  <div class="how"><div><b>1. Elige</b>postre, tamaño y sabores</div><div><b>2. Deja tus datos</b>sin crear cuenta</div><div><b>3. Te confirmo</b>la fecha de entrega</div></div>
  <h2>Elige tu postre</h2>
  ${loadErr ? `<div class="err" role="alert">${esc(loadErr)}</div>` : ""}
  <div class="grid">${cards}</div>
  <h2>Tu pedido</h2>
  <div class="panel" id="cartbox">${cartHTML()}</div>
  ${cart.length ? formHTML() : ""}
  <footer>Pedidos por WhatsApp ${WHATSAPP_SHOW} · TikTok e Instagram @paodolce26</footer>
  ${sheet ? sheetHTML() : ""}`;
  bind();
}
function cartHTML() {
  if (!cart.length) return `<div class="empty">Aún no has agregado nada. Toca un postre para empezar.</div>`;
  return cart.map((i, n) => `<div class="line"><div class="d"><b>${esc(itemText(i))}</b></div><div style="text-align:right"><span class="price">${money(i.price * i.qty)}</span><br><button class="rm" data-rm="${n}">Quitar</button></div></div>`).join("") +
    `<div class="total"><span>Total</span><span>${money(total())}</span></div>`;
}
function formHTML() {
  return `<h2>Tus datos</h2><form class="panel" id="form" autocomplete="on">
  <label class="f" for="f-name">Tu nombre</label><input type="text" id="f-name" name="name" required maxlength="80" value="${esc(draft.name)}" placeholder="Ej. Laura Pérez">
  <label class="f" for="f-loc">¿Dónde te lo entrego?</label><input type="text" id="f-loc" name="loc" required maxlength="200" value="${esc(draft.loc)}" placeholder="Ej. CDA P900, o dirección con barrio">
  <label class="f" for="f-wa">WhatsApp <small>(opcional)</small></label><input type="tel" id="f-wa" name="wa" inputmode="tel" maxlength="25" value="${esc(draft.wa)}" placeholder="300 000 0000">
  <label class="f" for="f-notes">Algo más que deba saber <small>(opcional)</small></label><textarea id="f-notes" name="notes" maxlength="400">${esc(draft.notes)}</textarea>
  <div class="note"><b>Fecha de entrega:</b> yo la confirmo según el día que voy a tu sede o zona. Si dejas tu WhatsApp, te escribo ahí.</div>
  <h3 style="font-size:1.1rem;margin-top:18px">Cómo pagar</h3>
  <p style="margin:4px 0">Nequi, Llave o transferencia al mismo número:</p>
  <div class="pay"><b>${PAGO}</b><button type="button" class="btn ghost sm" id="copy">Copiar número</button></div>
  ${errMsg ? `<div class="err" role="alert">${esc(errMsg)}</div>` : ""}
  <div style="margin-top:18px"><button class="btn full" type="submit" ${sending ? "disabled" : ""}>${sending ? "Enviando…" : "Enviar pedido · " + money(total())}</button></div></form>`;
}
function sheetHTML() {
  const p = products.find((x) => x.id === sheet.pid), s = sheet;
  const sz = p.sizes.length > 1
    ? `<fieldset><legend>Tamaño</legend><div class="opts">${p.sizes.map((z, k) => `<label class="opt"><input type="radio" name="size" value="${k}" ${s.size === k ? "checked" : ""}><span>${esc(z.label)} · ${money(z.price)}</span></label>`).join("")}</div></fieldset>`
    : `<p class="price" style="margin:8px 0 0">${esc(p.sizes[0].label)} · ${money(p.sizes[0].price)}</p>`;
  const gr = p.groups.map((g) => `<fieldset><legend>${esc(g.name)} <small>· elige 1</small></legend><div class="opts">${g.choices.map((c) => `<label class="opt"><input type="radio" name="g" data-g="${esc(g.name)}" value="${esc(c)}" ${s.opts[g.name] === c ? "checked" : ""}><span>${esc(c)}</span></label>`).join("")}</div></fieldset>`).join("");
  const missing = p.groups.filter((g) => !s.opts[g.name]);
  return `<div class="sheet-bg" id="bg"><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(p.name)}">
  <div class="sheet-head"><h2 style="margin:0">${esc(p.name)}</h2><button class="x" id="close" aria-label="Cerrar">✕</button></div>
  <p style="margin:0;color:var(--muted)">${esc(p.description)}</p>${sz}${gr}
  <div class="sheet-foot"><div class="qty"><button id="minus" aria-label="Menos">−</button><output>${s.qty}</output><button id="plus" aria-label="Más">+</button></div>
  <button class="btn" id="add" ${missing.length ? "disabled" : ""}>${missing.length ? "Elige " + missing.map((g) => g.name.toLowerCase()).join(" y ") : "Agregar · " + money(p.sizes[s.size].price * s.qty)}</button></div></div></div>`;
}
function renderDone() {
  const o = done;
  return `<div class="done"><img src="${logo}" alt="" style="width:96px"><h1 style="font-size:2rem">¡Pedido recibido!</h1>
  <p class="code">${esc(o.code)}</p>
  <p>Gracias, ${esc(o.name)}. Te confirmo la fecha de entrega según el día que pase por ${esc(o.location)}.</p>
  <div class="panel" style="text-align:left;margin:16px 0">${o.items.map((i) => `<div class="line"><div class="d">${esc(itemText(i))}</div><span class="price">${money(i.price * i.qty)}</span></div>`).join("")}<div class="total"><span>Total</span><span>${money(o.total)}</span></div></div>
  <p>Pago por Nequi, Llave o transferencia: <b>${PAGO}</b></p>
  <p style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><a class="btn" target="_blank" rel="noopener" href="${waLink(orderMsg(o))}">Avisar por WhatsApp</a><button class="btn ghost" id="again">Hacer otro pedido</button></p></div>`;
}

function bind() {
  const g = (id) => document.getElementById(id);
  $app.querySelectorAll("[data-p]").forEach((b) => (b.onclick = () => { sheet = { pid: +b.dataset.p, size: 0, qty: 1, opts: {} }; render(); }));
  $app.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = () => { cart.splice(+b.dataset.rm, 1); render(); }));
  if (g("again")) g("again").onclick = () => { done = null; render(); scrollTo(0, 0); };
  if (g("close")) g("close").onclick = () => { sheet = null; render(); };
  if (g("bg")) g("bg").onclick = (e) => { if (e.target.id === "bg") { sheet = null; render(); } };
  if (g("minus")) g("minus").onclick = () => { sheet.qty = Math.max(1, sheet.qty - 1); keepScroll(); };
  if (g("plus")) g("plus").onclick = () => { sheet.qty = Math.min(20, sheet.qty + 1); keepScroll(); };
  if (g("add")) g("add").onclick = () => {
    const p = products.find((x) => x.id === sheet.pid), z = p.sizes[sheet.size];
    cart.push({ productId: p.id, sizeIndex: sheet.size, name: p.name, size: z.label, price: z.price, qty: sheet.qty,
      optMap: { ...sheet.opts }, opts: p.groups.map((gg) => ({ k: gg.name, v: sheet.opts[gg.name] })) });
    sheet = null; render();
    setTimeout(() => g("cartbox")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  $app.querySelectorAll(".sheet input[type=radio]").forEach((r) => (r.onchange = () => {
    if (r.name === "size") sheet.size = +r.value; else sheet.opts[r.dataset.g] = r.value;
    keepScroll();
  }));
  const f = g("form");
  if (f) {
    f.addEventListener("input", () => { draft = { name: g("f-name").value, loc: g("f-loc").value, wa: g("f-wa").value, notes: g("f-notes").value }; saveDraft(); });
    g("copy").onclick = async (e) => {
      try { await navigator.clipboard.writeText(PAGO); e.target.textContent = "¡Copiado!"; }
      catch { const r = document.createRange(); r.selectNode(e.target.previousElementSibling); getSelection().removeAllRanges(); getSelection().addRange(r); e.target.textContent = "Número seleccionado"; }
    };
    f.onsubmit = submit;
  }
}
function keepScroll() { const y = document.querySelector(".sheet")?.scrollTop || 0; render(); const s = document.querySelector(".sheet"); if (s) s.scrollTop = y; }

async function submit(e) {
  e.preventDefault();
  if (sending || !cart.length) return;
  sending = true; errMsg = ""; render();
  try {
    const r = await fetch("/api/orders", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: draft.name, location: draft.loc, whatsapp: draft.wa, notes: draft.notes,
        items: cart.map((i) => ({ productId: i.productId, sizeIndex: i.sizeIndex, qty: i.qty, opts: i.optMap })) }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || "No se pudo enviar el pedido.");
    done = data; cart = []; draft.notes = "";
    sending = false; render(); scrollTo(0, 0);
  } catch (err) {
    sending = false;
    errMsg = (err.message === "Failed to fetch" ? "No hay conexión. Revisa tu internet e intenta de nuevo." : err.message);
    render();
  }
}

(async () => {
  try {
    const r = await fetch("/api/products");
    if (!r.ok) throw 0;
    products = await r.json();
  } catch { loadErr = "No pude cargar el menú. Recarga la página."; }
  render();
})();
