/* MountLab · app principal (Catálogo + Biblioteca + Proyectos + Pendientes + Asistente) */
(function () {
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clone = o => JSON.parse(JSON.stringify(o));
  const hoy = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const cop = n => n == null || n === "" || isNaN(n) ? "—" : "$" + Math.round(n).toLocaleString("es-CO");
  const slug = s => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "item";
  const r2 = v => Math.round(v * 100) / 100;
  const TIPOS = { electronico: "Electrónico", mecanico: "Mecánico / herraje", material: "Material / insumo", herramienta: "Herramienta", otro: "Otro" };
  const FIJ = { tornillo: "Tornillos en agujeros", guia_deslizante: "Guía deslizante (ranura)", pocket: "Alojamiento (pocket)", clip: "Clip / pestaña", adhesivo: "Adhesivo / cinta", abrazadera: "Abrazadera", na: "No aplica" };
  const ESTP = { idea: "Idea", diseno: "Diseño", prototipo: "Prototipo", "en curso": "En curso", terminado: "Terminado" };
  const app = $("#app");
  const S = { f: { q: "", tipo: "", cat: "", tag: "", estado: "", vista: "tarjetas" }, W: null, orig: null, tab: "ficha", ed: null, chat: [] };

  // ---------- utilidades UI
  let tt; function toast(m, ms) { const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(tt); tt = setTimeout(() => t.classList.remove("show"), ms || 2600); }
  function modal(html, mount) {
    return new Promise(res => {
      const box = $("#modalBox"); box.innerHTML = html; $("#modal").classList.remove("hide");
      const close = v => { $("#modal").classList.add("hide"); box.innerHTML = ""; res(v); };
      mount && mount(box, close);
      $$("[data-close]", box).forEach(b => b.onclick = () => close(null));
    });
  }
  function confirmar(msg, ok) { return modal(`<div>${msg}</div><div class="row" style="justify-content:flex-end"><button data-close>Cancelar</button><button class="pri" id="mOk">${ok || "Aceptar"}</button></div>`, (b, c) => $("#mOk", b).onclick = () => c(true)); }
  function precioMin(c) { const ps = (c.precios || []).filter(p => +p.precio_cop > 0); if (!ps.length) return null; return ps.reduce((a, b) => (+a.precio_cop <= +b.precio_cop ? a : b)); }
  const comp = id => Store.db.componentes.find(c => c.id === id);
  function imgHtml(c, big) {
    const src = c.imagen && Store.imgUrl(c.imagen.src);
    if (src) return `<img src="${esc(src)}" alt="${esc(c.nombre)}" loading="lazy">`;
    const t = MLEditor.thumb(c, big ? 280 : 200, big ? 190 : 130); if (t) return t;
    return `<div class="muted small" style="padding:30px">Sin imagen</div>`;
  }
  function download(name, text, type) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain" })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
  function categorias() { const s = new Set(["Microcontroladores", "Sensores", "Actuadores", "Energía", "Comunicación RF", "Conectores", "Cableado", "Almacenamiento", "Pantallas", "Herrajes", "Materiales", "Prototipado", "Herramientas"]); Store.db.componentes.forEach(c => c.categoria && s.add(c.categoria)); return [...s].sort((a, b) => a.localeCompare(b, "es")); }
  function estadoPill() {
    const p = $("#estado"), n = Store.localPendientes();
    const t = { github: "GitHub conectado", "github-lectura": "GitHub: solo lectura", publico: "Solo lectura (sin token)", local: "Modo local" }[Store.mode];
    p.textContent = t + (n ? ` · ${n} sin subir` : ""); p.className = "pill " + (Store.mode === "github" ? "ok" : "loc");
    p.title = Store.error || "Clic para ajustes"; p.onclick = () => location.hash = "#/ajustes";
    const np = Store.db.pendientes.length, b = $("#nPend"); b.textContent = np; b.classList.toggle("hide", !np);
  }
  function dirty() { return S.W && S.orig && JSON.stringify(S.W) !== S.orig; }
  window.addEventListener("beforeunload", e => { if (dirty()) { e.preventDefault(); e.returnValue = ""; } });

  // ---------- router
  let lastHash = location.hash;
  async function route() {
    const h = location.hash || "#/";
    if (dirty() && !h.startsWith("#/c/" + S.W.id)) {
      if (!(await confirmar("Tienes cambios sin guardar en <b>" + esc(S.W.nombre) + "</b>. ¿Salir sin guardar?", "Salir sin guardar"))) { history.replaceState(null, "", lastHash); return; }
    }
    lastHash = h;
    if (S.ed) { S.ed.destroy(); S.ed = null; }
    if (!h.startsWith("#/c/")) { S.W = null; S.orig = null; }
    const [, r, id] = h.split("/");
    $$("#nav a").forEach(a => a.classList.toggle("act", a.dataset.r === ({ "": "catalogo", c: "catalogo", p: "proyectos" }[r] ?? r)));
    window.scrollTo(0, 0);
    if (r === "c" && id) return vComponente(decodeURIComponent(id));
    if (r === "proyectos") return vProyectos();
    if (r === "p" && id) return vProyecto(decodeURIComponent(id));
    if (r === "pendientes") return vPendientes();
    if (r === "asistente") return vAsistente();
    if (r === "ajustes") return vAjustes();
    return vCatalogo();
  }
  window.addEventListener("hashchange", route);

  // =====================================================================  CATÁLOGO
  function filtrar() {
    const f = S.f, q = f.q.trim().toLowerCase();
    return Store.db.componentes.filter(c => {
      if (f.tipo && c.tipo !== f.tipo) return false;
      if (f.cat && c.categoria !== f.cat) return false;
      if (f.tag && !(c.etiquetas || []).includes(f.tag)) return false;
      if (f.estado === "verificado" && c.estado !== "verificado") return false;
      if (f.estado === "borrador" && c.estado === "verificado") return false;
      if (f.estado === "montaje" && !(c.montaje && c.montaje.pcb)) return false;
      if (f.estado === "sinimg" && c.imagen) return false;
      if (q) { const t = [c.id, c.nombre, c.categoria, c.fabricante, c.referencia, ...(c.etiquetas || []), ...Object.values(c.ficha || {})].join(" ").toLowerCase(); if (!q.split(/\s+/).every(w => t.includes(w))) return false; }
      return true;
    }).sort((a, b) => a.categoria.localeCompare(b.categoria, "es") || a.nombre.localeCompare(b.nombre, "es"));
  }
  function vCatalogo() {
    const cs = Store.db.componentes, f = S.f;
    const cnt = (k, v) => cs.filter(c => c[k] === v).length;
    const tags = {}; cs.forEach(c => (c.etiquetas || []).forEach(t => tags[t] = (tags[t] || 0) + 1));
    app.innerHTML = `<div class="cat-layout">
      <aside class="panel filters">
        <input id="fq" placeholder="Buscar: nombre, voltaje, I2C…" value="${esc(f.q)}">
        <h4>Tipo</h4><div class="chips">${Object.entries(TIPOS).filter(([k]) => cnt("tipo", k)).map(([k, n]) => `<span class="chip ${f.tipo === k ? "on" : ""}" data-f="tipo" data-v="${k}">${n} (${cnt("tipo", k)})</span>`).join("")}</div>
        <h4>Categoría</h4><select id="fcat"><option value="">Todas</option>${categorias().filter(c => cnt("categoria", c)).map(c => `<option ${f.cat === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
        <h4>Etiquetas</h4><div class="chips">${Object.entries(tags).sort((a, b) => b[1] - a[1]).map(([t, n]) => `<span class="chip ${f.tag === t ? "on" : ""}" data-f="tag" data-v="${esc(t)}">${esc(t)} (${n})</span>`).join("") || '<span class="muted small">—</span>'}</div>
        <h4>Estado</h4><div class="chips">${[["verificado", "Verificado"], ["borrador", "Sin verificar"], ["montaje", "Con montaje"], ["sinimg", "Sin foto"]].map(([k, n]) => `<span class="chip ${f.estado === k ? "on" : ""}" data-f="estado" data-v="${k}">${n}</span>`).join("")}</div>
        <div class="row" style="margin-top:14px"><button class="sm" id="fclr">Limpiar filtros</button></div>
      </aside>
      <section>
        <div class="row" style="justify-content:space-between;margin-bottom:12px">
          <div class="stats" id="stats" style="margin:0"></div>
          <div class="row"><button class="sm ${f.vista === "tarjetas" ? "on" : ""}" data-v="tarjetas">Tarjetas</button><button class="sm ${f.vista === "tabla" ? "on" : ""}" data-v="tabla">Tabla</button><button class="pri" id="bNew">+ Nuevo</button></div>
        </div>
        <div id="lst"></div>
      </section></div>`;
    const pinta = () => {
      const L = filtrar();
      const ver = L.filter(c => c.estado === "verificado").length;
      $("#stats").innerHTML = `<div class="stat"><b>${L.length}</b><span>de ${cs.length} elementos</span></div><div class="stat"><b>${ver}</b><span>verificados</span></div><div class="stat"><b>${L.filter(c => c.montaje && c.montaje.pcb).length}</b><span>con montaje</span></div>`;
      if (!L.length) { $("#lst").innerHTML = `<div class="panel muted">No hay elementos con esos filtros.</div>`; return; }
      if (f.vista === "tabla") {
        $("#lst").innerHTML = `<div class="panel" style="padding:0;overflow:auto"><table class="t"><tr><th></th><th>Nombre</th><th>Categoría</th><th>Voltaje</th><th>Interfaz</th><th>Montaje</th><th class="num">Desde</th><th>Estado</th></tr>
          ${L.map(c => { const p = precioMin(c); return `<tr data-id="${esc(c.id)}" style="cursor:pointer"><td style="width:54px"><div style="width:48px;height:34px;display:flex;align-items:center;justify-content:center;overflow:hidden">${imgHtml(c).replace("<svg ", '<svg style="max-width:48px;max-height:34px" ').replace("<img ", '<img style="max-width:48px;max-height:34px" ')}</div></td>
          <td><b>${esc(c.nombre)}</b><div class="small muted">${esc(c.id)}</div></td><td>${esc(c.categoria)}</td><td class="small">${esc((c.ficha || {}).voltaje || "")}</td><td class="small">${esc((c.ficha || {}).interfaz || "")}</td>
          <td class="small">${c.montaje && c.montaje.pcb ? `${c.montaje.pcb[0]}×${c.montaje.pcb[1]} · ${(c.montaje.agujeros || []).length} ag.` : "—"}</td><td class="num">${p ? cop(p.precio_cop) : "—"}</td>
          <td>${c.estado === "verificado" ? '<span class="tag ok">Verificado</span>' : '<span class="tag warn">Sin verificar</span>'}</td></tr>`; }).join("")}</table></div>`;
        $$("tr[data-id]").forEach(tr => tr.onclick = () => location.hash = "#/c/" + encodeURIComponent(tr.dataset.id));
      } else {
        $("#lst").innerHTML = `<div class="cards">${L.map(c => { const p = precioMin(c); return `<div class="card" data-id="${esc(c.id)}"><div class="im">${imgHtml(c)}</div><div class="bd">
          <div class="nm">${esc(c.nombre)}</div><div class="row" style="gap:4px"><span class="tag cat">${esc(c.categoria)}</span>${c.estado === "verificado" ? '<span class="tag ok">✓</span>' : ""}${(c.etiquetas || []).slice(0, 3).map(t => `<span class="tag">${esc(t)}</span>`).join("")}</div>
          <div class="small muted">${esc(((c.ficha || {}).voltaje || "").slice(0, 60))}</div>
          <div class="ft"><span>${c.montaje && c.montaje.pcb ? `▭ ${c.montaje.pcb[0]}×${c.montaje.pcb[1]} mm` : TIPOS[c.tipo] || ""}</span><span>${p ? "desde " + cop(p.precio_cop) : ""}</span></div></div></div>`; }).join("")}</div>`;
        $$(".card").forEach(d => d.onclick = () => location.hash = "#/c/" + encodeURIComponent(d.dataset.id));
      }
    };
    $("#fq").oninput = e => { f.q = e.target.value; pinta(); };
    $("#fcat").onchange = e => { f.cat = e.target.value; pinta(); };
    $$(".chip[data-f]").forEach(ch => ch.onclick = () => { const k = ch.dataset.f; f[k] = f[k] === ch.dataset.v ? "" : ch.dataset.v; vCatalogo(); });
    $("#fclr").onclick = () => { Object.assign(f, { q: "", tipo: "", cat: "", tag: "", estado: "" }); vCatalogo(); };
    $$("[data-v]").forEach(b => { if (b.tagName === "BUTTON") b.onclick = () => { f.vista = b.dataset.v; vCatalogo(); }; });
    $("#bNew").onclick = nuevoComponente;
    pinta();
  }

  async function nuevoComponente(base) {
    const r = await modal(`<h3>Nuevo elemento</h3>
      <div><label>Nombre</label><input id="nN" placeholder="Ej: Sensor MPU6050"></div>
      <div class="grid2"><div><label>Tipo</label><select id="nT">${Object.entries(TIPOS).map(([k, n]) => `<option value="${k}">${n}</option>`).join("")}</select></div>
      <div><label>Categoría</label><input id="nC" list="dlCat" value="Sensores"><datalist id="dlCat">${categorias().map(c => `<option>${esc(c)}</option>`).join("")}</datalist></div></div>
      <div><label>Identificador (sin espacios)</label><input id="nI"></div>
      <label class="row" style="gap:6px"><input type="checkbox" id="nP" checked style="width:auto"> Tiene placa / se monta (crea el montaje con origen al centro)</label>
      <div class="row" style="justify-content:flex-end"><button data-close>Cancelar</button><button class="pri" id="nOk">Crear</button></div>`, (b, close) => {
      const n = $("#nN", b), i = $("#nI", b); let tocado = false;
      n.oninput = () => { if (!tocado) i.value = slug(n.value); }; i.oninput = () => tocado = true;
      $("#nT", b).onchange = e => { $("#nP", b).checked = e.target.value === "electronico"; };
      $("#nOk", b).onclick = () => {
        const id = slug(i.value || n.value); if (!n.value.trim()) return toast("Escribe el nombre");
        if (comp(id)) return toast("Ya existe un elemento con ese identificador");
        close({ id, nombre: n.value.trim(), tipo: $("#nT", b).value, categoria: $("#nC", b).value.trim() || "Otros", placa: $("#nP", b).checked });
      };
      setTimeout(() => n.focus(), 50);
    });
    if (!r) return;
    const c = {
      id: r.id, nombre: r.nombre, tipo: r.tipo, categoria: r.categoria, etiquetas: [], fabricante: "", referencia: "", estado: "borrador", version: 1, unidad: "und",
      ficha: { descripcion: "", funcionamiento: "", voltaje: "", corriente: "", interfaz: "", entradas: "", salidas: "", dimensiones: "", datasheet: "", notas: "" },
      especificaciones: [], imagen: null, precios: [], busquedas: {},
      montaje: r.placa ? { origen: "centro", pcb: [30, 20, 1.6], fijacion: "tornillo", agujeros: [], altura_superior: 3, altura_inferior: 0, holgura_inferior_cableado: 0, nota: "" } : null,
      zonas: [], pines: [], archivos: {}, historial: [{ v: 1, fecha: hoy(), nota: "Creado" }],
    };
    S.nuevo = c; location.hash = "#/c/" + encodeURIComponent(c.id);
  }

  // =====================================================================  COMPONENTE
  function vComponente(id) {
    let c = comp(id);
    if (!c && S.nuevo && S.nuevo.id === id) c = S.nuevo;
    if (!c) { app.innerHTML = `<div class="panel">No existe el elemento <b>${esc(id)}</b>. <a href="#/">Volver al catálogo</a></div>`; return; }
    if (!S.W || S.W.id !== id) { S.W = clone(c); S.orig = S.nuevo && S.nuevo.id === id ? "{}" : JSON.stringify(c); S.tab = S.tab || "ficha"; }
    const W = S.W;
    const enProy = Store.db.proyectos.filter(p => (p.bom || []).some(b => b.id === W.id));
    app.innerHTML = `<div class="det-head">
      <div><div class="small"><a href="#/">← Catálogo</a></div><h2 style="margin-top:4px">${esc(W.nombre)}</h2>
        <div class="row" style="gap:6px;margin-top:6px"><span class="tag">${esc(W.id)}</span><span class="tag cat">${esc(W.categoria)}</span><span class="tag">${TIPOS[W.tipo] || W.tipo}</span><span class="tag">v${W.version || 1}</span>
        ${W.variante_de ? `<span class="tag">variante de <a href="#/c/${esc(W.variante_de)}">${esc(W.variante_de)}</a></span>` : ""}
        ${enProy.map(p => `<a class="tag" href="#/p/${esc(p.id)}">📁 ${esc(p.nombre)}</a>`).join("")}<span id="dirtyMark"></span></div></div>
      <div class="row">
        <label class="btn" style="margin:0;color:${W.estado === "verificado" ? "var(--ok)" : "var(--warn)"}"><input type="checkbox" id="chkVer" style="width:auto" ${W.estado === "verificado" ? "checked" : ""}> ${W.estado === "verificado" ? "Verificado con calibrador" : "Sin verificar"}</label>
        <button id="bSave" class="pri">Guardar</button><button id="bUndo">Descartar</button>
        <button id="bDup">Duplicar</button><button id="bVar">Crear variante</button><button id="bProj">Añadir a proyecto</button><button id="bDel" class="danger">Eliminar</button></div></div>
      <div class="tabs">${[["ficha", "Ficha"], ["montaje", "Montaje"], ["zonas", "Zonas"], ["pines", "Pines"], ["archivos", "Archivos CAD"], ["versiones", "Versiones"], ["json", "JSON"]].map(([k, n]) => `<button data-tab="${k}" class="${S.tab === k ? "on" : ""}">${n}</button>`).join("")}</div>
      <div id="tabBody"></div>`;
    const mark = () => { $("#dirtyMark").innerHTML = dirty() ? '<span class="dirty">Cambios sin guardar</span>' : ""; $("#bSave").disabled = !dirty(); $("#bUndo").disabled = !dirty(); };
    S.mark = mark; mark();
    $$("[data-tab]").forEach(b => b.onclick = () => { S.tab = b.dataset.tab; $$("[data-tab]").forEach(x => x.classList.toggle("on", x === b)); tab(); });
    $("#chkVer").onchange = e => { W.estado = e.target.checked ? "verificado" : "borrador"; vComponente(id); };
    $("#bSave").onclick = guardarComponente;
    $("#bUndo").onclick = () => { if (S.nuevo && S.nuevo.id === id) { S.W = null; S.orig = null; S.nuevo = null; location.hash = "#/"; return; } S.W = null; vComponente(id); };
    $("#bDup").onclick = () => copiar(false); $("#bVar").onclick = () => copiar(true);
    $("#bProj").onclick = () => aProyecto(W.id);
    $("#bDel").onclick = async () => {
      if (!(await confirmar(`¿Eliminar <b>${esc(W.nombre)}</b>? ${enProy.length ? `Está en ${enProy.length} proyecto(s).` : ""} El historial queda en GitHub.`, "Eliminar"))) return;
      try { const m = await Store.remove("componentes", W.id, `Eliminar ${W.id}`); toast(m === "github" ? "Eliminado (commit en GitHub)" : "Eliminado en modo local"); } catch (e) { toast("Error: " + e.message, 5000); }
      S.W = null; S.orig = null; estadoPill(); location.hash = "#/";
    };
    tab();
  }
  async function copiar(variante) {
    const W = S.W; const r = await modal(`<h3>${variante ? "Crear variante" : "Duplicar"} de ${esc(W.nombre)}</h3>
      ${variante ? '<div class="msg info">Una variante hereda la ficha y queda enlazada al original (ej: “montado sobre shield”). Luego cambias solo lo distinto.</div>' : ""}
      <div><label>Nombre</label><input id="cN" value="${esc(W.nombre + (variante ? " (variante)" : " (copia)"))}"></div>
      <div><label>Identificador</label><input id="cI" value="${esc(W.id + (variante ? "_var" : "_copia"))}"></div>
      <div class="row" style="justify-content:flex-end"><button data-close>Cancelar</button><button class="pri" id="cOk">Crear</button></div>`, (b, close) => {
      $("#cOk", b).onclick = () => { const id = slug($("#cI", b).value); if (comp(id)) return toast("Ese identificador ya existe"); close({ id, nombre: $("#cN", b).value }); };
    });
    if (!r) return;
    const c = clone(W); c.id = r.id; c.nombre = r.nombre; c.version = 1; c.estado = "borrador"; c.archivos = variante ? c.archivos : {};
    if (variante) c.variante_de = W.id; else delete c.variante_de;
    c.historial = [{ v: 1, fecha: hoy(), nota: (variante ? "Variante" : "Copia") + ` de ${W.id} v${W.version || 1}` }];
    S.W = null; S.orig = null; S.nuevo = c; location.hash = "#/c/" + encodeURIComponent(c.id);
  }
  function cambiosDe(W, O) {
    const out = []; if (!O.id) return ["nuevo"];
    for (const k of ["montaje", "zonas", "pines"]) if (JSON.stringify(W[k]) !== JSON.stringify(O[k])) out.push(k);
    for (const k of ["ficha", "especificaciones", "precios", "imagen", "nombre", "categoria", "tipo", "etiquetas", "estado", "fabricante", "referencia"]) if (JSON.stringify(W[k]) !== JSON.stringify(O[k])) out.push(k);
    return out;
  }
  async function guardarComponente() {
    const W = S.W, O = JSON.parse(S.orig || "{}"), ch = cambiosDe(W, O);
    const geo = ch.some(k => ["montaje", "zonas", "pines"].includes(k)) && O.id;
    const nombres = { montaje: "montaje/agujeros", zonas: "zonas", pines: "pines", ficha: "ficha técnica", precios: "precios", imagen: "imagen", especificaciones: "especificaciones", estado: "estado de verificación" };
    const sug = ch[0] === "nuevo" ? "Creado" : "Actualizado: " + ch.map(k => nombres[k] || k).join(", ");
    const nota = await modal(`<h3>Guardar ${esc(W.nombre)}</h3>
      ${geo ? `<div class="msg info">Cambiaste la geometría (${ch.filter(k => ["montaje", "zonas", "pines"].includes(k)).join(", ")}): se crea la <b>versión ${(W.version || 1) + 1}</b> y GitHub regenera el DXF y el STEP de montaje.</div>` : ""}
      <div><label>Nota del cambio (queda en el historial)</label><textarea id="gN">${esc(sug)}</textarea></div>
      <div class="row" style="justify-content:flex-end"><button data-close>Cancelar</button><button class="pri" id="gOk">Guardar</button></div>`, (b, close) => { $("#gOk", b).onclick = () => close($("#gN", b).value.trim() || sug); });
    if (nota == null) return;
    if (geo) { W.version = (W.version || 1) + 1; W.cad_pendiente = true; }
    W.historial = W.historial || [];
    if (O.id) W.historial.push({ v: W.version || 1, fecha: hoy(), nota, cambios: ch });
    W.modificado = new Date().toISOString();
    if (W.imagen && String(W.imagen.src).startsWith("data:") && Store.mode === "github") {
      try { toast("Subiendo imagen…"); W.imagen.src = await Store.uploadImage(W.id, W.imagen.src); } catch (e) { toast("No se pudo subir la imagen: " + e.message, 5000); return; }
    }
    $("#bSave").disabled = true; $("#bSave").textContent = "Guardando…";
    try {
      const m = await Store.save("componentes", clone(W), `${W.id} v${W.version || 1}: ${nota}`);
      toast(m === "github" ? "Guardado en GitHub" + (geo ? " · se están regenerando DXF/STEP" : "") : "Guardado en este navegador (modo local)");
    } catch (e) { toast("Quedó guardado localmente. Error al subir: " + e.message, 6000); }
    S.nuevo = null; S.orig = JSON.stringify(W); estadoPill(); vComponente(W.id);
  }
  async function aProyecto(id) {
    const ps = Store.db.proyectos;
    const r = await modal(`<h3>Añadir a proyecto</h3>
      <div><label>Proyecto</label><select id="aP">${ps.map(p => `<option value="${esc(p.id)}">${esc(p.nombre)}</option>`).join("")}<option value="__nuevo">+ Nuevo proyecto…</option></select></div>
      <div class="grid2"><div><label>Cantidad</label><input id="aC" type="number" min="1" value="1"></div><div><label>Nota</label><input id="aN"></div></div>
      <div class="row" style="justify-content:flex-end"><button data-close>Cancelar</button><button class="pri" id="aOk">Añadir</button></div>`, (b, close) => {
      $("#aOk", b).onclick = () => close({ p: $("#aP", b).value, n: +$("#aC", b).value || 1, nota: $("#aN", b).value });
    });
    if (!r) return;
    let p = r.p === "__nuevo" ? await crearProyecto(true) : clone(ps.find(x => x.id === r.p)); if (!p) return;
    const ex = p.bom.find(b => b.id === id); if (ex) ex.cantidad += r.n; else p.bom.push({ id, cantidad: r.n, nota: r.nota });
    p.historial = p.historial || []; p.historial.push({ fecha: hoy(), nota: `Añadido ${id} × ${r.n}` });
    try { await Store.save("proyectos", p, `Proyecto ${p.id}: añadir ${id}`); toast("Añadido a " + p.nombre); } catch (e) { toast("Error: " + e.message, 5000); }
    estadoPill();
  }

  function tab() {
    const body = $("#tabBody"), W = S.W; if (S.ed) { S.ed.destroy(); S.ed = null; }
    const ch = () => S.mark();
    if (S.tab === "ficha") return tabFicha(body, W, ch);
    if (["montaje", "zonas", "pines"].includes(S.tab)) return tabEditor(body, W, ch);
    if (S.tab === "archivos") return tabArchivos(body, W);
    if (S.tab === "versiones") return tabVersiones(body, W);
    if (S.tab === "json") {
      body.innerHTML = `<div class="panel"><textarea id="js" style="min-height:60vh;font:12px ui-monospace,Consolas,monospace">${esc(JSON.stringify(W, null, 2))}</textarea>
        <div class="row" style="margin-top:8px"><button id="jsA" class="pri">Aplicar cambios del JSON</button><button id="jsD">Descargar</button></div></div>`;
      $("#jsA").onclick = () => { try { const o = JSON.parse($("#js").value); if (o.id !== W.id) return toast("No cambies el id aquí; usa Duplicar"); S.W = o; vComponente(W.id); toast("JSON aplicado (falta Guardar)"); } catch (e) { toast("JSON inválido: " + e.message, 5000); } };
      $("#jsD").onclick = () => download(W.id + ".json", JSON.stringify(W, null, 1), "application/json");
    }
  }

  // ---- Ficha
  function tabFicha(body, W, ch) {
    const F = W.ficha = W.ficha || {};
    const fld = (k, lab, ta) => `<div><label>${lab}</label>${ta ? `<textarea data-f="${k}">${esc(F[k] || "")}</textarea>` : `<input data-f="${k}" value="${esc(F[k] || "")}">`}</div>`;
    const bq = encodeURIComponent((W.referencia || W.nombre).replace(/\(.*?\)/g, ""));
    body.innerHTML = `<div class="ficha-grid">
      <div class="side">
        <div class="imgbox" id="imgB">${imgHtml(W, true)}</div>
        <div class="small muted" style="text-align:center">${W.imagen ? esc(W.imagen.origen || "") : W.montaje ? "Vista superior generada del montaje" : ""}</div>
        <div class="row"><label class="btn" style="margin:0">📷 Foto / imagen<input type="file" accept="image/*" capture="environment" id="imgF" hidden></label>
          ${W.imagen ? '<button id="imgX" class="sm">Quitar</button>' : ""}</div>
        <div class="panel"><h3>Clasificación</h3>
          <div><label>Tipo</label><select data-r="tipo">${Object.entries(TIPOS).map(([k, n]) => `<option value="${k}" ${W.tipo === k ? "selected" : ""}>${n}</option>`).join("")}</select></div>
          <div style="margin-top:8px"><label>Categoría</label><input data-r="categoria" list="dlCat2" value="${esc(W.categoria)}"><datalist id="dlCat2">${categorias().map(c => `<option>${esc(c)}</option>`).join("")}</datalist></div>
          <div style="margin-top:8px"><label>Etiquetas (separadas por coma)</label><input id="tags" value="${esc((W.etiquetas || []).join(", "))}"></div>
          <div class="grid2" style="margin-top:8px"><div><label>Fabricante</label><input data-r="fabricante" value="${esc(W.fabricante || "")}"></div><div><label>Referencia</label><input data-r="referencia" value="${esc(W.referencia || "")}"></div></div>
          <div style="margin-top:8px"><label>Unidad</label><input data-r="unidad" value="${esc(W.unidad || "und")}"></div>
        </div>
      </div>
      <div class="side">
        <div class="panel"><h3>Ficha técnica</h3>
          <div><label>Nombre</label><input data-r="nombre" value="${esc(W.nombre)}"></div>
          <div style="margin-top:8px">${fld("descripcion", "Descripción", 1)}</div>
          <div style="margin-top:8px">${fld("funcionamiento", "Funcionamiento", 1)}</div>
          <div class="grid2" style="margin-top:8px">${fld("voltaje", "Voltaje")}${fld("corriente", "Corriente")}${fld("interfaz", "Interfaz")}${fld("dimensiones", "Dimensiones")}${fld("entradas", "Entradas")}${fld("salidas", "Salidas")}</div>
          <div style="margin-top:8px">${fld("datasheet", "Datasheet (URL)")}</div>
          <div class="row small" style="margin-top:4px">${F.datasheet ? `<a href="${esc(F.datasheet)}" target="_blank" rel="noopener">Abrir datasheet ↗</a>` : ""}
            <a href="https://www.google.com/search?q=${bq}+datasheet+pdf" target="_blank" rel="noopener">Buscar datasheet ↗</a>
            <a href="https://www.google.com/search?tbm=isch&q=${bq}" target="_blank" rel="noopener">Buscar imágenes ↗</a></div>
          <div style="margin-top:8px">${fld("notas", "Notas", 1)}</div>
        </div>
        <div class="panel"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Especificaciones</h3><button class="sm" id="esA">+ Fila</button></div>
          <table class="t" style="margin-top:6px"><tr><th>Parámetro</th><th>Valor</th><th></th></tr>${(W.especificaciones || []).map((e, i) => `<tr><td><input data-es="${i}" data-k="param" value="${esc(e.param)}"></td><td><input data-es="${i}" data-k="valor" value="${esc(e.valor)}"></td><td><button class="sm" data-esx="${i}">✕</button></td></tr>`).join("")}</table></div>
        <div class="panel"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Precios y proveedores (COP)</h3><button class="sm" id="prA">+ Proveedor</button></div>
          <table class="t" style="margin-top:6px"><tr><th>Proveedor</th><th class="num">Precio</th><th>Enlace</th><th>Fecha</th><th></th></tr>${(W.precios || []).map((p, i) => `<tr><td><input data-pr="${i}" data-k="proveedor" value="${esc(p.proveedor)}"></td><td><input data-pr="${i}" data-k="precio_cop" type="number" value="${esc(p.precio_cop)}" style="text-align:right"></td>
            <td><div class="row" style="flex-wrap:nowrap"><input data-pr="${i}" data-k="url" value="${esc(p.url || "")}">${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">↗</a>` : ""}</div></td><td><input data-pr="${i}" data-k="fecha" value="${esc(p.fecha || "")}" style="width:90px"></td><td><button class="sm" data-prx="${i}">✕</button></td></tr>`).join("")}</table>
          ${(W.precios || []).some(p => p.estimado) ? '<div class="small muted" style="margin-top:6px">Algunos precios son estimados (nov-2026). Al editarlos se marcan como reales.</div>' : ""}</div>
      </div></div>`;
    $$("[data-f]", body).forEach(i => i.oninput = () => { F[i.dataset.f] = i.value; ch(); });
    $$("[data-r]", body).forEach(i => i.oninput = i.onchange = () => { W[i.dataset.r] = i.value; ch(); });
    $("#tags").oninput = e => { W.etiquetas = e.target.value.split(",").map(s => s.trim()).filter(Boolean); ch(); };
    $$("[data-es]", body).forEach(i => i.oninput = () => { W.especificaciones[+i.dataset.es][i.dataset.k] = i.value; ch(); });
    $$("[data-esx]", body).forEach(b => b.onclick = () => { W.especificaciones.splice(+b.dataset.esx, 1); ch(); tab(); });
    $("#esA").onclick = () => { (W.especificaciones = W.especificaciones || []).push({ param: "", valor: "" }); ch(); tab(); };
    $$("[data-pr]", body).forEach(i => i.oninput = () => { const p = W.precios[+i.dataset.pr]; p[i.dataset.k] = i.dataset.k === "precio_cop" ? +i.value : i.value; delete p.estimado; ch(); });
    $$("[data-prx]", body).forEach(b => b.onclick = () => { W.precios.splice(+b.dataset.prx, 1); ch(); tab(); });
    $("#prA").onclick = () => { (W.precios = W.precios || []).push({ proveedor: "", precio_cop: 0, url: "", fecha: hoy().slice(0, 7) }); ch(); tab(); };
    $("#imgF").onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      const url = await reducirImagen(f, 900); W.imagen = { src: url, origen: "foto (" + hoy() + ")" }; ch(); tab();
      toast(Store.mode === "github" ? "La imagen se sube al guardar" : "Imagen lista (modo local)");
    };
    const x = $("#imgX"); if (x) x.onclick = () => { W.imagen = null; ch(); tab(); };
  }
  function reducirImagen(file, max) {
    return new Promise((res, rej) => {
      const img = new Image(); img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL("image/jpeg", 0.85)); URL.revokeObjectURL(img.src);
      }; img.onerror = rej; img.src = URL.createObjectURL(file);
    });
  }

  // ---- Editor Montaje / Zonas / Pines
  function tabEditor(body, W, ch) {
    const mode = S.tab;
    W.zonas = W.zonas || []; W.pines = W.pines || [];
    body.innerHTML = `<div class="ed-layout"><div id="edHost"></div><div class="side" id="edSide"></div></div>`;
    let selI = null;
    const side = () => {
      const sd = $("#edSide");
      if (mode === "montaje") sideMontaje(sd, W, selI);
      if (mode === "zonas") sideZonas(sd, W, selI);
      if (mode === "pines") sidePines(sd, W, selI);
    };
    const changed = () => { ch(); side(); };
    S.ed = MLEditor.create($("#edHost"), W, {
      mode, toast,
      onChange: () => { ch(); side(); },
      onSelect: i => { selI = i; side(); },
      zoneType: () => S.zoneType || "conector",
      onAction: a => a === "corners" ? dlgEsquinas(W, changed) : dlgFila(W, changed),
    });
    S.sideRefresh = (i) => { if (i !== undefined) { selI = i; S.ed.select(i); } side(); S.ed.redraw(); ch(); };
    side();
  }
  const num = (v, d) => { const n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? d : n; };
  function bindNums(root, obj, after) { $$("[data-n]", root).forEach(i => i.oninput = () => { const k = i.dataset.n; obj[k] = i.type === "number" ? num(i.value, 0) : i.value; after(); }); }

  function sideMontaje(sd, W, sel) {
    const M = W.montaje;
    if (!M || !M.pcb) {
      sd.innerHTML = `<div class="panel"><h3>Montaje</h3><p class="muted">Este elemento no tiene placa definida (ej: herrajes, materiales).</p><button class="pri" id="mOn">Tiene montaje: crear placa</button></div>`;
      $("#mOn").onclick = () => { W.montaje = { origen: "centro", pcb: [30, 20, 1.6], fijacion: "tornillo", agujeros: [], altura_superior: 3, altura_inferior: 0, holgura_inferior_cableado: 0, nota: "" }; S.ed.fit(); S.sideRefresh(); };
      return;
    }
    const h = sel != null ? M.agujeros[sel] : null;
    sd.innerHTML = `<div class="panel"><h3>Placa (origen al centro)</h3>
        <div class="kv"><div><label>Largo X (mm)</label><input type="number" step="0.1" id="pL" value="${M.pcb[0]}"></div><div><label>Ancho Y (mm)</label><input type="number" step="0.1" id="pW" value="${M.pcb[1]}"></div><div><label>Espesor</label><input type="number" step="0.1" id="pT" value="${M.pcb[2] ?? 1.6}"></div></div>
        <div style="margin-top:8px"><label>Fijación</label><select id="pF">${Object.entries(FIJ).map(([k, n]) => `<option value="${k}" ${M.fijacion === k ? "selected" : ""}>${n}</option>`).join("")}</select></div>
        <div class="kv" style="margin-top:8px"><div><label>Alto sobre PCB</label><input type="number" step="0.1" data-n="altura_superior" value="${M.altura_superior ?? 0}"></div><div><label>Bajo PCB</label><input type="number" step="0.1" data-n="altura_inferior" value="${M.altura_inferior ?? 0}"></div><div><label>Holgura cables</label><input type="number" step="1" data-n="holgura_inferior_cableado" value="${M.holgura_inferior_cableado ?? 0}"></div></div>
        <div style="margin-top:8px"><label>Nota</label><textarea data-n="nota">${esc(M.nota || "")}</textarea></div>
        <div class="row" style="margin-top:8px"><button class="sm" id="pR">↻ Rotar 90°</button><button class="sm" id="pM">⇋ Espejo X</button><button class="sm danger" id="pX">Quitar montaje</button></div></div>
      <div class="panel"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Agujeros (${M.agujeros.length})</h3><button class="sm" id="hA">+ Agujero</button></div>
        <div class="list" style="margin-top:8px">${M.agujeros.map((o, i) => `<div class="it ${sel === i ? "sel" : ""}" data-i="${i}"><span class="sw" style="background:#fbbf24;border-radius:50%"></span><b>H${i + 1}</b><span class="muted">x ${o.x} · y ${o.y}</span><span style="margin-left:auto">Ø${o.d}</span></div>`).join("") || '<div class="it muted">Sin agujeros. Usa “+ Agujero” y haz clic en la placa, o “4 esquinas”.</div>'}</div>
        ${h ? `<div class="kv" style="margin-top:10px"><div><label>X (mm)</label><input type="number" step="0.1" id="hx" value="${h.x}"></div><div><label>Y (mm)</label><input type="number" step="0.1" id="hy" value="${h.y}"></div><div><label>Ø (mm)</label><input type="number" step="0.1" id="hd" value="${h.d}"></div></div>
          <div class="row" style="margin-top:6px"><span class="small muted">Tornillo sugerido: ${tornilloPara(h.d)}</span><button class="sm danger" id="hX" style="margin-left:auto">Eliminar</button></div>` : '<div class="small muted" style="margin-top:6px">Arrastra un agujero en la placa o selecciónalo en la lista para editar sus coordenadas.</div>'}
      </div>`;
    const re = () => { S.ed.redraw(); S.mark(); };
    $("#pL").oninput = e => { M.pcb[0] = num(e.target.value, M.pcb[0]); re(); };
    $("#pW").oninput = e => { M.pcb[1] = num(e.target.value, M.pcb[1]); re(); };
    $("#pT").oninput = e => { M.pcb[2] = num(e.target.value, 1.6); re(); };
    $("#pF").onchange = e => { M.fijacion = e.target.value; S.mark(); };
    bindNums(sd, M, () => S.mark());
    $("#pR").onclick = () => { transformar(W, (x, y) => [-y, x], true); S.ed.fit(); S.sideRefresh(); };
    $("#pM").onclick = () => { transformar(W, (x, y) => [-x, y], false); S.sideRefresh(); };
    $("#pX").onclick = async () => { if (await confirmar("¿Quitar el montaje (placa y agujeros)?", "Quitar")) { W.montaje = null; S.sideRefresh(null); } };
    $("#hA").onclick = () => { S.ed.setTool("hole"); toast("Haz clic en la placa donde va el agujero"); };
    $$(".it[data-i]", sd).forEach(it => it.onclick = () => S.sideRefresh(+it.dataset.i));
    if (h) {
      $("#hx").oninput = e => { h.x = num(e.target.value, h.x); re(); }; $("#hy").oninput = e => { h.y = num(e.target.value, h.y); re(); };
      $("#hd").oninput = e => { h.d = num(e.target.value, h.d); re(); };
      $("#hX").onclick = () => { M.agujeros.splice(sel, 1); S.sideRefresh(null); };
    }
  }
  function tornilloPara(d) {
    const t = Store.db.tablas.tornillos || {}; let best = null;
    for (const [m, v] of Object.entries(t)) if (v && v.pasante && v.pasante <= d + 0.15) if (!best || v.pasante > t[best].pasante) best = m;
    return best ? `${best} (pasante ${t[best].pasante} mm)` : "más pequeño que M2.5";
  }
  function transformar(W, fn, rot) {
    const M = W.montaje; if (!M) return;
    if (rot) M.pcb = [M.pcb[1], M.pcb[0], M.pcb[2]];
    for (const h of M.agujeros || []) [h.x, h.y] = fn(h.x, h.y).map(r2);
    for (const p of W.pines || []) if (p.x != null) [p.x, p.y] = fn(p.x, p.y).map(r2);
    const sal = rot ? { "+X": "+Y", "+Y": "-X", "-X": "-Y", "-Y": "+X" } : { "+X": "-X", "-X": "+X" };
    for (const z of W.zonas || []) { [z.cx, z.cy] = fn(z.cx, z.cy).map(r2); if (rot) [z.w, z.h] = [z.h, z.w]; if (sal[z.salida]) z.salida = sal[z.salida]; }
  }
  async function dlgEsquinas(W, done) {
    const M = W.montaje; if (!M) return toast("Primero crea la placa");
    const r = await modal(`<h3>Agujeros en las 4 esquinas</h3><p class="small muted">Se ubican simétricos respecto al centro. Reemplaza los agujeros actuales.</p>
      <div class="kv"><div><label>Margen al borde X (mm)</label><input id="eX" type="number" step="0.1" value="2.5"></div><div><label>Margen al borde Y (mm)</label><input id="eY" type="number" step="0.1" value="2.5"></div><div><label>Ø agujero</label><input id="eD" type="number" step="0.1" value="3"></div></div>
      <div class="row" style="justify-content:flex-end"><button data-close>Cancelar</button><button class="pri" id="eOk">Crear</button></div>`, (b, c) => $("#eOk", b).onclick = () => c({ x: num($("#eX", b).value, 2.5), y: num($("#eY", b).value, 2.5), d: num($("#eD", b).value, 3) }));
    if (!r) return;
    const ax = r2(M.pcb[0] / 2 - r.x), ay = r2(M.pcb[1] / 2 - r.y);
    M.agujeros = [[-ax, -ay], [ax, -ay], [ax, ay], [-ax, ay]].map(([x, y]) => ({ x, y, d: r.d })); S.sideRefresh(null);
  }

  function sideZonas(sd, W, sel) {
    const z = sel != null ? W.zonas[sel] : null, ZT = MLEditor.ZT;
    sd.innerHTML = `<div class="panel"><h3>Nueva zona</h3><div class="row" style="flex-wrap:nowrap"><select id="zT">${Object.entries(ZT).map(([k, v]) => `<option value="${k}" ${(S.zoneType || "conector") === k ? "selected" : ""}>${v.n}</option>`).join("")}</select><button class="pri sm" id="zD">▭ Dibujar</button></div>
        <div class="small muted" style="margin-top:6px">Elige el tipo, pulsa Dibujar y arrastra un rectángulo sobre la placa. Las líneas punteadas muestran la holgura hacia donde sale el cable o conector.</div></div>
      <div class="panel"><h3>Zonas (${W.zonas.length})</h3><div class="list">${W.zonas.map((q, i) => `<div class="it ${sel === i ? "sel" : ""}" data-i="${i}"><span class="sw" style="background:${(ZT[q.tipo] || ZT.otra).c}"></span>${esc(q.nombre || q.tipo)}<span class="muted small" style="margin-left:auto">${MLEditor.SALIDAS[q.salida] ? q.salida : ""}</span></div>`).join("") || '<div class="it muted">Sin zonas</div>'}</div></div>
      ${z ? `<div class="panel"><h3>Zona seleccionada</h3>
        <div class="grid2"><div><label>Tipo</label><select id="zt">${Object.entries(ZT).map(([k, v]) => `<option value="${k}" ${z.tipo === k ? "selected" : ""}>${v.n}</option>`).join("")}</select></div><div><label>Nombre</label><input data-n="nombre" value="${esc(z.nombre || "")}"></div></div>
        <div class="kv" style="margin-top:8px"><div><label>Centro X</label><input type="number" step="0.1" data-n="cx" value="${z.cx}"></div><div><label>Centro Y</label><input type="number" step="0.1" data-n="cy" value="${z.cy}"></div><div></div>
          <div><label>Ancho X</label><input type="number" step="0.1" data-n="w" value="${z.w}"></div><div><label>Alto Y</label><input type="number" step="0.1" data-n="h" value="${z.h}"></div><div></div>
          <div><label>Z desde</label><input type="number" step="0.1" id="z0" value="${(z.z || [0, 0])[0]}"></div><div><label>Z hasta</label><input type="number" step="0.1" id="z1" value="${(z.z || [0, 0])[1]}"></div><div><label>Holgura</label><input type="number" step="1" data-n="holgura" value="${z.holgura ?? 0}"></div></div>
        <div style="margin-top:8px"><label>Hacia dónde sale (cable, conector, dedo)</label><select id="zs">${Object.entries(MLEditor.SALIDAS).map(([k, n]) => `<option value="${k}" ${z.salida === k ? "selected" : ""}>${n}</option>`).join("")}</select></div>
        <div style="margin-top:8px"><label>Regla / nota</label><input data-n="regla" value="${esc(z.regla || "")}"></div>
        ${["usb", "conector"].includes(z.tipo) ? `<div class="grid2" style="margin-top:8px"><div><label>Ventana en carcasa: ancho</label><input type="number" step="0.5" id="vw" value="${(z.ventana || [])[0] ?? ""}"></div><div><label>alto</label><input type="number" step="0.5" id="vh" value="${(z.ventana || [])[1] ?? ""}"></div></div>` : ""}
        <div class="row" style="margin-top:8px"><button class="sm" id="zC">Duplicar</button><button class="sm danger" id="zX">Eliminar</button></div></div>` : ""}`;
    $("#zT").onchange = e => S.zoneType = e.target.value;
    $("#zD").onclick = () => { S.zoneType = $("#zT").value; S.ed.setTool("zone"); toast("Arrastra sobre la placa para dibujar la zona"); };
    $$(".it[data-i]", sd).forEach(it => it.onclick = () => S.sideRefresh(+it.dataset.i));
    if (z) {
      const re = () => { S.ed.redraw(); S.mark(); };
      bindNums(sd, z, re);
      $("#zt").onchange = e => { const old = ZT[z.tipo]; if (!z.nombre || (old && z.nombre === old.n)) z.nombre = ZT[e.target.value].n; z.tipo = e.target.value; S.sideRefresh(sel); };
      $("#zs").onchange = e => { z.salida = e.target.value; re(); };
      $("#z0").oninput = e => { z.z = [num(e.target.value, 0), (z.z || [0, 0])[1]]; S.mark(); };
      $("#z1").oninput = e => { z.z = [(z.z || [0, 0])[0], num(e.target.value, 0)]; S.mark(); };
      const vw = $("#vw"), vh = $("#vh"); if (vw) { const v = () => { z.ventana = [num(vw.value, 0), num(vh.value, 0)]; S.mark(); }; vw.oninput = v; vh.oninput = v; }
      $("#zC").onclick = () => { const c = clone(z); c.cx = r2(c.cx + 2); c.cy = r2(c.cy - 2); W.zonas.push(c); S.sideRefresh(W.zonas.length - 1); };
      $("#zX").onclick = () => { W.zonas.splice(sel, 1); S.sideRefresh(null); };
    }
  }

  function sidePines(sd, W, sel) {
    const p = sel != null ? W.pines[sel] : null, sin = W.pines.filter(q => q.x == null).length;
    sd.innerHTML = `<div class="panel"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Pines (${W.pines.length})</h3><div class="row"><button class="sm" id="pA">+ Pin</button><button class="sm" id="pF">⋯ Fila de header</button></div></div>
        ${sin ? `<div class="msg warn">${sin} pin(es) sin ubicar. Selecciona uno y usa <b>• Colocar pin</b> para hacer clic en su posición; avanza solo al siguiente.</div>` : ""}
        <div class="list" style="max-height:380px">${W.pines.map((q, i) => `<div class="it ${sel === i ? "sel" : ""}" data-i="${i}"><span class="sw" style="background:${MLEditor.pinColor(q)};border-radius:50%"></span><b style="min-width:42px">${esc(q.n)}</b><span class="muted small" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(q.func || "")}</span><span class="small" style="margin-left:auto;color:${q.x == null ? "var(--warn)" : "var(--ink3)"}">${q.x == null ? "sin ubicar" : q.x + ", " + q.y}</span></div>`).join("") || '<div class="it muted">Sin pines</div>'}</div></div>
      ${p ? `<div class="panel"><h3>Pin seleccionado</h3>
        <div class="grid2"><div><label>Nombre</label><input data-n="n" value="${esc(p.n)}"></div><div><label>Conector</label><input data-n="conector" value="${esc(p.conector || "")}" placeholder="header 2.54 abajo"></div></div>
        <div style="margin-top:8px"><label>Función</label><input data-n="func" value="${esc(p.func || "")}"></div>
        <div class="kv" style="margin-top:8px"><div><label>X</label><input type="number" step="0.01" id="px" value="${p.x ?? ""}"></div><div><label>Y</label><input type="number" step="0.01" id="py" value="${p.y ?? ""}"></div><div></div></div>
        <div class="row" style="margin-top:8px"><button class="sm" id="pC">• Colocar con clic</button><button class="sm" id="pU">Quitar posición</button><button class="sm" id="pUp">↑</button><button class="sm" id="pDn">↓</button><button class="sm danger" id="pX">Eliminar</button></div></div>` : ""}`;
    $$(".it[data-i]", sd).forEach(it => it.onclick = () => S.sideRefresh(+it.dataset.i));
    $("#pA").onclick = () => { W.pines.push({ n: "P" + (W.pines.length + 1), func: "", x: null, y: null }); S.sideRefresh(W.pines.length - 1); S.ed.setTool("pin"); };
    $("#pF").onclick = () => dlgFila(W, () => S.sideRefresh(null));
    if (p) {
      const re = () => { S.ed.redraw(); S.mark(); };
      bindNums(sd, p, re);
      $("#px").oninput = e => { p.x = e.target.value === "" ? null : num(e.target.value, 0); re(); };
      $("#py").oninput = e => { p.y = e.target.value === "" ? null : num(e.target.value, 0); re(); };
      $("#pC").onclick = () => { S.ed.setTool("pin"); toast("Haz clic en la placa donde está " + p.n); };
      $("#pU").onclick = () => { p.x = null; p.y = null; S.sideRefresh(sel); };
      $("#pUp").onclick = () => { if (sel > 0) { W.pines.splice(sel - 1, 0, W.pines.splice(sel, 1)[0]); S.sideRefresh(sel - 1); } };
      $("#pDn").onclick = () => { if (sel < W.pines.length - 1) { W.pines.splice(sel + 1, 0, W.pines.splice(sel, 1)[0]); S.sideRefresh(sel + 1); } };
      $("#pX").onclick = () => { W.pines.splice(sel, 1); S.sideRefresh(null); };
    }
  }
  async function dlgFila(W, done) {
    const sinU = W.pines.filter(p => p.x == null).map(p => p.n);
    const r = await modal(`<h3>Fila de header</h3><p class="small muted">Ubica varios pines en línea (ej. un header 1×19 de un ESP32). El primer pin queda en X, Y inicial.</p>
      <div class="kv"><div><label>Cantidad</label><input id="fN" type="number" value="${sinU.length || 4}"></div><div><label>Paso (mm)</label><input id="fP" type="number" step="0.01" value="2.54"></div><div><label>Dirección</label><select id="fD"><option value="x">→ +X</option><option value="-x">← −X</option><option value="y">↑ +Y</option><option value="-y">↓ −Y</option></select></div>
      <div><label>X inicial</label><input id="fX" type="number" step="0.01" value="0"></div><div><label>Y inicial</label><input id="fY" type="number" step="0.01" value="0"></div><div><label>Centrar en X/Y</label><select id="fC"><option value="0">No</option><option value="1">Sí (X/Y = centro de la fila)</option></select></div></div>
      <div><label>Nombres (separados por coma). Vacío = usar los pines sin ubicar en orden${sinU.length ? ` (${esc(sinU.slice(0, 6).join(", "))}${sinU.length > 6 ? "…" : ""})` : ""}</label><textarea id="fNm" placeholder="3V3, GND, D15, D2, …"></textarea></div>
      <div class="row" style="justify-content:flex-end"><button data-close>Cancelar</button><button class="pri" id="fOk">Aplicar</button></div>`, (b, c) => $("#fOk", b).onclick = () => c({
      n: Math.max(1, num($("#fN", b).value, 1) | 0), p: num($("#fP", b).value, 2.54), d: $("#fD", b).value, x: num($("#fX", b).value, 0), y: num($("#fY", b).value, 0), c: $("#fC", b).value === "1",
      nombres: $("#fNm", b).value.split(",").map(s => s.trim()).filter(Boolean),
    }));
    if (!r) return;
    const [dx, dy] = { x: [1, 0], "-x": [-1, 0], y: [0, 1], "-y": [0, -1] }[r.d];
    const off = r.c ? -(r.n - 1) / 2 * r.p : 0;
    const objetivo = [];
    if (r.nombres.length) { for (const nm of r.nombres.slice(0, r.n)) { let q = W.pines.find(p => p.n === nm && p.x == null); if (!q) { q = { n: nm, func: "", x: null, y: null }; W.pines.push(q); } objetivo.push(q); } }
    else { for (const q of W.pines) if (q.x == null && objetivo.length < r.n) objetivo.push(q); while (objetivo.length < r.n) { const q = { n: "P" + (W.pines.length + 1), func: "", x: null, y: null }; W.pines.push(q); objetivo.push(q); } }
    objetivo.forEach((q, i) => { q.x = r2(r.x + dx * (off + i * r.p)); q.y = r2(r.y + dy * (off + i * r.p)); });
    done && done(); toast(`${objetivo.length} pines ubicados`);
  }

  // ---- Archivos CAD
  function tabArchivos(body, W) {
    const A = W.archivos || {};
    const nombres = { step: "Modelo 3D (STEP)", dxf: "Plano (DXF)", step_montaje: "STEP de montaje (placa + agujeros + zonas)", dxf_huella: "DXF de huella (origen al centro)" };
    const gh = `https://github.com/${Store.cfg.owner}/${Store.cfg.repo}`;
    body.innerHTML = `<div class="grid2">
      <div class="panel"><h3>Archivos CAD</h3>
        <table class="t"><tr><th>Archivo</th><th>Nombre</th><th>Versión</th></tr>${Object.entries(A).map(([k, a]) => `<tr><td>${nombres[k] || k}</td><td>${a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.nombre || "abrir")} ↗</a>` : esc(a.nombre || "")}<div class="small muted">${esc(a.carpeta || "")}</div></td><td>${a.version ? "v" + a.version : ""}</td></tr>`).join("") || '<tr><td colspan="3" class="muted">Sin archivos todavía</td></tr>'}</table>
        ${Object.values(A).some(a => String(a.carpeta || "").includes("repositorio"))
          ? `<div class="msg info" style="margin-top:10px">Los archivos de montaje se guardan en <b>GitHub</b> (<code>archivos/${esc(W.id)}</code>); al hacer clic se descargan. Con el <b>sincronizador de MountLab</b> instalado en tu PC también llegan solos (cada 10 min) a <b>D:\\Mi unidad\\MountLab\\biblioteca\\archivos\\${esc(W.id)}\\</b> para abrirlos en SolidWorks.</div>`
          : `<div class="msg info" style="margin-top:10px">En tu PC los encuentras en <b>D:\\Mi unidad\\MountLab\\biblioteca\\archivos\\${esc(W.id)}\\</b> (Drive para escritorio) para abrirlos directo en SolidWorks.</div>`}
        ${W.cad_pendiente ? '<div class="msg warn">Hay cambios de geometría pendientes de regenerar en CAD.</div>' : ""}</div>
      <div class="panel"><h3>Generar</h3>
        <p class="small muted">El DXF de huella se puede bajar ya mismo desde aquí (lo genera el navegador). El STEP de montaje lo genera GitHub con CadQuery al guardar cambios de geometría, y lo sube a Drive como versión nueva.</p>
        <div class="row"><button class="pri" id="bDxf" ${W.montaje ? "" : "disabled"}>Descargar DXF de huella (v${W.version || 1})</button>
        <button id="bCad" ${Store.mode === "github" && W.montaje ? "" : "disabled"}>Regenerar DXF + STEP en GitHub</button></div>
        ${Store.mode !== "github" ? '<div class="small muted" style="margin-top:6px">Para regenerar en GitHub configura el token en Ajustes.</div>' : `<div class="small" style="margin-top:6px"><a href="${gh}/actions" target="_blank" rel="noopener">Ver ejecuciones en GitHub Actions ↗</a></div>`}
        <h3 style="margin-top:16px">Convenciones</h3><ul class="small muted" style="margin:0;padding-left:18px"><li>Unidades en mm; origen (0,0) en el centro de la placa; X a lo largo, Y a lo ancho, Z hacia arriba desde la cara inferior del PCB.</li><li>Capas DXF: PCB, AGUJEROS, ZONAS, ZONAS_HOLGURA, PINES, EJES, TEXTO.</li><li>Cada cambio de geometría crea un archivo nuevo: <code>${esc(W.id)}_v${(W.version || 1)}_huella.dxf</code>; las versiones anteriores no se borran.</li></ul></div></div>`;
    $("#bDxf").onclick = () => download(`${W.id}_v${W.version || 1}_huella.dxf`, MLDxf.componenteADxf(W), "application/dxf");
    $("#bCad").onclick = async () => {
      if (dirty()) return toast("Guarda primero los cambios");
      try { await Store.dispatch("datos.yml", { id: W.id }); toast("Listo: GitHub está regenerando los archivos (1–3 min)"); } catch (e) { toast("Error: " + e.message, 6000); }
    };
  }
  function tabVersiones(body, W) {
    const gh = `https://github.com/${Store.cfg.owner}/${Store.cfg.repo}/commits/${Store.cfg.branch}/data/componentes/${W.id}.json`;
    body.innerHTML = `<div class="panel"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Historial de versiones</h3><a href="${gh}" target="_blank" rel="noopener" class="small">Ver todos los cambios en GitHub ↗</a></div>
      <table class="t" style="margin-top:8px"><tr><th>Versión</th><th>Fecha</th><th>Nota</th><th>Cambios</th></tr>${(W.historial || []).slice().reverse().map(h => `<tr><td><b>v${h.v ?? ""}</b></td><td class="small">${esc(h.fecha || "")}</td><td>${esc(h.nota || "")}</td><td class="small muted">${esc((h.cambios || []).join(", "))}</td></tr>`).join("")}</table></div>`;
  }

  // =====================================================================  PROYECTOS
  function totalesBom(p) {
    const prov = {}; let barato = 0, sinPrecio = 0;
    for (const b of p.bom || []) {
      const c = comp(b.id); if (!c) continue; const pm = precioMin(c);
      if (pm) barato += pm.precio_cop * b.cantidad; else sinPrecio++;
      for (const pr of c.precios || []) if (+pr.precio_cop > 0) prov[pr.proveedor] = (prov[pr.proveedor] || 0) + pr.precio_cop * b.cantidad;
    }
    return { prov, barato, sinPrecio };
  }
  function vProyectos() {
    const ps = Store.db.proyectos;
    app.innerHTML = `<div class="row" style="justify-content:space-between;margin-bottom:12px"><h2>Proyectos</h2><button class="pri" id="pNew">+ Nuevo proyecto</button></div>
      <div class="pcards">${ps.map(p => { const t = totalesBom(p); return `<div class="card" data-id="${esc(p.id)}"><div class="bd" style="gap:8px"><div class="row" style="justify-content:space-between"><div class="nm" style="font-size:15px">${esc(p.nombre)}</div><span class="tag">${esc(ESTP[p.estado] || p.estado || "")}</span></div>
        <div class="small muted">${esc((p.descripcion || "").slice(0, 140))}</div>
        <div class="ft"><span>${(p.bom || []).length} referencias · ${(p.bom || []).reduce((a, b) => a + (+b.cantidad || 0), 0)} unidades</span><span>${cop(t.barato)}</span></div></div></div>`; }).join("") || '<div class="panel muted">Aún no hay proyectos.</div>'}</div>`;
    $$(".card[data-id]").forEach(d => d.onclick = () => location.hash = "#/p/" + encodeURIComponent(d.dataset.id));
    $("#pNew").onclick = async () => { const p = await crearProyecto(false); if (p) location.hash = "#/p/" + encodeURIComponent(p.id); };
  }
  async function crearProyecto(silencioso) {
    const r = await modal(`<h3>Nuevo proyecto</h3><div><label>Nombre</label><input id="qN"></div><div><label>Descripción</label><textarea id="qD"></textarea></div>
      <div class="row" style="justify-content:flex-end"><button data-close>Cancelar</button><button class="pri" id="qOk">Crear</button></div>`, (b, c) => { $("#qOk", b).onclick = () => { const n = $("#qN", b).value.trim(); if (!n) return toast("Escribe un nombre"); c({ n, d: $("#qD", b).value }); }; setTimeout(() => $("#qN", b).focus(), 50); });
    if (!r) return null;
    let id = slug(r.n).replace(/_/g, "-"); while (Store.db.proyectos.some(p => p.id === id)) id += "-2";
    const p = { id, nombre: r.n, estado: "idea", descripcion: r.d, creado: hoy(), bom: [], documentacion: "", historial: [{ fecha: hoy(), nota: "Creado" }] };
    if (!silencioso) { try { await Store.save("proyectos", p, `Proyecto ${id}: creado`); } catch (e) { toast("Error: " + e.message, 5000); } estadoPill(); }
    return p;
  }
  function vProyecto(id) {
    const o = Store.db.proyectos.find(p => p.id === id);
    if (!o) { app.innerHTML = `<div class="panel">No existe el proyecto. <a href="#/proyectos">Volver</a></div>`; return; }
    const P = clone(o), O = JSON.stringify(o); P.bom = P.bom || [];
    const pinta = () => {
      const t = totalesBom(P), sucio = JSON.stringify(P) !== O;
      app.innerHTML = `<div class="det-head"><div><div class="small"><a href="#/proyectos">← Proyectos</a></div><input id="pNm" value="${esc(P.nombre)}" style="font-size:20px;font-weight:700;border:none;padding:4px 0;background:none"></div>
        <div class="row">${sucio ? '<span class="dirty">Cambios sin guardar</span>' : ""}<button class="pri" id="pSv" ${sucio ? "" : "disabled"}>Guardar</button><button id="pCsv">Exportar BOM (CSV)</button><button id="pDup">Duplicar</button><button class="danger" id="pDel">Eliminar</button></div></div>
        <div class="grid2" style="grid-template-columns:2fr 1fr;align-items:start">
          <div class="side">
            <div class="panel"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Lista de materiales (BOM)</h3><div class="picker" style="width:320px"><input id="pk" placeholder="+ Añadir componente: buscar…"><div class="res hide" id="pkR"></div></div></div>
              <div style="overflow:auto;margin-top:8px"><table class="t"><tr><th></th><th>Componente</th><th class="num">Cant.</th><th>Nota</th><th class="num">Unitario</th><th class="num">Subtotal</th><th></th></tr>
              ${P.bom.map((b, i) => { const c = comp(b.id), pm = c && precioMin(c); return `<tr><td style="width:44px"><div style="width:40px;height:30px;display:flex;align-items:center;justify-content:center;overflow:hidden">${c ? imgHtml(c).replace("<svg ", '<svg style="max-width:40px;max-height:30px" ').replace("<img ", '<img style="max-width:40px;max-height:30px" ') : ""}</div></td>
                <td>${c ? `<a href="#/c/${esc(c.id)}">${esc(c.nombre)}</a><div class="small muted">${esc(c.categoria)}</div>` : `<span class="tag bad">${esc(b.id)} no existe</span>`}</td>
                <td class="num" style="width:80px"><input type="number" min="0" data-b="${i}" data-k="cantidad" value="${b.cantidad}" style="text-align:right"></td>
                <td><input data-b="${i}" data-k="nota" value="${esc(b.nota || "")}"></td><td class="num small">${pm ? cop(pm.precio_cop) + `<div class="muted">${esc(pm.proveedor)}</div>` : "—"}</td><td class="num">${pm ? cop(pm.precio_cop * b.cantidad) : "—"}</td><td><button class="sm" data-bx="${i}">✕</button></td></tr>`; }).join("") || '<tr><td colspan="7" class="muted">Busca y añade componentes arriba.</td></tr>'}
              </table></div></div>
            <div class="panel"><h3>Documentación del proyecto</h3><textarea id="pDoc" style="min-height:180px" placeholder="Objetivo, requisitos, decisiones, enlaces a planos, pruebas…">${esc(P.documentacion || "")}</textarea></div>
          </div>
          <div class="side">
            <div class="panel"><h3>Datos</h3><div><label>Estado</label><select id="pEs">${Object.entries(ESTP).map(([k, n]) => `<option value="${k}" ${P.estado === k ? "selected" : ""}>${n}</option>`).join("")}</select></div>
              <div style="margin-top:8px"><label>Descripción</label><textarea id="pDs">${esc(P.descripcion || "")}</textarea></div><div class="small muted" style="margin-top:6px">Creado ${esc(P.creado || "")}</div></div>
            <div class="panel"><h3>Costo estimado</h3><table class="t"><tr><td>Mezcla más barata</td><td class="num"><b>${cop(t.barato)}</b></td></tr>${Object.entries(t.prov).map(([k, v]) => `<tr><td>Todo en ${esc(k)}</td><td class="num">${cop(v)}</td></tr>`).join("")}</table>
              ${t.sinPrecio ? `<div class="small muted" style="margin-top:6px">${t.sinPrecio} referencia(s) sin precio.</div>` : ""}</div>
            <div class="panel"><h3>Historial</h3>${(P.historial || []).slice().reverse().slice(0, 12).map(h => `<div class="small" style="margin-bottom:4px"><span class="muted">${esc(h.fecha)}</span> · ${esc(h.nota)}</div>`).join("")}</div>
          </div></div>`;
      const set = () => { pinta(); };
      $("#pNm").oninput = e => { P.nombre = e.target.value; };
      $("#pNm").onchange = set;
      $("#pEs").onchange = e => { P.estado = e.target.value; set(); };
      $("#pDs").onchange = e => { P.descripcion = e.target.value; set(); };
      $("#pDoc").onchange = e => { P.documentacion = e.target.value; set(); };
      $$("[data-b]").forEach(i => i.onchange = () => { const b = P.bom[+i.dataset.b]; b[i.dataset.k] = i.dataset.k === "cantidad" ? Math.max(0, +i.value) : i.value; set(); });
      $$("[data-bx]").forEach(x => x.onclick = () => { const b = P.bom.splice(+x.dataset.bx, 1)[0]; P.historial.push({ fecha: hoy(), nota: "Quitado " + b.id }); set(); });
      const pk = $("#pk"), res = $("#pkR");
      pk.oninput = () => {
        const q = pk.value.trim().toLowerCase(); if (!q) { res.classList.add("hide"); return; }
        const L = Store.db.componentes.filter(c => (c.nombre + " " + c.id + " " + c.categoria + " " + (c.etiquetas || []).join(" ")).toLowerCase().includes(q)).slice(0, 12);
        res.innerHTML = L.map(c => `<div data-id="${esc(c.id)}"><span>${esc(c.nombre)}</span><span class="muted small">${esc(c.categoria)}</span></div>`).join("") || '<div class="muted">Sin resultados</div>';
        res.classList.remove("hide");
        $$("[data-id]", res).forEach(d => d.onclick = () => { const ex = P.bom.find(b => b.id === d.dataset.id); if (ex) ex.cantidad++; else P.bom.push({ id: d.dataset.id, cantidad: 1, nota: "" }); P.historial = P.historial || []; P.historial.push({ fecha: hoy(), nota: "Añadido " + d.dataset.id }); set(); });
      };
      $("#pSv").onclick = async () => {
        try { const m = await Store.save("proyectos", clone(P), `Proyecto ${P.id}: actualizado`); toast(m === "github" ? "Proyecto guardado en GitHub" : "Guardado en modo local"); } catch (e) { toast("Guardado local. Error al subir: " + e.message, 6000); }
        estadoPill(); vProyecto(P.id);
      };
      $("#pCsv").onclick = () => {
        const rows = [["Item", "Id", "Componente", "Categoría", "Cantidad", "Unidad", "Proveedor", "Precio unitario COP", "Subtotal COP", "Enlace", "Nota"]];
        P.bom.forEach((b, i) => { const c = comp(b.id) || {}, pm = precioMin(c); rows.push([i + 1, b.id, c.nombre || "", c.categoria || "", b.cantidad, c.unidad || "", pm ? pm.proveedor : "", pm ? pm.precio_cop : "", pm ? pm.precio_cop * b.cantidad : "", pm ? pm.url : "", b.nota || ""]); });
        download(`BOM_${P.id}.csv`, "\ufeff" + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n"), "text/csv");
      };
      $("#pDup").onclick = async () => { const n = clone(P); n.id = P.id + "-copia"; n.nombre = P.nombre + " (copia)"; n.creado = hoy(); n.historial = [{ fecha: hoy(), nota: "Copia de " + P.id }]; try { await Store.save("proyectos", n, `Proyecto ${n.id}: copia de ${P.id}`); } catch (e) { toast(e.message); } location.hash = "#/p/" + n.id; };
      $("#pDel").onclick = async () => { if (!(await confirmar(`¿Eliminar el proyecto <b>${esc(P.nombre)}</b>? Los componentes no se borran.`, "Eliminar"))) return; try { await Store.remove("proyectos", P.id, `Eliminar proyecto ${P.id}`); } catch (e) { toast(e.message); } estadoPill(); location.hash = "#/proyectos"; };
    };
    pinta();
  }

  // =====================================================================  PENDIENTES
  function getPath(o, p) { return p.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o); }
  function setPath(o, p, v) { const ks = p.split("."); let a = o; ks.slice(0, -1).forEach(k => { a[k] = a[k] ?? {}; a = a[k]; }); a[ks.at(-1)] = v; }
  const show = v => v == null || v === "" ? '<span class="muted">(vacío)</span>' : typeof v === "object" ? `<pre style="margin:0;white-space:pre-wrap;font-size:11.5px">${esc(JSON.stringify(v, null, 1))}</pre>` : /^https?:/.test(v) ? `<a href="${esc(v)}" target="_blank" rel="noopener">${esc(String(v).slice(0, 70))}</a>` : esc(v);
  function vPendientes() {
    const L = Store.db.pendientes;
    app.innerHTML = `<div class="row" style="justify-content:space-between;margin-bottom:6px"><h2>Pendientes por aprobar</h2></div>
      <p class="muted" style="margin-top:0">Aquí llega la información que se descarga automáticamente (fotos, datasheets, precios, proveedores). No se guarda en la biblioteca hasta que la apruebes.</p>
      ${L.length ? L.map((p, i) => { const c = comp(p.componente); return `<div class="panel" style="margin-bottom:12px"><div class="row" style="justify-content:space-between"><div><b>${c ? `<a href="#/c/${esc(c.id)}">${esc(c.nombre)}</a>` : esc(p.componente) + ' <span class="tag bad">nuevo / no existe</span>'}</b> <span class="small muted">· ${esc(p.fuente || "")} · ${esc(p.fecha || "")}</span></div>
        <div class="row"><button class="sm" data-all="${i}">Marcar todo</button><button class="pri sm" data-ok="${i}">Aprobar seleccionados</button><button class="sm danger" data-no="${i}">Rechazar todo</button></div></div>
        <div class="diff" style="margin-top:10px"><div class="h">Campo</div><div class="h">Actual</div><div class="h">Propuesto</div>
        ${Object.entries(p.cambios || {}).map(([k, v]) => `<div><label class="row" style="gap:6px;margin:0;color:var(--ink)"><input type="checkbox" data-p="${i}" data-k="${esc(k)}" style="width:auto">${esc(k)}</label></div><div class="old">${show(c ? getPath(c, k) : null)}</div><div class="new">${k === "imagen.src" && v ? `<img src="${esc(v)}" style="max-height:100px">` : show(v)}</div>`).join("")}</div></div>`; }).join("") : '<div class="panel muted">No hay nada pendiente. 🎉</div>'}`;
    $$("[data-all]").forEach(b => b.onclick = () => $$(`[data-p="${b.dataset.all}"]`).forEach(x => x.checked = true));
    $$("[data-no]").forEach(b => b.onclick = async () => { const p = L[+b.dataset.no]; try { await Store.remove("pendientes", p.id, `Rechazar propuesta ${p.id}`); } catch (e) { toast(e.message); } estadoPill(); vPendientes(); });
    $$("[data-ok]").forEach(b => b.onclick = async () => {
      const i = +b.dataset.ok, p = L[i], ks = $$(`[data-p="${i}"]`).filter(x => x.checked).map(x => x.dataset.k);
      if (!ks.length) return toast("Marca al menos un campo");
      let c = comp(p.componente); c = c ? clone(c) : { id: p.componente, nombre: p.componente, tipo: "electronico", categoria: "Otros", estado: "borrador", version: 1, ficha: {}, precios: [], zonas: [], pines: [], archivos: {}, historial: [] };
      for (const k of ks) { const v = p.cambios[k]; if (k === "precios" && Array.isArray(v)) { const ex = c.precios || []; for (const nv of v) { const j = ex.findIndex(x => x.proveedor === nv.proveedor); if (j >= 0) ex[j] = nv; else ex.push(nv); } c.precios = ex; } else setPath(c, k, v); }
      c.historial = c.historial || []; c.historial.push({ v: c.version || 1, fecha: hoy(), nota: `Aprobado de ${p.fuente || "búsqueda automática"}: ${ks.join(", ")}` });
      try {
        await Store.save("componentes", c, `${c.id}: aprobar datos de ${p.fuente || "búsqueda"} (${ks.join(", ")})`);
        const resto = Object.keys(p.cambios).filter(k => !ks.includes(k));
        if (resto.length) { const q = clone(p); resto.length; q.cambios = Object.fromEntries(resto.map(k => [k, p.cambios[k]])); await Store.save("pendientes", q, `Pendiente ${p.id}: quedan ${resto.length}`); }
        else await Store.remove("pendientes", p.id, `Pendiente ${p.id} aprobado`);
        toast("Aprobado y guardado");
      } catch (e) { toast("Error: " + e.message, 5000); }
      estadoPill(); vPendientes();
    });
  }

  // =====================================================================  ASISTENTE IA
  function contextoCatalogo() {
    return Store.db.componentes.map(c => { const pm = precioMin(c), F = c.ficha || {}; return [c.id, c.nombre, c.categoria, TIPOS[c.tipo], F.voltaje, F.corriente, F.interfaz, F.dimensiones, (c.etiquetas || []).join("/"), pm ? "desde " + pm.precio_cop + " COP" : "", c.estado === "verificado" ? "verificado" : "", (F.descripcion || "").slice(0, 160)].filter(Boolean).join(" | "); }).join("\n");
  }
  function vAsistente() {
    const sinKey = !Store.cfg.aiKey;
    app.innerHTML = `<div class="chat"><div class="row" style="justify-content:space-between"><h2>Asistente IA</h2><span class="small muted">Conoce tus ${Store.db.componentes.length} componentes y ${Store.db.proyectos.length} proyectos</span></div>
      ${sinKey ? '<div class="msg warn">Para usar el asistente agrega tu clave de la API de Anthropic en <a href="#/ajustes">Ajustes</a>. Se guarda solo en este navegador.</div>' : ""}
      <div class="log" id="log">${S.chat.length ? "" : `<div class="muted small" style="text-align:center;margin-top:20px">Ejemplos:</div><div class="row" style="justify-content:center">${["¿Qué sensores I2C tengo y a qué voltaje funcionan?", "Necesito un datalogger con GPS, IMU y batería 2S: ¿qué componentes uso?", "Resúmeme el BNO055 para decidir si lo uso", "¿Qué me falta comprar para el proyecto Termo-01?"].map(e => `<button class="sm ex">${esc(e)}</button>`).join("")}</div>`}</div>
      <div class="in"><textarea id="q" rows="2" placeholder="Pregunta, pide una recomendación o un resumen técnico…" ${sinKey ? "disabled" : ""}></textarea><button class="pri" id="send" ${sinKey ? "disabled" : ""}>Enviar</button></div></div>`;
    const log = $("#log");
    const fmt = t => esc(t).replace(/\[\[([a-z0-9_]+)\]\]/g, (m, id) => comp(id) ? `<a class="cref" href="#/c/${id}">${esc(comp(id).nombre)}</a>` : m).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    const pintaLog = () => { if (!S.chat.length) return; log.innerHTML = S.chat.map(m => `<div class="bub ${m.role === "user" ? "u" : "a"}">${m.role === "user" ? esc(m.content) : fmt(m.content)}</div>`).join(""); log.scrollTop = log.scrollHeight; };
    pintaLog();
    $$(".ex").forEach(b => b.onclick = () => { if (!sinKey) { $("#q").value = b.textContent; enviar(); } });
    $("#q").onkeydown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } };
    $("#send").onclick = enviar;
    async function enviar() {
      const q = $("#q").value.trim(); if (!q) return; $("#q").value = "";
      S.chat.push({ role: "user", content: q }); S.chat.push({ role: "assistant", content: "…" }); pintaLog();
      const proys = Store.db.proyectos.map(p => `${p.id} "${p.nombre}" (${p.estado}): ` + (p.bom || []).map(b => `${b.id}×${b.cantidad}`).join(", ")).join("\n");
      const system = `Eres el asistente de MountLab, la biblioteca de componentes de John (estudiante de ingeniería biomédica/mecatrónica en Colombia, diseña dispositivos con ESP32, KiCad y SolidWorks). Responde en español, breve y técnico.
Cuando menciones un componente de la biblioteca escribe su id entre dobles corchetes, por ejemplo [[esp32_38p]], para que la app lo convierta en enlace.
Para recomendaciones: prioriza lo que ya tiene en la biblioteca, revisa compatibilidad de voltajes (3.3 V vs 5 V), interfaces y consumo, y di claramente qué le falta comprar. Los precios son estimados en COP.
Si algo no está en la biblioteca, dilo y sugiere el tipo de componente genérico. No inventes datos de la biblioteca.

BIBLIOTECA (id | nombre | categoría | tipo | voltaje | corriente | interfaz | dimensiones | etiquetas | precio | estado | descripción):
${contextoCatalogo()}

PROYECTOS:
${proys}`;
      try {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST", headers: { "content-type": "application/json", "x-api-key": Store.cfg.aiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
          body: JSON.stringify({ model: Store.cfg.aiModel || "claude-sonnet-5-5", max_tokens: 1500, system, messages: S.chat.slice(0, -1).slice(-12) }),
        });
        const j = await r.json(); if (!r.ok) throw new Error((j.error && j.error.message) || r.status);
        S.chat[S.chat.length - 1].content = (j.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
      } catch (e) { S.chat[S.chat.length - 1].content = "No pude responder: " + e.message; }
      pintaLog();
    }
  }

  // =====================================================================  AJUSTES
  function vAjustes() {
    const c = Store.cfg, n = Store.localPendientes();
    app.innerHTML = `<h2 style="margin-bottom:12px">Ajustes</h2><div class="grid2" style="align-items:start">
      <div class="panel"><h3>GitHub (datos y versiones)</h3>
        <div class="grid3"><div><label>Usuario u organización</label><input id="gO" value="${esc(c.owner)}"></div><div><label>Repositorio</label><input id="gR" value="${esc(c.repo)}"></div><div><label>Rama</label><input id="gB" value="${esc(c.branch)}"></div></div>
        <div style="margin-top:8px"><label>Token personal (fine-grained) · se guarda solo en este dispositivo</label><input id="gT" type="password" value="${esc(c.token)}" placeholder="github_pat_…"></div>
        <div class="row" style="margin-top:8px"><button class="pri" id="gS">Guardar y conectar</button><button id="gX">Olvidar token</button><span class="small muted" id="gMsg">${esc(Store.mode === "github" ? "Conectado a " + c.owner + "/" + c.repo : Store.error || "")}</span></div>
        <details style="margin-top:10px"><summary class="small">Cómo crear el token (una vez por dispositivo)</summary><ol class="small muted" style="padding-left:18px">
          <li>GitHub → foto de perfil → <b>Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token</b>.</li>
          <li>Repository access: <b>Only select repositories</b> → elige <b>${esc(c.repo)}</b>.</li>
          <li>Permisos de repositorio: <b>Contents: Read and write</b> y <b>Actions: Read and write</b>.</li>
          <li>Copia el token y pégalo aquí. En el celular haz lo mismo (o genera otro token).</li></ol></details>
        ${n ? `<div class="msg warn" style="margin-top:10px">Hay ${n} cambio(s) hechos en modo local sin subir. <button class="sm" id="gSync">Subir ahora</button></div>` : ""}</div>
      <div class="panel"><h3>Asistente IA</h3>
        <div><label>Clave API de Anthropic · se guarda solo en este dispositivo</label><input id="aK" type="password" value="${esc(c.aiKey)}" placeholder="sk-ant-…"></div>
        <div style="margin-top:8px"><label>Modelo</label><input id="aM" value="${esc(c.aiModel)}"></div>
        <div class="row" style="margin-top:8px"><button class="pri" id="aS">Guardar</button></div>
        <div class="small muted" style="margin-top:6px">La clave se crea en console.anthropic.com. El uso se cobra por consumo a tu cuenta de la API.</div></div>
      <div class="panel"><h3>Google Drive (archivos pesados)</h3>
        <div><label>Carpeta MountLab en Drive (enlace)</label><input id="dD" value="${esc(c.drive)}" placeholder="https://drive.google.com/drive/folders/…"></div>
        <div class="row" style="margin-top:8px"><button id="dS">Guardar</button>${c.drive ? `<a class="btn" href="${esc(c.drive)}" target="_blank" rel="noopener">Abrir carpeta ↗</a>` : ""}</div>
        <div class="small muted" style="margin-top:6px">Los STEP/DXF se guardan en <b>MountLab/biblioteca/archivos/&lt;id&gt;/</b>. La subida automática desde GitHub se configura con el secreto <code>RCLONE_CONFIG</code> (ver README).</div></div>
      <div class="panel"><h3>Datos</h3><div class="small muted">Base cargada: ${Store.db.componentes.length} componentes, ${Store.db.proyectos.length} proyectos${Store.db.generado ? " · generada " + esc(Store.db.generado) : ""}.</div>
        <div class="row" style="margin-top:8px"><button id="xE">Exportar todo (JSON)</button><label class="btn" style="margin:0">Importar JSON<input type="file" id="xI" accept=".json" hidden></label><button id="xR">Recargar</button></div></div></div>`;
    $("#gS").onclick = async () => {
      Store.saveCfg({ owner: $("#gO").value.trim(), repo: $("#gR").value.trim(), branch: $("#gB").value.trim() || "main", token: $("#gT").value.trim() });
      $("#gMsg").textContent = "Probando…";
      let err = null;
      try { await Store.test(); await Store.load(); toast("Conectado a GitHub"); } catch (e) { err = e.message; Store.mode = "local"; Store.error = e.message; }
      estadoPill(); vAjustes();
      if (err) { $("#gMsg").innerHTML = `<span style="color:var(--bad)">✗ ${esc(err)}</span>`; toast(err, 7000); } else $("#gMsg").innerHTML = '<span style="color:var(--ok)">✓ Conectado</span>';
    };
    $("#gX").onclick = async () => { Store.saveCfg({ token: "" }); await Store.load(); estadoPill(); vAjustes(); };
    const sy = $("#gSync"); if (sy) sy.onclick = async () => { try { const k = await Store.syncLocal(i => toast(`Subiendo ${i}…`)); toast(`${k} cambio(s) subidos`); } catch (e) { toast(e.message, 5000); } estadoPill(); vAjustes(); };
    $("#aS").onclick = () => { Store.saveCfg({ aiKey: $("#aK").value.trim(), aiModel: $("#aM").value.trim() || "claude-sonnet-5-5" }); toast("Guardado"); };
    $("#dS").onclick = () => { Store.saveCfg({ drive: $("#dD").value.trim() }); vAjustes(); };
    $("#xE").onclick = () => download(`mountlab_${hoy()}.json`, JSON.stringify({ formato: "mountlab-db", version: 2, exportado: new Date().toISOString(), componentes: Store.db.componentes, proyectos: Store.db.proyectos }, null, 1), "application/json");
    $("#xR").onclick = async () => { await Store.load(); estadoPill(); toast("Recargado"); vAjustes(); };
    $("#xI").onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const j = JSON.parse(await f.text()); const cs = j.componentes || (Array.isArray(j) ? j : [j]);
        if (!(await confirmar(`Importar ${cs.length} componente(s) y ${(j.proyectos || []).length} proyecto(s)? Los que tengan el mismo id se reemplazan.`, "Importar"))) return;
        for (const c of cs) if (c.id) await Store.save("componentes", c, `Importar ${c.id}`);
        for (const p of j.proyectos || []) if (p.id) await Store.save("proyectos", p, `Importar proyecto ${p.id}`);
        toast("Importado"); estadoPill();
      } catch (er) { toast("Error: " + er.message, 5000); }
    };
  }

  // ---------- inicio
  (async function () {
    app.innerHTML = '<div class="panel muted">Cargando biblioteca…</div>';
    await Store.load(); estadoPill(); route();
    if (Store.error && Store.mode !== "github") console.warn(Store.error);
  })();
  window.ML = { S, route, toast };
})();
