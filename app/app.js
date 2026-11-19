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
  const S = { f: { q: "", tipo: "", cat: "", tag: "", estado: "", vista: "tarjetas" }, W: null, orig: null, tab: "ficha", ed: null, chat: [], adj: {} };

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
    const pf = window.Auth ? Auth.perfil() : {}, rol = { "dueño": "Dueño", edicion: "Invitado · edición", lectura: "Invitado · solo lectura" }[pf.rol] || "";
    const w = $("#who"); if (w) w.innerHTML = pf.rol ? `<span class="avatar">${esc((pf.nombre || "?").slice(0, 1).toUpperCase())}</span><span><b style="color:var(--ink)">${esc(pf.nombre || "")}</b><br>${esc(rol)}${pf.rol === "dueño" && Store.permisos && Store.permisos.admin ? " ✓" : ""}</span>` : "";
  }
  function dirty() { return S.W && S.orig && JSON.stringify(S.W) !== S.orig; }
  window.addEventListener("beforeunload", e => { if (dirty()) { e.preventDefault(); e.returnValue = ""; } });

  const fmtTexto = t => esc(t).replace(/\[\[([a-z0-9_]+)\]\]/g, (m, id) => comp(id) ? `<a class="cref" href="#/c/${id}">${esc(comp(id).nombre)}</a>` : m).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  // ---------- router
  let lastHash = location.hash;
  async function route() {
    const h = location.hash || "#/";
    if (dirty() && !h.startsWith("#/c/" + S.W.id)) {
      if (!(await confirmar("Tienes cambios sin guardar en <b>" + esc(S.W.nombre) + "</b>. ¿Salir sin guardar?", "Salir sin guardar"))) { history.replaceState(null, "", lastHash); return; }
    }
    lastHash = h;
    if (S.ed) { S.ed.destroy(); S.ed = null; }
    if (S.circ) { S.circ.destroy(); S.circ = null; }
    if (!h.startsWith("#/c/")) { S.W = null; S.orig = null; }
    const [, r, id] = h.split("/");
    $$("#nav a").forEach(a => a.classList.toggle("act", a.dataset.r === ({ "": "inicio", asistente: "inicio", invitacion: "inicio", c: "catalogo", p: "proyectos", pasivos: "pasivos" }[r] ?? r)));
    window.scrollTo(0, 0);
    if (r !== "asistente" && $("#drawer").classList.contains("wide")) { $("#drawer").classList.remove("wide"); document.body.classList.remove("drawer-wide"); }
    if (r === "asistente") { abrirAsistente(true); history.replaceState(null, "", "#/"); lastHash = "#/"; return vInicio(); }
    if (r === "catalogo") return vCatalogo();
    if (r === "pasivos") return vPasivos();
    if (r === "c" && id) return vComponente(decodeURIComponent(id));
    if (r === "proyectos") return vProyectos();
    if (r === "p" && id) return vProyecto(decodeURIComponent(id));
    if (r === "pendientes") return vPendientes();
    if (r === "ajustes") return vAjustes();
    return vInicio();
  }
  window.addEventListener("hashchange", route);

  // =====================================================================  CATÁLOGO
  function filtrar() {
    const f = S.f, q = f.q.trim().toLowerCase();
    let difusa = null;   // tolerante a errores de ortografía (cerebro local)
    if (q && window.MLLocal) { MLLocal.asegurar(Store.db.componentes); difusa = new Set(MLLocal.buscar(q, 15).filter(r => r.s >= 0.6).map(r => r.c.id)); }
    return Store.db.componentes.filter(c => {
      if (f.tipo && c.tipo !== f.tipo) return false;
      if (f.cat && c.categoria !== f.cat) return false;
      if (f.tag && !(c.etiquetas || []).includes(f.tag)) return false;
      if (f.estado === "verificado" && c.estado !== "verificado") return false;
      if (f.estado === "borrador" && c.estado === "verificado") return false;
      if (f.estado === "montaje" && !(c.montaje && c.montaje.pcb)) return false;
      if (f.estado === "sinimg" && c.imagen) return false;
      if (q) { const t = [c.id, c.nombre, c.categoria, c.fabricante, c.referencia, ...(c.alias || []), ...(c.etiquetas || []), ...Object.values(c.ficha || {})].join(" ").toLowerCase(); if (!q.split(/\s+/).every(w => t.includes(w)) && !(difusa && difusa.has(c.id))) return false; }
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
          <div class="row"><button class="sm ${f.vista === "tarjetas" ? "on" : ""}" data-v="tarjetas">Tarjetas</button><button class="sm ${f.vista === "tabla" ? "on" : ""}" data-v="tabla">Tabla</button><a class="btn" href="#/pasivos" title="Resistencias y capacitores: valores, códigos y calculadoras">Ω Pasivos</a><button class="pri" id="bNew">+ Nuevo</button></div>
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
    S.nuevo = c; S.tab = r.placa ? "modelo" : "ficha"; if (r.placa) c.montaje = Object.assign(c.montaje, { agujeros: [] }); location.hash = "#/c/" + encodeURIComponent(c.id);
  }

  // =====================================================================  COMPONENTE
  function vComponente(id) {
    let c = comp(id);
    if (!c && S.nuevo && S.nuevo.id === id) c = S.nuevo;
    if (!c) { app.innerHTML = `<div class="panel">No existe el elemento <b>${esc(id)}</b>. <a href="#/catalogo">Volver al catálogo</a></div>`; return; }
    if (!S.W || S.W.id !== id) { S.W = clone(c); S.orig = S.nuevo && S.nuevo.id === id ? "{}" : JSON.stringify(c); S.tab = S.tabSig || S.tab || "ficha"; } S.tabSig = null;
    const W = S.W;
    const enProy = Store.db.proyectos.filter(p => (p.bom || []).some(b => b.id === W.id));
    app.innerHTML = `<div class="det-head">
      <div><div class="small"><a href="#/catalogo">← Catálogo</a></div><h2 style="margin-top:4px">${esc(W.nombre)}</h2>
        <div class="row" style="gap:6px;margin-top:6px"><span class="tag">${esc(W.id)}</span><span class="tag cat">${esc(W.categoria)}</span><span class="tag">${TIPOS[W.tipo] || W.tipo}</span><span class="tag">v${W.version || 1}</span>
        ${W.variante_de ? `<span class="tag">variante de <a href="#/c/${esc(W.variante_de)}">${esc(W.variante_de)}</a></span>` : ""}
        ${enProy.map(p => `<a class="tag" href="#/p/${esc(p.id)}">📁 ${esc(p.nombre)}</a>`).join("")}<span id="dirtyMark"></span></div></div>
      <div class="row">
        <label class="btn" style="margin:0;color:${W.estado === "verificado" ? "var(--ok)" : "var(--warn)"}"><input type="checkbox" id="chkVer" style="width:auto" ${W.estado === "verificado" ? "checked" : ""}> ${W.estado === "verificado" ? "Verificado con calibrador" : "Sin verificar"}</label>
        <button id="bSave" class="pri">Guardar</button><button id="bUndo">Descartar</button>
        <button id="bDup">Duplicar</button><button id="bVar">Crear variante</button><button id="bProj">Añadir a proyecto</button><button id="bDel" class="danger">Eliminar</button></div></div>
      <div class="tabs">${[["ficha", "Ficha"], ["modelo", "Modelo 3D"], ["montaje", "Montaje"], ["zonas", "Zonas"], ["pines", "Pines"], ["archivos", "Archivos CAD"], ["versiones", "Versiones"], ["json", "JSON"]].map(([k, n]) => `<button data-tab="${k}" class="${S.tab === k ? "on" : ""}">${n}</button>`).join("")}</div>
      <div id="tabBody"></div>`;
    const mark = () => { $("#dirtyMark").innerHTML = dirty() ? '<span class="dirty">Cambios sin guardar</span>' : ""; $("#bSave").disabled = !dirty(); $("#bUndo").disabled = !dirty(); };
    S.mark = mark; mark();
    $$("[data-tab]").forEach(b => b.onclick = () => { S.tab = b.dataset.tab; $$("[data-tab]").forEach(x => x.classList.toggle("on", x === b)); tab(); });
    $("#chkVer").onchange = e => { W.estado = e.target.checked ? "verificado" : "borrador"; vComponente(id); };
    $("#bSave").onclick = guardarComponente;
    $("#bUndo").onclick = () => { if (S.nuevo && S.nuevo.id === id) { S.W = null; S.orig = null; S.nuevo = null; location.hash = "#/catalogo"; return; } S.W = null; vComponente(id); };
    $("#bDup").onclick = () => copiar(false); $("#bVar").onclick = () => copiar(true);
    $("#bProj").onclick = () => aProyecto(W.id);
    $("#bDel").onclick = async () => {
      if (!(await confirmar(`¿Eliminar <b>${esc(W.nombre)}</b>? ${enProy.length ? `Está en ${enProy.length} proyecto(s).` : ""} El historial queda en GitHub.`, "Eliminar"))) return;
      try { const m = await Store.remove("componentes", W.id, `Eliminar ${W.id}`); toast(m === "github" ? "Eliminado (commit en GitHub)" : "Eliminado en modo local"); } catch (e) { toast("Error: " + e.message, 5000); }
      S.W = null; S.orig = null; estadoPill(); location.hash = "#/catalogo";
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
    for (const k of ["modelo", "montaje", "zonas", "pines"]) if (JSON.stringify(W[k]) !== JSON.stringify(O[k])) out.push(k);
    for (const k of ["ficha", "especificaciones", "precios", "imagen", "nombre", "categoria", "tipo", "etiquetas", "estado", "fabricante", "referencia"]) if (JSON.stringify(W[k]) !== JSON.stringify(O[k])) out.push(k);
    return out;
  }
  async function guardarComponente() {
    const W = S.W, O = JSON.parse(S.orig || "{}"), ch = cambiosDe(W, O);
    const geo = ch.some(k => ["modelo", "montaje", "zonas", "pines"].includes(k)) && O.id;
    const nombres = { modelo: "modelo 3D", montaje: "montaje/agujeros", zonas: "zonas", pines: "pines", ficha: "ficha técnica", precios: "precios", imagen: "imagen", especificaciones: "especificaciones", estado: "estado de verificación" };
    const sug = ch[0] === "nuevo" ? "Creado" : "Actualizado: " + ch.map(k => nombres[k] || k).join(", ");
    const nota = await modal(`<h3>Guardar ${esc(W.nombre)}</h3>
      ${geo ? `<div class="msg info">Cambiaste la geometría (${ch.filter(k => ["modelo", "montaje", "zonas", "pines"].includes(k)).join(", ")}): se crea la <b>versión ${(W.version || 1) + 1}</b> y GitHub regenera el DXF y el STEP de montaje.</div>` : ""}
      <div><label>Nota del cambio (queda en el historial)</label><textarea id="gN">${esc(sug)}</textarea></div>
      <div class="row" style="justify-content:flex-end"><button data-close>Cancelar</button><button class="pri" id="gOk">Guardar</button></div>`, (b, close) => { $("#gOk", b).onclick = () => close($("#gN", b).value.trim() || sug); });
    if (nota == null) return;
    if (geo) { W.version = (W.version || 1) + 1; W.cad_pendiente = true; }
    W.historial = W.historial || [];
    if (O.id) W.historial.push({ v: W.version || 1, fecha: hoy(), nota, cambios: ch });
    W.modificado = new Date().toISOString();
    if (!W.imagen && W.modelo && S.ed && S.ed.captura) { try { const src = await S.ed.captura(); if (src) W.imagen = { src, origen: "render del modelo 3D" }; } catch (e) { } }
    if (W.modelo && W.montaje && W.montaje.pcb && (!O.id || geo)) W.cad_pendiente = true;
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
  async function aProyecto(id, valor) {
    const ps = Store.db.proyectos, cc = comp(id), fam = cc && cc.valores;
    const r = await modal(`<h3>Añadir a proyecto</h3>
      <div><label>Proyecto</label><select id="aP">${ps.map(p => `<option value="${esc(p.id)}">${esc(p.nombre)}</option>`).join("")}<option value="__nuevo">+ Nuevo proyecto…</option></select></div>
      <div class="grid${fam ? 3 : 2}">${fam ? `<div><label>Valor (${esc(cc.valores.unidad)})</label><input id="aV" placeholder="${cc.valores.magnitud === "resistencia" ? "ej. 4k7" : "ej. 100n"}" value="${esc(valor || "")}"></div>` : ""}<div><label>Cantidad</label><input id="aC" type="number" min="1" value="1"></div><div><label>Nota</label><input id="aN"></div></div>
      <div class="row" style="justify-content:flex-end"><button data-close>Cancelar</button><button class="pri" id="aOk">Añadir</button></div>`, (b, close) => {
      $("#aOk", b).onclick = () => close({ p: $("#aP", b).value, n: +$("#aC", b).value || 1, nota: $("#aN", b).value, v: fam ? valorBonito(cc, $("#aV", b).value) : "" });
    });
    if (!r) return;
    let p = r.p === "__nuevo" ? await crearProyecto(true) : clone(ps.find(x => x.id === r.p)); if (!p) return;
    const ex = p.bom.find(b => b.id === id && (b.valor || "") === (r.v || "")); if (ex) ex.cantidad += r.n; else p.bom.push(Object.assign({ id, cantidad: r.n, nota: r.nota }, r.v ? { valor: r.v } : {}));
    p.historial = p.historial || []; p.historial.push({ fecha: hoy(), nota: `Añadido ${id} × ${r.n}` });
    try { await Store.save("proyectos", p, `Proyecto ${p.id}: añadir ${id}`); toast("Añadido a " + p.nombre); } catch (e) { toast("Error: " + e.message, 5000); }
    estadoPill();
  }

  function tab() {
    const body = $("#tabBody"), W = S.W; if (S.ed) { S.ed.destroy(); S.ed = null; }
    const ch = () => S.mark();
    if (S.tab === "ficha") return tabFicha(body, W, ch);
    if (S.tab === "modelo") { S.ed = MLModelo.montar(body, W, { onChange: ch, toast }); return; }
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
    if (W.valores) { body.insertAdjacentHTML("beforeend", panelValores(W)); $$("[data-vv]", body).forEach(c => c.onclick = () => { S.pvQ = c.dataset.vv; S.ptab = "valor"; location.hash = "#/pasivos"; }); }
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
      <div class="panel"><h3>Zonas (${W.zonas.length})</h3><div class="list">${W.zonas.map((q, i) => `<div class="it ${sel === i ? "sel" : ""}" data-i="${i}"><span class="sw" style="background:${(ZT[q.tipo] || ZT.otra).c}"></span>${esc(q.nombre || q.tipo)}${q.auto ? ' <span class="tag" title="Se genera desde la pestaña Modelo 3D: edítala allá">modelo 3D</span>' : ""}<span class="muted small" style="margin-left:auto">${MLEditor.SALIDAS[q.salida] ? q.salida : ""}</span></div>`).join("") || '<div class="it muted">Sin zonas</div>'}</div></div>
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
    const nombres = { step: "Modelo 3D (STEP)", dxf: "Plano (DXF)", step_montaje: "STEP de montaje (placa + agujeros + zonas)", dxf_huella: "DXF de huella (origen al centro)", datasheet: "Datasheet (copia PDF)", dxf_plano: "Plano de taller (DXF: 3 vistas + cotas + cajetín)" };
    const gh = `https://github.com/${Store.cfg.owner}/${Store.cfg.repo}`;
    body.innerHTML = `<div class="grid2">
      <div class="panel"><h3>Archivos CAD</h3>
        <table class="t"><tr><th>Archivo</th><th>Nombre</th><th>Versión</th></tr>${Object.entries(A).map(([k, a]) => `<tr><td>${nombres[k] || k}</td><td>${a.url ? (/github\.com\/.+\/raw\/|raw\.githubusercontent\.com/.test(a.url) ? `<a href="#" data-dl="${esc(a.url)}" data-nm="${esc(a.nombre || "")}">⬇ ${esc(a.nombre || "descargar")}</a>` : `<a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.nombre || "abrir")} ↗</a>`) : esc(a.nombre || "")}<div class="small muted">${esc(a.carpeta || "")}</div></td><td>${a.version ? "v" + a.version : ""}${a.error ? `<div class="small" style="color:var(--warn)">Sin copia: ${esc(a.error)}${a.fuente ? ` · <a href="${esc(a.fuente)}" target="_blank" rel="noopener">abrir original ↗</a>` : ""}</div>` : ""}</td></tr>`).join("") || '<tr><td colspan="3" class="muted">Sin archivos todavía</td></tr>'}</table>
        ${Object.values(A).some(a => String(a.carpeta || "").includes("repositorio"))
          ? `<div class="msg info" style="margin-top:10px">Los archivos de montaje se guardan en <b>GitHub</b> (<code>archivos/${esc(W.id)}</code>); al hacer clic se descargan. Con el <b>sincronizador de MountLab</b> instalado en tu PC también llegan solos (cada 10 min) a <b>D:\\Mi unidad\\MountLab\\biblioteca\\archivos\\${esc(W.id)}\\</b> para abrirlos en SolidWorks.</div>`
          : `<div class="msg info" style="margin-top:10px">En tu PC los encuentras en <b>D:\\Mi unidad\\MountLab\\biblioteca\\archivos\\${esc(W.id)}\\</b> (Drive para escritorio) para abrirlos directo en SolidWorks.</div>`}
        ${W.cad_pendiente ? '<div class="msg warn">Hay cambios de geometría pendientes de regenerar en CAD.</div>' : ""}</div>
      <div class="panel"><h3>Generar</h3>
        <p class="small muted">El DXF de huella se puede bajar ya mismo desde aquí (lo genera el navegador). El STEP de montaje y el <b>plano de taller</b> (vista superior, frontal y lateral con cotas generales, agujeros y cajetín, escala 1:1) los genera GitHub con CadQuery al guardar cambios de geometría, como versión nueva.</p>
        <div class="row"><button class="pri" id="bDxf" ${W.montaje ? "" : "disabled"}>Descargar DXF de huella (v${W.version || 1})</button>
        <button id="bCad" ${Store.mode === "github" && W.montaje ? "" : "disabled"}>Regenerar DXF + STEP en GitHub</button></div>
        ${Store.mode !== "github" ? '<div class="small muted" style="margin-top:6px">Para regenerar en GitHub configura el token en Ajustes.</div>' : `<div class="small" style="margin-top:6px"><a href="${gh}/actions" target="_blank" rel="noopener">Ver ejecuciones en GitHub Actions ↗</a></div>`}
        <h3 style="margin-top:16px">Convenciones</h3><ul class="small muted" style="margin:0;padding-left:18px"><li>Unidades en mm; origen (0,0) en el centro de la placa; X a lo largo, Y a lo ancho, Z hacia arriba desde la cara inferior del PCB.</li><li>Capas DXF de huella: PCB, AGUJEROS, ZONAS, ZONAS_HOLGURA, PINES, EJES, TEXTO, PIEZAS_A/B.</li><li>Plano: capas CONTORNO, PIEZAS, OCULTAS, CENTRO, COTAS, TEXTO, MARCO; proyección ISO-E (primer diedro).</li><li>Cada cambio de geometría crea un archivo nuevo: <code>${esc(W.id)}_v${(W.version || 1)}_huella.dxf</code>; las versiones anteriores no se borran.</li></ul></div></div>`;
    $$("[data-dl]", body).forEach(l => l.onclick = async e => {
      e.preventDefault();
      const raw = l.dataset.dl.replace(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/raw\//, "https://raw.githubusercontent.com/$1/$2/");
      try {
        toast("Descargando " + l.dataset.nm + "…");
        const r = await fetch(raw, { cache: "no-store" }); if (!r.ok) throw new Error("GitHub " + r.status);
        const b = await r.blob(), a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([b], { type: "application/octet-stream" })); a.download = l.dataset.nm || raw.split("/").pop();
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
      } catch (er) { toast("No se pudo descargar: " + er.message, 5000); }
    });
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
    if (S.proyId !== id) { S.proyId = id; S.ptabP = S.ptabSig || "resumen"; } S.ptabSig = null;
    const cabecera = () => { const sucio = JSON.stringify(P) !== O, d = $("#pDirty"), b = $("#pSv"); if (d) d.innerHTML = sucio ? '<span class="dirty">Cambios sin guardar</span>' : ""; if (b) b.disabled = !sucio; };
    S.proySucio = () => JSON.stringify(P) !== O;
    const pinta = () => {
      const t = totalesBom(P), sucio = JSON.stringify(P) !== O, diag = S.ptabP === "diagrama";
      if (S.circ) { S.circ.destroy(); S.circ = null; }
      app.innerHTML = `<div class="det-head"><div><div class="small"><a href="#/proyectos">← Proyectos</a></div><input id="pNm" value="${esc(P.nombre)}" style="font-size:20px;font-weight:700;border:none;padding:4px 0;background:none"></div>
        <div class="row"><span id="pDirty">${sucio ? '<span class="dirty">Cambios sin guardar</span>' : ""}</span><button class="pri" id="pSv" ${sucio ? "" : "disabled"}>Guardar</button><button id="pCsv">Exportar BOM (CSV)</button><button id="pDup">Duplicar</button><button class="danger" id="pDel">Eliminar</button></div></div>
        <div class="tabs"><button data-pt2="resumen" class="${diag ? "" : "on"}">Resumen y BOM</button><button data-pt2="diagrama" class="${diag ? "on" : ""}">⚡ Diagrama de conexiones${P.circuito && (P.circuito.inst || []).length ? ` <span class="tag">${P.circuito.inst.length}</span>` : ""}</button></div>
        ${diag ? '<div id="circHost"></div>' : `
        <div class="grid2" style="grid-template-columns:2fr 1fr;align-items:start">
          <div class="side">
            <div class="panel"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Lista de materiales (BOM)</h3><div class="picker" style="width:320px"><input id="pk" placeholder="+ Añadir componente: buscar…"><div class="res hide" id="pkR"></div></div></div>
              <div style="overflow:auto;margin-top:8px"><table class="t"><tr><th></th><th>Componente</th><th class="num">Cant.</th><th>Nota</th><th class="num">Unitario</th><th class="num">Subtotal</th><th></th></tr>
              ${P.bom.map((b, i) => { const c = comp(b.id), pm = c && precioMin(c); return `<tr><td style="width:44px"><div style="width:40px;height:30px;display:flex;align-items:center;justify-content:center;overflow:hidden">${c ? imgHtml(c).replace("<svg ", '<svg style="max-width:40px;max-height:30px" ').replace("<img ", '<img style="max-width:40px;max-height:30px" ') : ""}</div></td>
                <td>${c ? `<a href="#/c/${esc(c.id)}">${esc(c.nombre)}</a><div class="small muted">${esc(c.categoria)}</div>${c.valores ? `<input data-b="${i}" data-k="valor" value="${esc(b.valor || "")}" placeholder="Valor: ${c.valores.magnitud === "resistencia" ? "ej. 4k7" : "ej. 100n"}" style="margin-top:4px;max-width:160px;padding:4px 7px">` : ""}` : `<span class="tag bad">${esc(b.id)} no existe</span>`}</td>
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
            <div class="panel"><h3>🧪 Revisión técnica</h3>${(() => { const al = window.MLLocal ? MLLocal.revisar(P, Store.db) : []; return al.length ? al.map(a => `<div class="small" style="margin-bottom:6px" title="${esc(a.por)}">${a.nivel === "rojo" ? "🔴" : a.nivel === "amarillo" ? "🟡" : "🔵"} ${fmtTexto(a.msg)}</div>`).join("") + '<div class="small muted">Sistema experto con reglas fijas (pasa el mouse para ver el porqué). Orienta, no reemplaza tu criterio.</div>' : '<div class="small muted">Sin observaciones.</div>'; })()}</div>
            <div class="panel"><h3>Historial</h3>${(P.historial || []).slice().reverse().slice(0, 12).map(h => `<div class="small" style="margin-bottom:4px"><span class="muted">${esc(h.fecha)}</span> · ${esc(h.nota)}</div>`).join("")}</div>
          </div></div>`}`;
      $$("[data-pt2]").forEach(b => b.onclick = () => { S.ptabP = b.dataset.pt2; pinta(); if (window.MLAgent) MLAgent.refrescar(); });
      if (diag) S.circ = MLCircuito.montar($("#circHost"), P, { onChange: cabecera, toast, ia: circuitoIA });
      const set = () => { pinta(); };
      $("#pNm").oninput = e => { P.nombre = e.target.value; };
      $("#pNm").onchange = () => diag ? cabecera() : set();
      if (!diag) $("#pEs").onchange = e => { P.estado = e.target.value; set(); };
      if (!diag) $("#pDs").onchange = e => { P.descripcion = e.target.value; set(); };
      if (!diag) $("#pDoc").onchange = e => { P.documentacion = e.target.value; set(); };
      $$("[data-b]").forEach(i => i.onchange = () => { const b = P.bom[+i.dataset.b]; b[i.dataset.k] = i.dataset.k === "cantidad" ? Math.max(0, +i.value) : i.dataset.k === "valor" ? valorBonito(comp(b.id), i.value) : i.value; if (i.dataset.k === "valor") i.value = b.valor; set(); });
      $$("[data-bx]").forEach(x => x.onclick = () => { const b = P.bom.splice(+x.dataset.bx, 1)[0]; P.historial.push({ fecha: hoy(), nota: "Quitado " + b.id }); set(); });
      const pk = $("#pk"), res = $("#pkR");
      if (pk) pk.oninput = () => {
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
        const rows = [["Item", "Id", "Componente", "Valor", "Categoría", "Cantidad", "Unidad", "Proveedor", "Precio unitario COP", "Subtotal COP", "Enlace", "Nota"]];
        P.bom.forEach((b, i) => { const c = comp(b.id) || {}, pm = precioMin(c); rows.push([i + 1, b.id, c.nombre || "", b.valor || "", c.categoria || "", b.cantidad, c.unidad || "", pm ? pm.proveedor : "", pm ? pm.precio_cop : "", pm ? pm.precio_cop * b.cantidad : "", pm ? pm.url : "", b.nota || ""]); });
        download(`BOM_${P.id}.csv`, "\ufeff" + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n"), "text/csv");
      };
      $("#pDup").onclick = async () => { const n = clone(P); n.id = P.id + "-copia"; n.nombre = P.nombre + " (copia)"; n.creado = hoy(); n.historial = [{ fecha: hoy(), nota: "Copia de " + P.id }]; try { await Store.save("proyectos", n, `Proyecto ${n.id}: copia de ${P.id}`); } catch (e) { toast(e.message); } location.hash = "#/p/" + n.id; };
      $("#pDel").onclick = async () => { if (!(await confirmar(`¿Eliminar el proyecto <b>${esc(P.nombre)}</b>? Los componentes no se borran.`, "Eliminar"))) return; try { await Store.remove("proyectos", P.id, `Eliminar proyecto ${P.id}`); } catch (e) { toast(e.message); } estadoPill(); location.hash = "#/proyectos"; };
    };
    pinta();
  }

  /** Pide a la IA un circuito completo con componentes de la biblioteca y lo muestra para aprobar. */
  async function circuitoIA(objetivo, api) {
    if (!nubeLista()) { toast("Para diseñar con IA agrega una clave de Claude o Gemini en Ajustes. Mientras tanto usa ✦ Sugerir conexiones (local).", 6000); return; }
    const elec = Store.db.componentes.filter(c => !["Herrajes", "Materiales", "Cableado", "Prototipado"].includes(c.categoria) && c.tipo === "electronico");
    const lista = elec.map(c => { const pf = MLCircuito.perfil(c), rol = pf.rol === "resistencia" || pf.rol === "capacitor" ? "pasivo2" : pf.rol; const pins = MLCircuito.pinesDe(c, rol).map(p => p.n).join(","); return `${c.id} | ${c.nombre} | ${(c.ficha || {}).voltaje || ""} | pines: ${pins}`; }).join("\n");
    const virt = Object.entries(MLCircuito.VIRT).map(([id, v]) => `${id} | ${v.nombre} | pines: ${v.pines.map(p => p[0]).join(",")}`).join("\n");
    const actual = S.circ ? S.circ.circuito() : null;
    const system = `Eres el asistente de MountLab. Diseñas circuitos para John (ingeniería biomédica/mecatrónica, Colombia) usando SOLO componentes de su biblioteca y las partes virtuales.
Responde en español: primero 4–8 líneas explicando el circuito (alimentación, buses, pines elegidos y por qué, cuidados), luego UN bloque:
\`\`\`mountlab-circuito
{"componentes":[{"ref":"U1","id":"esp32_38p"},{"ref":"R1","id":"res_metal_14w","valor":"4k7"},{"ref":"BT1","id":"@18650","p":{"mAh":3000}}],
 "conexiones":[["U1.GPIO21","U2.SDA"],["U2.GND","U1.GND"]]}
\`\`\`
Reglas: usa los nombres de pin EXACTOS de la lista; tierra común; I2C del ESP32 en GPIO21/22; UART cruzado TX→RX; sensores analógicos en ADC1 (GPIO32–39); no uses GPIO6–11; evita GPIO0/2/12/15 si puedes; servos y motores con fuente aparte (no del 3V3 del ESP32); respeta voltajes (3.3 V vs 5 V) y agrega reguladores, resistencias de LED o pull-ups si hacen falta. Pasivos: elige la familia (res_*/cap_*) y pon "valor".
BIBLIOTECA (id | nombre | voltaje | pines):
${lista}
PARTES VIRTUALES:
${virt}
${actual && actual.inst.length ? "CIRCUITO ACTUAL (puedes completarlo; usa refs nuevas para lo que agregues): " + JSON.stringify({ inst: actual.inst.map(i => ({ ref: i.ref, id: i.id })), cables: actual.cables }) : ""}`;
    toast("✦ Diseñando el circuito…", 4000);
    const r = await llamarIA(system, [{ role: "user", content: objetivo }], false, { potente: true });
    const m = r.text.match(/```mountlab-circuito\s*([\s\S]*?)```/); if (!m) { await modal(`<h3>Respuesta del asistente</h3><div style="white-space:pre-wrap" class="small">${esc(r.text)}</div><div class="row" style="justify-content:flex-end"><button data-close>Cerrar</button></div>`); return; }
    let j; try { j = JSON.parse(m[1]); } catch (e) { toast("La propuesta no es JSON válido: " + e.message, 6000); return; }
    const expl = r.text.replace(m[0], "").trim();
    const ok = await modal(`<h3>✦ Circuito propuesto</h3><div class="small" style="white-space:pre-wrap">${esc(expl)}</div>
      <div class="grid2"><div><b class="small">Componentes (${(j.componentes || []).length})</b><ul class="small" style="margin:4px 0;padding-left:18px">${(j.componentes || []).map(c => `<li><b>${esc(c.ref)}</b> ${esc((comp(c.id) || MLCircuito.VIRT[c.id] || {}).nombre || c.id + " (no está en la biblioteca)")}${c.valor ? " · " + esc(c.valor) : ""}</li>`).join("")}</ul></div>
        <div><b class="small">Conexiones (${(j.conexiones || []).length})</b><div class="small" style="max-height:220px;overflow:auto">${(j.conexiones || []).map(([a, b]) => `<div><code>${esc(a)}</code> → <code>${esc(b)}</code></div>`).join("")}</div></div></div>
      <div class="row" style="justify-content:flex-end"><button data-close>Descartar</button><button class="pri" id="mOk">Aplicar al diagrama</button></div>`, (b, c) => $("#mOk", b).onclick = () => c(true));
    if (!ok) return;
    const res = api.aplicarPropuesta(j); toast(`Circuito aplicado: ${res.ok} conexiones${res.mal.length ? ` · ${res.mal.length} no se pudieron ubicar` : ""}`, 6000);
  }

  // =====================================================================  PENDIENTES
  function getPath(o, p) { return p.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o); }
  function setPath(o, p, v) { const ks = p.split("."); let a = o; ks.slice(0, -1).forEach(k => { a[k] = a[k] ?? {}; a = a[k]; }); a[ks.at(-1)] = v; }
  const show = v => v == null || v === "" ? '<span class="muted">(vacío)</span>' : typeof v === "object" ? `<pre style="margin:0;white-space:pre-wrap;font-size:11.5px">${esc(JSON.stringify(v, null, 1))}</pre>` : /^https?:/.test(v) ? `<a href="${esc(v)}" target="_blank" rel="noopener">${esc(String(v).slice(0, 70))}</a>` : esc(v);
  function vPendientes() {
    const L = Store.db.pendientes;
    app.innerHTML = `<div class="row" style="justify-content:space-between;margin-bottom:6px"><h2>Pendientes por aprobar</h2></div>
      <p class="muted" style="margin-top:0">Aquí llega la información que se descarga automáticamente (fotos, datasheets, precios, proveedores). No se guarda en la biblioteca hasta que la apruebes.</p>
      ${L.length ? L.map((p, i) => { const c = comp(p.componente); return `<div class="panel" style="margin-bottom:12px"><div class="row" style="justify-content:space-between"><div><b>${c ? `<a href="#/c/${esc(c.id)}">${esc(c.nombre)}</a>` : esc(p.componente) + ' <span class="tag bad">nuevo / no existe</span>'}</b> <span class="small muted">· ${esc(p.fuente || "")} · ${esc(p.fecha || "")}</span>${p.resumen ? `<div class="small muted">${esc(p.resumen)}</div>` : ""}</div>
        <div class="row"><button class="sm" data-all="${i}">Marcar todo</button><button class="pri sm" data-ok="${i}">Aprobar seleccionados</button><button class="sm danger" data-no="${i}">Rechazar todo</button></div></div>
        <div class="diff" style="margin-top:10px"><div class="h">Campo</div><div class="h">Actual</div><div class="h">Propuesto</div>
        ${Object.entries(p.cambios || {}).map(([k, v]) => `<div><label class="row" style="gap:6px;margin:0;color:var(--ink)"><input type="checkbox" data-p="${i}" data-k="${esc(k)}" style="width:auto">${esc(k)}</label></div><div class="old">${show(c ? getPath(c, k) : null)}</div><div class="new">${k === "imagen.src" && v ? `<img src="${esc(v)}" style="max-height:100px">` : show(v)}${(p.fuentes || {})[k] ? `<div class="small"><a href="${esc(p.fuentes[k])}" target="_blank" rel="noopener">fuente ↗</a>${(p.confianza || {})[k] ? " · confianza " + esc(p.confianza[k]) : ""}</div>` : ""}</div>`).join("")}</div></div>`; }).join("") : '<div class="panel muted">No hay nada pendiente. 🎉</div>'}`;
    $$("[data-all]").forEach(b => b.onclick = () => $$(`[data-p="${b.dataset.all}"]`).forEach(x => x.checked = true));
    $$("[data-no]").forEach(b => b.onclick = async () => { const p = L[+b.dataset.no]; try { await Store.remove("pendientes", p.id, `Rechazar propuesta ${p.id}`); } catch (e) { toast(e.message); } estadoPill(); vPendientes(); });
    $$("[data-ok]").forEach(b => b.onclick = async () => {
      const i = +b.dataset.ok, p = L[i], ks = $$(`[data-p="${i}"]`).filter(x => x.checked).map(x => x.dataset.k);
      if (!ks.length) return toast("Marca al menos un campo");
      const c = aplicarCambios(comp(p.componente), p.componente, p.cambios, ks, p.fuente);
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

  // ---- proveedores de IA (la clave queda solo en este navegador)
  const IAS = { anthropic: "Claude (Anthropic)", gemini: "Google Gemini", openai: "OpenAI / compatible" };
  const nubeLista = () => iaLista();
  function iaLista() { const c = Store.cfg; return c.aiProv === "gemini" ? !!c.gemKey : c.aiProv === "openai" ? !!(c.oaKey && c.oaModel) : !!c.aiKey; }
  function iaNombre() { const c = Store.cfg; return (IAS[c.aiProv || "gemini"] || IAS.gemini) + " · " + ((c.aiProv || "gemini") === "gemini" ? c.gemModel + (c.gemPro ? " / " + c.gemPro : "") : c.aiProv === "openai" ? c.oaModel : c.aiModel + (c.aiPro ? " / " + c.aiPro : "")); }
  const iaBusca = () => (Store.cfg.aiProv || "gemini") !== "openai";
  /** Devuelve { text, fuentes:[{titulo,url}] }. Con buscar=true usa la búsqueda web del proveedor. */
  /** Contenido de un mensaje → formato de cada proveedor. Partes: {type:"text"} | {type:"img", mime, b64} | {type:"pdf", b64, texto}. */
  function partes(m, prov) {
    if (!Array.isArray(m.content)) return prov === "gemini" ? [{ text: m.content }] : m.content;
    const txtPdf = p => ({ type: "text", text: `Contenido del PDF “${p.nombre}” (texto extraído):\n${(p.texto || "").slice(0, 80000)}` });
    return m.content.map(p => {
      if (prov === "gemini") return p.type === "text" ? { text: p.text } : p.type === "img" ? { inline_data: { mime_type: p.mime, data: p.b64 } } : p.b64.length < 26e6 ? { inline_data: { mime_type: "application/pdf", data: p.b64 } } : { text: txtPdf(p).text };
      if (prov === "openai") return p.type === "text" ? p : p.type === "img" ? { type: "image_url", image_url: { url: `data:${p.mime};base64,${p.b64}` } } : txtPdf(p);
      return p.type === "text" ? p : p.type === "img" ? { type: "image", source: { type: "base64", media_type: p.mime, data: p.b64 } } : p.b64.length < 30e6 ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: p.b64 } } : txtPdf(p);
    });
  }
  // ---- Gemini: errores entendibles, reintento en 429/503 y respaldo al modelo rápido
  const GEM = "https://generativelanguage.googleapis.com/v1beta", AGOT = {};   // AGOT: modelo → hasta cuándo saltarlo (sin cupo)
  function errClaude(st, j) {
    const m = ((j && j.error) || {}).message || String(st);
    if (st === 401) return "La clave de Claude no es válida (revisa que la copiaste completa, empieza por sk-ant-).";
    if (st === 403) return "Claude rechazó la clave (" + m + ").";
    if (st === 400 && /credit balance|billing|purchase credits/i.test(m)) return "Tu cuenta de la API de Claude no tiene saldo: compra créditos en platform.claude.com → Billing (la suscripción Pro de claude.ai no los incluye).";
    if (st === 404) return "Ese modelo de Claude no existe: pulsa “Conectar y probar” para elegir uno vigente.";
    if (st === 429) return "Se alcanzó el límite de la API de Claude; espera un momento.";
    if (st === 529 || st >= 500) return "Claude está saturado en este momento (" + st + "). Intenta de nuevo en unos segundos.";
    return m;
  }
  function errGemini(r, j) {
    const e = (j && j.error) || {}, msg = e.message || String(r.status), st = e.status || "";
    if (r.status === 400 && /API key not valid|API_KEY_INVALID/i.test(msg)) return "La clave de Gemini no es válida: revisa que la copiaste completa (las claves nuevas empiezan por AQ., las antiguas por AIza).";
    if (r.status === 401) return "Gemini rechazó la clave (401" + (/ACCESS_TOKEN_TYPE|OAuth/i.test(msg) ? ": tipo de clave no aceptado" : "") + "). Si es una clave nueva (AQ.), bórrala y crea otra en AI Studio dentro de un proyecto nuevo; si persiste, crea una clave clásica (AIza) en console.cloud.google.com → Credenciales con la «Generative Language API».";
    if (r.status === 400 && /location is not supported|User location/i.test(msg)) return "Gemini no está disponible desde tu ubicación con esta clave.";
    if (r.status === 403) return "Gemini rechazó la clave (" + msg + "). Revisa que la API esté habilitada en el proyecto de AI Studio.";
    if (r.status === 404) return "Ese modelo no existe o ya no está disponible: pulsa “Conectar y probar” en Ajustes para elegir uno vigente.";
    if (r.status === 429 || st === "RESOURCE_EXHAUSTED") return "Se alcanzó el límite de Gemini (nivel gratuito: consultas por minuto o por día). Espera un momento o usa el modelo rápido.";
    if (r.status >= 500) return "Gemini está saturado en este momento (" + r.status + "). Intenta de nuevo en unos segundos.";
    return msg;
  }
  function usoIA(modelo, meta) {
    try { const k = "ml_uso_ia", d = hoy(); let u = JSON.parse(localStorage.getItem(k)) || {}; if (u.dia !== d) u = { dia: d, n: 0, tin: 0, tout: 0, mod: {} };
      u.n++; u.mod[modelo] = (u.mod[modelo] || 0) + 1; if (meta) { u.tin += meta.promptTokenCount || 0; u.tout += (meta.candidatesTokenCount || 0) + (meta.thoughtsTokenCount || 0); } localStorage.setItem(k, JSON.stringify(u)); } catch (e) { }
  }
  /** fetch con límite de tiempo: evita que la app se quede “colgada” si la red no responde. */
  async function fetchT(url, op, ms) {
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms || 90000);
    try { return await fetch(url, Object.assign({}, op, { signal: ac.signal })); }
    catch (e) { const ia = /anthropic/.test(url) ? "Claude" : "Gemini"; if (e.name === "AbortError") throw new Error(`${ia} no respondió en ${Math.round((ms || 90000) / 1000)} s (revisa tu conexión, VPN, antivirus o firewall)`); throw new Error("No se pudo contactar a " + ia + " (" + e.message + "). ¿Bloqueador, red de la empresa o sin internet?"); }
    finally { clearTimeout(t); }
  }
  async function pedirGemini(modelo, body, key, ms, sinEspera) {
    for (let intento = 0; intento < 2; intento++) {
      const r = await fetchT(`${GEM}/models/${encodeURIComponent(modelo)}:generateContent`, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body) }, ms || 120000);
      let j = {}; try { j = await r.json(); } catch (e) { }
      if (r.ok) { usoIA(modelo, j.usageMetadata); return j; }
      const espera = +(((((j.error || {}).details || []).find(d => d.retryDelay) || {}).retryDelay || "").replace("s", "")) || 4;
      if (!sinEspera && (r.status === 429 || r.status === 503) && intento === 0 && espera <= 20) { toast(`Gemini pidió esperar ${Math.ceil(espera)} s… reintentando`, 4000); await new Promise(res => setTimeout(res, espera * 1000)); continue; }
      const err = new Error(errGemini(r, j)); err.status = r.status; err.cero = r.status === 429 && /limit:\s*0\b/.test(((j.error || {}).message) || ""); if (err.cero) err.message = `El modelo ${modelo} no está incluido en el nivel gratuito de tu proyecto (cupo 0).`; throw err;
    }
  }
  async function llamarIA(system, msgs, buscar, opts) {
    opts = opts || {};
    const c = Store.cfg, prov = c.aiProv || "gemini", fuentes = [];
    msgs = msgs.map(m => ({ role: m.role, content: partes(m, prov) }));
    const addF = (url, titulo) => { if (url && !fuentes.some(f => f.url === url)) fuentes.push({ url, titulo: titulo || url }); };
    if (prov === "gemini") {
      const body = { systemInstruction: { parts: [{ text: system }] }, contents: msgs.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: m.content })), generationConfig: { maxOutputTokens: 16384 } };
      if (buscar) body.tools = [{ google_search: {} }];
      const rapido = c.gemModel || "gemini-2.5-flash", modelo = opts.potente && c.gemPro ? c.gemPro : rapido;
      // cascada: cada modelo tiene su propio cupo gratuito → si uno da 429/503/404 se pasa al siguiente
      const cola = [...new Set([modelo, rapido, ...(c.gemAlt || [])])].filter(Boolean);
      let j, usado = null, ultimo = null;
      const intentar = async (sinWeb) => {
        for (const m of cola) {
          if (AGOT[m] > Date.now()) continue;
          const b = sinWeb ? Object.assign({}, body, { tools: undefined }) : body;
          try { j = await pedirGemini(m, b, c.gemKey, undefined, true); usado = m; return true; }
          catch (e) { ultimo = e; if (![429, 503, 404].includes(e.status)) throw e; AGOT[m] = Date.now() + (e.status === 404 || e.cero ? 6 * 36e5 : e.status === 503 ? 3e4 : 6e4); }
        }
        return false;
      };
      if (!(await intentar(false)) && !(buscar && await intentar(true))) throw new Error(`Ningún modelo de Gemini tuvo cupo ahora (probé ${cola.length}: ${cola.join(", ")}). Último error: ${ultimo ? ultimo.message : "?"} — en el nivel gratuito el cupo se repone cada minuto y a medianoche (hora del Pacífico). Pulsa “Conectar y probar” si cambiaste de clave.`);
      if (usado !== modelo) toast(`${modelo} sin cupo ahora; respondió ${usado}`, 5000);
      const cand = (j.candidates || [])[0]; if (!cand) throw new Error("Gemini no devolvió respuesta" + (j.promptFeedback && j.promptFeedback.blockReason ? " (bloqueada: " + j.promptFeedback.blockReason + ")" : ""));
      for (const ch of ((cand.groundingMetadata || {}).groundingChunks || [])) if (ch.web) addF(ch.web.uri, ch.web.title);
      const text = ((cand.content || {}).parts || []).filter(p => p.text && !p.thought).map(p => p.text).join("\n");
      return { text: text || "(respuesta vacía: " + (cand.finishReason || "") + ")", fuentes, modelo: usado };
    }
    if (prov === "openai") {
      const r = await fetch(String(c.oaUrl || "https://api.openai.com/v1").replace(/\/$/, "") + "/chat/completions", {
        method: "POST", headers: { "content-type": "application/json", Authorization: "Bearer " + c.oaKey },
        body: JSON.stringify({ model: c.oaModel, messages: [{ role: "system", content: system }, ...msgs] }),
      });
      const j = await r.json(); if (!r.ok) throw new Error((j.error && j.error.message) || r.status);
      return { text: ((j.choices || [])[0] || {}).message?.content || "(respuesta vacía)", fuentes };
    }
    let conv = msgs.slice(), texto = "";
    for (let paso = 0; paso < 4; paso++) {
      const body = { model: (opts.potente && c.aiPro) ? c.aiPro : (c.aiModel || "claude-haiku-5-5"), max_tokens: 8000, system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }], messages: conv };
      if (buscar) body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 6 }];
      const r = await fetchT("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": c.aiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }, body: JSON.stringify(body) }, 180000);
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(errClaude(r.status, j));
      for (const b of j.content || []) {
        if (b.type === "text") { texto += b.text; for (const ci of b.citations || []) addF(ci.url, ci.title); }
        if (b.type === "web_search_tool_result" && b.content && b.content.type === "web_search_tool_result_error") texto += `\n(La búsqueda web falló: ${b.content.error_code}${b.content.error_code === "invalid_tool_input" ? "" : ". Revisa que la búsqueda web esté habilitada en console.anthropic.com"})\n`;
      }
      if (j.stop_reason !== "pause_turn") break;
      conv = conv.concat([{ role: "assistant", content: j.content }]);   // la búsqueda pidió continuar
    }
    return { text: texto, fuentes, modelo: (opts.potente && c.aiPro) ? c.aiPro : (c.aiModel || "claude-haiku-5-5") };
  }
  async function listarGemini(key, detalle) {
    const r = await fetchT(`${GEM}/models?pageSize=200`, { headers: { "x-goog-api-key": key } }, 20000);
    let j = {}; try { j = await r.json(); } catch (e) { } if (!r.ok) throw new Error(errGemini(r, j));
    const L = (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes("generateContent") && /gemini/.test(m.name)).map(m => ({ id: m.name.replace(/^models\//, ""), nombre: m.displayName || "", entrada: m.inputTokenLimit || 0 }));
    return detalle ? L : L.map(m => m.id);
  }
  /** Elige el mejor modelo rápido (Flash estable más nuevo) y el potente (Pro más nuevo) de la lista. */
  function elegirGemini(L) {
    const ids = L.map(m => m.id || m).filter(id => /^gemini-\d/.test(id) && !/tts|image|audio|live|embedding|robotics|computer|native|exp|learnlm|customtools|research|deep|nano|agent|veo|imagen|-\d{3}$|-\d{2}-\d{4}$/i.test(id));
    const ver = id => { const m = id.match(/gemini-(\d+)(?:\.(\d+))?/); return m ? +m[1] * 100 + +(m[2] || 0) : 0; };
    const orden = (a, b) => ver(b) - ver(a) || (/preview/.test(a) - /preview/.test(b)) || (/latest/.test(b) - /latest/.test(a));
    // nivel gratuito 2026: los Flash/Flash-Lite ≥ 3 son gratis; Pro y los 2.5 (en proyectos nuevos) no → se prefieren los ≥ 3
    const nuevo = id => ver(id) >= 300, ord2 = (a, b) => (nuevo(b) - nuevo(a)) || orden(a, b);
    const flash = ids.filter(id => /flash/.test(id) && !/lite/.test(id)).sort(ord2), lite = ids.filter(id => /flash-lite/.test(id)).sort(ord2), pro = ids.filter(id => /-pro/.test(id)).sort(orden);
    const estable = L => L.find(id => !/preview/.test(id)) || L[0];
    return { rapido: estable(flash) || estable(lite) || ids[0], potente: estable(pro) || null, flash, lite, pro };
  }

  // ---- propuestas (crear / actualizar componentes): nada se guarda sin aprobar
  function compVacio(id, nombre) {
    return { id, nombre: nombre || id, tipo: "electronico", categoria: "Otros", etiquetas: [], fabricante: "", referencia: "", estado: "borrador", version: 1, unidad: "und",
      ficha: { descripcion: "", funcionamiento: "", voltaje: "", corriente: "", interfaz: "", entradas: "", salidas: "", dimensiones: "", datasheet: "", notas: "" },
      especificaciones: [], imagen: null, precios: [], busquedas: {}, montaje: null, zonas: [], pines: [], archivos: {}, historial: [] };
  }
  const GEO = ["montaje", "zonas", "pines", "modelo"];
  /** Aplica los campos elegidos de una propuesta; devuelve el componente nuevo (sin guardar). */
  function aplicarCambios(base, id, cambios, claves, fuente) {
    const c = base ? clone(base) : compVacio(id, cambios.nombre);
    let geo = false;
    for (const k of claves) {
      let v = clone(cambios[k]);
      if (k === "precios" && Array.isArray(v)) { const ex = c.precios || []; for (const nv of v) { nv.fecha = nv.fecha || hoy().slice(0, 7); const i = ex.findIndex(x => x.proveedor === nv.proveedor); if (i >= 0) ex[i] = nv; else ex.push(nv); } c.precios = ex; continue; }
      if (k === "especificaciones" && Array.isArray(v)) { const ex = c.especificaciones || []; for (const nv of v) { const i = ex.findIndex(x => x.param === nv.param); if (i >= 0) ex[i] = nv; else ex.push(nv); } c.especificaciones = ex; continue; }
      if (k === "etiquetas" && Array.isArray(v)) { c.etiquetas = [...new Set([...(c.etiquetas || []), ...v])]; continue; }
      if (k === "imagen.src" || k === "imagen") { c.imagen = { src: typeof v === "string" ? v : (v && v.src), origen: "web (" + (fuente || "propuesta") + ")" }; continue; }
      if (k === "montaje" && v) { v = Object.assign({ origen: "centro", fijacion: (v.agujeros || []).length ? "tornillo" : "guia_deslizante", agujeros: [], altura_superior: 0, altura_inferior: 0, holgura_inferior_cableado: 0 }, v); v.nota = (v.nota ? v.nota + " " : "") + "Propuesto por el asistente a partir del datasheet: verificar con calibrador."; }
      if (k === "pines" && Array.isArray(v)) v = v.map(p => Object.assign({ x: null, y: null }, p));
      setPath(c, k, v);
      if (GEO.includes(k.split(".")[0])) geo = true;
    }
    if (base && geo) c.version = (c.version || 1) + 1;
    if (geo && c.montaje && c.montaje.pcb) c.cad_pendiente = true;
    if (geo || !base) c.estado = "borrador";
    c.historial = c.historial || [];
    c.historial.push({ v: c.version || 1, fecha: hoy(), nota: (base ? "Actualizado" : "Creado") + ` con datos de ${fuente || "búsqueda automática"} (aprobado): ${claves.join(", ")}`, cambios: claves });
    c.modificado = new Date().toISOString();
    return c;
  }
  function extraerPropuestas(text) {
    const props = []; const re = /```mountlab-propuesta\s*([\s\S]*?)```/g; let m;
    while ((m = re.exec(text))) { try { const p = JSON.parse(m[1]); if (p && p.componente && p.cambios) props.push(p); } catch (e) { props.push({ error: "No pude leer la propuesta: " + e.message }); } }
    return { limpio: text.replace(re, "").trim(), props };
  }
  const corto = v => { if (v == null) return '<span class="muted">(vacío)</span>';
    if (typeof v === "string" && v.startsWith("data:image")) return `<img src="${v}" style="max-height:80px;max-width:140px;border-radius:6px">`;
    if (v && typeof v === "object" && v.base) { const b = v.base; return esc(`${(MLPlant.BASES[b.tipo || "placa"] || {}).n || "Placa"} ${b.forma === "redonda" ? "Ø" + b.d : b.L + " × " + b.W} × ${b.espesor} mm`) + ((v.piezas || []).length ? ` · ${v.piezas.length} pieza(s): ${esc(v.piezas.map(q => q.plantilla).join(", ").slice(0, 80))}` : ""); }
    if (v && typeof v === "object" && Array.isArray(v.pcb)) return esc(`Placa ${v.pcb.join(" × ")} mm`) + ((v.agujeros || []).length ? ` · ${v.agujeros.length} agujero(s) Ø${v.agujeros[0].d}` : " · sin agujeros");
    if (typeof v === "string") return /^https?:/.test(v) ? (/\.(png|jpe?g|webp|gif)(\?|$)/i.test(v) ? `<img src="${esc(v)}" style="max-height:70px;max-width:120px">` : `<a href="${esc(v)}" target="_blank" rel="noopener">${esc(v.slice(0, 60))}…</a>`) : esc(v.length > 160 ? v.slice(0, 160) + "…" : v);
    const s = JSON.stringify(v); return s.length < 90 ? `<code>${esc(s)}</code>` : `<details><summary>${Array.isArray(v) ? v.length + " elementos" : "objeto"}</summary><pre style="white-space:pre-wrap;font-size:11px;margin:4px 0">${esc(JSON.stringify(v, null, 1))}</pre></details>`; };
  function htmlPropuesta(p, i, estado) {
    if (p.error) return `<div class="msg warn">${esc(p.error)}</div>`;
    const base = p._nuevo ? null : comp(p.componente), crear = !base;
    const filas = Object.entries(p.cambios).map(([k, v]) => {
      const f = (p.fuentes || {})[k], cf = (p.confianza || {})[k];
      return `<tr><td><input type="checkbox" data-pk="${i}" data-k="${esc(k)}" ${cf === "baja" ? "" : "checked"} style="width:auto" ${estado ? "disabled" : ""}></td><td><b>${esc(k)}</b>${cf ? ` <span class="tag ${cf === "alta" ? "ok" : cf === "media" ? "warn" : "bad"}">${esc(cf)}</span>` : ""}${GEO.includes(k.split(".")[0]) ? ' <span class="tag warn">verificar</span>' : ""}</td>
        ${crear ? "" : `<td class="small">${corto(getPath(base, k))}</td>`}<td class="small">${corto(v)}</td><td class="small">${f ? `<a href="${esc(f)}" target="_blank" rel="noopener">fuente ↗</a>` : '<span class="muted">—</span>'}</td></tr>`;
    }).join("");
    return `<div class="panel" style="margin-top:8px;padding:12px;background:var(--bg2)">
      <div class="row" style="justify-content:space-between"><b>${crear ? "➕ Crear" : "✎ Actualizar"} ${esc(p.cambios.nombre || (base && base.nombre) || p.componente)} <span class="tag">${esc(p.componente)}</span></b>
      ${estado ? `<span class="tag ${estado.startsWith("Aprobado") || estado.startsWith("Enviado") ? "ok" : "bad"}">${esc(estado)}</span>` : ""}</div>
      ${p.resumen ? `<div class="small muted" style="margin:4px 0">${esc(p.resumen)}</div>` : ""}
      <div style="overflow:auto"><table class="t" style="margin-top:6px"><tr><th></th><th>Campo</th>${crear ? "" : "<th>Actual</th>"}<th>Propuesto</th><th>Fuente</th></tr>${filas}</table></div>
      ${estado ? "" : `<div class="row" style="margin-top:8px"><button class="pri sm" data-pa="${i}">Aprobar seleccionados</button><button class="sm" data-pp="${i}">Enviar a Pendientes</button><button class="sm danger" data-pd="${i}">Descartar</button></div>`}</div>`;
  }
  /** Normaliza un modelo propuesto (ids, nombres, parámetros por defecto; descarta plantillas desconocidas). */
  function modeloLimpio(mo) {
    if (!mo || !mo.base) return null;
    const tipo = MLPlant.BASES[mo.base.tipo] ? mo.base.tipo : "placa", b = Object.assign({ tipo }, clone(MLPlant.BASES[tipo].def), mo.base);
    if (b.forma === "redonda" && !b.d) b.d = b.L || 20; if (!b.L) b.L = b.d || 20; if (!b.W) b.W = b.forma === "redonda" ? b.L : 20;
    const cuenta = {}, piezas = (mo.piezas || []).filter(q => q && MLPlant.plantilla(q.plantilla)).map((q, i) => { const t = MLPlant.plantilla(q.plantilla); cuenta[t.id] = (cuenta[t.id] || 0) + 1;
      return { id: "p" + (i + 1), plantilla: t.id, nombre: q.nombre || `${t.n.split(" (")[0]} ${cuenta[t.id]}`, cara: q.cara === "B" ? "B" : "A", x: +q.x || 0, y: +q.y || 0, rot: +q.rot || 0, z: +q.z || 0, params: Object.assign(MLPlant.paramsDef(t), q.params || {}) }; });
    return { version: 1, base: b, piezas };
  }
  async function guardarPropuesta(p, claves, fuenteTxt, adjIds) {
    const base = comp(p.componente);
    if (!base && !p.cambios.nombre) throw new Error("La propuesta no trae nombre para el componente nuevo");
    const c = aplicarCambios(base, p.componente, p.cambios, claves.filter(k => k !== "imagen" || !String(p.cambios.imagen).startsWith("data:")), fuenteTxt);
    if (!base) { if (!claves.includes("categoria") && p.cambios.categoria) c.categoria = p.cambios.categoria; if (!claves.includes("nombre")) c.nombre = p.cambios.nombre; }
    const adj = (adjIds || []).map(id => S.adj[id]).filter(Boolean), extra = [];
    // modelo 3D: el propuesto o uno a partir del montaje → montaje, zonas y pines sincronizados → DXF/STEP/plano en GitHub
    if (claves.includes("modelo")) c.modelo = modeloLimpio(p.cambios.modelo);
    if (!c.modelo && c.montaje && c.montaje.pcb && claves.includes("montaje")) c.modelo = MLPlant.desdeMontaje(c);
    if (c.modelo) { MLPlant.sincronizar(c); c.cad_pendiente = true; extra.push("modelo 3D"); }
    // foto subida en el chat
    const foto = claves.includes("imagen") && String(p.cambios.imagen).startsWith("data:") ? p.cambios.imagen : null;
    if (foto) { c.imagen = { src: foto, origen: "foto subida en el chat" }; if (Store.mode === "github") c.imagen.src = await Store.uploadImage(c.id, foto); extra.push("foto"); }
    // copia del datasheet subido
    const pdf = adj.find(a => a.kind === "pdf");
    if (pdf && Store.mode === "github") {
      const nombre = `${c.id}_datasheet.pdf`, ruta = `archivos/${c.id}/${nombre}`;
      try { await Store.putFile(ruta, pdf.b64, `${c.id}: datasheet subido desde el chat (${pdf.nombre})`);
        c.archivos = Object.assign({}, c.archivos, { datasheet: { nombre, fecha: hoy(), subido: true, fuente: "subido desde el chat: " + pdf.nombre, carpeta: `archivos/${c.id} (repositorio)`, url: `https://github.com/${Store.cfg.owner}/${Store.cfg.repo}/raw/${Store.cfg.branch}/${ruta}` } }); extra.push("datasheet PDF"); }
      catch (e) { toast("No se pudo guardar el PDF: " + e.message, 6000); }
    }
    const m = await Store.save("componentes", c, `${c.id} v${c.version || 1}: ${base ? "actualizado" : "creado"} con el asistente (${claves.join(", ")})`);
    return { c, m, extra: extra.join(", ") };
  }
  async function propuestaAPendientes(p, claves, fuenteTxt) {
    const cambios = Object.fromEntries(claves.map(k => [k, p.cambios[k]]));
    const pend = { id: `${p.componente}_${Date.now().toString(36)}`, componente: p.componente, fuente: fuenteTxt, fecha: hoy(), resumen: p.resumen || "", cambios, fuentes: p.fuentes || {}, confianza: p.confianza || {} };
    return Store.save("pendientes", pend, `Pendiente: propuesta del asistente para ${p.componente}`);
  }
  const idDe = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
  function chipAdj(a, i) {
    const ic = a.thumb ? `<img src="${a.thumb}" alt="">` : `<span>${a.kind === "pdf" ? "📄" : a.kind === "imagen" ? "🖼" : "📝"}</span>`;
    return `<span class="adj ${a.cargando ? "cargando" : ""}" title="${esc(a.nombre)}">${ic}<span class="n">${esc(a.nombre)}${a.cargando ? " · leyendo…" : a.paginas ? ` · ${a.paginas} pág.` : ""}</span>${i != null && !a.cargando ? `<button class="x" data-qx="${i}" title="Quitar">✕</button>` : ""}</span>`;
  }
  // ---- panel del asistente (en todas las ventanas)
  function abrirAsistente(ancho) {
    const d = $("#drawer"); d.classList.add("open"); document.body.classList.add("drawer-open");
    if (ancho != null) { d.classList.toggle("wide", !!ancho); document.body.classList.toggle("drawer-wide", !!ancho); }
    $("#btnIA").classList.add("on"); try { localStorage.setItem("ml_drawer", "1"); } catch (e) { }
    if (!$("#asHost").childElementCount) vAsistente();
    if (window.MLAgent) MLAgent.refrescar();
    setTimeout(() => { const q = $("#q"); if (q && matchMedia("(pointer:fine)").matches) q.focus(); }, 250);
  }
  function cerrarAsistente() { $("#drawer").classList.remove("open", "wide"); document.body.classList.remove("drawer-open", "drawer-wide"); $("#btnIA").classList.remove("on"); try { localStorage.removeItem("ml_drawer"); } catch (e) { } }
  function preguntar(q) { abrirAsistente(); const t = $("#q"); if (!t) return; t.value = q; $("#send").click(); }
  function vAsistente() {
    const sinKey = false;   // el modo local funciona sin clave
    if (S.buscar === undefined) S.buscar = true;
    if (!S.modo) S.modo = nubeLista() ? "auto" : "local";
    if (!nubeLista() && S.modo !== "local") S.modo = "local";
    MLLocal.asegurar(Store.db.componentes);
    const sinResp = (() => { try { return JSON.parse(localStorage.getItem("ml_sinresp")) || []; } catch (e) { return []; } })();
    const H = $("#asHost");
    H.innerHTML = `<div class="row" style="justify-content:space-between;padding:8px 14px 0;gap:6px"><div class="row" style="gap:4px">${[["auto", "🔀 Auto", "Responde local y gratis; si no sabe o le pides investigar, consulta a la nube"], ["local", "⚡ Local", "Sin internet ni costo: busca en tu biblioteca y maneja la app"], ["nube", "☁ Nube", iaNombre()]].map(([k, n, t]) => `<button class="sm ${S.modo === k ? "on" : ""}" data-modo="${k}" title="${esc(t)}" ${k !== "local" && !nubeLista() ? "disabled" : ""}>${n}</button>`).join("")}</div>
        <div class="row" style="gap:4px"><label class="sm btn" style="margin:0;padding:4px 8px;font-size:12px" title="${iaBusca() ? "La nube busca datasheets, medidas y precios en internet" : "El proveedor OpenAI/compatible no busca en internet desde aquí"}"><input type="checkbox" id="qB" ${S.buscar && iaBusca() ? "checked" : ""} ${iaBusca() ? "" : "disabled"}> 🔎 Web</label><button class="sm ghost" id="qC" title="Nueva conversación">🗋</button></div></div>
      ${!nubeLista() ? '<div class="msg info small" style="margin:8px 14px 0">Modo ⚡ local: responde gratis desde tu biblioteca y maneja la app con órdenes (“abre el bme280”, “pasa a la cara B”). Para investigar en internet agrega una clave de Claude o Gemini en <a href="#/ajustes">Ajustes</a>.</div>' : ""}
      <details class="small" style="margin:6px 14px 0"><summary>🧠 Cerebro local: <span id="cbE">${esc(MLLocal.estado())}</span>${sinResp.length ? ` · <b>${sinResp.length} sin respuesta</b>` : ""}</summary>
        <div class="panel" style="margin-top:6px;padding:10px"><div class="row" style="flex-wrap:nowrap"><input id="cbQ" placeholder="Prueba cómo interpreta una frase, ej. “sensr de presion”"><button class="sm" id="cbR">Reentrenar</button></div><div id="cbO" class="small" style="margin-top:6px"></div>
        <div class="small muted" style="margin-top:6px">Comandos: <code>aprende: termo = lm75_modulo</code> · <code>olvida: termo</code> · <code>revisa proyecto termo-01</code> · órdenes de la app (“exporta el BOM”, “toma la imagen del modelo”)</div>
        ${sinResp.length ? `<div style="margin-top:8px"><b>Sin respuesta</b> (enséñale a qué componente se refieren):${sinResp.slice(-10).reverse().map(x => `<div class="row" style="justify-content:space-between;margin-top:3px"><span>“${esc(x)}”</span><button class="sm" data-ens="${esc(x)}">Enseñar</button></div>`).join("")}<button class="sm" id="cbL" style="margin-top:6px">Limpiar lista</button></div>` : ""}</div></details>
      <div class="log" id="log"></div>
      <div id="adjBox" class="adj-box"></div>
      <div class="in"><div class="in-tools"><button class="sm ghost" id="qF" title="Adjuntar foto o datasheet (PDF) · también puedes arrastrarlo o pegarlo">📎</button><button class="sm ghost" id="qCam" title="Tomar foto con la cámara">📷</button></div>
        <textarea id="q" rows="2" placeholder="Pregunta, da una orden o adjunta un datasheet… (Enter envía)" ${sinKey ? "disabled" : ""}></textarea><button class="pri" id="send" ${sinKey ? "disabled" : ""}>➤</button>
        <input type="file" id="qFile" accept="image/*,application/pdf,.pdf,.txt" multiple hidden><input type="file" id="qFoto" accept="image/*" capture="environment" hidden></div>`;
    const log = $("#log");
    const fmt = t => esc(t).replace(/\[\[([a-z0-9_]+)\]\]/g, (m, id) => comp(id) ? `<a class="cref" href="#/c/${id}">${esc(comp(id).nombre)}</a>` : m).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    const ejemplos = ["¿Qué voltaje usa el bme28o?", "pines del lm75", "¿Qué sensores I2C tengo?", "abre el proyecto cansat", "busca I2C", ...(nubeLista() ? ["Agrega el sensor MPU6050 (GY-521): datasheet, pines, medidas y precios en Colombia", "Completa el datasheet del TP4056"] : [])];
    const pintaLog = () => {
      if (!S.chat.length) { log.innerHTML = `<div class="muted small" style="text-align:center;margin-top:20px">Pregúntale por tus componentes, dale <b>órdenes</b> para manejar la app (“abre el bme280”, “exporta el BOM”, “pasa a la cara B”) o pídele que <b>agregue o complete</b> uno: investiga y te muestra una <b>propuesta</b> que tú apruebas.</div><div class="row" style="justify-content:center;margin-top:8px">${ejemplos.map(e => `<button class="sm ex">${esc(e)}</button>`).join("")}</div>`; $$(".ex").forEach(b => b.onclick = () => { if (!sinKey) { $("#q").value = b.textContent; enviar(); } }); return; }
      log.innerHTML = S.chat.map((m, mi) => m.role === "user" ? `<div class="bub u">${(m.adj || []).length ? `<div class="adj-row">${m.adj.map(a => chipAdj(a)).join("")}</div>` : ""}${esc(m.content)}</div>` : m.role === "act" ? `<div class="bub act">${m.ok === false ? "⚠" : "⚡"} ${esc(m.content)}</div>` :
        `<div class="bub a" style="max-width:100%">${m.modelo ? `<div class="small muted" style="margin-bottom:4px">☁ ${esc(m.modelo)}</div>` : ""}${m.local ? `<div class="small muted" style="margin-bottom:4px">⚡ local · ${esc(m.via)}${m.conf ? " · " + Math.round(m.conf * 100) + "%" : ""}</div>` : ""}${fmt(m.vista ?? m.content)}
          ${m.local && (m.ids || []).length ? `<div class="row" style="margin-top:6px;gap:4px">${m.ids.map(id => comp(id) ? `<button class="sm" data-sug="${esc(comp(id).nombre)}">${esc(comp(id).nombre)}</button>` : "").join("")}</div>` : ""}
          ${m.accion && !m.accionHecha ? `<div class="row" style="margin-top:6px"><button class="pri sm" data-acc="${mi}">Confirmar</button><button class="sm" data-accx="${mi}">Cancelar</button></div>` : m.accionHecha ? `<div class="small" style="margin-top:4px">${esc(m.accionHecha)}</div>` : ""}
          ${m.local && nubeLista() && !m.subida ? `<div style="margin-top:6px"><button class="sm" data-nube="${mi}">☁ Preguntar a la nube${S.buscar ? " (con búsqueda)" : ""}</button></div>` : ""}
          ${(m.acciones || []).map((a, ai) => `<div class="row" style="margin-top:6px;gap:6px"><span class="tag vio">⚡ ${esc(a.n)}</span>${a.estado ? `<span class="small muted">${esc(a.estado)}</span>` : `<button class="pri sm" data-ax="${mi}:${ai}">Hacer</button><button class="sm" data-axn="${mi}:${ai}">No</button>`}</div>`).join("")}
          ${(m.props || []).map((p, pi) => htmlPropuesta(p, mi + ":" + pi, (m.estados || {})[pi])).join("")}
          ${(m.creados || []).map(x => `<div class="bub act" style="margin-top:8px">✓ ${esc(x.nombre)} quedó en la biblioteca · <a href="#/c/${encodeURIComponent(x.id)}">Abrir ficha</a>${x.modelo ? ` · <a href="#/c/${encodeURIComponent(x.id)}" data-tabm="modelo">Ver modelo 3D</a> · <a href="#/c/${encodeURIComponent(x.id)}" data-tabm="archivos">DXF / STEP / plano</a>` : ""}</div>`).join("")}
          ${(m.fuentes || []).length ? `<details style="margin-top:6px"><summary class="small">Fuentes consultadas (${m.fuentes.length})</summary><ul class="small" style="margin:4px 0;padding-left:18px">${m.fuentes.slice(0, 15).map(f => `<li><a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.titulo)}</a></li>`).join("")}</ul></details>` : ""}</div>`).join("");
      log.scrollTop = log.scrollHeight;
      const cl = id => { const [mi, pi] = id.split(":").map(Number); return { m: S.chat[mi], p: S.chat[mi].props[pi], pi }; };
      const claves = id => $$(`[data-pk="${id}"]`).filter(x => x.checked).map(x => x.dataset.k);
      const fuenteTxt = () => "asistente IA · " + iaNombre();
      const marca = (m, pi, txt) => { m.estados = m.estados || {}; m.estados[pi] = txt; pintaLog(); };
      $$("[data-pa]", log).forEach(b => b.onclick = async () => {
        const { m, p, pi } = cl(b.dataset.pa), ks = claves(b.dataset.pa); if (!ks.length) return toast("Marca al menos un campo");
        b.disabled = true; b.textContent = "Guardando…";
        if (!comp(p.componente)) p._nuevo = true;
        try { const r = await guardarPropuesta(p, ks, m.local ? "datasheet subido (lectura local)" : fuenteTxt(), m.adjIds); marca(m, pi, `Aprobado · ${r.m === "github" ? "guardado en GitHub" : "guardado local"}${r.extra ? " · " + r.extra : ""}${r.c.cad_pendiente ? " · generando DXF, STEP y plano" : ""}`); estadoPill(); toast("Guardado: " + r.c.nombre);
          m.creados = [...(m.creados || []), { id: r.c.id, nombre: r.c.nombre, modelo: !!r.c.modelo }]; pintaLog(); }
        catch (e) { toast("Error: " + e.message, 6000); b.disabled = false; b.textContent = "Aprobar seleccionados"; }
      });
      $$("[data-pp]", log).forEach(b => b.onclick = async () => {
        const { m, p, pi } = cl(b.dataset.pp), ks = claves(b.dataset.pp); if (!ks.length) return toast("Marca al menos un campo");
        try { await propuestaAPendientes(p, ks, fuenteTxt()); marca(m, pi, "Enviado a Pendientes"); estadoPill(); } catch (e) { toast("Error: " + e.message, 6000); }
      });
      $$("[data-pd]", log).forEach(b => b.onclick = () => { const { m, pi } = cl(b.dataset.pd); marca(m, pi, "Descartado"); });
      $$("[data-sug]", log).forEach(b => b.onclick = () => { $("#q").value = b.dataset.sug; enviar(); });
      $$("[data-tabm]", log).forEach(b => b.onclick = () => { S.tabSig = b.dataset.tabm; });
      $$("[data-nube]", log).forEach(b => b.onclick = () => { const mi = +b.dataset.nube; S.chat[mi].subida = true; nube(S.chat[mi - 1].content); });
      $$("[data-ax]", log).forEach(b => b.onclick = async () => { const [mi, ai] = b.dataset.ax.split(":").map(Number), a = S.chat[mi].acciones[ai]; const r = await ejecutarAccionIA(a, true); a.estado = r.ok ? "✓ " + r.msg : "⚠ " + r.msg; pintaLog(); });
      $$("[data-axn]", log).forEach(b => b.onclick = () => { const [mi, ai] = b.dataset.axn.split(":").map(Number); S.chat[mi].acciones[ai].estado = "Descartada"; pintaLog(); });
      $$("[data-accx]", log).forEach(b => b.onclick = () => { S.chat[+b.dataset.accx].accionHecha = "Cancelado"; pintaLog(); });
      $$("[data-acc]", log).forEach(b => b.onclick = async () => {
        const m = S.chat[+b.dataset.acc], A = m.accion, c = clone(comp(A.id)); if (!c) return;
        c.alias = c.alias || [];
        if (A.tipo === "alias" && !c.alias.includes(A.alias)) c.alias.push(A.alias);
        if (A.tipo === "olvida") c.alias = c.alias.filter(x => norm(x) !== norm(A.alias));
        try { await Store.save("componentes", c, `${c.id}: ${A.tipo === "alias" ? "aprende alias “" + A.alias + "”" : "olvida alias “" + A.alias + "”"}`); m.accionHecha = A.tipo === "alias" ? `✓ Aprendido: “${A.alias}” → ${c.nombre}` : "✓ Alias eliminado";
          let L = []; try { L = JSON.parse(localStorage.getItem("ml_sinresp")) || []; } catch (e) {} localStorage.setItem("ml_sinresp", JSON.stringify(L.filter(x => norm(x) !== norm(A.alias))));
          MLLocal.construir(Store.db.componentes); estadoPill(); } catch (e) { toast("Error: " + e.message, 5000); }
        pintaLog();
      });
    };
    const norm = t => String(t).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    $$("[data-modo]").forEach(b => b.onclick = () => { S.modo = b.dataset.modo; vAsistente(); });
    const cbO = () => { const q = $("#cbQ").value; if (!q.trim()) { $("#cbO").innerHTML = ""; return; } const B = MLLocal.buscar(q, 3), N = MLLocal.red(q, 3);
      $("#cbO").innerHTML = `<b>Búsqueda:</b> ${B.map(r => `${esc(r.c.nombre)} <span class="muted">${Math.round(r.s * 100)}%</span>`).join(" · ") || "—"}<br><b>Red neuronal:</b> ${N.map(r => `${esc(r.c.nombre)} <span class="muted">${Math.round(r.p * 100)}%</span>`).join(" · ") || "entrenando…"}`; };
    $("#cbQ").oninput = cbO;
    $("#cbR").onclick = () => { MLLocal.construir(Store.db.componentes); $("#cbE").textContent = "entrenando…"; };
    document.addEventListener("ml-red", () => { const e = $("#cbE"); if (e) e.textContent = MLLocal.estado(); }, { once: true });
    $$("[data-ens]").forEach(b => b.onclick = () => { $("#q").value = `aprende: ${b.dataset.ens} = `; $("#q").focus(); });
    const cl2 = $("#cbL"); if (cl2) cl2.onclick = () => { localStorage.removeItem("ml_sinresp"); vAsistente(); };
    pintaLog();
    $("#q").onkeydown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } };
    S.pend = S.pend || [];
    const pintaAdj = () => { const b = $("#adjBox"); if (!b) return; b.innerHTML = S.pend.map((a, i) => chipAdj(a, i)).join(""); $$("[data-qx]", b).forEach(x => x.onclick = () => { S.pend.splice(+x.dataset.qx, 1); pintaAdj(); }); };
    S.agregarArchivos = async files => {
      for (const f of [...files]) {
        if (f.size > 40e6) { toast(`“${f.name}” pesa ${(f.size / 1e6).toFixed(0)} MB: el máximo es 40 MB`, 5000); continue; }
        const tmp = { id: "tmp", nombre: f.name, kind: /pdf/i.test(f.type + f.name) ? "pdf" : "imagen", cargando: true }; S.pend.push(tmp); pintaAdj();
        try { const a = await MLArchivos.leer(f); S.adj[a.id] = a; S.pend.splice(S.pend.indexOf(tmp), 1, a); }
        catch (e) { S.pend.splice(S.pend.indexOf(tmp), 1); toast(e.message, 5000); }
        pintaAdj();
      }
      $("#q").focus();
    };
    $("#qF").onclick = () => $("#qFile").click(); $("#qCam").onclick = () => $("#qFoto").click();
    $("#qFile").onchange = e => { S.agregarArchivos(e.target.files); e.target.value = ""; };
    $("#qFoto").onchange = e => { S.agregarArchivos(e.target.files); e.target.value = ""; };
    $("#q").onpaste = e => { const fs = [...(e.clipboardData || {}).files || []]; if (fs.length) { e.preventDefault(); S.agregarArchivos(fs); } };
    pintaAdj();
    $("#send").onclick = enviar;
    $("#qB").onchange = e => { S.buscar = e.target.checked; };
    $("#qC").onclick = () => { S.chat = []; pintaLog(); };
    const PIDE_NUBE = /\b(agrega\w*|añad\w*|anad\w*|crea\w*|busca\w*|complet\w*|actualiz\w*|investig\w*|internet|recomiend\w*|recomend\w*|necesito|disen\w*|diseñ\w*|compar\w*|alternativ\w*|por que|porque|explica\w*)\b/i;
    S.pintaLog = pintaLog;
    async function enviar() {
      if ((S.pend || []).some(a => a.cargando)) return toast("Espera: todavía estoy leyendo el archivo…");
      let q = $("#q").value.trim(); const adj = (S.pend || []).splice(0); pintaAdj();
      if (!q && !adj.length) return; $("#q").value = "";
      if (adj.length && matchMedia("(min-width: 1180px)").matches) { $("#drawer").classList.add("wide"); document.body.classList.add("drawer-wide"); }
      if (adj.length) return conArchivos(q || "Revisa este archivo e identifica el componente; propón agregarlo a la biblioteca con toda su información técnica.", adj);
      // 1) ¿es una orden para la app? (agente local, sin internet)
      const it = window.MLAgent && !/^(aprende|olvida|revisa proyecto)\b/i.test(q) ? MLAgent.intencion(q) : null;
      if (it) {
        S.chat.push({ role: "user", content: q }); const r = await MLAgent.ejecutar(it.a, it.args);
        S.chat.push({ role: "act", content: r.msg, ok: r.ok }); pintaLog(); return;
      }
      if (S.modo !== "nube" && /^\s*(hola|holi|buen[oa]s?( d[ií]as| tardes| noches)?|hey|qu[eé] tal|gracias|muchas gracias|ok|listo|vale|perfecto)[\s!.,¡¿?]*$/i.test(q)) {
        const g = /gracias/i.test(q) ? "¡Con gusto! ¿Qué más hacemos?" : /^(ok|listo|vale|perfecto)/i.test(q) ? "👍" : "¡Hola! Pregúntame por tus componentes, pídeme que busque un datasheet en internet, adjunta una foto o un PDF, o dame una orden (\"abre termo-01\", \"código de colores\"…).";
        S.chat.push({ role: "user", content: q }, { role: "assistant", content: g, local: true, via: "saludo" }); pintaLog(); return;
      }
      if (S.modo !== "nube") {
        const r = MLLocal.responder(q, Store.db);
        const directo = S.modo === "local" || !nubeLista() || ["comando", "sistema experto"].includes(r.via) || (!PIDE_NUBE.test(q) && r.confianza >= 0.6 && !r.sinRespuesta);
        if (directo) {
          if (r.sinRespuesta) { let L = []; try { L = JSON.parse(localStorage.getItem("ml_sinresp")) || []; } catch (e) {} if (!L.includes(q)) L.push(q); localStorage.setItem("ml_sinresp", JSON.stringify(L.slice(-50))); }
          let texto = r.texto;
          if (r.sinRespuesta && PIDE_NUBE.test(q) && !nubeLista()) texto += "\n\nPara buscarlo en internet y crear la ficha necesito una clave de Claude o Gemini (Ajustes).";
          S.chat.push({ role: "user", content: q }, { role: "assistant", content: texto, local: true, via: r.via, conf: r.confianza, ids: r.ids, accion: r.accion });
          pintaLog(); return;
        }
      }
      return nube(q);
    }
    async function conArchivos(q, adj) {
      const meta = adj.map(a => ({ id: a.id, nombre: a.nombre, kind: a.kind, thumb: a.thumb, paginas: a.paginas }));
      if (nubeLista() && S.modo !== "local") return nube(q, adj, meta);
      S.chat.push({ role: "user", content: q, adj: meta });
      const props = [], notas = [], cats = [...new Set(Store.db.componentes.map(c => c.categoria))];
      const pdfs = adj.filter(a => a.kind === "pdf" || a.kind === "texto"), fotos = adj.filter(a => a.kind === "imagen");
      for (const a of pdfs) {
        if (!(a.texto || "").trim()) { notas.push(`“${a.nombre}” no tiene texto seleccionable (parece escaneado): sin IA en la nube no puedo leerlo.`); continue; }
        const p = MLArchivos.analizar(a, { categorias: cats, idDe: idDe });
        const rf = norm(p.cambios.referencia || "").replace(/[^a-z0-9]/g, "");
        const ya = rf.length >= 4 ? (Store.db.componentes.find(c => c.referencia && norm(c.referencia).replace(/[^a-z0-9]/g, "") === rf) || comp(p.componente) || Store.db.componentes.find(c => (norm(c.id) + " " + norm(c.nombre)).replace(/[^a-z0-9 ]/g, "").split(" ").includes(rf))) : comp(p.componente);
        if (ya) { p.componente = ya.id; delete p.cambios.nombre;
          const vacio = v => v == null || v === "" || (Array.isArray(v) && !v.length) || (typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length);
          for (const k of Object.keys(p.cambios)) if (!["especificaciones", "etiquetas"].includes(k) && !vacio(getPath(ya, k))) delete p.cambios[k];   // no piso lo que ya tienes
          if (ya.montaje && ya.montaje.pcb) { delete p.cambios.montaje; delete p.cambios.modelo; }
          notas.push(Object.keys(p.cambios).length ? `Ya tienes ${ya.nombre} en la biblioteca: te propongo completar solo lo que le falta.` : `Ya tienes ${ya.nombre} en la biblioteca y el PDF no agrega datos nuevos.`); }
        else if (comp(p.componente)) p.componente = p.componente + "_" + Date.now().toString(36).slice(-3);
        if (fotos.length && !ya) { p.cambios["imagen"] = fotos[0].foto; p.confianza.imagen = "alta"; }
        props.push(p);
      }
      if (!pdfs.length && fotos.length) {
        const r = MLLocal.buscar(q, 1)[0], cand = r && r.s >= 0.65 ? r.c : null;
        if (cand) props.push({ componente: cand.id, resumen: `Foto para ${cand.nombre} (lo reconocí por tu mensaje).`, cambios: { imagen: fotos[0].foto }, confianza: { imagen: "alta" }, fuentes: {} });
        else { const nom = q.length < 60 && !/revisa|identifica|analiza/i.test(q) ? q : fotos[0].nombre.replace(/\.[a-z]+$/i, "").replace(/[_-]+/g, " ");
          props.push({ componente: idDe(nom) || "componente_nuevo", resumen: "Sin IA en la nube no puedo reconocer la foto: corrige el nombre (escríbelo en tu mensaje) y completa la ficha después.", cambios: { nombre: nom, categoria: "Otros", imagen: fotos[0].foto }, confianza: { nombre: "baja", imagen: "alta" }, fuentes: {} }); }
      }
      const p0 = props[0];
      const txt = [p0 && p0.origen === "local" ? `Leí el datasheet en tu navegador (sin internet). ${p0.resumen}` : "", ...notas,
        p0 && p0.cambios.modelo ? `Con las medidas armé un modelo 3D básico (${p0.cambios.modelo.base.tipo === "prisma" ? "el encapsulado como prisma" : "la placa"}); al aprobar, GitHub genera el DXF de huella, el STEP y el plano con cotas. El PDF queda guardado como copia del datasheet.` : (pdfs.length ? "No encontré medidas confiables en el PDF: al crearlo podrás dibujar la placa en la pestaña Modelo 3D." : ""),
        !nubeLista() ? "Con una clave de Claude o Gemini (Ajustes) además leería tablas y planos, reconocería fotos y buscaría en internet medidas del módulo, agujeros y precios en Colombia." : ""].filter(Boolean).join("\n\n");
      S.chat.push({ role: "assistant", content: txt, vista: txt, local: true, via: "lectura de archivo", props: props.filter(p => Object.keys(p.cambios).length), adjIds: adj.map(a => a.id) });
      pintaLog();
    }
    async function nube(q, adj, meta) {
      const buscar = S.buscar && iaBusca();
      S.chat.push({ role: "user", content: q, adj: meta }); S.chat.push({ role: "assistant", content: adj ? "📄 Leyendo el archivo" + (buscar ? " e investigando…" : "…") : buscar ? "🔎 Investigando…" : "…", adjIds: adj ? adj.map(a => a.id) : undefined }); pintaLog();
      $("#send").disabled = true;
      const proys = Store.db.proyectos.map(p => `${p.id} "${p.nombre}" (${p.estado}): ` + (p.bom || []).map(b => `${b.id}×${b.cantidad}`).join(", ")).join("\n");
      const system = `Eres el asistente de MountLab, la biblioteca de componentes de John (estudiante de ingeniería biomédica/mecatrónica en Colombia; diseña dispositivos con ESP32, KiCad y SolidWorks). Responde en español, breve y técnico.
Cuando menciones un componente de la biblioteca escribe su id entre dobles corchetes, por ejemplo [[esp32_38p]], para que la app lo convierta en enlace.
Para recomendaciones: prioriza lo que ya tiene, revisa voltajes (3.3 V vs 5 V), interfaces y consumo, y di qué le falta comprar. Los precios de la biblioteca son estimados en COP.
${buscar ? "Tienes búsqueda web: úsala para datasheets oficiales (fabricante, distribuidores como Mouser, DigiKey, LCSC, Adafruit, SparkFun), planos con medidas del módulo y precios actuales en Colombia (Mercado Libre Colombia, tiendas de electrónica colombianas) y AliExpress/Amazon." : "No tienes búsqueda web en esta pregunta: no inventes enlaces ni precios."}

PROPUESTAS — cuando John pida AGREGAR, CREAR, COMPLETAR o ACTUALIZAR componentes:
1. Investiga y explica en 3-6 líneas qué encontraste y qué dudas quedan.
2. Termina con un bloque por componente, exactamente con este formato (JSON válido, sin comentarios):
\`\`\`mountlab-propuesta
{"componente":"id_en_minusculas_con_guiones_bajos","resumen":"una línea",
 "cambios":{
  "nombre":"…","tipo":"electronico|mecanico|material|herramienta|otro","categoria":"…","etiquetas":["I2C","…"],"fabricante":"…","referencia":"…",
  "ficha.descripcion":"…","ficha.funcionamiento":"…","ficha.voltaje":"…","ficha.corriente":"…","ficha.interfaz":"…","ficha.dimensiones":"…","ficha.datasheet":"URL directa al PDF",
  "especificaciones":[{"param":"…","valor":"…"}],
  "pines":[{"n":"VCC","func":"Alimentación 3.3–5 V"}],
  "montaje":{"pcb":[largo_mm,ancho_mm,espesor_mm],"agujeros":[{"x":0,"y":0,"d":3}],"altura_superior":0,"altura_inferior":0},
  "precios":[{"proveedor":"Mercado Libre CO","precio_cop":0,"url":"…"}],
  "imagen.src":"URL directa a una imagen .jpg/.png del producto"},
 "fuentes":{"campo":"URL de donde salió ese dato"},
 "confianza":{"campo":"alta|media|baja"}}
\`\`\`
Reglas: para ACTUALIZAR usa el id existente de la biblioteca y pon solo los campos que cambian o faltan; para CREAR usa un id nuevo que no exista. Incluye "nombre" y "categoria" al crear (usa categorías existentes si encajan: ${[...new Set(Store.db.componentes.map(c => c.categoria))].join(", ")}).
Montaje: mm, ORIGEN EN EL CENTRO de la placa, X a lo largo, Y a lo ancho; agujeros con coordenadas desde el centro. Inclúyelo solo si hallaste un plano o medidas confiables (si no, omítelo). Precios en pesos colombianos (convierte de USD si hace falta y dilo en el resumen).
Nunca inventes URLs: si no encontraste un dato, omite el campo. Marca confianza "baja" a lo dudoso.

BIBLIOTECA (id | nombre | categoría | tipo | voltaje | corriente | interfaz | dimensiones | etiquetas | precio | estado | descripción):
${contextoCatalogo()}

PROYECTOS:
${proys}

PANTALLA ACTUAL: ${ctxActual().titulo}${S.W ? ` (componente [[${S.W.id}]], pestaña ${S.tab})` : ""}.
ACCIONES DE LA APP — si John te pide hacer algo en la interfaz (abrir, cambiar de pestaña, guardar, exportar, colocar piezas en el modelo 3D…), además de responder agrega uno o más bloques así (JSON válido):
\`\`\`mountlab-accion
{"accion":"id_de_la_accion","args":{}}
\`\`\`
Acciones disponibles ahora (id: descripción [args]):
${accionesParaIA()}
Usa solo ids de esta lista. Las de navegación se ejecutan solas; las que modifican datos le piden confirmación a John.${adj ? `

ARCHIVOS ADJUNTOS — John adjuntó ${adj.map(a => `“${a.nombre}” (${a.kind === "pdf" ? "datasheet PDF" + (a.paginas ? ", " + a.paginas + " págs." : "") : a.kind === "imagen" ? "foto" : "texto"})`).join(", ")}.
1. Revisa primero el archivo: identifica el componente (referencia exacta, fabricante, si es chip suelto o módulo/breakout) y extrae TODA la información técnica (voltajes, corrientes, interfaz y dirección I2C, tabla de pines, medidas del encapsulado o del módulo, agujeros de montaje, temperatura, notas de diseño).
2. ${buscar ? "Luego busca en internet SOLO lo que el archivo no trae: medidas y agujeros del módulo comercial, precios en Colombia, URL directa del datasheet oficial e imagen." : "No tienes búsqueda web: usa solo lo que trae el archivo."}
3. Si ya existe en la biblioteca, propón ACTUALIZARLO; si no, propón CREARLO. Incluye montaje y además el campo "modelo" (modelo 3D paramétrico) con este formato:
"modelo":{"base":{"tipo":"placa|prisma|cilindro","forma":"rect|redondeada|redonda","L":largo,"W":ancho,"d":diametro,"espesor":espesor_o_altura,"radio":0,"color":"#166534"},"piezas":[{"plantilla":"id","cara":"A|B","x":0,"y":0,"rot":0,"params":{}}]}
Para un chip suelto usa base "prisma" con las medidas del encapsulado (color "#1f2937") y "montaje.pcb" = [largo, ancho, alto]. Para un módulo usa "placa" y coloca sus piezas principales con estas plantillas (ids): ${MLPlant.todas().map(t => t.id).join(", ")}. Coordenadas en mm desde el centro de la placa.
4. En el resumen di qué datos salieron del archivo y cuáles de internet.` : ""}`;
      const last = S.chat[S.chat.length - 1];
      try {
        const hist = S.chat.slice(0, -1).filter(m => m.role !== "act").slice(-12).map(m => ({ role: m.role, content: m.content })).filter((m, i, A) => !(m.role === "assistant" && i === 0));
        while (hist.length > 1 && hist[0].role !== "user") hist.shift();
        for (let i = hist.length - 1; i > 0; i--) if (hist[i].role === hist[i - 1].role) hist[i - 1].content += "\n" + hist.splice(i, 1)[0].content;
        if (adj && hist.length) { const u = hist[hist.length - 1]; u.content = [...adj.map(a => a.kind === "imagen" ? { type: "img", mime: a.mime, b64: a.b64 } : a.kind === "pdf" ? { type: "pdf", b64: a.b64, texto: a.texto, nombre: a.nombre } : { type: "text", text: `Archivo ${a.nombre}:\n${(a.texto || "").slice(0, 60000)}` }), { type: "text", text: u.content }]; }
        const r = await llamarIA(system, hist, buscar, { potente: !!adj });
        const { limpio, props } = extraerPropuestas(r.text);
        const { limpio: limpio2, acciones } = extraerAcciones(limpio);
        Object.assign(last, { modelo: r.modelo, content: r.text, vista: limpio2 || (props.length ? "Esta es mi propuesta:" : acciones.length ? "Listo:" : r.text), props, fuentes: r.fuentes, acciones });
        for (const a of acciones) if (!a.peligro && !a.estado) { const x = await ejecutarAccionIA(a); a.estado = x.ok ? "✓ " + x.msg : "⚠ " + x.msg; }
      } catch (e) { Object.assign(last, { content: "No pude responder: " + e.message, vista: null }); }
      $("#send").disabled = false; pintaLog();
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
        <div><label>Proveedor</label><select id="aP">${Object.entries(IAS).map(([k, n]) => `<option value="${k}" ${(c.aiProv || "anthropic") === k ? "selected" : ""}>${n}</option>`).join("")}</select></div>
        <div id="aBox" style="margin-top:8px"></div>
        <div class="row" style="margin-top:8px"><button class="pri" id="aS">Guardar</button><span class="small muted" id="aMsg"></span></div>
        <div class="small muted" style="margin-top:6px">Las claves se guardan solo en este dispositivo. Puedes dejar varias guardadas y cambiar de proveedor cuando quieras.</div></div>
      <div class="panel"><h3>Google Drive (archivos pesados)</h3>
        <div><label>Carpeta MountLab en Drive (enlace)</label><input id="dD" value="${esc(c.drive)}" placeholder="https://drive.google.com/drive/folders/…"></div>
        <div class="row" style="margin-top:8px"><button id="dS">Guardar</button>${c.drive ? `<a class="btn" href="${esc(c.drive)}" target="_blank" rel="noopener">Abrir carpeta ↗</a>` : ""}</div>
        <div class="small muted" style="margin-top:6px">Los STEP/DXF se guardan en <b>MountLab/biblioteca/archivos/&lt;id&gt;/</b>. La subida automática desde GitHub se configura con el secreto <code>RCLONE_CONFIG</code> (ver README).</div></div>
      <div class="panel" style="grid-column:1/-1"><h3>🔐 Acceso y seguridad</h3><div id="acc"></div></div>
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
    const aBox = () => {
      const p = $("#aP").value;
      if (p === "anthropic") {
        $("#aBox").innerHTML = `${c.aiKey ? "" : `<ol class="small" style="margin:0 0 8px;padding-left:18px;line-height:1.7"><li>Entra a <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noopener">platform.claude.com</a> (Claude Console) con tu cuenta.</li><li>En <b>Billing</b> compra créditos (la API es prepago; tu plan de Claude.ai no la incluye, salvo Max/Team con créditos mensuales).</li><li>En <b>API keys</b> → <b>Create key</b>, cópiala, pégala aquí y pulsa <b>Conectar y probar</b>.</li></ol>`}
          <div><label>Clave API de Claude</label><input id="k1" type="password" value="${esc(c.aiKey)}" placeholder="sk-ant-…" autocomplete="off"></div>
          <div class="grid2" style="margin-top:8px"><div><label>Modelo rápido (chat, búsquedas)</label><input id="m1" list="dlCl" value="${esc(c.aiModel || "claude-haiku-5-5")}"></div><div><label>Modelo potente (datasheets, circuitos)</label><input id="m1p" list="dlCl" value="${esc(c.aiPro || "claude-sonnet-5-5")}"></div></div><datalist id="dlCl"></datalist>
          <div class="row" style="margin-top:8px"><button class="pri sm" id="cC">⚡ Conectar y probar</button></div>
          <div class="small muted" style="margin-top:6px">Rápido = Haiku (el más económico); potente = Sonnet. La búsqueda web de Claude cobra aparte por búsqueda.</div>`;
        $("#cC").onclick = async () => {
          const k = $("#k1").value.trim(); if (!k) return toast("Pega primero la clave de Claude");
          const b = $("#cC"); b.disabled = true; $("#aMsg").textContent = "Conectando con Claude…";
          try {
            const H = { "x-api-key": k, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" };
            let ids = []; try { const r = await fetchT("https://api.anthropic.com/v1/models?limit=100", { headers: H }, 20000); const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(errClaude(r.status, j)), { duro: r.status === 401 || r.status === 403 }); ids = (j.data || []).map(m => m.id); } catch (e) { if (e.duro) throw e; }
            const ver = id => { const m = id.match(/(\d+)-(\d+)(?:-|$)/); return m ? +m[1] * 100 + +m[2] : 0; }, mejor = f => ids.filter(f).sort((a, b) => ver(b) - ver(a))[0];
            const rap = mejor(x => /haiku/.test(x)) || $("#m1").value.trim() || "claude-haiku-5-5", pot = mejor(x => /sonnet/.test(x)) || $("#m1p").value.trim() || "claude-sonnet-5-5";
            if (ids.length) $("#dlCl").innerHTML = ids.map(i => `<option value="${esc(i)}">`).join("");
            const t0 = performance.now(), r = await fetchT("https://api.anthropic.com/v1/messages", { method: "POST", headers: Object.assign({ "content-type": "application/json" }, H), body: JSON.stringify({ model: rap, max_tokens: 16, messages: [{ role: "user", content: "Responde solo con la palabra: listo" }] }) }, 30000);
            const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(errClaude(r.status, j));
            const txt = (j.content || []).filter(x => x.type === "text").map(x => x.text).join("").trim();
            $("#m1").value = rap; $("#m1p").value = pot; Store.saveCfg({ aiProv: "anthropic", aiKey: k, aiModel: rap, aiPro: pot }); S.modo = "auto";
            $("#aMsg").innerHTML = `<span style="color:var(--ok)">✓ Claude conectado en ${Math.round(performance.now() - t0)} ms (“${esc(txt || "ok")}”) · rápido: <b>${esc(rap)}</b> · potente: <b>${esc(pot)}</b></span>`;
            toast("Asistente conectado a Claude"); if ($("#asHost").childElementCount) vAsistente();
          } catch (e) { $("#aMsg").innerHTML = `<span style="color:var(--bad)">✗ ${esc(e.message)}</span>`; }
          b.disabled = false;
        };
      }
      if (p === "gemini") { let u = {}; try { u = JSON.parse(localStorage.getItem("ml_uso_ia")) || {}; } catch (e) { } const hoyU = u.dia === hoy() ? u : null;
        $("#aBox").innerHTML = `${c.gemKey ? "" : `<ol class="small" style="padding-left:18px;margin:0 0 10px;line-height:1.6"><li>Abre <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> con tu cuenta de Google.</li><li>Pulsa <b>Create API key</b> (crear clave) y cópiala.</li><li>Pégala aquí y pulsa <b>Conectar y probar</b>: elijo solo los mejores modelos disponibles para tu clave.</li></ol>`}
        <div><label>Clave API de Gemini</label><input id="k2" type="password" value="${esc(c.gemKey)}" placeholder="AQ.… o AIza…" autocomplete="off"></div>
        <div class="grid2" style="margin-top:8px"><div><label>Modelo rápido (chat, búsquedas)</label><input id="m2" list="dlGem" value="${esc(c.gemModel)}"></div><div><label>Modelo potente (datasheets, circuitos)</label><input id="m2p" list="dlGem" value="${esc(c.gemPro || "")}" placeholder="(igual al rápido)"></div></div><datalist id="dlGem"></datalist>
        <div class="row" style="margin-top:8px"><button class="pri sm" id="gC">⚡ Conectar y probar</button><button class="sm" id="gL">Ver modelos</button></div>
        ${hoyU ? `<div class="small muted" style="margin-top:6px">Hoy: <b style="color:var(--ink)">${hoyU.n}</b> consultas · ${Math.round((hoyU.tin + hoyU.tout) / 1000)} k tokens (${Object.entries(hoyU.mod).map(([m, n]) => `${esc(m)} ×${n}`).join(", ")})</div>` : ""}
        <details class="small" style="margin-top:8px"><summary>¿Y mi plan Google AI Pro?</summary><div class="muted" style="margin-top:4px;line-height:1.5">El plan Pro mejora la app de Gemini y los límites dentro de AI Studio, pero <b>no paga la API</b>: la clave funciona en el <b>nivel gratuito</b> (sin tarjeta) con límites de consultas por minuto y por día, y en ese nivel Google puede usar las consultas para mejorar sus modelos (no pegues datos privados). Si un día necesitas más, se activa la facturación por uso en el proyecto de AI Studio y la misma clave sigue funcionando.</div></details>`; }
      if (p === "openai") $("#aBox").innerHTML = `<div><label>URL base (OpenAI, OpenRouter, Groq, DeepSeek…)</label><input id="u3" value="${esc(c.oaUrl)}"></div><div style="margin-top:8px"><label>Clave API</label><input id="k3" type="password" value="${esc(c.oaKey)}" placeholder="sk-…"></div><div style="margin-top:8px"><label>Modelo</label><input id="m3" value="${esc(c.oaModel)}" placeholder="ej. gpt-…"></div>`;
      const gc = $("#gC"); if (gc) gc.onclick = async () => {
        const k = $("#k2").value.trim(); if (!k) return toast("Pega primero la clave de Gemini");
        gc.disabled = true; const t00 = performance.now(); let paso = "1/2 · verificando la clave y listando modelos";
        const tic = setInterval(() => { $("#aMsg").textContent = `Conectando con Gemini… ${paso} (${Math.round((performance.now() - t00) / 1000)} s)`; }, 500);
        try {
          const L = await listarGemini(k, true), el = elegirGemini(L); if (!el.rapido) throw new Error("Tu clave no tiene modelos Gemini disponibles");
          paso = `2/2 · clave válida (${L.length} modelos) · probando ${el.rapido}`;
          $("#dlGem").innerHTML = L.map(m => `<option value="${esc(m.id)}">${esc(m.nombre)}</option>`).join("");
          // la clave ya es válida: se guarda aunque la prueba de texto tarde
          Store.saveCfg({ aiProv: "gemini", gemKey: k, gemModel: el.rapido, gemPro: el.potente || "" }); S.modo = "auto";
          $("#m2").value = el.rapido; $("#m2p").value = el.potente || "";
          const fE = el.flash.filter(x => !/preview/.test(x)), lE = el.lite.filter(x => !/preview/.test(x));
          // se intercalan Flash y Flash-Lite: si los Flash están saturados (503), los Lite suelen tener capacidad
          const candidatos = [...new Set([el.rapido, lE[0], fE[1], lE[1], fE[2]].filter(Boolean))].slice(0, 5);
          let ok = null, fallos = [];
          for (const m of candidatos) {
            paso = `2/2 · clave válida (${L.length} modelos) · probando ${m}`;
            const t0 = performance.now(), cuerpo = { contents: [{ role: "user", parts: [{ text: "Responde solo con la palabra: listo" }] }], generationConfig: { maxOutputTokens: 256 } };
            try {
              const j = await pedirGemini(m, cuerpo, k, 25000, true);
              const txt = (((j.candidates || [])[0] || {}).content || {}).parts?.filter(x => x.text && !x.thought).map(x => x.text).join("").trim();
              ok = { m, ms: Math.round(performance.now() - t0), txt }; break;
            } catch (e) { fallos.push(`${m}: ${e.message}`); }
          }
          clearInterval(tic);
          const mezcla = []; for (let i = 0; i < 6; i++) mezcla.push(fE[i], lE[i]);
          const alt = [...new Set([...(ok && ok.m !== el.rapido ? [ok.m] : []), ...mezcla.filter(Boolean), ...el.flash, ...el.lite])].filter(x => x !== el.rapido).filter((x, i, A) => !/gemini-[12]\./.test(x) || !A.some(y => !/gemini-[12]\./.test(y))).slice(0, 6);
          // ¿el Pro tiene cupo en tu proyecto? (en el nivel gratuito normalmente no) → si no, el potente es el mejor Flash
          let potente = el.potente;
          if (ok && potente) { paso = "probando el modelo potente " + potente; try { await pedirGemini(potente, { contents: [{ role: "user", parts: [{ text: "ok" }] }], generationConfig: { maxOutputTokens: 16 } }, k, 20000, true); } catch (e) { potente = fE[0] || ok.m; } }
          if (!ok) potente = fE[0] || el.rapido; if (!potente && ok) potente = el.flash.find(x => !/preview/.test(x)) || ok.m;
          el.potente = potente; $("#m2p").value = potente || ""; Store.saveCfg({ gemPro: potente || "" });
          Store.saveCfg({ gemAlt: alt });
          if (ok) {
            // el rápido sigue siendo el mejor Flash; si no respondió en la prueba, el que sí respondió va primero en la cascada
            $("#aMsg").innerHTML = `<span style="color:var(--ok)">✓ Gemini conectado en ${ok.ms} ms (“${esc(ok.txt || "ok")}”) · rápido: <b>${esc(el.rapido)}</b>${ok.m !== el.rapido ? ` (saturado ahora; respondió <b>${esc(ok.m)}</b> y queda de respaldo)` : ""}${el.potente ? ` · potente: <b>${esc(el.potente)}</b>` : ""} · ${L.length} modelos</span>`;
          } else {
            $("#aMsg").innerHTML = `<span style="color:var(--warn,#e6b450)">⚠ La clave es válida y quedó guardada (${L.length} modelos), pero ningún modelo respondió a la prueba:<br>${fallos.map(esc).join("<br>")}</span>`;
            gc.disabled = false; return;
          }
          toast("Asistente conectado a Gemini"); if ($("#asHost").childElementCount) vAsistente();
        } catch (e) { clearInterval(tic); $("#aMsg").innerHTML = `<span style="color:var(--bad)">✗ ${esc(e.message)}</span>`; }
        clearInterval(tic); gc.disabled = false;
      };
      const gl = $("#gL"); if (gl) gl.onclick = async () => {
        const k = $("#k2").value.trim(); if (!k) return toast("Pega primero la clave");
        try { const ms = await listarGemini(k, true); $("#dlGem").innerHTML = ms.map(m => `<option value="${esc(m.id)}">${esc(m.nombre)}</option>`).join(""); $("#aMsg").textContent = ms.length + " modelos disponibles: haz clic en un campo de modelo para elegir"; } catch (e) { $("#aMsg").textContent = "✗ " + e.message; }
      };
    };
    $("#aP").onchange = aBox; aBox();
    $("#aS").onclick = () => {
      const p = $("#aP").value, v = id => ($("#" + id) ? $("#" + id).value.trim() : undefined), o = { aiProv: p };
      if (p === "anthropic") Object.assign(o, { aiKey: v("k1"), aiModel: v("m1") || "claude-haiku-5-5", aiPro: v("m1p") || "" });
      if (p === "gemini") Object.assign(o, { gemKey: v("k2"), gemModel: v("m2") || "gemini-2.5-flash", gemPro: v("m2p") || "" });
      if (p === "openai") Object.assign(o, { oaUrl: v("u3") || "https://api.openai.com/v1", oaKey: v("k3"), oaModel: v("m3") });
      Store.saveCfg(o); $("#aMsg").textContent = "✓ Guardado: " + iaNombre(); toast("Asistente: " + iaNombre());
    };
    $("#dS").onclick = () => { Store.saveCfg({ drive: $("#dD").value.trim() }); vAjustes(); };
    panelAcceso($("#acc"));
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

  // =====================================================================  ANEXO DE PASIVOS
  /** "4k7" → "4.7 kΩ" (o "100 nF") según la familia; si no se entiende, deja el texto. */
  function valorBonito(c, txt) {
    txt = String(txt || "").trim(); if (!txt || !c || !c.valores) return txt;
    const tipo = c.valores.magnitud === "resistencia" ? "R" : "C", L = MLPas.leer(txt).filter(o => o.tipo === tipo);
    const o = L.find(x => /RKM|resistencia|capacitancia|notación|número/.test(x.como)) || L[0];
    return o ? (tipo === "R" ? MLPas.fmtR(o.valor) : MLPas.fmtC(o.valor)) : txt;
  }
  const familias = () => Store.db.componentes.filter(c => c.valores);
  function cubre(c, tipo, v) {
    const val = c.valores; if (!val || (tipo === "R") !== (val.magnitud === "resistencia")) return false;
    if (val.lista) return val.lista.some(x => Math.abs(x - v) <= v * 1e-6);
    if (v < val.min * 0.999 || v > val.max * 1.001) return (val.extra || []).includes(v);
    return MLPas.series(v).includes(val.serie) || ((val.serie === "E96" || val.serie === "E48") && MLPas.series(v).includes("E24"));
  }
  const GRUPOS_PAS = {
    R: [["Agujero pasante (axiales)", c => c.etiquetas.includes("axial") || c.etiquetas.includes("chasis")], ["SMD", c => c.etiquetas.includes("SMD")], ["Variables, redes y especiales", () => true]],
    C: [["Cerámicos", c => c.etiquetas.includes("cerámico") && !c.etiquetas.includes("seguridad")], ["Electrolíticos y polímero", c => c.etiquetas.includes("electrolítico") || c.etiquetas.includes("polímero")], ["Tantalio", c => c.etiquetas.includes("tantalio")], ["Película y seguridad (AC)", c => c.etiquetas.includes("película") || c.etiquetas.includes("seguridad")], ["Supercapacitores y otros", () => true]],
  };
  function vPasivos(tab) {
    S.ptab = tab || S.ptab || "familias";
    const F = familias(), nR = F.filter(c => c.valores.magnitud === "resistencia").length, nC = F.length - nR;
    const tabs = [["familias", "Familias"], ["valor", "Valor y códigos"], ["colores", "Código de colores"], ["calc", "Calculadoras"], ["series", "Series E"], ["tablas", "Tablas"], ["guia", "Guía rápida"]];
    app.innerHTML = `<div class="hero"><div><div class="small"><a href="#/catalogo">← Catálogo</a></div><h1>Ω Anexo de <span>pasivos</span></h1><div class="muted">${nR} familias de resistencias · ${nC} de capacitores · todos los valores comerciales, códigos y medidas típicas</div></div>
        <div style="flex:1;max-width:420px"><input id="pvQ" placeholder="Valor o código: 4k7, 100n, 104, 473J, 01C, 2A104J…" value="${esc(S.pvQ || "")}" style="font-size:16px;padding:12px 14px"></div></div>
      <div class="tabs">${tabs.map(([k, n]) => `<button data-pt="${k}" class="${S.ptab === k ? "on" : ""}">${n}</button>`).join("")}</div><div id="pvB"></div>`;
    $$("[data-pt]").forEach(b => b.onclick = () => vPasivos(b.dataset.pt));
    const q = $("#pvQ"); q.onkeydown = e => { if (e.key === "Enter") { S.pvQ = q.value.trim(); vPasivos("valor"); } };
    const B = $("#pvB");
    if (S.ptab === "familias") {
      const tarjeta = c => `<div class="card" data-id="${esc(c.id)}"><div class="im" style="height:110px">${imgHtml(c)}</div><div class="bd"><div class="nm">${esc(c.nombre)}</div>
        <div class="small muted">${esc(((c.especificaciones || []).find(e => /Potencia|Voltaje/.test(e.param)) || {}).valor || "")} · ${esc(((c.especificaciones || []).find(e => e.param === "Tolerancia") || {}).valor || "")}</div>
        <div class="small">${esc(((c.especificaciones || []).find(e => e.param === "Rango de valores") || {}).valor || "")}</div></div></div>`;
      const bloque = (t, tipo) => { const L = F.filter(c => (c.valores.magnitud === "resistencia") === (tipo === "R")), usados = new Set(); return `<h2 style="margin:18px 0 6px">${t}</h2>` + GRUPOS_PAS[tipo].map(([g, f]) => { const G = L.filter(c => !usados.has(c.id) && f(c)); G.forEach(c => usados.add(c.id)); return G.length ? `<h3 class="muted" style="margin:14px 0 8px">${esc(g)} <span class="tag">${G.length}</span></h3><div class="cards">${G.map(tarjeta).join("")}</div>` : ""; }).join(""); };
      B.innerHTML = bloque("Resistencias", "R") + bloque("Capacitores", "C") + (F.length ? "" : '<div class="panel muted">Aún no están las familias: espera a que GitHub publique la base.</div>');
      $$(".card[data-id]", B).forEach(d => d.onclick = () => location.hash = "#/c/" + encodeURIComponent(d.dataset.id));
    }
    if (S.ptab === "valor") {
      const L = MLPas.leer(S.pvQ || "");
      B.innerHTML = !S.pvQ ? `<div class="panel muted">Escribe arriba un valor o el código impreso en la pieza y pulsa Enter. Ejemplos: ${["4k7", "220R", "100n", "104", "473J", "2A104J", "01C", "4702", "R010", "4u7"].map(x => `<button class="sm" data-ej="${x}">${x}</button>`).join(" ")}</div>`
        : L.length ? L.map(o => o.tipo === "R" ? tarjetaR(o) : tarjetaC(o)).join("") : `<div class="panel">No entendí “${esc(S.pvQ)}”. Prueba con 4k7, 10K, 2R2, 100n, 22pF, 104…</div>`;
      $$("[data-ej]", B).forEach(b => b.onclick = () => { S.pvQ = b.dataset.ej; vPasivos("valor"); });
      $$("[data-fam]", B).forEach(b => b.onclick = () => location.hash = "#/c/" + encodeURIComponent(b.dataset.fam));
      $$("[data-bom]", B).forEach(b => b.onclick = () => { const [id, v] = b.dataset.bom.split("|"); aProyecto(id, v); });
    }
    if (S.ptab === "colores") {
      S.cb = S.cb || { n: 4, d: [4, 7, 0], m: 2, t: "5", tc: 100 };
      const sel = (id, opts, v) => `<select id="${id}" style="width:auto">${opts.map(([val, n, hex]) => `<option value="${val}" ${String(val) === String(v) ? "selected" : ""} style="background:${hex || "#111"};color:${["Blanco", "Amarillo", "Plateado", "Dorado", "Naranja"].includes(n) ? "#111" : "#fff"}">${n}</option>`).join("")}</select>`;
      const dig = MLPas.COL.map(([n, h], i) => [i, n, h]), mul = [[-2, "Plateado ×0.01", "#c0c0c0"], [-1, "Dorado ×0.1", "#d4a017"], ...MLPas.COL.map(([n, h], i) => [i, `${n} ×10^${i}`, h])];
      const tol = Object.entries(MLPas.TOL).map(([k, [n]]) => [k, `${n} ${MLPas.TOL[k][1]}`, ""]);
      const c = S.cb, nd = c.n >= 5 ? 3 : 2, sig = +c.d.slice(0, nd).join(""), v = sig * Math.pow(10, c.m);
      const bandasSel = [...c.d.slice(0, nd).map(d => MLPas.COL[d]), c.m === -1 ? MLPas.ORO : c.m === -2 ? MLPas.PLATA : MLPas.COL[c.m], (() => { const t = MLPas.TOL[c.t]; return t[0] === "Dorado" ? MLPas.ORO : t[0] === "Plateado" ? MLPas.PLATA : MLPas.COL.find(x => x[0] === t[0]); })(), ...(c.n === 6 ? [MLPas.COL.find(x => x[0] === ({ 100: "Marrón", 50: "Rojo", 15: "Naranja", 25: "Amarillo", 10: "Azul", 5: "Violeta" })[c.tc])] : [])];
      B.innerHTML = `<div class="grid2" style="align-items:start"><div class="panel"><h3>Lee las bandas</h3>
          <div class="row" style="margin-bottom:10px">${[4, 5, 6].map(n => `<button class="sm ${c.n === n ? "on" : ""}" data-nb="${n}">${n} bandas</button>`).join("")}</div>
          <div class="row" style="gap:6px">${Array.from({ length: nd }, (_, i) => `<div><label>${i + 1}ª cifra</label>${sel("cbD" + i, dig.slice(i === 0 ? 1 : 0), c.d[i])}</div>`).join("")}<div><label>Multiplicador</label>${sel("cbM", mul, c.m)}</div><div><label>Tolerancia</label>${sel("cbT", tol, c.t)}</div>${c.n === 6 ? `<div><label>Coef. térmico</label>${sel("cbTC", [[100, "Marrón 100 ppm"], [50, "Rojo 50 ppm"], [15, "Naranja 15 ppm"], [25, "Amarillo 25 ppm"], [10, "Azul 10 ppm"], [5, "Violeta 5 ppm"]], c.tc)}</div>` : ""}</div>
          <div style="margin:16px 0;text-align:center">${MLPas.svgResistencia(bandasSel, 320, 80)}</div>
          <div style="text-align:center"><b style="font-size:28px">${MLPas.fmtR(v)}</b> <span class="muted">${MLPas.TOL[c.t][1]}${c.n === 6 ? " · " + c.tc + " ppm/°C" : ""}</span><div class="small muted">RKM: ${MLPas.rkm(v)} · ${MLPas.series(v).length ? "series " + MLPas.series(v).join(", ") : "no es un valor normalizado"}</div></div>
          <div class="row" style="justify-content:center;margin-top:10px"><button class="sm" id="cbVer">Ver todos los códigos de ${MLPas.fmtR(v)} →</button></div></div>
        <div class="panel"><h3>Tabla de colores (IEC 60062)</h3><table class="t"><tr><th>Color</th><th class="num">Cifra</th><th class="num">Multiplicador</th><th>Tolerancia</th><th class="num">ppm/°C</th></tr>
          ${(Store.db.tablas.pasivos ? Store.db.tablas.pasivos.colores : []).map(k => `<tr><td><span class="sw" style="background:${k.hex || "transparent"};border:1px solid var(--line2)"></span> ${esc(k.color)}</td><td class="num">${k.digito ?? "—"}</td><td class="num">${k.mult != null ? "×" + (k.mult >= 1e3 ? MLPas.fmtR(k.mult).replace(" Ω", "").replace("Ω", "") : k.mult) : "—"}</td><td>${esc(k.tol || "")}</td><td class="num">${k.tc ?? ""}</td></tr>`).join("")}</table>
          <div class="small muted" style="margin-top:8px">Se lee desde la banda más cercana a un extremo; la de tolerancia suele estar separada. Truco: “<b>N</b>i <b>M</b>e <b>R</b>ompas <b>N</b>ada <b>A</b>mor <b>V</b>erde <b>A</b>zul <b>V</b>ioleta <b>G</b>ris <b>B</b>lanco”.</div></div></div>`;
      $$("[data-nb]", B).forEach(b => b.onclick = () => { const n2 = +b.dataset.nb; while (c.d.length < 3) c.d.push(0);
        if (c.n < 5 && n2 >= 5 && c.m > -2) { c.d = [c.d[0], c.d[1], 0]; c.m--; } else if (c.n >= 5 && n2 < 5 && c.d[2] === 0 && c.m < 9) c.m++;
        c.n = n2; vPasivos("colores"); });
      Array.from({ length: nd }, (_, i) => $("#cbD" + i).onchange = e => { c.d[i] = +e.target.value; vPasivos("colores"); });
      $("#cbM").onchange = e => { c.m = +e.target.value; vPasivos("colores"); }; $("#cbT").onchange = e => { c.t = e.target.value; vPasivos("colores"); };
      if ($("#cbTC")) $("#cbTC").onchange = e => { c.tc = +e.target.value; vPasivos("colores"); };
      $("#cbVer").onclick = () => { S.pvQ = MLPas.rkm(v); vPasivos("valor"); };
    }
    if (S.ptab === "calc") {
      const k = S.calc = S.calc || { vcc: 5, vf: 2, if: 15, vin: 12, vout: 3.3, r2: 10000, r: 10000, c: 1e-7 };
      const e24 = x => MLPas.cercano(x, "E24"), e96 = x => MLPas.cercano(x, "E96");
      const rLed = (k.vcc - k.vf) / (k.if / 1000), rL = rLed > 0 ? Math.max(...MLPas.lista({ serie: "E24", min: 1, max: 1e7 }).filter(x => x <= rLed * 1.0001).slice(-1), 0) : 0;
      const rLsig = rLed > 0 ? MLPas.lista({ serie: "E24", min: 1, max: 1e7 }).find(x => x >= rLed - 1e-9) : 0, pLed = rLsig ? Math.pow((k.vcc - k.vf), 2) / rLsig : 0;
      const r1 = k.vout > 0 && k.vin > k.vout ? k.r2 * (k.vin / k.vout - 1) : 0, r1e = r1 ? e24(r1) : 0, voutReal = r1e ? k.vin * k.r2 / (r1e + k.r2) : 0, r1f = r1 ? e96(r1) : 0;
      const tau = k.r * k.c, fc = 1 / (2 * Math.PI * tau);
      const num = (id, v, n, u) => `<div><label>${n}</label><div class="row" style="flex-wrap:nowrap;gap:4px"><input type="number" step="any" data-k="${id}" value="${v}"><span class="small muted">${u}</span></div></div>`;
      const potFam = p => p <= 0.125 ? "1/8 W (SMD 0805) o más" : p <= 0.25 ? "1/4 W" : p <= 0.5 ? "1/2 W" : p <= 1 ? "1 W" : p <= 2 ? "2 W" : p <= 5 ? "5 W cerámica" : "≥ 10 W";
      B.innerHTML = `<div class="grid3" style="align-items:start">
        <div class="panel"><h3>💡 Resistencia para LED</h3><div class="grid3">${num("vcc", k.vcc, "Alimentación", "V")}${num("vf", k.vf, "Vf del LED", "V")}${num("if", k.if, "Corriente", "mA")}</div>
          <div style="margin-top:10px">R = (Vcc − Vf) / I = <b>${MLPas.fmtR(+rLed.toFixed(2))}</b><br>Usa <b>${rLsig ? MLPas.fmtR(rLsig) : "—"}</b> (E24, siguiente valor) → ${rLsig ? (((k.vcc - k.vf) / rLsig) * 1000).toFixed(1) + " mA" : ""}<br>Potencia ${(pLed * 1000).toFixed(0)} mW → mínimo <b>${potFam(pLed * 2)}</b> (con margen 2×)</div>
          <div class="small muted" style="margin-top:6px">Vf típico: rojo 1.8–2 V · amarillo 2.1 V · verde 2.2–3.2 V · azul/blanco 3–3.3 V.</div>${rLsig ? `<button class="sm" style="margin-top:8px" data-ir="${esc(MLPas.rkm(rLsig))}">Códigos de ${MLPas.fmtR(rLsig)} →</button>` : ""}</div>
        <div class="panel"><h3>➗ Divisor de voltaje</h3><div class="grid3">${num("vin", k.vin, "Vin", "V")}${num("vout", k.vout, "Vout deseado", "V")}${num("r2", k.r2, "R2 (abajo)", "Ω")}</div>
          <div style="margin-top:10px">R1 = R2 · (Vin/Vout − 1) = <b>${MLPas.fmtR(+r1.toFixed(1))}</b><br>E24: <b>${r1e ? MLPas.fmtR(r1e) : "—"}</b> → Vout ${voutReal.toFixed(3)} V<br>E96 (1 %): <b>${r1f ? MLPas.fmtR(r1f) : "—"}</b> → ${r1f ? (k.vin * k.r2 / (r1f + k.r2)).toFixed(3) : "—"} V<br>Corriente ${r1e ? ((k.vin / (r1e + k.r2)) * 1000).toFixed(2) : "—"} mA</div>
          <div class="small muted" style="margin-top:6px">Para el ADC del ESP32 (máx. 3.3 V, ideal ≤ 2.5 V) usa R de 10–100 kΩ y un capacitor de 100 nF a tierra.</div></div>
        <div class="panel"><h3>⏱ Filtro / tiempo RC</h3><div class="grid2">${num("r", k.r, "R", "Ω")}${num("c", k.c, "C", "F")}</div>
          <div style="margin-top:10px">τ = R·C = <b>${tau >= 1 ? tau.toFixed(3) + " s" : tau >= 1e-3 ? (tau * 1e3).toFixed(3) + " ms" : (tau * 1e6).toFixed(3) + " µs"}</b><br>Corte (−3 dB) f = 1/(2πRC) = <b>${fc >= 1e3 ? (fc / 1e3).toFixed(2) + " kHz" : fc.toFixed(2) + " Hz"}</b><br>Carga al 99 %: ${(5 * tau >= 1 ? (5 * tau).toFixed(2) + " s" : (5 * tau * 1e3).toFixed(2) + " ms")} (5τ)</div>
          <div class="small muted" style="margin-top:6px">C se escribe en faradios: 100 nF = 1e-7 · 10 µF = 1e-5.</div></div></div>`;
      $$("[data-k]", B).forEach(i => i.onchange = () => { k[i.dataset.k] = +i.value; vPasivos("calc"); });
      $$("[data-ir]", B).forEach(b => b.onclick = () => { S.pvQ = b.dataset.ir; vPasivos("valor"); });
    }
    if (S.ptab === "series") {
      const T = (Store.db.tablas.pasivos || {}).series || {};
      B.innerHTML = `<div class="panel"><p class="muted" style="margin-top:0">Los valores comerciales siguen las series E (IEC 60063): cada serie reparte la década en pasos iguales en escala logarítmica. Multiplica por 1, 10, 100, 1 k… (ej. 4.7 → 4.7 Ω, 47 Ω, 470 Ω, 4.7 kΩ…).</p>
        ${MLPas.ORDEN.map(k => `<div style="margin:12px 0"><b>${k}</b> <span class="tag">${(T[k] || {}).tolerancia || ""}</span> <span class="small muted">${MLPas.S[k].length} valores por década</span><div class="chips" style="margin-top:6px">${MLPas.S[k].map(v => `<span class="chip" data-v="${v}">${(+v).toFixed(k === "E48" || k === "E96" ? 2 : 1)}</span>`).join("")}</div></div>`).join("")}</div>`;
      $$("[data-v]", B).forEach(c => c.onclick = () => { S.pvQ = MLPas.rkm(+c.dataset.v * 1000); vPasivos("valor"); });
    }
    if (S.ptab === "tablas") {
      const T = Store.db.tablas.pasivos || {};
      B.innerHTML = `<div class="grid2" style="align-items:start">
        <div class="panel"><h3>Tamaños SMD (resistencias y MLCC)</h3><table class="t"><tr><th>Imperial</th><th>Métrico</th><th class="num">L × W × H (mm)</th><th class="num">Potencia R</th></tr>${(T.smd || []).map(r => `<tr><td><b>${r.tam}</b></td><td>${r.metrico}</td><td class="num">${r.L} × ${r.W} × ${r.H}</td><td class="num">${r.potencia_W} W</td></tr>`).join("")}</table><div class="small muted" style="margin-top:6px">En MLCC la altura crece con la capacidad (hasta ≈ W).</div></div>
        <div class="panel"><h3>Electrolíticos radiales: tamaño típico</h3><div style="max-height:360px;overflow:auto"><table class="t"><tr><th>Capacidad</th><th>Voltaje</th><th>Ø × L (mm)</th><th class="num">Paso</th></tr>${((T.electroliticos || {}).tamaños || []).map(([c, v, t]) => `<tr><td>${c}</td><td>${v}</td><td>${t}</td><td class="num">${((T.electroliticos || {}).paso_mm || {})[t.split("×")[0]] ?? "—"} mm</td></tr>`).join("")}</table></div><div class="small muted">${esc((T.electroliticos || {}).nota || "")}</div></div>
        <div class="panel"><h3>Dieléctricos cerámicos</h3><table class="t"><tr><th>Clase</th><th>Estabilidad</th><th>Uso</th></tr>${(T.dielectricos || []).map(d => `<tr><td><b>${esc(d.clase)}</b><div class="small muted">${esc(d.tipo)}</div></td><td class="small">${esc(d.estabilidad)}</td><td class="small">${esc(d.uso)}</td></tr>`).join("")}</table></div>
        <div class="panel"><h3>Tantalio SMD: casos</h3><table class="t"><tr><th>Caso</th><th>EIA</th><th class="num">L × W × H (mm)</th></tr>${(T.tantalio_smd || []).map(r => `<tr><td><b>${r.caso}</b></td><td>${r.eia}</td><td class="num">${r.L} × ${r.W} × ${r.H}</td></tr>`).join("")}</table>
          <h3 style="margin-top:14px">Código EIA-96 (SMD 1 %)</h3><div class="small muted">2 cifras = valor de la tabla E96 · letra = multiplicador (${Object.entries((T.eia96 || {}).letras || {}).map(([l, f]) => `${l}=${f}`).join(" · ")})</div>
          <div class="chips" style="margin-top:6px;max-height:160px;overflow:auto">${((T.eia96 || {}).codigos || []).map(c => `<span class="chip">${c.codigo} = ${c.valor}</span>`).join("")}</div></div></div>`;
    }
    if (S.ptab === "guia") {
      B.innerHTML = `<div class="grid2" style="align-items:start">
        <div class="panel"><h3>¿Qué resistencia uso?</h3><ul class="small" style="padding-left:18px;line-height:1.7">
          <li><b>Uso general</b> (pull-up, LED, base de transistor): carbón 1/4 W 5 % o SMD 0805.</li>
          <li><b>Precisión</b> (divisores para ADC, ganancia de amplificadores, instrumentación biomédica): película metálica 1 % (E96), mejor 0.1 % y 25 ppm/°C para puentes y referencias.</li>
          <li><b>Potencia</b>: calcula P = I²R y usa ≥ 2× (1 W, 2 W, 5 W cerámica, 25 W aluminio con disipador). Sepárala de la placa.</li>
          <li><b>Medir corriente</b>: shunt de mΩ 2512 + INA219/INA226; rutea las líneas de medida tipo Kelvin.</li>
          <li><b>Ajustes</b>: trimmer multivuelta para calibración fina; potenciómetro B (lineal) para control, A (log) para audio.</li>
          <li><b>Protección</b>: varistor en la entrada AC, polyfuse en USB, NTC de arranque en fuentes.</li></ul></div>
        <div class="panel"><h3>¿Qué capacitor uso?</h3><ul class="small" style="padding-left:18px;line-height:1.7">
          <li><b>Desacople</b>: 100 nF cerámico X7R pegado a cada pin de VCC + 10 µF por riel. En el ESP32: 10–22 µF + 100 nF junto al módulo.</li>
          <li><b>Osciladores, filtros, temporización</b>: cerámico C0G/NP0 o película (estables con voltaje y temperatura).</li>
          <li><b>Filtrado de fuente</b>: electrolítico 105 °C con voltaje ≥ 1.5–2× el de trabajo; polímero si el regulador es conmutado (bajo ESR).</li>
          <li><b>Audio y señales</b>: película (poliéster/polipropileno) para acople.</li>
          <li><b>Red eléctrica</b>: solo X2 (fase-neutro) e Y1/Y2 (a tierra); nunca un cerámico común.</li>
          <li><b>Respaldo de energía</b>: supercapacitor (moneda para RTC; cilíndrico para picos de GSM).</li>
          <li><b>Ojo con MLCC X5R/X7R</b>: con 5 V aplicados un 10 µF 0603 de 6.3 V puede quedar en 3 µF (DC-bias): elige mayor tamaño o voltaje.</li></ul></div></div>`;
    }
  }
  function tarjetaR(o) {
    const v = o.valor, b4 = MLPas.bandas(v, 4), b5 = MLPas.bandas(v, 5), cod = MLPas.smd(v), ser = MLPas.series(v), fams = familias().filter(c => cubre(c, "R", v));
    return `<div class="panel" style="margin-bottom:12px"><div class="row" style="justify-content:space-between"><div><span class="tag cat">Resistencia</span> <span class="small muted">leído como ${esc(o.como)}</span><h2 style="margin-top:6px">${MLPas.fmtR(v)} <span class="muted" style="font-size:15px">RKM ${MLPas.rkm(v)}</span></h2></div>
        <div class="small">${ser.length ? `Valor normalizado en ${ser.map(s => `<span class="tag ok">${s}</span>`).join(" ")}` : `<span class="tag warn">No es normalizado</span> más cercano: E12 ${MLPas.fmtR(MLPas.cercano(v, "E12"))} · E24 ${MLPas.fmtR(MLPas.cercano(v, "E24"))} · E96 ${MLPas.fmtR(MLPas.cercano(v, "E96"))}`}</div></div>
      <div class="grid3" style="margin-top:10px;align-items:start">
        <div><b class="small">4 bandas (5 %)</b>${b4 ? `<div>${MLPas.svgResistencia(b4.bandas)}</div><div class="small">${b4.bandas.map(x => x[0]).join(" · ")}${b4.aproximado != null ? `<br><span style="color:var(--warn)">≈ ${MLPas.fmtR(b4.aproximado)} (no cabe en 2 cifras)</span>` : ""}</div>` : '<div class="small muted">Fuera de rango</div>'}</div>
        <div><b class="small">5 bandas (1 %)</b>${b5 ? `<div>${MLPas.svgResistencia(b5.bandas)}</div><div class="small">${b5.bandas.map(x => x[0]).join(" · ")}</div>` : '<div class="small muted">Fuera de rango</div>'}</div>
        <div><b class="small">Código SMD</b><table class="t small" style="margin-top:4px"><tr><td>3 dígitos (5 %)</td><td><b>${esc(cod.tres || "—")}</b></td></tr><tr><td>4 dígitos (1 %)</td><td><b>${esc(cod.cuatro || "—")}</b></td></tr><tr><td>EIA-96 (0603 1 %)</td><td><b>${esc(cod.eia96 || "—")}</b></td></tr></table></div></div>
      <div style="margin-top:10px"><b class="small">Familias de tu biblioteca que lo tienen (${fams.length})</b><div class="row" style="margin-top:6px;gap:6px">${fams.map(c => `<span class="row" style="gap:2px"><button class="sm" data-fam="${esc(c.id)}">${esc(c.nombre.replace(/^Resistencia (de )?/, ""))}</button><button class="sm ghost" title="Añadir a un proyecto con este valor" data-bom="${esc(c.id)}|${esc(MLPas.fmtR(v))}">＋BOM</button></span>`).join("") || '<span class="small muted">Ninguna (valor fuera de las series cargadas)</span>'}</div></div></div>`;
  }
  function tarjetaC(o) {
    const v = o.valor, ser = MLPas.series(v), fams = familias().filter(c => cubre(c, "C", v)), cc = MLPas.codC(v);
    return `<div class="panel" style="margin-bottom:12px"><div class="row" style="justify-content:space-between"><div><span class="tag vio">Capacitor</span> <span class="small muted">leído como ${esc(o.como)}</span><h2 style="margin-top:6px">${MLPas.fmtC(v)} <span class="muted" style="font-size:15px">${MLPas.rkmC(v)} · ${+(v * 1e12).toPrecision(4)} pF</span></h2></div>
        <div class="small">${ser.length ? `Serie ${ser.map(s => `<span class="tag ok">${s}</span>`).join(" ")}` : `<span class="tag warn">No es normalizado</span> más cercano E6 ${MLPas.fmtC(MLPas.cercano(v, "E6"))} · E12 ${MLPas.fmtC(MLPas.cercano(v, "E12"))}`}</div></div>
      <div class="grid3" style="margin-top:10px"><div><b class="small">Código impreso</b><div style="font:700 26px ui-monospace,Consolas,monospace;margin-top:4px">${esc(cc || "—")}</div><div class="small muted">3 cifras en pF + letra de tolerancia (J ±5 %, K ±10 %, M ±20 %)</div></div>
        <div><b class="small">Equivalencias</b><div class="small" style="margin-top:4px">${+(v * 1e12).toPrecision(4)} pF = ${+(v * 1e9).toPrecision(4)} nF = ${+(v * 1e6).toPrecision(4)} µF</div></div>
        <div><b class="small">Tipo recomendado</b><div class="small" style="margin-top:4px">${v < 1e-9 ? "Cerámico C0G/NP0 o mica (RF, cristales)" : v <= 1e-6 ? "Cerámico X7R (desacople) o película (señal/audio)" : v <= 1e-4 ? "MLCC X5R grande, tantalio o electrolítico" : v < 0.05 ? "Electrolítico o polímero" : "Supercapacitor"}</div></div></div>
      <div style="margin-top:10px"><b class="small">Familias de tu biblioteca que lo tienen (${fams.length})</b><div class="row" style="margin-top:6px;gap:6px">${fams.map(c => `<span class="row" style="gap:2px"><button class="sm" data-fam="${esc(c.id)}">${esc(c.nombre.replace(/^Capacitor (de )?/, ""))}</button><button class="sm ghost" title="Añadir a un proyecto con este valor" data-bom="${esc(c.id)}|${esc(MLPas.fmtC(v))}">＋BOM</button></span>`).join("") || '<span class="small muted">Ninguna</span>'}</div></div></div>`;
  }
  /** Panel de valores comerciales en la ficha de una familia. */
  function panelValores(c) {
    const val = c.valores, L = MLPas.lista(val), R = val.magnitud === "resistencia", fm = R ? MLPas.fmtR : MLPas.fmtC;
    const dec = {}; L.forEach(v => { const k = v === 0 ? "0" : Math.floor(Math.log10(v) + 1e-9); (dec[k] = dec[k] || []).push(v); });
    const extra = Object.entries(val).filter(([k]) => !["magnitud", "unidad", "serie", "min", "max", "lista", "extra"].includes(k));
    return `<div class="panel" style="margin-top:12px"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Valores comerciales ${val.serie ? `<span class="tag ok">${esc(val.serie)}</span>` : ""} <span class="tag">${L.length}</span></h3><a href="#/pasivos" class="small">Ω Anexo de pasivos →</a></div>
      ${extra.map(([k, v]) => `<div class="small" style="margin-top:6px"><b>${esc(k[0].toUpperCase() + k.slice(1))}:</b> ${esc(Array.isArray(v) ? v.join(" · ") : v)}</div>`).join("")}
      ${L.length ? `<div style="max-height:260px;overflow:auto;margin-top:8px">${Object.keys(dec).sort((a, b) => +a - +b).map(k => `<div class="chips" style="margin:4px 0">${dec[k].map(v => `<span class="chip" data-vv="${esc(R ? MLPas.rkm(v) : MLPas.rkmC(v))}" title="Ver códigos">${esc(fm(v))}</span>`).join("")}</div>`).join("")}</div>` : ""}
      <div class="small muted" style="margin-top:6px">Clic en un valor para ver sus códigos. Al añadir esta familia a un proyecto puedes indicar el valor exacto.</div></div>`;
  }

  // =====================================================================  INICIO
  function vInicio() {
    const cs = Store.db.componentes, ps = Store.db.proyectos, n = cs.length || 1;
    const ver = cs.filter(c => c.estado === "verificado").length, mon = cs.filter(c => c.montaje && c.montaje.pcb).length, mod = cs.filter(c => c.modelo && c.modelo.base).length;
    const sinImg = cs.filter(c => !c.imagen && !(c.montaje && c.montaje.pcb)).length, sinDs = cs.filter(c => c.tipo === "electronico" && !(c.ficha || {}).datasheet).length, sinPrecio = cs.filter(c => !precioMin(c)).length;
    const recientes = cs.slice().sort((a, b) => String(b.modificado || "").localeCompare(String(a.modificado || ""))).slice(0, 6);
    const pred = window.MLAgent ? MLAgent.predecir(ctxActual(), 4) : [];
    const p = Auth.perfil ? Auth.perfil() : {}, hora = new Date().getHours();
    app.innerHTML = `<div class="hero"><div><div class="muted small">${hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches"}${p.nombre ? ", " + esc(p.nombre) : ""}</div><h1>Tu laboratorio de <span>componentes</span></h1></div>
        <div class="row"><button id="hBus">🔎 Buscar <kbd>Ctrl K</kbd></button><button class="pri" id="hNew">+ Nuevo componente</button></div></div>
      <div class="kpis">
        <div class="kpi" data-go="#/catalogo"><b>${cs.length}</b><span>componentes en la biblioteca</span><div class="bar"><i style="width:100%"></i></div></div>
        <div class="kpi" data-go="#/catalogo" data-f="verificado"><b>${ver}</b><span>verificados con calibrador · ${Math.round(ver / n * 100)}%</span><div class="bar"><i style="width:${ver / n * 100}%"></i></div></div>
        <div class="kpi" data-go="#/catalogo" data-f="montaje"><b>${mon}</b><span>con montaje · ${mod} con modelo 3D</span><div class="bar"><i style="width:${mon / n * 100}%"></i></div></div>
        <div class="kpi" data-go="#/proyectos"><b>${ps.length}</b><span>proyectos · ${ps.reduce((a, q) => a + (q.bom || []).length, 0)} referencias en BOM</span><div class="bar"><i style="width:${Math.min(100, ps.length * 20)}%"></i></div></div>
        <div class="kpi" data-go="#/pendientes"><b>${Store.db.pendientes.length}</b><span>pendientes por aprobar</span><div class="bar"><i style="width:${Math.min(100, Store.db.pendientes.length * 10)}%"></i></div></div>
      </div>
      <div class="home-grid">
        <div class="side">
          <div class="panel"><h3>Acciones rápidas</h3><div class="quick">
            <button data-q="nuevo"><span class="qi">＋</span><b>Nuevo componente</b><small>Ficha, modelo 3D y montaje</small></button>
            <button data-q="ia"><span class="qi">✦</span><b>Preguntar al asistente</b><small>Local o con IA en la nube</small></button>
            <button data-q="circ"><span class="qi">⚡</span><b>Nuevo circuito</b><small>Diagrama, energía e informe</small></button>
            <button data-q="cat"><span class="qi">▦</span><b>Explorar catálogo</b><small>Filtros y búsqueda difusa</small></button>
          </div></div>
          <div class="panel"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Modificados recientemente</h3><a class="small" href="#/catalogo">Ver todo →</a></div>
            <div style="margin-top:8px">${recientes.map(c => `<div class="lst-it" data-c="${esc(c.id)}"><div class="mini">${imgHtml(c)}</div><div style="min-width:0;flex:1"><b>${esc(c.nombre)}</b><div class="small muted">${esc(c.categoria)} · v${c.version || 1}${c.modificado ? " · " + esc(String(c.modificado).slice(0, 10)) : ""}</div></div>${c.estado === "verificado" ? '<span class="tag ok">✓</span>' : '<span class="tag warn">por verificar</span>'}</div>`).join("") || '<div class="muted small">Aún no hay componentes.</div>'}</div></div>
        </div>
        <div class="side">
          <div class="panel" style="border-color:rgba(167,139,250,.35)"><h3>✦ El asistente sugiere</h3>${pred.length ? pred.map((o, i) => `<div class="lst-it" data-pr="${i}"><span class="tag vio">${esc(o.a.ic || "✦")}</span><div style="flex:1"><b>${esc(o.a.n)}</b><div class="small muted">${esc(o.motivo || "")}</div></div><span class="small muted">${Math.round(o.s * 100)}%</span></div>`).join("") : '<div class="small muted">Aprende de lo que haces: mientras más uses MountLab, mejores sugerencias.</div>'}</div>
          <div class="panel"><h3>Salud de la biblioteca</h3>
            ${[["Sin imagen ni montaje", sinImg, "sinimg"], ["Electrónicos sin datasheet", sinDs, ""], ["Sin precio", sinPrecio, ""], ["Por verificar con calibrador", cs.length - ver, "borrador"]].map(([t, v, f]) => `<div class="lst-it" ${f ? `data-fe="${f}"` : 'data-go2="#/catalogo"'}><div style="flex:1">${t}</div><b class="${v ? "" : "muted"}">${v}</b></div>`).join("")}
            ${sinDs && nubeLista() ? '<button class="sm" id="hDs" style="margin-top:8px">✦ Pedirle al asistente que complete datasheets</button>' : ""}</div>
          <div class="panel"><h3>Proyectos</h3>${ps.slice(0, 5).map(q => { const t = totalesBom(q); return `<div class="lst-it" data-p="${esc(q.id)}"><span>📁</span><div style="flex:1"><b>${esc(q.nombre)}</b><div class="small muted">${esc(ESTP[q.estado] || q.estado || "")} · ${(q.bom || []).length} ref.</div></div><span class="small">${cop(t.barato)}</span></div>`; }).join("") || '<div class="small muted">Sin proyectos</div>'}</div>
        </div></div>`;
    $$("[data-go]", app).forEach(k => k.onclick = () => { if (k.dataset.f) { Object.assign(S.f, { q: "", tipo: "", cat: "", tag: "", estado: k.dataset.f }); } location.hash = k.dataset.go; });
    $$("[data-fe]", app).forEach(k => k.onclick = () => { Object.assign(S.f, { q: "", tipo: "", cat: "", tag: "", estado: k.dataset.fe }); location.hash = "#/catalogo"; });
    $$("[data-go2]", app).forEach(k => k.onclick = () => location.hash = k.dataset.go2);
    $$("[data-c]", app).forEach(k => k.onclick = () => location.hash = "#/c/" + encodeURIComponent(k.dataset.c));
    $$("[data-p]", app).forEach(k => k.onclick = () => location.hash = "#/p/" + encodeURIComponent(k.dataset.p));
    $$("[data-pr]", app).forEach(k => k.onclick = async () => { const r = await MLAgent.ejecutar(pred[+k.dataset.pr].a); toast(r.msg); });
    $("#hBus").onclick = () => MLAgent.paleta(); $("#hNew").onclick = () => nuevoComponente();
    $$("[data-q]", app).forEach(b => b.onclick = async () => { const q = b.dataset.q; if (q === "nuevo") nuevoComponente(); if (q === "ia") abrirAsistente(); if (q === "cat") location.hash = "#/catalogo"; if (q === "proy" || q === "circ") { const pr = await crearProyecto(false); if (pr) { if (q === "circ") S.ptabSig = "diagrama"; location.hash = "#/p/" + encodeURIComponent(pr.id); } } });
    const hd = $("#hDs"); if (hd) hd.onclick = () => preguntar("Busca y completa el datasheet (URL directa al PDF) de los componentes electrónicos que no lo tienen: " + cs.filter(c => c.tipo === "electronico" && !(c.ficha || {}).datasheet).slice(0, 5).map(c => c.id).join(", "));
  }

  // =====================================================================  AGENTE: contexto, acciones y reglas
  function ctxActual() {
    const [, r, id] = (location.hash || "#/").split("/"), v = { "": "inicio", c: "componente", p: "proyecto" }[r || ""] ?? r;
    const o = { vista: v || "inicio", id: id ? decodeURIComponent(id) : null, tab: v === "componente" ? S.tab : null };
    const nom = { pasivos: "Anexo de pasivos", inicio: "Inicio", catalogo: "Catálogo", proyectos: "Proyectos", pendientes: "Pendientes", ajustes: "Ajustes" };
    if (v === "componente") o.titulo = `Componente · ${S.W ? S.W.nombre : o.id} · ${({ ficha: "Ficha", modelo: "Modelo 3D", montaje: "Montaje", zonas: "Zonas", pines: "Pines", archivos: "Archivos CAD", versiones: "Versiones", json: "JSON" })[S.tab] || S.tab}`;
    else if (v === "proyecto") { const p = Store.db.proyectos.find(x => x.id === o.id); o.tab = S.ptabP || "resumen"; o.titulo = "Proyecto · " + (p ? p.nombre : o.id) + (o.tab === "diagrama" ? " · Diagrama" : ""); }
    else o.titulo = nom[o.vista] || o.vista;
    return o;
  }
  const edApi = () => S.ed && S.ed.api;
  function irTab(t) { if (!S.W) return false; S.tab = t; const b = $(`[data-tab="${t}"]`); if (b) b.click(); else vComponente(S.W.id); return true; }
  function clic(sel) { const b = $(sel); if (!b || b.disabled) return false; b.click(); return true; }
  function buscarComponente(q) { MLLocal.asegurar(Store.db.componentes); const r = MLLocal.buscar(q, 1)[0]; let mejor = r ? { c: r.c, s: r.s } : null; for (const c of Store.db.componentes) { const s = window.MLAgent ? MLAgent.sim(q, c.nombre + " " + c.id.replace(/_/g, " ")) : 0; if (!mejor || s > mejor.s) mejor = { c, s }; } return mejor; }
  function buscarProyecto(q) { let mejor = null; for (const p of Store.db.proyectos) { const s = MLAgent.sim(q, p.nombre + " " + p.id.replace(/-/g, " ")); if (!mejor || s > mejor.s) mejor = { p, s }; } return mejor; }
  function buscarCatalogo(q) { Object.assign(S.f, { q, tipo: "", cat: "", tag: "", estado: "" }); if (location.hash === "#/catalogo") vCatalogo(); else location.hash = "#/catalogo"; return `Catálogo filtrado por “${q}”`; }
  const ACCIONES = [
    // navegación
    { id: "ir_inicio", n: "Ir al inicio", ic: "⌂", k: "home tablero resumen", global: true, run: () => { location.hash = "#/"; } },
    { id: "ir_catalogo", n: "Ir al catálogo", ic: "▦", k: "biblioteca componentes lista", global: true, run: () => { location.hash = "#/catalogo"; } },
    { id: "ir_proyectos", n: "Ir a proyectos", ic: "📁", k: "proyectos bom", global: true, run: () => { location.hash = "#/proyectos"; } },
    { id: "ir_pendientes", n: "Revisar pendientes por aprobar", ic: "📥", k: "pendientes aprobar bandeja propuestas", global: true, run: () => { location.hash = "#/pendientes"; } },
    { id: "ir_pasivos", n: "Abrir el anexo de pasivos", ic: "Ω", k: "resistencias capacitores condensadores codigo colores bandas series e smd valores", global: true, run: () => { location.hash = "#/pasivos"; } },
    { id: "codigo_colores", n: "Código de colores de resistencias", ic: "🎨", k: "bandas colores resistencia leer", global: true, run: () => { S.ptab = "colores"; location.hash === "#/pasivos" ? vPasivos("colores") : location.hash = "#/pasivos"; } },
    { id: "calculadoras", n: "Calculadoras (LED, divisor, RC)", ic: "🧮", k: "calcular resistencia led divisor voltaje filtro rc constante tiempo", global: true, run: () => { S.ptab = "calc"; location.hash === "#/pasivos" ? vPasivos("calc") : location.hash = "#/pasivos"; } },
    { id: "ir_ajustes", n: "Abrir ajustes", ic: "⚙", k: "configuracion token github clave ia drive", global: true, run: () => { location.hash = "#/ajustes"; } },
    { id: "abrir_componente", n: "Abrir un componente", ic: "▭", k: "ver ficha", global: true, args: '{"id":"id_del_componente"}', run: a => { const c = comp(a.id) || (a.q && buscarComponente(a.q)?.c); if (!c) return false; location.hash = "#/c/" + encodeURIComponent(c.id); return "Abierto " + c.nombre; } },
    { id: "abrir_proyecto", n: "Abrir un proyecto", ic: "📁", global: true, args: '{"id":"id_del_proyecto"}', run: a => { const p = Store.db.proyectos.find(x => x.id === a.id) || (a.q && buscarProyecto(a.q)?.p); if (!p) return false; location.hash = "#/p/" + encodeURIComponent(p.id); return "Abierto " + p.nombre; } },
    { id: "buscar_catalogo", n: "Buscar en el catálogo", ic: "🔎", k: "filtrar", global: true, args: '{"q":"texto"}', run: a => buscarCatalogo(a.q || "") },
    { id: "nuevo_componente", n: "Crear componente nuevo", ic: "＋", k: "agregar nuevo elemento ficha", global: true, run: () => { nuevoComponente(); } },
    { id: "nuevo_proyecto", n: "Crear proyecto nuevo", ic: "📁", k: "nuevo proyecto", global: true, run: async () => { const p = await crearProyecto(false); if (p) location.hash = "#/p/" + encodeURIComponent(p.id); } },
    { id: "abrir_asistente", n: "Abrir el asistente", ic: "✦", k: "chat ia", global: true, run: () => abrirAsistente() },
    { id: "paleta", n: "Buscar en toda la app", ic: "⌘", k: "paleta comandos", global: true, run: () => MLAgent.paleta() },
    { id: "bloquear", n: "Bloquear MountLab", ic: "🔒", k: "cerrar sesion salir candado", global: true, run: () => Auth.bloquear() },
    { id: "invitar", n: "Invitar a alguien", ic: "✉", k: "compartir acceso codigo invitacion", global: true, when: () => Auth.esDueño(), run: () => { location.hash = "#/ajustes"; setTimeout(() => dlgInvitar(), 200); } },
    { id: "subir_locales", n: "Subir cambios hechos sin conexión", ic: "⇪", k: "sincronizar subir local", global: true, when: () => Store.localPendientes() > 0 && Store.mode === "github", run: async () => { const k = await Store.syncLocal(); estadoPill(); return k + " cambio(s) subidos"; } },
    { id: "recargar", n: "Recargar la biblioteca", ic: "↻", k: "actualizar refrescar datos", global: true, run: async () => { await Store.load(); estadoPill(); route(); return "Biblioteca recargada"; } },
    // componente
    ...[["ficha", "Ficha"], ["modelo", "Modelo 3D"], ["montaje", "Montaje"], ["zonas", "Zonas"], ["pines", "Pines"], ["archivos", "Archivos CAD"], ["versiones", "Versiones"], ["json", "JSON"]].map(([t, n]) => ({ id: "tab_" + t, n: "Ver pestaña " + n, ic: "▤", k: t === "archivos" ? "dxf step descargar planos" : t === "modelo" ? "3d modelado diseño" : "", grupo: "Componente", when: c => c.vista === "componente" && c.tab !== t, run: () => irTab(t) })),
    { id: "guardar", n: "Guardar cambios", ic: "💾", k: "guardar commit", grupo: "Componente", sel: "#bSave", when: c => c.vista === "componente" && dirty(), run: () => clic("#bSave") },
    { id: "descartar", n: "Descartar cambios", ic: "↺", grupo: "Componente", peligro: true, when: c => c.vista === "componente" && dirty(), run: () => clic("#bUndo") },
    { id: "verificar", n: "Marcar como verificado", ic: "✓", k: "calibrador medido verificar", grupo: "Componente", when: c => c.vista === "componente" && S.W && S.W.estado !== "verificado", run: () => { S.W.estado = "verificado"; vComponente(S.W.id); return "Marcado como verificado (falta guardar)"; } },
    { id: "duplicar", n: "Duplicar componente", ic: "⧉", grupo: "Componente", when: c => c.vista === "componente", run: () => clic("#bDup") },
    { id: "variante", n: "Crear variante", ic: "⑂", grupo: "Componente", when: c => c.vista === "componente", run: () => clic("#bVar") },
    { id: "a_proyecto", n: "Añadir a un proyecto", ic: "📁", k: "bom agregar", grupo: "Componente", when: c => c.vista === "componente", run: () => clic("#bProj") },
    { id: "regenerar_cad", n: "Regenerar DXF, STEP y plano en GitHub", ic: "⟳", k: "cad regenerar planos step dxf", grupo: "Componente", peligro: false, when: c => c.vista === "componente" && Store.mode === "github" && S.W && S.W.montaje, run: async () => { if (dirty()) return "Guarda primero los cambios"; await Store.dispatch("datos.yml", { id: S.W.id }); return "GitHub está regenerando los archivos (1–3 min)"; } },
    { id: "descargar_dxf", n: "Descargar DXF de huella", ic: "⬇", k: "dxf descargar plano huella", grupo: "Componente", when: c => c.vista === "componente" && S.W && S.W.montaje && S.W.montaje.pcb, run: () => { download(`${S.W.id}_v${S.W.version || 1}_huella.dxf`, MLDxf.componenteADxf(S.W), "application/dxf"); return "DXF descargado"; } },
    { id: "completar_ia", n: "Completar la ficha con el asistente", ic: "✦", k: "datasheet investigar buscar internet", grupo: "Componente", when: c => c.vista === "componente" && S.W && !S.nuevo, run: () => { preguntar(`Completa la ficha de [[${S.W.id}]] (${S.W.nombre}): datasheet en PDF, voltaje, corriente, interfaz, pines, medidas y precios en Colombia. Solo lo que falte.`); } },
    { id: "eliminar", n: "Eliminar componente", ic: "🗑", grupo: "Componente", peligro: true, when: c => c.vista === "componente", run: () => clic("#bDel") },
    // modelo 3D
    { id: "cara_a", n: "Pasar a la cara A (arriba)", ic: "▲", k: "cara superior top", grupo: "Modelo 3D", when: c => c.tab === "modelo" && edApi()?.tiene(), run: () => edApi().cara("A") },
    { id: "cara_b", n: "Pasar a la cara B (abajo)", ic: "▼", k: "cara inferior bottom", grupo: "Modelo 3D", when: c => c.tab === "modelo" && edApi()?.tiene(), run: () => edApi().cara("B") },
    { id: "explotar", n: "Explotar / juntar la vista 3D", ic: "✷", k: "explosionar separar", grupo: "Modelo 3D", when: c => c.tab === "modelo" && edApi()?.tiene(), run: () => edApi().explotar() },
    { id: "vista_iso", n: "Vista 3D isométrica", ic: "◇", grupo: "Modelo 3D", when: c => c.tab === "modelo" && edApi()?.tiene(), run: () => edApi().vista("iso") },
    { id: "vista_arriba", n: "Vista 3D desde arriba", ic: "⤒", grupo: "Modelo 3D", when: c => c.tab === "modelo" && edApi()?.tiene(), run: () => edApi().vista("arriba") },
    { id: "vista_abajo", n: "Vista 3D desde abajo", ic: "⤓", grupo: "Modelo 3D", when: c => c.tab === "modelo" && edApi()?.tiene(), run: () => edApi().vista("abajo") },
    { id: "imagen_modelo", n: "Usar la vista 3D como imagen", ic: "📷", k: "foto captura render imagen", grupo: "Modelo 3D", when: c => c.tab === "modelo" && edApi()?.tiene(), run: async () => (await edApi().imagen()) ? "Imagen lista (falta guardar)" : false },
    { id: "seleccionar_todo", n: "Seleccionar todas las piezas de esta cara", ic: "☑", grupo: "Modelo 3D", when: c => c.tab === "modelo" && edApi()?.tiene(), run: () => edApi().todo() },
    { id: "colocar", n: "Colocar una pieza de la librería", ic: "⊕", grupo: "Modelo 3D", args: '{"plantilla":"id (header_macho, usb_c, micro_usb, jst_xh, pulsador, led_smd, wroom, electrolitico, separador, f_caja…)","params":{"n":8},"cara":"A|B"}', when: c => c.tab === "modelo" && edApi()?.tiene(), run: a => edApi().colocar(a.plantilla, a.params, a.cara) ? "Pieza colocada en el centro: arrástrala a su lugar" : false },
    // proyecto
    { id: "ver_diagrama", n: "Abrir el diagrama de conexiones", ic: "⚡", k: "circuito esquema conexiones montaje cables", grupo: "Proyecto", when: c => c.vista === "proyecto" && c.tab !== "diagrama", run: () => { S.ptabP = "diagrama"; vProyecto(ctxActual().id); } },
    { id: "nuevo_circuito", n: "Nuevo circuito (proyecto con diagrama)", ic: "⚡", k: "diagrama esquema conexiones montaje", global: true, run: async () => { const p = await crearProyecto(false); if (p) { S.ptabSig = "diagrama"; location.hash = "#/p/" + encodeURIComponent(p.id); } } },
    { id: "sugerir_conexiones", n: "Sugerir conexiones", ic: "✦", k: "conectar automatico cables sugerencias", grupo: "Diagrama", when: c => c.tab === "diagrama" && S.circ, run: () => { const n = S.circ.sugerir(); return n ? `${n} conexiones sugeridas (en morado)` : "No encontré conexiones que sugerir"; } },
    { id: "aceptar_sugerencias", n: "Aceptar todas las conexiones sugeridas", ic: "✓", k: "conectar todo", grupo: "Diagrama", when: c => c.tab === "diagrama" && S.circ, run: () => { if (!S.circ.sugerir()) return "No hay sugerencias"; return `${S.circ.aceptarTodas()} conexiones agregadas`; } },
    { id: "ordenar_diagrama", n: "Ordenar el diagrama", ic: "▦", k: "acomodar organizar bloques", grupo: "Diagrama", when: c => c.tab === "diagrama" && S.circ, run: () => S.circ.ordenar() },
    { id: "informe_circuito", n: "Informe PDF del circuito", ic: "🖨", k: "imprimir reporte documento pdf", grupo: "Diagrama", when: c => c.tab === "diagrama" && S.circ, run: () => S.circ.informe() },
    { id: "energia_circuito", n: "Ver voltajes y corrientes (energía)", ic: "🔋", k: "consumo corriente voltaje bateria autonomia presupuesto", grupo: "Diagrama", when: c => c.tab === "diagrama" && S.circ, run: () => S.circ.verTab("energia") },
    { id: "verificar_circuito", n: "Verificar el circuito", ic: "🧪", k: "errores revisar erc cortos", grupo: "Diagrama", when: c => c.tab === "diagrama" && S.circ, run: () => S.circ.verTab("verif") },
    { id: "exportar_bom", n: "Exportar BOM (CSV)", ic: "⬇", k: "lista materiales excel csv", grupo: "Proyecto", when: c => c.vista === "proyecto", run: () => clic("#pCsv") },
    { id: "revisar_proyecto", n: "Revisar el proyecto (sistema experto)", ic: "🧪", k: "revision tecnica voltajes i2c consumo", grupo: "Proyecto", when: c => c.vista === "proyecto", run: () => { abrirAsistente(); const t = $("#q"); t.value = "revisa proyecto " + ctxActual().id; $("#send").click(); } },
    { id: "guardar_proyecto", n: "Guardar el proyecto", ic: "💾", grupo: "Proyecto", when: c => c.vista === "proyecto" && $("#pSv") && !$("#pSv").disabled, run: () => clic("#pSv") },
  ];
  function reglas(c) {
    const R = [], W = S.W, np = Store.db.pendientes.length, nl = Store.localPendientes();
    if (c.vista === "componente" && W) {
      if (dirty()) R.push({ accion: "guardar", peso: 1, motivo: "Tienes cambios sin guardar" });
      if (W.montaje && W.montaje.pcb && !(W.modelo && W.modelo.base) && c.tab !== "modelo") R.push({ accion: "tab_modelo", peso: 0.55, motivo: "Aún no tiene modelo 3D" });
      if (c.tab === "modelo" && W.modelo && !W.imagen) R.push({ accion: "imagen_modelo", peso: 0.7, motivo: "El componente no tiene imagen" });
      if (W.cad_pendiente && Store.mode === "github" && !dirty()) R.push({ accion: "regenerar_cad", peso: 0.6, motivo: "Hay geometría pendiente de regenerar" });
      if (!(W.ficha || {}).datasheet && W.tipo === "electronico" && nubeLista()) R.push({ accion: "completar_ia", peso: 0.45, motivo: "Le falta el datasheet" });
      if (W.estado !== "verificado" && W.montaje && W.montaje.pcb && c.tab !== "modelo") R.push({ accion: "verificar", peso: 0.25, motivo: "Medidas sin verificar" });
      if (c.tab === "archivos" && W.montaje) R.push({ accion: "descargar_dxf", peso: 0.35, motivo: "Descarga inmediata desde el navegador" });
    }
    if (c.vista === "proyecto" && c.tab === "diagrama" && S.circ) { const k = S.circ.calcular(), C2 = S.circ.circuito(); if (C2.inst.length > 1) R.push({ accion: "sugerir_conexiones", peso: C2.cables.length < C2.inst.length ? 0.7 : 0.3, motivo: "Propone alimentación, tierra y buses" }); if (k.avisos.length) R.push({ accion: "verificar_circuito", peso: 0.6, motivo: `${k.avisos.length} aviso(s) del circuito` }); if (C2.cables.length > 2) R.push({ accion: "informe_circuito", peso: 0.35, motivo: "Documento con diagrama, tablas y energía" }); }
    if (c.vista === "proyecto" && c.tab !== "diagrama") R.push({ accion: "ver_diagrama", peso: 0.45, motivo: "Arma las conexiones del proyecto" });
    if (c.vista === "proyecto") { R.push({ accion: "revisar_proyecto", peso: 0.4, motivo: "Detecta choques de voltaje, I2C y consumo" }); R.push({ accion: "exportar_bom", peso: 0.3, motivo: "Para comprar o cotizar" }); }
    if (np && c.vista !== "pendientes") R.push({ accion: "ir_pendientes", peso: c.vista === "inicio" ? 0.65 : 0.35, motivo: `${np} propuesta(s) esperan tu aprobación` });
    if (nl && Store.mode === "github") R.push({ accion: "subir_locales", peso: 0.8, motivo: `${nl} cambio(s) solo en este navegador` });
    if (Store.mode !== "github" && Auth.esDueño() && c.vista !== "ajustes") R.push({ accion: "ir_ajustes", peso: 0.5, motivo: "Conecta GitHub para guardar tus cambios" });
    if (c.vista === "catalogo" || c.vista === "inicio") R.push({ accion: "nuevo_componente", peso: 0.2, motivo: "" });
    return R;
  }
  /** Órdenes en lenguaje natural para el diagrama: "conecta el bme280 al esp32", "agrega una batería 18650". */
  function intencionCircuito(q) {
    if (!S.circ || ctxActual().tab !== "diagrama") return null;
    const norm = t => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const n = norm(q).replace(/[¿?¡!.]/g, "").trim(); let m;
    if ((m = n.match(/^(?:conecta|une|conectar|cablea)\s+(?:el |la |los )?(.+?)\s+(?:al|a la|a|con el|con la|con|y el|y la|y)\s+(?:el |la )?(.+?)(?:\s+(?:por|via|usando)\s+(i2c|spi|uart|serial))?$/))) {
      const A = S.circ.buscarInst(m[1]), B = S.circ.buscarInst(m[2]); if (!A || !B || A.s < 0.5 || B.s < 0.5) return null;
      return { s: 0.95, a: { id: "conectar_par", n: `Conectar ${A.it.ref} con ${B.it.ref}${m[3] ? " por " + m[3].toUpperCase() : ""}`, run: () => {
        const bus = m[3] ? { i2c: "I2C", spi: "SPI", uart: "UART", serial: "UART" }[m[3]] : null;
        const L = S.circ.conectarPar(A.it.ref, B.it.ref, bus); return L ? `${L} conexiones entre ${A.it.ref} y ${B.it.ref}` : `No encontré conexiones entre ${A.it.ref} y ${B.it.ref}`; } } };
    }
    if ((m = n.match(/^(?:agrega|anade|añade|pon|coloca|inserta|mete)\s+(?:un|una|el|la|otro|otra)?\s*(.+)$/))) {
      const t = m[1], V = MLCircuito.VIRT, virt = /usb/.test(t) ? "@usb" : /18650/.test(t) ? "@18650" : /lipo/.test(t) ? "@lipo" : /2s|7\.4/.test(t) ? "@2s" : /fuente de lab|laboratorio/.test(t) ? "@lab" : /adaptador|12 ?v/.test(t) ? "@dc12" : /^tierra|^gnd/.test(t) ? "@gnd" : /^led/.test(t) ? "@led" : /pulsador|boton/.test(t) ? "@boton" : null;
      let id = virt, nombre = virt && V[virt].nombre, valor = null;
      if (!id) { const pv = (t.match(/(?:de|con)\s+([0-9][0-9.,]*\s*[kmunp]?[a-zΩ]*)$/i) || [])[1]; const base = pv ? t.replace(/\s+(de|con)\s+[0-9].*$/, "") : t;
        if (/resistencia/.test(base)) id = "res_carbon_14w"; else if (/capacitor|condensador/.test(base)) id = /electrol/.test(base) ? "cap_electrolitico_radial" : "cap_multicapa_tht";
        else { const r = buscarComponente(base); if (r && r.s >= 0.6) id = r.c.id; }
        if (id) { nombre = comp(id).nombre; valor = pv ? valorBonito(comp(id), pv) : null; } }
      if (!id) return null;
      return { s: 0.9, a: { id: "colocar_comp", n: `Agregar ${nombre}${valor ? " " + valor : ""} al diagrama`, run: () => { const it = S.circ.colocar(id, 40 + Math.random() * 200, 40 + Math.random() * 200, valor ? { valor } : {}); return it ? `${it.ref} agregado` : false; } } };
    }
    return null;
  }
  function accionesParaIA() { const c = ctxActual(); return ACCIONES.filter(a => !a.when || a.when(c)).map(a => `${a.id}: ${a.n}${a.args ? " " + a.args : ""}${a.peligro ? " (pide confirmación)" : ""}`).join("\n"); }
  function extraerAcciones(text) {
    const acciones = []; const re = /```mountlab-accion\s*([\s\S]*?)```/g; let m;
    while ((m = re.exec(text || ""))) { try { const j = JSON.parse(m[1]); for (const x of Array.isArray(j) ? j : [j]) { const a = ACCIONES.find(z => z.id === x.accion); if (a) acciones.push({ id: a.id, n: a.n, args: x.args || {}, peligro: !!a.peligro || ["guardar", "eliminar", "descartar", "regenerar_cad", "verificar", "bloquear"].includes(a.id) }); } } catch (e) { } }
    return { limpio: String(text || "").replace(re, "").trim(), acciones };
  }
  async function ejecutarAccionIA(x, confirmado) { const a = ACCIONES.find(z => z.id === x.id); if (!a) return { ok: false, msg: "Acción desconocida" }; return MLAgent.ejecutar(a, x.args, { confirmado }); }
  const miniHtml = c => `<div class="mini" style="width:30px;height:30px">${imgHtml(c).replace("<svg ", '<svg style="max-width:30px;max-height:30px" ').replace("<img ", '<img style="max-width:30px;max-height:30px" ')}</div>`;
  function recientesVisitados() { try { return (JSON.parse(localStorage.getItem("ml_recientes")) || []).map(comp).filter(Boolean); } catch (e) { return []; } }
  window.addEventListener("hashchange", () => { const m = location.hash.match(/^#\/c\/(.+)$/); if (!m) return; const id = decodeURIComponent(m[1]); let L = []; try { L = JSON.parse(localStorage.getItem("ml_recientes")) || []; } catch (e) { } L = [id, ...L.filter(x => x !== id)].slice(0, 12); try { localStorage.setItem("ml_recientes", JSON.stringify(L)); } catch (e) { } });

  // ---------- acceso: contraseña, bloqueo automático e invitaciones
  function panelAcceso(box) {
    const pf = Auth.perfil(), dueño = Auth.esDueño(), A = (Store.db.accesos || []).slice().sort((a, b) => String(b.creado).localeCompare(String(a.creado)));
    box.innerHTML = `<div class="grid2" style="align-items:start">
      <div><div class="small muted">Sesión: <b style="color:var(--ink)">${esc(pf.nombre || "")}</b> · ${esc({ "dueño": "dueño", edicion: "invitado con edición", lectura: "invitado de solo lectura" }[pf.rol] || "—")}${pf.exp ? " · vence " + esc(String(pf.exp).slice(0, 10)) : ""}${dueño ? (Store.permisos && Store.permisos.admin ? ' · <span style="color:var(--ok)">verificado con GitHub (admin del repositorio)</span>' : " · conecta tu token para verificar que eres el dueño del repositorio") : ""}</div>
        <div class="grid2" style="margin-top:10px"><div><label>Bloqueo automático por inactividad</label><select id="sBl">${[[5, "5 min"], [15, "15 min"], [30, "30 min"], [60, "1 hora"], [240, "4 horas"], [0, "Nunca"]].map(([v, n]) => `<option value="${v}" ${+(pf.bloqueo ?? 30) === v ? "selected" : ""}>${n}</option>`).join("")}</select></div>
          <div style="display:flex;align-items:flex-end"><button id="sLk">🔒 Bloquear ahora</button></div></div>
        ${dueño ? '<button class="pri" id="sTr" style="margin-top:10px">📱 Llevar mis claves a otro dispositivo</button>' : ""}
        <details style="margin-top:10px"><summary class="small">Cambiar contraseña</summary><div class="grid3" style="margin-top:8px"><input type="password" id="sP0" placeholder="Actual"><input type="password" id="sP1" placeholder="Nueva (8+)"><button id="sPc">Cambiar</button></div></details>
        <div class="msg info small" style="margin-top:10px">La contraseña protege la app, la edición y tus claves (cifradas con AES-256 en este dispositivo). El repositorio <b>${esc(Store.cfg.owner)}/${esc(Store.cfg.repo)}</b> ${Store.privado ? "es <b>privado</b>." : "es <b>público</b>: los JSON de la biblioteca siguen siendo legibles en GitHub. Para ocultarlos haría falta un repositorio privado (Pages privado requiere GitHub Pro)."}</div></div>
      <div>${dueño ? `<div class="row" style="justify-content:space-between"><b>Invitaciones</b><button class="pri sm" id="sInv">✉ Invitar a alguien</button></div>
        <div class="small muted" style="margin:4px 0 8px">Generas un enlace y un PIN (envíalos por canales distintos). Puedes revocar o dejar que venza. Para edición, crea en GitHub un token fine-grained para esa persona (solo este repositorio, Contents RW) y pégalo en la invitación: viaja cifrado con el PIN.</div>
        <table class="t"><tr><th>Nombre</th><th>Rol</th><th>Vence</th><th>Estado</th><th></th></tr>${A.map(a => { const venc = a.vence && Date.parse(a.vence + "T23:59:59") < Date.now(); return `<tr><td>${esc(a.nombre)}</td><td class="small">${a.rol === "edicion" ? "edición" : "lectura"}${a.con_token ? " · token" : ""}</td><td class="small">${esc(a.vence || "nunca")}</td><td>${a.estado === "revocado" ? '<span class="tag bad">revocada</span>' : venc ? '<span class="tag warn">vencida</span>' : '<span class="tag ok">activa</span>'}</td><td>${a.estado !== "revocado" && !venc ? `<button class="sm danger" data-rv="${esc(a.id)}">Revocar</button>` : `<button class="sm ghost" data-rm="${esc(a.id)}" title="Quitar del registro">✕</button>`}</td></tr>`; }).join("") || '<tr><td colspan="5" class="muted small">Aún no has invitado a nadie.</td></tr>'}</table>`
        : `<div class="small muted">Las invitaciones las gestiona el dueño.</div>`}</div></div>`;
    $("#sBl", box).onchange = async e => { await Auth.guardarPerfil({ bloqueo: +e.target.value }); toast("Bloqueo automático: " + e.target.selectedOptions[0].textContent); };
    $("#sLk", box).onclick = () => Auth.bloquear();
    $("#sPc", box).onclick = async () => { try { await Auth.cambiarPassword($("#sP0", box).value, $("#sP1", box).value); toast("Contraseña cambiada"); $("#sP0", box).value = $("#sP1", box).value = ""; } catch (e) { toast(e.message, 5000); } };
    const iv = $("#sInv", box); if (iv) iv.onclick = dlgInvitar;
    const tr = $("#sTr", box); if (tr) tr.onclick = dlgTraspaso;
    $$("[data-rv]", box).forEach(b => b.onclick = async () => { const a = A.find(x => x.id === b.dataset.rv); if (!(await confirmar(`¿Revocar el acceso de <b>${esc(a.nombre)}</b>? Pierde el acceso la próxima vez que abra MountLab.${a.con_token ? "<br><br><b>Importante:</b> revoca también en GitHub el token que le diste." : ""}`, "Revocar"))) return;
      try { await Store.save("accesos", Object.assign({}, a, { estado: "revocado", revocado: hoy() }), `Acceso ${a.id}: revocado`); toast("Invitación revocada"); } catch (e) { toast("Error: " + e.message, 5000); } panelAcceso(box); });
    $$("[data-rm]", box).forEach(b => b.onclick = async () => { try { await Store.remove("accesos", b.dataset.rm, `Acceso ${b.dataset.rm}: quitado del registro`); } catch (e) { toast(e.message); } panelAcceso(box); });
  }
  async function dlgTraspaso() {
    let t; try { t = await Auth.crearTraspaso(); } catch (e) { return toast(e.message, 5000); }
    const nom = { token: "token de GitHub", gemKey: "clave de Gemini", aiKey: "clave de Claude", oaKey: "clave OpenAI/compatible" };
    let qr = ""; try { const q = qrcode(0, "L"); q.addData(t.url); q.make(); qr = q.createSvgTag({ cellSize: 3, margin: 2, scalable: true }); } catch (e) { }
    await modal(`<h3>📱 Llevar mis claves a otro dispositivo</h3>
      <div class="small muted">Lleva <b>${t.claves.map(k => nom[k] || k).join(", ") || "tu configuración"}</b> y tus modelos. El enlace va cifrado: sin el PIN no sirve. Vence a las <b>${new Date(t.exp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</b> (30 min).</div>
      <div class="grid2" style="align-items:center;margin-top:10px">
        <div style="background:#fff;border-radius:10px;padding:6px;max-width:240px">${qr || '<div class="small" style="color:#000">QR no disponible: usa el enlace</div>'}</div>
        <div><ol class="small" style="padding-left:18px;margin:0;line-height:1.7">
          <li>En el celular, <b>escanea el QR</b> con la cámara (o envíate el enlace).</li>
          <li>Escribe este PIN:</li></ol>
          <div style="font:700 28px var(--mono,monospace);letter-spacing:3px;margin:6px 0 10px">${esc(t.pin)}</div>
          <div class="row"><button class="sm" id="tCp">Copiar enlace</button>${navigator.share ? '<button class="sm" id="tSh">Compartir…</button>' : ""}</div>
          <div class="small muted" style="margin-top:8px">No envíes el PIN por el mismo medio que el enlace.</div></div></div>
      <div class="row" style="justify-content:flex-end;margin-top:10px"><button data-close class="pri">Listo</button></div>`, (b) => {
      $("#tCp", b).onclick = async () => { try { await navigator.clipboard.writeText(t.url); toast("Enlace copiado (sin el PIN)"); } catch (e) { prompt("Copia el enlace:", t.url); } };
      const sh = $("#tSh", b); if (sh) sh.onclick = () => navigator.share({ title: "MountLab: traer mis claves", url: t.url }).catch(() => { });
    });
  }
  async function dlgInvitar() {
    if (Store.mode !== "github") return toast("Para invitar necesitas conectar GitHub (el registro de la invitación se guarda en el repositorio)", 6000);
    const r = await modal(`<h3>✉ Invitar a alguien</h3>
      <div class="grid2"><div><label>Nombre</label><input id="iN" placeholder="Ej: Camila (semillero)"></div><div><label>Rol</label><select id="iR"><option value="lectura">Solo lectura</option><option value="edicion">Edición</option></select></div></div>
      <div class="grid2"><div><label>Vence en</label><select id="iD"><option value="1">1 día</option><option value="7" selected>7 días</option><option value="30">30 días</option><option value="90">90 días</option><option value="0">No vence</option></select></div><div><label>Token de GitHub para esa persona (opcional)</label><input id="iT" type="password" placeholder="github_pat_… (necesario para editar)"></div></div>
      <div class="small muted">El token viaja cifrado dentro del enlace; solo se abre con el PIN. Sin token, la persona solo puede leer.</div>
      <div class="row" style="justify-content:flex-end"><button data-close>Cancelar</button><button class="pri" id="iOk">Crear invitación</button></div>`, (b, close) => {
      $("#iOk", b).onclick = () => { const n = $("#iN", b).value.trim(); if (!n) return toast("Escribe el nombre"); const rol = $("#iR", b).value, t = $("#iT", b).value.trim(); if (rol === "edicion" && !t) return toast("Para edición pega un token de GitHub para esa persona"); close({ nombre: n, rol, dias: +$("#iD", b).value, token: t }); };
      setTimeout(() => $("#iN", b).focus(), 50);
    });
    if (!r) return;
    try {
      const inv = await Auth.crearInvitacion(r);
      await Store.save("accesos", inv.registro, `Acceso nuevo: ${r.nombre} (${r.rol})`);
      await modal(`<h3>Invitación lista para ${esc(r.nombre)}</h3>
        <div><label>1 · Enlace (envíalo por un canal)</label><div class="row" style="flex-wrap:nowrap"><input id="xU" readonly value="${esc(inv.url)}"><button class="sm" data-cp="xU">Copiar</button></div></div>
        <div><label>2 · PIN (envíalo por otro canal, por ejemplo en persona o por llamada)</label><div class="row" style="flex-wrap:nowrap"><input id="xP" readonly value="${esc(inv.pin)}" style="font:600 20px ui-monospace,Consolas,monospace;letter-spacing:.12em"><button class="sm" data-cp="xP">Copiar</button></div></div>
        <div class="msg warn small">El PIN no se vuelve a mostrar. ${r.rol === "edicion" ? "Quien tenga el enlace y el PIN podrá editar con el token incluido." : "Acceso de solo lectura."} ${r.dias ? `Vence en ${r.dias} día(s).` : "No vence: revócala cuando ya no la necesite."}</div>
        <div class="row" style="justify-content:flex-end"><button class="pri" data-close>Listo</button></div>`, b => $$("[data-cp]", b).forEach(x => x.onclick = async () => { const i = $("#" + x.dataset.cp, b); i.select(); try { await navigator.clipboard.writeText(i.value); toast("Copiado"); } catch (e) { document.execCommand("copy"); toast("Copiado"); } }));
    } catch (e) { toast("Error: " + e.message, 6000); }
    if (location.hash === "#/ajustes") vAjustes();
  }

  // ---------- inicio
  (async function () {
    app.innerHTML = '<div class="panel muted">Cargando biblioteca…</div>';
    $("#fab").onclick = () => abrirAsistente(); $("#btnIA").onclick = () => $("#drawer").classList.contains("open") ? cerrarAsistente() : abrirAsistente();
    $("#drClose").onclick = cerrarAsistente; $("#drWide").onclick = () => { const w = !$("#drawer").classList.contains("wide"); $("#drawer").classList.toggle("wide", w); document.body.classList.toggle("drawer-wide", w); };
    $("#btnBuscar").onclick = () => MLAgent.paleta(); $("#btnLock").onclick = () => Auth.bloquear();
    document.addEventListener("keydown", e => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "j" || e.key === "J")) { e.preventDefault(); $("#drawer").classList.contains("open") ? cerrarAsistente() : abrirAsistente(); }
      if (e.key === "Escape" && $("#drawer").classList.contains("open") && $("#modal").classList.contains("hide") && $("#palette").classList.contains("hide") && !(document.activeElement && document.activeElement.closest && document.activeElement.closest(".mo-layout"))) cerrarAsistente();
    });
    // soltar una foto o un PDF en cualquier parte → al asistente
    document.addEventListener("dragover", e => { if ([...(e.dataTransfer || {}).types || []].includes("Files")) { e.preventDefault(); document.body.classList.add("soltando"); } });
    document.addEventListener("dragleave", e => { if (!e.relatedTarget) document.body.classList.remove("soltando"); });
    document.addEventListener("drop", e => { document.body.classList.remove("soltando"); const fs = (e.dataTransfer || {}).files; if (!fs || !fs.length || e.defaultPrevented) return; e.preventDefault(); if (!Auth.abierta()) return; abrirAsistente(); S.agregarArchivos && S.agregarArchivos(fs); });
    await Auth.iniciar();
    await Store.load(); estadoPill();
    if (!(await Auth.verificarAcceso(Store.db))) return;
    if (Store.mode === "github") Store.test().then(estadoPill).catch(() => { });
    if (window.MLLocal) MLLocal.construir(Store.db.componentes);
    MLAgent.init({
      ctx: ctxActual, acciones: () => ACCIONES, reglas, confirmar, toast, preguntar, buscarCatalogo, buscarComponente, buscarProyecto,
      colocar: (id, params, cara) => { if (!edApi()) { if (S.W) irTab("modelo"); return false; } return edApi().colocar(id, params, cara) ? "Pieza colocada" : false; },
      intencionExtra: q => intencionCircuito(q),
      extra: q => MLPas.leer(q).filter(o => !/número/.test(o.como) || /^\d+(\.\d+)?\s*(Ω|ohm)/i.test(q)).slice(0, 3).map(o => ({ ic: o.tipo === "R" ? "Ω" : "⊣⊢", n: (o.tipo === "R" ? MLPas.fmtR(o.valor) : MLPas.fmtC(o.valor)) + " — códigos y familias", sub: o.como, run: () => { S.pvQ = q; S.ptab = "valor"; location.hash === "#/pasivos" ? vPasivos("valor") : location.hash = "#/pasivos"; } })),
      vistas: () => [["⌂", "Inicio", "#/"], ["▦", "Catálogo", "#/catalogo"], ["Ω", "Anexo de pasivos", "#/pasivos"], ["📁", "Proyectos", "#/proyectos"], ["📥", "Pendientes", "#/pendientes"], ["⚙", "Ajustes", "#/ajustes"]].map(([ic, n, h]) => ({ ic, n, h })),
      recientes: recientesVisitados, mini: miniHtml,
      componentes: (q, n) => { const sc = new Map(); for (const c of Store.db.componentes) { const s = MLAgent.sim(q, [c.nombre, c.id.replace(/_/g, " "), c.categoria, c.referencia, ...(c.etiquetas || []), ...(c.alias || [])].join(" ")); if (s >= 0.55) sc.set(c.id, { c, s }); } MLLocal.asegurar(Store.db.componentes); for (const r of MLLocal.buscar(q, 6)) if (r.s >= 0.6 && !sc.has(r.c.id)) sc.set(r.c.id, { c: r.c, s: r.s * 0.95 }); return [...sc.values()].sort((a, b) => b.s - a.s).slice(0, n); },
      proyectos: (q, n) => Store.db.proyectos.map(p => ({ p, s: MLAgent.sim(q, p.nombre + " " + p.id.replace(/-/g, " ") + " " + (p.descripcion || "")) })).filter(x => x.s >= 0.55).sort((a, b) => b.s - a.s).slice(0, n),
      nota: r => { if (!r) return; if ($("#drawer").classList.contains("open") && S.pintaLog) { S.chat.push({ role: "act", content: r.msg, ok: r.ok }); S.pintaLog(); } else toast(r.msg); },
    });
    route();
    try { if (localStorage.getItem("ml_drawer") && matchMedia("(min-width: 1180px)").matches) abrirAsistente(); } catch (e) { }
    if (Store.error && Store.mode !== "github") console.warn(Store.error);
  })();
  window.ML = { S, route, toast, ctx: ctxActual, acciones: ACCIONES, abrirAsistente, preguntar, valorBonito };
})();
