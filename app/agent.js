/* MountLab · agente de la interfaz.
   - Conoce las acciones de la app (registro que entrega app.js) y TODOS los botones, pestañas y enlaces visibles.
   - Aprende tus hábitos (qué pulsas en cada pantalla y qué haces después) y predice lo siguiente.
   - Paleta de comandos (Ctrl+K), sugerencias en el panel del asistente y una burbuja junto al botón ✦.
   - Entiende órdenes en lenguaje natural ("abre el bme280", "pasa a la cara B", "exporta el BOM") sin internet.
   Todo queda en este dispositivo (localStorage "ml_habitos"). */
(function () {
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const KH = "ml_habitos";
  let API = null;

  // ---------------- texto
  const PALABRAS_EXTRA = new Set("el la los las un una de del al en a por para con mi mis me".split(" "));
  const tok = s => (window.MLLocal ? MLLocal.tok(s) : norm(s).replace(/[^a-z0-9\s]/g, " ").split(/\s+/)).filter(w => w && !PALABRAS_EXTRA.has(w));
  function wsim(a, b) {
    if (a === b) return 1; if (a.length >= 3 && b.startsWith(a)) return 0.9; if (b.length >= 3 && a.startsWith(b)) return 0.8;
    return window.MLLocal ? MLLocal.wsim(a, b) : 0;
  }
  /** Parecido entre una frase y un texto (0..1). */
  function sim(q, texto) {
    const qt = tok(q), tt = tok(texto); if (!qt.length || !tt.length) return 0;
    let s = 0; for (const a of qt) { let b = 0; for (const t of tt) b = Math.max(b, wsim(a, t)); s += b; }
    let r = s / qt.length; const nq = norm(q).trim(), nt = norm(texto);
    if (nq.length >= 3 && nt.includes(nq)) r = Math.max(r, 0.96);
    return Math.min(1, r);
  }

  // ---------------- hábitos
  const H = {
    get() { try { return Object.assign({ c: {}, t: {}, last: null, n: 0 }, JSON.parse(localStorage.getItem(KH)) || {}); } catch (e) { return { c: {}, t: {}, last: null, n: 0 }; } },
    set(h) { try { localStorage.setItem(KH, JSON.stringify(h)); } catch (e) { } },
    registrar(label, ctx) {
      if (!label) return; const h = this.get(), k = ctxKey(ctx);
      h.c[k] = h.c[k] || {}; h.c[k][label] = Math.min(200, (h.c[k][label] || 0) + 1);
      if (h.last && h.last !== label) { h.t[h.last] = h.t[h.last] || {}; h.t[h.last][label] = Math.min(200, (h.t[h.last][label] || 0) + 1); }
      h.last = label; h.n++; this.set(h);
    },
  };
  const ctxKey = c => (c && c.vista || "?") + (c && c.tab ? ":" + c.tab : "");

  // ---------------- elementos visibles de la pantalla
  function etiqueta(el) {
    if (el.matches(".lst-it, .card, .mo-item")) { const b = el.querySelector("b, .nm, span"); if (b && b.innerText.trim()) return b.innerText.replace(/\s+/g, " ").trim().slice(0, 60); }
    if (el.matches(".kpi")) { const sp = el.querySelector("span"); if (sp) return sp.innerText.replace(/\s+/g, " ").trim().slice(0, 60); }
    let t = (el.getAttribute("aria-label") || "").trim();
    const txt = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
    if (!t) t = txt.length >= 2 && txt.length <= 48 ? txt : (el.getAttribute("title") || txt).trim();
    if (el.title && txt.length <= 2) t = el.title.trim() + (txt ? " " + txt : "");
    return t.replace(/\s+/g, " ").slice(0, 60);
  }
  function visible(el) { if (!el.isConnected || el.disabled) return false; const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false; const cs = getComputedStyle(el); return cs.visibility !== "hidden" && cs.display !== "none"; }
  function elementosUI() {
    const out = [], vistos = new Set();
    const raiz = [$("#app"), $(".topbar"), $("#side")].filter(Boolean);
    for (const r of raiz) for (const el of $$("button, a[href], [data-tab], .chip, label.btn, .card[data-id], .mo-item[data-pt], .kpi[data-go], .lst-it", r)) {
      if (!visible(el)) continue; const n = etiqueta(el); if (!n || n.length < 2 || /^[\W\d]+$/.test(n)) continue;
      const k = norm(n); if (vistos.has(k)) continue; vistos.add(k);
      out.push({ id: "ui:" + k, n, ic: el.matches("[data-tab]") ? "▤" : el.matches("a") ? "↗" : "◉", grupo: "En esta pantalla", el, ui: true });
    }
    return out;
  }

  // ---------------- candidatos y búsqueda
  function acciones(ctx) { return (API ? API.acciones() : []).filter(a => !a.when || a.when(ctx)); }
  function candidatos(ctx) {
    const reg = acciones(ctx), nombres = new Set(reg.map(a => norm(a.n)));
    return reg.concat(elementosUI().filter(u => !nombres.has(norm(u.n))));
  }
  function buscar(q, ctx, n) {
    const L = candidatos(ctx).map(a => ({ a, s: Math.max(sim(q, a.n), a.k ? sim(q, a.n + " " + a.k) * 0.97 : 0) - (a.ui ? 0.04 : 0) })).filter(x => x.s >= 0.5);
    return L.sort((x, y) => y.s - x.s).slice(0, n || 8);
  }

  // ---------------- predicción
  function predecir(ctx, n) {
    ctx = ctx || (API && API.ctx()) || {};
    const h = H.get(), k = ctxKey(ctx), cnt = h.c[k] || {}, tot = Object.values(cnt).reduce((a, b) => a + b, 0);
    const tr = (h.last && h.t[h.last]) || {}, totT = Object.values(tr).reduce((a, b) => a + b, 0);
    const C = candidatos(ctx), porNombre = new Map(C.map(a => [a.n, a]));
    const sc = new Map(), add = (a, s, motivo) => { if (!a) return; const o = sc.get(a.id) || { a, s: 0, motivos: [] }; o.s += s; if (motivo && !o.motivos.includes(motivo)) o.motivos.push(motivo); sc.set(a.id, o); };
    for (const r of (API ? API.reglas(ctx) : [])) add(r.accion ? C.find(a => a.id === r.accion) : null, r.peso || 0.5, r.motivo);
    for (const [lab, c] of Object.entries(cnt)) if (tot >= 2 && c >= 2) add(porNombre.get(lab), 0.85 * c / (tot + 3), "Lo sueles hacer aquí");
    for (const [lab, c] of Object.entries(tr)) if (c >= 2) add(porNombre.get(lab), 0.6 * c / (totT + 2), "Sueles hacerlo después de «" + h.last + "»");
    return [...sc.values()].filter(o => o.a.n !== h.last || o.motivos.some(m => !m.startsWith("Lo sueles") && !m.startsWith("Sueles"))).map(o => ({ a: o.a, s: Math.min(1, o.s), motivo: o.motivos[0] || "" }))
      .sort((x, y) => y.s - x.s).slice(0, n || 4);
  }

  // ---------------- ejecutar
  function flash(el) { if (!el) return; try { el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) { } el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 3000); }
  async function ejecutar(a, args, opt) {
    opt = opt || {};
    if (!a) return { ok: false, msg: "No encontré esa acción" };
    if (a.peligro && !opt.confirmado) { const ok = await API.confirmar(`¿${esc(a.n)}?`, a.n); if (!ok) return { ok: false, msg: "Cancelado" }; }
    H.registrar(a.n, API.ctx());
    try {
      if (a.ui) { const el = a.el && a.el.isConnected ? a.el : (elementosUI().find(u => u.id === a.id) || {}).el; if (!el) return { ok: false, msg: "Ese elemento ya no está en pantalla" }; flash(el); setTimeout(() => el.click(), 250); return { ok: true, msg: "Pulsado: " + a.n }; }
      const r = await a.run(args || {}); if (r === false) return { ok: false, msg: "No se pudo: " + a.n };
      if (a.sel) setTimeout(() => flash($(a.sel)), 350);
      return { ok: true, msg: typeof r === "string" ? r : a.n };
    } catch (e) { return { ok: false, msg: e.message }; }
    finally { setTimeout(refrescar, 600); }
  }

  // ---------------- órdenes en lenguaje natural (sin internet)
  const VERBO = /^(abre|abrir|abreme|ve a|ir a|vamos a|llevame a|muestra|muestrame|ensename|pulsa|presiona|oprime|haz clic en|dale a|activa|desactiva|cambia a|pasa a|crea|crear|nuevo|nueva|guarda|guardar|descarta|exporta|exportar|descarga|descargar|regenera|regenerar|revisa|revisar|bloquea|bloquear|explota|toma|tomar|coloca|colocar|pon|poner|inserta|duplica|duplicar|elimina|eliminar|borra|sube|subir|recarga|invita|invitar|marca|filtra|filtrar|busca|buscar|selecciona|ajusta|gira|vista|cierra|abrir el|ver)\b/;
  function intencion(q) {
    const ctx = API.ctx(), n = norm(q).trim().replace(/[¿?¡!.]+/g, "").trim(); if (!n) return null;
    let m;
    // buscar en el catálogo
    if ((m = n.match(/^(?:busca|buscar|filtra|filtrar|encuentra)\s+(?:en el catalogo\s+)?(?:por\s+)?(.+)$/)) && !/internet|web|datasheet|precio/.test(n))
      return { a: { id: "buscar_catalogo", n: `Buscar “${m[1]}” en el catálogo`, run: () => API.buscarCatalogo(m[1]) }, s: 0.95 };
    // colocar una plantilla en el modelo 3D
    if (ctx.tab === "modelo" && (m = n.match(/^(?:coloca|colocar|pon|poner|inserta|agrega|anade|añade)\s+(?:un|una|el|la|dos|tres|cuatro)?\s*(.+?)(?:\s+en la cara\s+([ab]))?$/)) && window.MLPlant) {
      let mejor = null; for (const t of MLPlant.todas()) { const s = sim(m[1].replace(/de \d+ pines?|\d+ pines?|\d+ vias?/g, ""), t.n + " " + t.id.replace(/_/g, " ")); if (!mejor || s > mejor.s) mejor = { t, s }; }
      if (mejor && mejor.s >= 0.7) {
        const params = {}, pn = m[1].match(/(\d+)\s*(pines?|vias?)/); if (pn && (mejor.t.params || []).some(p => p.k === "n")) params.n = +pn[1];
        return { a: { id: "colocar", n: `Colocar ${mejor.t.n}${m[2] ? " en la cara " + m[2].toUpperCase() : ""}`, run: () => API.colocar(mejor.t.id, params, m[2] ? m[2].toUpperCase() : null) }, s: mejor.s };
      }
    }
    // abrir componente / proyecto / vista
    if ((m = n.match(/^(?:abre|abrir|abreme|ve a|ir a|vamos a|llevame a|muestra(?:me)?|ver|ensename)\s+(?:el |la |los |las |mi |mis )?(.+)$/))) {
      const obj = m[1].replace(/^(componente|modulo|sensor|proyecto|pestana|vista)\s+/, "");
      const r = buscar(m[1], ctx, 1)[0]; if (r && r.s >= 0.8) return r;
      const p = API.buscarProyecto(obj); if (p && (/proyecto/.test(m[1]) || p.s >= 0.75)) return { a: { id: "abrir_proyecto", n: "Abrir proyecto " + p.p.nombre, run: () => { location.hash = "#/p/" + encodeURIComponent(p.p.id); } }, s: p.s };
      const c = API.buscarComponente(obj); if (c && c.s >= 0.6) return { a: { id: "abrir_componente", n: "Abrir " + c.c.nombre, run: () => { location.hash = "#/c/" + encodeURIComponent(c.c.id); } }, s: c.s };
    }
    const r = buscar(n, ctx, 1)[0];
    if (r && (r.s >= 0.9 || (r.s >= 0.72 && VERBO.test(n)) || (r.s >= 0.8 && tok(n).length <= 3))) return r;
    return null;
  }

  // ---------------- interfaz: chips del panel, burbuja del ✦, paleta
  let tipMostrado = new Set(), tipTimer = null;
  function chipsHTML(L) { return L.map((o, i) => `<button class="sug" data-sg="${i}" title="${esc(o.motivo || "")}">${esc(o.a.ic || "✦")} ${esc(o.a.n)}</button>`).join(""); }
  function refrescar() {
    if (!API) return; const ctx = API.ctx(); const L = predecir(ctx, 4);
    const box = $("#drSug"); if (box) { box.innerHTML = L.length ? chipsHTML(L) + '<button class="sug" data-pal="1" title="Todas las acciones (Ctrl+K)">⌘ Más…</button>' : ""; $$("[data-sg]", box).forEach(b => b.onclick = async () => { const r = await ejecutar(L[+b.dataset.sg].a); API.nota && API.nota(r); }); const pb = $("[data-pal]", box); if (pb) pb.onclick = () => paleta(); }
    const c = $("#drCtx"); if (c) c.innerHTML = `<span>📍 ${esc(ctx.titulo || "")}</span>`;
    // burbuja predictiva junto al botón ✦
    clearTimeout(tipTimer); const tip = $("#fabTip"); if (!tip) return;
    const top = L[0], clave = ctxKey(ctx) + "|" + (top && top.a.n);
    if (!top || top.s < 0.55 || tipMostrado.has(clave) || document.body.classList.contains("drawer-open")) { tip.classList.add("hide"); return; }
    tipTimer = setTimeout(() => {
      tipMostrado.add(clave);
      tip.innerHTML = `<span>✦</span><span>¿<b>${esc(top.a.n)}</b>?<br><span class="small muted">${esc(top.motivo || "Sugerencia")}</span></span><span class="x" title="Ahora no">✕</span>`;
      tip.classList.remove("hide");
      tip.onclick = async e => { tip.classList.add("hide"); if (e.target.classList.contains("x")) return; const r = await ejecutar(top.a); API.toast && API.toast(r.msg); };
      setTimeout(() => tip.classList.add("hide"), 14000);
    }, 1400);
  }

  function paleta(q0) {
    const P = $("#palette"); if (!P) return; const ctx = API.ctx();
    P.innerHTML = `<div class="pal"><input id="palQ" placeholder="Escribe un componente, proyecto, acción o pregunta…" value="${esc(q0 || "")}" autocomplete="off"><div class="res" id="palR"></div>
      <div class="foot"><span><kbd>↑</kbd><kbd>↓</kbd> moverse</span><span><kbd>Enter</kbd> abrir</span><span><kbd>Esc</kbd> cerrar</span><span style="margin-left:auto">✦ también entiende órdenes: “pasa a la cara B”, “exporta el BOM”</span></div></div>`;
    P.classList.remove("hide");
    const inp = $("#palQ", P), res = $("#palR", P); let items = [], act = 0;
    const cerrar = () => { P.classList.add("hide"); P.innerHTML = ""; };
    const pintar = () => {
      const q = inp.value.trim(); items = []; const grupos = [];
      const g = (titulo, L) => { if (L.length) grupos.push([titulo, L]); };
      if (!q) {
        g("Sugerido para ti", predecir(ctx, 5).map(o => ({ ic: o.a.ic || "✦", n: o.a.n, sub: o.motivo, run: () => ejecutar(o.a) })));
        g("Ir a", API.vistas().map(v => ({ ic: v.ic, n: v.n, sub: "", run: () => { location.hash = v.h; } })));
        g("Recientes", API.recientes().slice(0, 6).map(c => ({ ic: API.mini(c), n: c.nombre, sub: c.categoria, run: () => { location.hash = "#/c/" + encodeURIComponent(c.id); } })));
        g("Acciones aquí", acciones(ctx).filter(a => !a.global).slice(0, 8).map(a => ({ ic: a.ic || "•", n: a.n, sub: a.grupo || "", run: () => ejecutar(a) })));
      } else {
        const it = intencion(q);
        if (it && it.s >= 0.85 && !it.a.ui && !acciones(ctx).some(a => a.id === it.a.id)) g("Orden", [{ ic: "⚡", n: it.a.n, sub: "orden", run: () => ejecutar(it.a) }]);
        g("Componentes", API.componentes(q, 7).map(r => ({ ic: API.mini(r.c), n: r.c.nombre, sub: r.c.categoria, run: () => { location.hash = "#/c/" + encodeURIComponent(r.c.id); } })));
        g("Acciones", buscar(q, ctx, 7).map(r => ({ ic: r.a.ic || "•", n: r.a.n, sub: r.a.ui ? "en pantalla" : (r.a.grupo || ""), run: () => ejecutar(r.a) })));
        g("Proyectos", API.proyectos(q, 4).map(r => ({ ic: "📁", n: r.p.nombre, sub: r.p.estado || "", run: () => { location.hash = "#/p/" + encodeURIComponent(r.p.id); } })));
        g("Asistente", [{ ic: "✦", n: `Preguntar: “${q}”`, sub: "asistente", run: () => API.preguntar(q) }]);
      }
      res.innerHTML = grupos.map(([t, L]) => `<div class="grp">${esc(t)}</div>` + L.map(o => { items.push(o); const i = items.length - 1; return `<div class="op ${i === act ? "act" : ""}" data-i="${i}"><span class="ic">${String(o.ic).startsWith("<") ? o.ic : esc(o.ic)}</span><span class="tx">${esc(o.n)}</span><span class="sub">${esc(o.sub || "")}</span></div>`; }).join("")).join("") || '<div class="grp">Sin resultados</div>';
      $$(".op", res).forEach(d => { d.onmousemove = () => { if (act !== +d.dataset.i) { act = +d.dataset.i; marcar(); } }; d.onclick = () => elegir(+d.dataset.i); });
    };
    const marcar = () => $$(".op", res).forEach(d => d.classList.toggle("act", +d.dataset.i === act));
    const elegir = async i => { const o = items[i]; if (!o) return; cerrar(); const r = await o.run(); if (r && r.msg && API.toast) API.toast(r.msg); };
    inp.oninput = () => { act = 0; pintar(); };
    inp.onkeydown = e => {
      if (e.key === "ArrowDown") { e.preventDefault(); act = Math.min(items.length - 1, act + 1); marcar(); $(".op.act", res)?.scrollIntoView({ block: "nearest" }); }
      else if (e.key === "ArrowUp") { e.preventDefault(); act = Math.max(0, act - 1); marcar(); $(".op.act", res)?.scrollIntoView({ block: "nearest" }); }
      else if (e.key === "Enter") { e.preventDefault(); elegir(act); }
      else if (e.key === "Escape") cerrar();
    };
    P.onclick = e => { if (e.target === P) cerrar(); };
    pintar(); setTimeout(() => inp.focus(), 20);
  }

  // ---------------- arranque
  function init(api) {
    API = api;
    // registra cada clic en la app (no en el panel del asistente ni la paleta)
    document.addEventListener("click", e => {
      const el = e.target.closest("button, a[href], [data-tab], .chip, label.btn, .card[data-id], .mo-item[data-pt], .kpi[data-go], .lst-it");
      if (!el || el.closest("#drawer, #palette, #lock, #fabTip, #modal")) return;
      const n = etiqueta(el); if (n && n.length >= 2) H.registrar(n, API.ctx());
      setTimeout(refrescar, 700);
    }, true);
    document.addEventListener("keydown", e => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); paleta(); }
      else if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || "") && !$("#palette:not(.hide)")) { e.preventDefault(); paleta(); }
    });
    window.addEventListener("hashchange", () => setTimeout(refrescar, 500));
    setTimeout(refrescar, 800);
  }

  window.MLAgent = { init, buscar, predecir, ejecutar, intencion, paleta, refrescar, elementosUI, sim, habitos: () => H.get(), olvidarHabitos: () => localStorage.removeItem(KH) };
})();
