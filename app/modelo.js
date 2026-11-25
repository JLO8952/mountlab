/* MountLab · pestaña "Modelo 3D": se dibuja en 2D (vista superior) con formas simples y plantillas;
   la vista 3D se actualiza en vivo. Todo se guarda en el mismo componente (modelo, montaje, zonas, pines). */
(function () {
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const r2 = v => (Math.round(v * 100) / 100) || 0;
  const num = (v, d) => { const n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? d : n; };
  const PLACAS = [
    { n: "Rectangular 30 × 20", base: { forma: "rect", L: 30, W: 20 } },
    { n: "Esquinas redondeadas 50 × 30", base: { forma: "redondeada", L: 50, W: 30, radio: 3 } },
    { n: "Redonda Ø 30", base: { forma: "redonda", d: 30 } },
    { n: "Tipo DevKit ESP32 (51.5 × 28.5)", base: { forma: "rect", L: 51.5, W: 28.5 }, agujeros: 2.5 },
    { n: "Tipo Arduino Nano (45 × 18)", base: { forma: "rect", L: 45, W: 18 } },
    { n: "Módulo sensor (20 × 15)", base: { forma: "rect", L: 20, W: 15 }, agujeros: 2.5 },
  ];

  const FONDO3D = "#0b1220";
  // ---------------- three.js (se carga solo al abrir la pestaña)
  let threeP = null;
  function cargarThree() {
    if (window.THREE && THREE.OrbitControls) return Promise.resolve();
    if (threeP) return threeP;
    const js = src => new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => no(new Error("No se pudo cargar " + src)); document.head.appendChild(s); });
    threeP = js("app/vendor/three.min.js").then(() => js("app/vendor/OrbitControls.js"));
    return threeP;
  }


  // ---------------- construcción 3D compartida (pestaña Modelo 3D, render de la ficha, caja 3D del proyecto)
  // Mundo three.js: X = X de la pieza, Y = altura (Z de la pieza), Z = −Y de la pieza.
  function forma2D(T, b, W) {
    const s = new T.Shape();
    if (b.forma === "contorno" && b.contorno && b.contorno.length > 2) { b.contorno.forEach((p, i) => i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])); s.closePath(); }
    else if (b.forma === "redonda") s.absarc(0, 0, b.d / 2, 0, Math.PI * 2, false);
    else { const L = b.L / 2, W2 = b.W / 2, r = b.forma === "redondeada" ? Math.min(b.radio || 0, L - 0.01, W2 - 0.01) : 0;
      s.moveTo(-L + r, -W2); s.lineTo(L - r, -W2); if (r) s.absarc(L - r, -W2 + r, r, -Math.PI / 2, 0); s.lineTo(L, W2 - r); if (r) s.absarc(L - r, W2 - r, r, 0, Math.PI / 2); s.lineTo(-L + r, W2); if (r) s.absarc(-L + r, W2 - r, r, Math.PI / 2, Math.PI); s.lineTo(-L, -W2 + r); if (r) s.absarc(-L + r, -W2 + r, r, Math.PI, Math.PI * 1.5); }
    for (const a of (W.montaje && W.montaje.agujeros) || []) { const h = new T.Path(); h.absarc(a.x, a.y, a.d / 2, 0, Math.PI * 2, true); s.holes.push(h); }
    return s;
  }
  /** Geometría de un perfil extruido (en el eje z, x o y), centrada como las demás primitivas (en cx, centro de altura, −cy). */
  function geoPerfil(T, c) {
    const sh = new T.Shape();
    if (c.circ) sh.absarc(c.circ[0], c.circ[1], c.circ[2], 0, Math.PI * 2, false);
    else { c.pts.forEach((p, i) => i ? sh.lineTo(p[0], p[1]) : sh.moveTo(p[0], p[1])); sh.closePath(); }
    const g = new T.ExtrudeGeometry(sh, { depth: Math.max(0.02, c.a1 - c.a0), bevelEnabled: false, curveSegments: 24 });
    if (c.eje === "x") { g.rotateY(Math.PI / 2); g.translate(c.a0, 0, 0); }        // (u, v, w) = (y, z, x) → (x, z, −y)
    else if (c.eje === "y") g.translate(0, 0, -c.a1);                              // (u, v, w) = (x, z, y) → (x, z, −y)
    else { g.rotateX(-Math.PI / 2); g.translate(0, c.a0, 0); }                     // (u, v, w) = (x, y, z) → (x, z, −y)
    g.translate(-c.cx, -(c.z0 + c.z1) / 2, c.cy);
    return g;
  }
  /** Agrega al grupo las mallas del componente W (placa/base + piezas). Devuelve el desplazamiento de "explotar". */
  function construir(T, W, o) {
    o = o || {}; const grupo = o.grupo || new T.Group(), M = W.modelo; if (!M || !M.base) return 0;
    const b = M.base, esp = b.espesor, E = o.explotar ? Math.max(6, Math.min(esp, 10) * 4) : 0, bi = MLPlant.baseInfo(b), sel = o.sel || [];
    const mat = (color, extra) => new T.MeshStandardMaterial(Object.assign({ color: color || "#64748b", roughness: 0.55, metalness: /#c|#d|#9/.test(color || "") ? 0.35 : 0.05 }, extra || {}));
    if (!bi.prim.length) {
      const pg = new T.ExtrudeGeometry(forma2D(T, b, W), { depth: esp, bevelEnabled: false, curveSegments: 32 }); pg.rotateX(-Math.PI / 2);
      grupo.add(new T.Mesh(pg, mat(b.color || "#166534", { roughness: 0.75, metalness: 0 })));
    }
    const lista = bi.prim.map(c => Object.assign({}, c, { esBase: true })).concat((M.piezas || []).flatMap(p => MLPlant.cuerposDe(p, esp)));
    for (const c of lista) {
      const alto = Math.max(0.05, c.z1 - c.z0), mid = (c.z0 + c.z1) / 2 + (c.esBase ? 0 : c.z0 >= esp - 1e-6 ? E : c.z1 <= 1e-6 ? -E : 0);
      let g;
      const hs = c.orejas ? ((W.montaje && W.montaje.agujeros) || []).filter(a => Math.abs(a.x - c.cx) < c.w / 2 && Math.abs(a.y - c.cy) < c.h / 2) : [];
      if (hs.length) { const s = new T.Shape(), w = c.w / 2, h = c.h / 2; s.moveTo(-w, -h); s.lineTo(w, -h); s.lineTo(w, h); s.lineTo(-w, h); s.lineTo(-w, -h);
        hs.forEach(a => { const p = new T.Path(); p.absarc(a.x - c.cx, a.y - c.cy, a.d / 2, 0, Math.PI * 2, true); s.holes.push(p); });
        g = new T.ExtrudeGeometry(s, { depth: alto, bevelEnabled: false, curveSegments: 20 }); g.rotateX(-Math.PI / 2); g.translate(0, -alto / 2, 0); }
      else if (c.f === "perfil") g = geoPerfil(T, c);
      else if (c.f === "cil") g = new T.CylinderGeometry(c.d / 2, c.d / 2, alto, 28);
      else if (c.r && c.r > 0.05) { const s = new T.Shape(), w = c.w / 2, h = c.h / 2, r = Math.min(c.r, w - 0.01, h - 0.01); s.moveTo(-w + r, -h); s.lineTo(w - r, -h); s.absarc(w - r, -h + r, r, -Math.PI / 2, 0); s.lineTo(w, h - r); s.absarc(w - r, h - r, r, 0, Math.PI / 2); s.lineTo(-w + r, h); s.absarc(-w + r, h - r, r, Math.PI / 2, Math.PI); s.lineTo(-w, -h + r); s.absarc(-w + r, -h + r, r, Math.PI, Math.PI * 1.5);
        g = new T.ExtrudeGeometry(s, { depth: alto, bevelEnabled: false, curveSegments: 12 }); g.rotateX(-Math.PI / 2); g.translate(0, -alto / 2, 0); }
      else g = new T.BoxGeometry(c.w, alto, c.h);
      const m = new T.Mesh(g, mat(c.color));
      m.position.set(c.cx, mid, -c.cy);
      if (sel.includes(c.pieza)) m.material.emissive = new T.Color("#0369a1");
      grupo.add(m);
    }
    return E;
  }
  /** Mallas de una lista de primitivas sueltas (mismas coordenadas que las piezas: x, y en planta, z hacia arriba). */
  function mallasPrims(T, lista, grupo, o) {
    o = o || {}; grupo = grupo || new T.Group();
    for (const c of lista) {
      const alto = Math.max(0.05, c.z1 - c.z0); let g;
      if (c.f === "perfil") g = geoPerfil(T, c);
      else if (c.f === "cil") g = new T.CylinderGeometry(c.d / 2, c.d / 2, alto, 28);
      else if (c.r && c.r > 0.05) { const s = new T.Shape(), w = c.w / 2, h = c.h / 2, r = Math.min(c.r, w - 0.01, h - 0.01); s.moveTo(-w + r, -h); s.lineTo(w - r, -h); s.absarc(w - r, -h + r, r, -Math.PI / 2, 0); s.lineTo(w, h - r); s.absarc(w - r, h - r, r, 0, Math.PI / 2); s.lineTo(-w + r, h); s.absarc(-w + r, h - r, r, Math.PI / 2, Math.PI); s.lineTo(-w, -h + r); s.absarc(-w + r, -h + r, r, Math.PI, Math.PI * 1.5);
        g = new T.ExtrudeGeometry(s, { depth: alto, bevelEnabled: false, curveSegments: 10 }); g.rotateX(-Math.PI / 2); g.translate(0, -alto / 2, 0); }
      else g = new T.BoxGeometry(c.w, alto, c.h);
      const m = new T.Mesh(g, o.material ? o.material(c) : new T.MeshStandardMaterial({ color: c.color || "#64748b", roughness: 0.55, metalness: /#c|#d|#9/.test(c.color || "") ? 0.35 : 0.05 }));
      m.position.set(c.cx, (c.z0 + c.z1) / 2, -c.cy); grupo.add(m);
    }
    return grupo;
  }
  /** Alto total y centro vertical del componente (para encuadrar la cámara). */
  function encuadre(W) { const bi = MLPlant.baseInfo(W.modelo.base), mt = W.montaje || {}, alto = (bi.top || 0) + (mt.altura_superior || 0) + (mt.altura_inferior || 0), zc = ((bi.top || 0) + (mt.altura_superior || 0) - (mt.altura_inferior || 0)) / 2; let ext = 0; for (const c of (W.modelo && W.modelo.cuerpos) || []) { const w = c.f === "cil" ? c.d : c.w, h = c.f === "cil" ? c.d : c.h; if (w != null) ext = Math.max(ext, 2 * (Math.abs(c.cx) + w / 2), 2 * (Math.abs(c.cy) + h / 2)); }   // piezas que salen de la base
    return { R: Math.max(bi.L || 20, bi.W || 20, alto, 2.5, ext * 0.85) * 1.6, zc }; }
  // render isométrico fuera de pantalla (un solo contexto WebGL reutilizado)
  let isoR = null; const isoCache = new Map();
  async function iso(W, ancho, alto, fondo) {
    if (!W || !W.modelo || !W.modelo.base) return null;
    const k = JSON.stringify([W.id, W.version, W.modelo, (W.montaje || {}).agujeros, ancho, alto, fondo || ""]); if (isoCache.has(k)) return isoCache.get(k);
    await cargarThree(); const T = THREE;
    if (!isoR) isoR = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
    const ren = isoR; ren.setPixelRatio(2); ren.setSize(ancho, alto, false);
    const scene = new T.Scene(); if (fondo) scene.background = new T.Color(fondo);
    scene.add(new T.HemisphereLight(0xffffff, 0x8899aa, 0.75));
    const dl = new T.DirectionalLight(0xffffff, 0.75); dl.position.set(60, 120, 80); scene.add(dl);
    const dl2 = new T.DirectionalLight(0xffffff, 0.35); dl2.position.set(-80, -60, -40); scene.add(dl2);
    const g = new T.Group(); scene.add(g); construir(T, W, { grupo: g });
    const { R, zc } = encuadre(W), cam = new T.PerspectiveCamera(35, ancho / alto, 0.1, 5000);
    // mira desde el lado donde están los conectores laterales (si los hay)
    const sal = (W.zonas || []).map(z => z.salida), sx = sal.includes("-X") && !sal.includes("+X") ? -1 : 1, sz = sal.includes("+Y") && !sal.includes("-Y") ? -1 : 1;
    cam.position.set(sx * R * 0.75, zc + R * 0.8, sz * R * 0.95); cam.lookAt(0, zc, 0);
    ren.setClearColor(0x000000, 0); ren.render(scene, cam);
    const src = ren.domElement.toDataURL("image/png");
    g.children.forEach(o => { o.geometry && o.geometry.dispose(); o.material && o.material.dispose(); });
    isoCache.set(k, src); return src;
  }

  function montar(host, W, opt) {
    opt = opt || {};
    const st = { cara: "A", tool: "sel", colocar: null, sel: [], selH: null, k: 8, ox: 0, oy: 0, snap: 0.5, drag: null, fitted: false, explotar: false, filtro: "", grupo: "Conectores", multi: false, varias: false, area: false, ptrs: new Map() };
    const listeners = [];
    const on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); listeners.push([el, ev, fn, o]); };
    let v3 = null;   // estado de la vista 3D

    const changed = (redibujar3d = true) => { MLPlant.sincronizar(W); opt.onChange && opt.onChange(); dibujar(); panel(); if (redibujar3d) render3d(); };
    const M = () => W.modelo;
    const nuevoId = () => "p" + Math.random().toString(36).slice(2, 7);
    const piezasSel = () => (M().piezas || []).filter(p => st.sel.includes(p.id));

    // ---------------- inicio: componente sin modelo
    function inicio() {
      const tieneMontaje = W.montaje && W.montaje.pcb;
      host.innerHTML = `<div class="panel" style="max-width:820px">
        <h3>Modelo 3D</h3>${opt.importarStep ? `<div class="msg info" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:space-between"><span>¿Tienes el <b>STEP</b> del fabricante? La app saca la placa, el contorno, los agujeros y cada pieza. ¿Solo fotos, un plano o medidas? <b>Modélalo con IA</b>.</span><span class="row" style="gap:6px"><button class="pri" id="moStep0">🧊 Importar STEP</button>${opt.modelarIA ? '<button class="pri" id="moIA0">🤖 Modelar con IA</button>' : ""}</span></div>` : ""}<p class="muted" style="margin-top:${opt.importarStep ? 12 : 0}px">Dibuja el componente con formas simples vistas desde arriba y la vista 3D se arma sola. Empieza por la placa:</p>
        ${tieneMontaje ? `<button class="pri" id="moDesde">Crear a partir de su montaje (${W.montaje.pcb[0]} × ${W.montaje.pcb[1]} mm${(W.zonas || []).length ? `, ${W.zonas.length} zonas` : ""})</button><div class="small muted" style="margin:6px 0 14px">Toma la placa, los agujeros y convierte las zonas en piezas que puedes ajustar.</div>` : ""}
        <div class="small" style="margin-bottom:6px"><b>${tieneMontaje ? "O empieza con una placa de plantilla:" : "Placas de plantilla:"}</b></div>
        <div class="row">${PLACAS.map((p, i) => `<button data-pl="${i}">${esc(p.n)}</button>`).join("")}</div>
        <div class="small" style="margin:16px 0 6px"><b>Otras bases</b> <span class="muted">(motores, servos y cuerpos sólidos: las piezas se montan encima o debajo)</span></div>
        <div class="row">${Object.entries(MLPlant.MOTORES).map(([k, m]) => `<button data-bm="${k}">⚙ ${esc(m.n)}</button>`).join("")}${Object.entries(MLPlant.SERVOS).map(([k, m]) => `<button data-bs="${k}">⛭ Servo ${esc(m.n)}</button>`).join("")}
          <button data-bx="prisma">▣ Prisma / caja</button><button data-bx="cilindro">◉ Cilindro</button></div></div>`;
      const s0 = host.querySelector("#moStep0"); if (s0) s0.onclick = () => opt.importarStep();
      const i0 = host.querySelector("#moIA0"); if (i0) i0.onclick = () => opt.modelarIA();
      const d = host.querySelector("#moDesde");
      if (d) d.onclick = () => { W.modelo = MLPlant.desdeMontaje(W); armar(); changed(); };
      host.querySelectorAll("[data-pl]").forEach(b => b.onclick = () => {
        const P = PLACAS[+b.dataset.pl];
        W.modelo = { version: 1, base: Object.assign({ forma: "rect", L: 30, W: 20, d: 30, espesor: 1.6, radio: 0, color: "#166534" }, P.base), piezas: [] };
        if (P.base.forma === "redonda") { W.modelo.base.L = P.base.d; W.modelo.base.W = P.base.d; }
        W.montaje = Object.assign(W.montaje || {}, { agujeros: [] });
        if (P.agujeros) { const ax = r2(P.base.L / 2 - P.agujeros), ay = r2(P.base.W / 2 - P.agujeros); W.montaje.agujeros = [[-ax, -ay], [ax, -ay], [ax, ay], [-ax, ay]].map(([x, y]) => ({ x, y, d: 3 })); }
        armar(); changed();
      });
      const nuevaBase = (tipo, extra) => {
        W.modelo = { version: 1, base: Object.assign({ tipo }, JSON.parse(JSON.stringify(MLPlant.BASES[tipo].def)), extra || {}), piezas: [] };
        W.montaje = Object.assign(W.montaje || {}, { agujeros: [] });
        const bi = MLPlant.baseInfo(W.modelo.base); if (bi.agujerosDef) W.montaje.agujeros = bi.agujerosDef;
        MLPlant.sincronizar(W);
        if (tipo === "servo" || tipo === "motor") W.montaje.fijacion = tipo === "servo" ? "tornillo" : "abrazadera";
        armar(); changed();
      };
      host.querySelectorAll("[data-bm]").forEach(b => b.onclick = () => nuevaBase("motor", { modelo: b.dataset.bm }));
      host.querySelectorAll("[data-bs]").forEach(b => b.onclick = () => nuevaBase("servo", { modelo: b.dataset.bs }));
      host.querySelectorAll("[data-bx]").forEach(b => b.onclick = () => nuevaBase(b.dataset.bx));
    }

    // ---------------- estructura
    function armar() {
      host.innerHTML = `<div class="mo-layout">
        <div class="mo-izq">
          <div class="mo-bar" id="moBar"></div>
          <div class="canvas-wrap mo-plan"><svg id="moSvg"></svg><div class="ed-info" id="moInfo"></div><div id="moHint" style="display:none;position:absolute;top:8px;left:8px;right:8px;background:rgba(14,165,233,.92);color:#04121f;font-weight:600;padding:6px 10px;border-radius:8px;font-size:12.5px;pointer-events:none"></div></div>
          <div class="panel mo-lib"><div class="row" style="justify-content:space-between;flex-wrap:nowrap"><b>Librería</b><input id="moQ" placeholder="Buscar pieza…" style="max-width:220px"></div><div class="tabs" id="moGr" style="margin:6px 0"></div><div id="moLib" class="mo-items"></div></div>
        </div>
        <div class="mo-der">
          <div class="mo-3d"><div id="mo3d"><div class="muted small" style="padding:20px">Cargando vista 3D…</div></div>
            <div class="mo-3dbar"><button class="sm" data-v="iso">Iso</button><button class="sm" data-v="arriba">Arriba</button><button class="sm" data-v="abajo">Abajo</button><button class="sm" id="moEx">Explotar</button><button class="sm" id="moFoto" title="Usar esta vista como imagen del componente">📷 Imagen</button>${opt.importarStep ? '<button class="sm" id="moStep" title="Reemplazar este modelo por uno generado desde un archivo STEP">🧊 Desde STEP</button>' : ""}${opt.modelarIA ? '<button class="sm" id="moIA" title="Rehacer el modelo con una IA a partir de fotos, plano o medidas">🤖 Con IA</button>' : ""}</div></div>
          <div class="panel" id="moPanel"></div>
          <div id="moRev"></div>
        </div></div>`;
      barra(); libreria(); panel();
      const svg = host.querySelector("#moSvg");
      on(svg, "pointerdown", pDown); on(svg, "pointermove", pMove); on(svg, "pointerup", pUp); on(svg, "pointercancel", pUp);
      on(svg, "wheel", e => { e.preventDefault(); const [sx, sy] = pt(e), [wx, wy] = toW(sx, sy); st.k *= e.deltaY < 0 ? 1.15 : 1 / 1.15; const [nx, ny] = toW(sx, sy); st.ox += wx - nx; st.oy += wy - ny; dibujar(); }, { passive: false });
      on(document, "keydown", tecla);
      const ro = new ResizeObserver(() => { dibujar(); v3 && v3.resize(); }); ro.observe(svg); listeners.push([null, null, () => ro.disconnect()]);
      host.querySelector("#moQ").oninput = e => { st.filtro = e.target.value; libreria(); };
      host.querySelectorAll("[data-v]").forEach(b => b.onclick = () => v3 && v3.vista(b.dataset.v));
      host.querySelector("#moEx").onclick = e => { st.explotar = !st.explotar; e.target.classList.toggle("on", st.explotar); render3d(); };
      const bS = host.querySelector("#moStep"); if (bS) bS.onclick = () => opt.importarStep();
      const bI = host.querySelector("#moIA"); if (bI) bI.onclick = () => opt.modelarIA();
      host.querySelector("#moFoto").onclick = async () => { const src = await captura(); if (!src) return; W.imagen = { src, origen: "render del modelo 3D" }; opt.onChange && opt.onChange(); opt.toast && opt.toast("Imagen lista: se guarda con el componente"); };
      dibujar();
      cargarThree().then(iniciar3d).catch(e => { host.querySelector("#mo3d").innerHTML = `<div class="small" style="padding:16px;color:#fca5a5">${esc(e.message)}. Recarga la página.</div>`; });
    }

    // ---------------- barra de herramientas
    function barra() {
      const b = host.querySelector("#moBar");
      b.innerHTML = `<div class="row" style="gap:4px">
        <button class="sm ${st.cara === "A" ? "on" : ""}" data-c="A" title="Cara superior">Cara A ▲</button><button class="sm ${st.cara === "B" ? "on" : ""}" data-c="B" title="Cara inferior (vista a través de la placa)">Cara B ▼</button>
        <span class="mo-sep"></span>
        <button class="sm ${st.tool === "sel" && !st.colocar ? "on" : ""}" data-t="sel">↖ Seleccionar</button><button class="sm ${st.tool === "hole" ? "on" : ""}" data-t="hole">◯ Agujero</button><button class="sm" data-t="esq">⌗ 4 esquinas</button>
        <span class="mo-sep"></span>
        <button class="sm" data-a="rot" title="Girar 90° (R)">↻</button><button class="sm" data-a="dup" title="Duplicar (Ctrl+D)">⧉</button><button class="sm" data-a="fila" title="Repetir en fila">⋯ Fila</button><button class="sm" data-a="cara" title="Pasar a la otra cara">⇅ Cara</button><button class="sm danger" data-a="del" title="Eliminar (Supr)">🗑</button>
        <span class="mo-sep"></span>
        <button class="sm ${st.multi ? "on" : ""}" data-m="multi" title="Cada toque agrega o quita piezas de la selección (igual que Shift + clic)">☑ Multi</button><button class="sm ${st.area ? "on" : ""}" data-m="area" title="Arrastrar en vacío selecciona por área (igual que Shift + arrastrar)">⬚ Área</button><button class="sm ${st.varias ? "on" : ""}" data-m="varias" title="Al colocar una pieza de la librería, seguir colocando copias (igual que Shift)">⊕ Colocar varias</button>
        <span class="mo-sep"></span>
        <button class="sm" data-z="in">＋</button><button class="sm" data-z="out">－</button><button class="sm" data-z="fit">Ajustar</button>
        <select id="moSnap" style="width:auto;padding:3px 6px">${[[0, "Libre"], [0.1, "0.1"], [0.5, "0.5"], [1, "1"], [1.27, "1.27"], [2.54, "2.54"]].map(([v, n]) => `<option value="${v}" ${st.snap == v ? "selected" : ""}>Rejilla ${n} mm</option>`).join("")}</select></div>
`;
      const hint = host.querySelector("#moHint"); if (hint) { hint.innerHTML = st.colocar ? `Colocando <b>${esc(MLPlant.plantilla(st.colocar)?.n)}</b> en la cara ${st.cara}: clic en la placa · ${st.varias ? "sigue colocando: pulsa ⊕ o Esc para terminar" : "Shift o ⊕ = varias · Esc = terminar"}` : ""; hint.style.display = st.colocar ? "block" : "none"; }
      b.querySelectorAll("[data-c]").forEach(x => x.onclick = () => { st.cara = x.dataset.c; st.sel = []; barra(); dibujar(); panel(); });
      b.querySelectorAll("[data-t]").forEach(x => x.onclick = () => { const t = x.dataset.t; if (t === "esq") return esquinas(); st.tool = t; st.colocar = null; barra(); });
      b.querySelectorAll("[data-a]").forEach(x => x.onclick = () => accion(x.dataset.a));
      b.querySelectorAll("[data-z]").forEach(x => x.onclick = () => { const z = x.dataset.z; if (z === "fit") st.fitted = false; else st.k *= z === "in" ? 1.25 : 0.8; dibujar(); });
      b.querySelector("#moSnap").onchange = e => st.snap = +e.target.value;
      b.querySelectorAll("[data-m]").forEach(x => x.onclick = () => { st[x.dataset.m] = !st[x.dataset.m]; barra(); });
    }

    // ---------------- librería
    function libreria() {
      const todas = MLPlant.todas(), q = st.filtro.trim().toLowerCase();
      const grupos = [...MLPlant.GRUPOS, ...(todas.some(t => t.propia) ? ["Mis plantillas"] : [])];
      host.querySelector("#moGr").innerHTML = q ? "" : grupos.map(g => `<button data-g="${esc(g)}" class="${st.grupo === g ? "on" : ""}">${esc(g)}</button>`).join("");
      host.querySelectorAll("[data-g]").forEach(b => b.onclick = () => { st.grupo = b.dataset.g; libreria(); });
      const L = todas.filter(t => q ? (t.n + " " + t.g).toLowerCase().includes(q) : t.g === st.grupo);
      host.querySelector("#moLib").innerHTML = L.map(t => `<div class="mo-item ${st.colocar === t.id ? "on" : ""}" data-pt="${esc(t.id)}" title="Clic y luego clic en la placa">${icono(t)}<span>${esc(t.n)}</span>${t.propia ? `<button class="sm ghost" data-ren="${esc(t.id)}" title="Renombrar plantilla">✎</button><button class="sm ghost" data-del="${esc(t.id)}" title="Eliminar plantilla">✕</button>` : ""}</div>`).join("") || '<div class="muted small">Sin resultados</div>';
      host.querySelectorAll("[data-pt]").forEach(d => d.onclick = e => { if (e.target.dataset.del || e.target.dataset.ren) return; st.colocar = st.colocar === d.dataset.pt ? null : d.dataset.pt; st.tool = "sel"; barra(); libreria(); });
      host.querySelectorAll("[data-ren]").forEach(b => b.onclick = e => {
        e.stopPropagation(); const u = (Store.db.plantillas || []).find(t => t.id === b.dataset.ren); if (!u) return;
        dialogo(`<h3>Renombrar plantilla</h3><div><label>Nombre</label><input id="tN" value="${esc(u.nombre)}"></div>`, async bx => {
          const n = bx.querySelector("#tN").value.trim(); if (!n || n === u.nombre) return;
          try { await Store.save("plantillas", Object.assign({}, u, { nombre: n }), `Plantilla ${u.id}: renombrada a ${n}`); libreria(); opt.toast && opt.toast("Plantilla renombrada"); } catch (er) { opt.toast && opt.toast(er.message); }
        });
      });
      host.querySelectorAll("[data-del]").forEach(b => b.onclick = async e => { e.stopPropagation(); if (!confirm || true) { try { await Store.remove("plantillas", b.dataset.del, `Eliminar plantilla ${b.dataset.del}`); opt.toast && opt.toast("Plantilla eliminada"); libreria(); } catch (er) { opt.toast && opt.toast(er.message); } } });
    }
    function icono(t) { // miniatura de la plantilla en planta
      const g = MLPlant.geom({ plantilla: t.id, rot: 0, x: 0, y: 0, params: {} }); let ex = 1;
      g.prim.forEach(p => { const w = p.f === "cil" ? p.d : p.w, h = p.f === "cil" ? p.d : p.h; ex = Math.max(ex, Math.abs(p.cx) + w / 2, Math.abs(p.cy) + h / 2); });
      const k = 15 / ex; let s = `<svg viewBox="-17 -17 34 34" width="34" height="34" style="flex:none;background:#0b1220;border-radius:6px">`;
      g.prim.forEach(p => { s += p.f === "cil" ? `<circle cx="${p.cx * k}" cy="${-p.cy * k}" r="${p.d / 2 * k}" fill="${p.color}"/>` : `<rect x="${(p.cx - p.w / 2) * k}" y="${(-p.cy - p.h / 2) * k}" width="${p.w * k}" height="${p.h * k}" rx="${(p.r || 0) * k}" fill="${p.color}"/>`; });
      return s + "</svg>";
    }

    // ---------------- plano 2D
    const svgEl = () => host.querySelector("#moSvg");
    const size = () => { const b = svgEl().getBoundingClientRect(); return [b.width || 700, b.height || 450]; };
    const toS = (x, y) => { const [w, h] = size(); return [w / 2 + (x - st.ox) * st.k, h / 2 - (y - st.oy) * st.k]; };
    const toW = (sx, sy) => { const [w, h] = size(); return [(sx - w / 2) / st.k + st.ox, -(sy - h / 2) / st.k + st.oy]; };
    const snap = v => st.snap ? Math.round(v / st.snap) * st.snap : v;
    const pt = e => { const b = svgEl().getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    function ajustar() { const [w, h] = size(), bi = MLPlant.baseInfo(M().base), L = bi.L || 30, Wd = bi.W || 20; st.k = Math.min((w - 70) / (L + 16), (h - 60) / (Wd + 16)); st.ox = 0; st.oy = 0; st.fitted = true; }
    function dibujar() {
      const svg = svgEl(); if (!svg) return; const [w, h] = size(); if (!st.fitted) ajustar();
      const b = M().base, esp = b.espesor;
      let s = `<rect width="${w}" height="${h}" fill="#0b1220"/>`;
      const step = st.k > 6 ? 1 : st.k > 2 ? 5 : 10; const [x0, y1] = toW(0, 0), [x1, y0] = toW(w, h);
      for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) { const [sx] = toS(x, 0); s += `<line x1="${sx}" y1="0" x2="${sx}" y2="${h}" stroke="${Math.round(x) % 5 === 0 ? "#1e293b" : "#131c2e"}"/>`; }
      for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) { const [, sy] = toS(0, y); s += `<line x1="0" y1="${sy}" x2="${w}" y2="${sy}" stroke="${Math.round(y) % 5 === 0 ? "#1e293b" : "#131c2e"}"/>`; }
      const [ax, ay] = toS(0, 0); s += `<line x1="0" y1="${ay}" x2="${w}" y2="${ay}" stroke="#7f1d1d"/><line x1="${ax}" y1="0" x2="${ax}" y2="${h}" stroke="#14532d"/>`;
      // base
      const bi = MLPlant.baseInfo(b);
      if (bi.prim.length) { for (const c of bi.prim.slice().sort((p, q) => p.z0 - q.z0)) { if (c.z1 <= 0) continue;
          if (c.f === "cil") { const [cx, cy] = toS(c.cx, c.cy); s += `<circle cx="${cx}" cy="${cy}" r="${c.d / 2 * st.k}" fill="${c.color}" fill-opacity=".6" stroke="#cbd5e1" stroke-width="1"/>`; }
          else { const [rx, ry] = toS(c.cx - c.w / 2, c.cy + c.h / 2); s += `<rect x="${rx}" y="${ry}" width="${c.w * st.k}" height="${c.h * st.k}" rx="${(c.r || 0) * st.k}" fill="${c.color}" fill-opacity=".55" stroke="#cbd5e1" stroke-width="1"/>`; } } }
      else if (bi.forma === "contorno") s += `<path d="${MLPlant.trazoPerfil({ pts: b.contorno }, toS, st.k)}" fill="${b.color || "#166534"}" fill-opacity=".75" stroke="#22c55e" stroke-width="1.5"/>`;
      else if (b.forma === "redonda") s += `<circle cx="${ax}" cy="${ay}" r="${b.d / 2 * st.k}" fill="${b.color || "#166534"}" fill-opacity=".75" stroke="#22c55e" stroke-width="1.5"/>`;
      else { const [px, py] = toS(-b.L / 2, b.W / 2); s += `<rect x="${px}" y="${py}" width="${b.L * st.k}" height="${b.W * st.k}" rx="${(b.forma === "redondeada" ? b.radio || 0 : 0) * st.k}" fill="${b.color || "#166534"}" fill-opacity=".75" stroke="#22c55e" stroke-width="1.5"/>`; }
      // piezas: primero la otra cara (fantasma), luego la activa
      const ps = M().piezas || [];
      for (const fase of [0, 1]) for (const pz of ps) {
        const act = (pz.cara || "A") === st.cara || (st.cara === "A" && MLPlant.esLateral(pz.cara)); if ((fase === 1) !== act) continue;
        const sel = st.sel.includes(pz.id);
        for (const c of MLPlant.cuerposDe(pz, esp)) {
          const op = act ? 0.95 : 0.22;
          if (c.f === "perfil" && c.eje === "z") { s += `<path data-p="${act ? pz.id : ""}" d="${MLPlant.trazoPerfil(c, toS, st.k)}" fill="${c.color}" fill-opacity="${op}" stroke="${act ? "#0b1220" : "#94a3b8"}" stroke-width=".6" ${act ? "" : 'stroke-dasharray="3 3"'} style="cursor:${act ? "move" : "default"}"/>`; }
          else if (c.f === "cil") { const [cx, cy] = toS(c.cx, c.cy); s += `<circle data-p="${act ? pz.id : ""}" cx="${cx}" cy="${cy}" r="${Math.max(1.5, c.d / 2 * st.k)}" fill="${c.color}" fill-opacity="${op}" stroke="${act ? "#0b1220" : "#94a3b8"}" ${act ? "" : 'stroke-dasharray="3 3"'} style="cursor:${act ? "move" : "default"}"/>`; }
          else { const [rx, ry] = toS(c.cx - c.w / 2, c.cy + c.h / 2); s += `<rect data-p="${act ? pz.id : ""}" x="${rx}" y="${ry}" width="${Math.max(1, c.w * st.k)}" height="${Math.max(1, c.h * st.k)}" rx="${(c.r || 0) * st.k}" fill="${c.color}" fill-opacity="${op}" stroke="${act ? "#0b1220" : "#94a3b8"}" stroke-width=".6" ${act ? "" : 'stroke-dasharray="3 3"'} style="cursor:${act ? "move" : "default"}"/>`; }
        }
        if (act) { const hb = MLPlant.huella(pz); if (hb) { const [rx, ry] = toS(hb.x0, hb.y1); if (sel) s += `<rect x="${rx - 3}" y="${ry - 3}" width="${(hb.x1 - hb.x0) * st.k + 6}" height="${(hb.y1 - hb.y0) * st.k + 6}" fill="none" stroke="#38bdf8" stroke-width="2" stroke-dasharray="5 3" pointer-events="none"/>`;
          if (st.k > 5 || sel) s += `<text x="${rx}" y="${ry - 5}" fill="${sel ? "#38bdf8" : "#cbd5e1"}" font-size="11" pointer-events="none">${esc(pz.nombre || MLPlant.plantilla(pz.plantilla)?.n || "")}</text>`; } }
      }
      // pines de la cara activa
      for (const p of W.pines || []) if (p.pieza && (p.cara || "A") === st.cara && p.x != null) { const [px, py] = toS(p.x, p.y); s += `<circle cx="${px}" cy="${py}" r="${Math.max(1.5, 0.35 * st.k)}" fill="#facc15" pointer-events="none"/>`; }
      // agujeros
      (W.montaje && W.montaje.agujeros || []).forEach((a, i) => { const [hx, hy] = toS(a.x, a.y), rr = Math.max(3, a.d / 2 * st.k); s += `<circle data-h="${i}" cx="${hx}" cy="${hy}" r="${rr}" fill="#0b1220" stroke="${st.selH === i ? "#fff" : "#fbbf24"}" stroke-width="${st.selH === i ? 2.5 : 1.5}" style="cursor:move"/>`; });
      // cotas y origen
      const L = bi.L, Wd = bi.W, [qx, qy] = toS(-L / 2, -Wd / 2);
      s += `<text x="${ax}" y="${qy + 18}" fill="#94a3b8" font-size="12" text-anchor="middle">${b.forma === "redonda" ? "Ø " + b.d : L} mm</text>${b.forma === "redonda" ? "" : `<text x="${qx - 8}" y="${ay}" fill="#94a3b8" font-size="12" text-anchor="end" dominant-baseline="middle">${Wd} mm</text>`}`;
      s += `<circle cx="${ax}" cy="${ay}" r="4" fill="none" stroke="#fff"/><text x="${w - 8}" y="16" fill="${st.cara === "A" ? "#38bdf8" : "#f472b6"}" font-size="13" text-anchor="end" font-weight="700">CARA ${st.cara}${st.cara === "B" ? " (vista a través de la placa)" : ""}</text>`;
      if (st.drag && st.drag.rect) { const R = st.drag.rect; const [a1, b1] = toS(Math.min(R[0], R[2]), Math.max(R[1], R[3])); s += `<rect x="${a1}" y="${b1}" width="${Math.abs(R[2] - R[0]) * st.k}" height="${Math.abs(R[3] - R[1]) * st.k}" fill="#38bdf822" stroke="#38bdf8" stroke-dasharray="4 3"/>`; }
      svg.innerHTML = s;
    }
    function pDown(e) {
      const [sx, sy] = pt(e), [wx, wy] = toW(sx, sy), t = e.target; svgEl().setPointerCapture(e.pointerId);
      st.ptrs.set(e.pointerId, [sx, sy]);
      if (st.ptrs.size === 2) { // pellizcar para acercar (celular / tableta)
        const [a, b2] = [...st.ptrs.values()], mid = [(a[0] + b2[0]) / 2, (a[1] + b2[1]) / 2];
        if (st.drag && st.drag.piezas && st.drag.moved) st.drag.piezas.forEach(o => { o.p.x = o.x; o.p.y = o.y; });
        st.drag = { pinch: { d0: Math.hypot(a[0] - b2[0], a[1] - b2[1]) || 1, k0: st.k, mw: toW(mid[0], mid[1]) } }; return;
      }
      if (st.ptrs.size > 2) return;
      const shift = e.shiftKey || st.multi;
      if (st.colocar) {
        const tp = MLPlant.plantilla(st.colocar); const id = nuevoId();
        const n = (M().piezas || []).filter(p => p.plantilla === st.colocar).length + 1;
        M().piezas.push({ id, plantilla: st.colocar, nombre: `${tp.n.split(" (")[0]} ${n}`, cara: st.cara, x: r2(snap(wx)), y: r2(snap(wy)), rot: 0, z: 0, params: MLPlant.paramsDef(tp) });
        st.sel = [id]; if (!e.shiftKey && !st.varias) { st.colocar = null; barra(); libreria(); } changed(); return;
      }
      if (st.tool === "hole") { W.montaje.agujeros = W.montaje.agujeros || []; const d = (W.montaje.agujeros.at(-1) || {}).d || 3; W.montaje.agujeros.push({ x: r2(snap(wx)), y: r2(snap(wy)), d }); st.selH = W.montaje.agujeros.length - 1; st.sel = []; st.tool = "sel"; barra(); changed(false); render3d(); return; }
      if (t.dataset.h != null && t.dataset.h !== "") { const i = +t.dataset.h, a = W.montaje.agujeros[i]; st.selH = i; st.sel = []; st.drag = { h: i, dx: wx - a.x, dy: wy - a.y }; panel(); dibujar(); return; }
      if (t.dataset.p) {
        const id = t.dataset.p;
        if (shift) st.sel = st.sel.includes(id) ? st.sel.filter(x => x !== id) : [...st.sel, id];
        else if (!st.sel.includes(id)) st.sel = [id];
        st.selH = null;
        st.drag = { piezas: piezasSel().map(p => ({ p, x: p.x, y: p.y })), wx, wy, moved: false }; panel(); dibujar(); return;
      }
      if (e.shiftKey || st.area) { st.drag = { rect: [wx, wy, wx, wy] }; return; }
      st.sel = []; st.selH = null; st.drag = { pan: [sx, sy, st.ox, st.oy] }; panel(); dibujar();
    }
    function pMove(e) {
      const [sx, sy] = pt(e), [wx, wy] = toW(sx, sy), d = st.drag;
      if (st.ptrs.has(e.pointerId)) st.ptrs.set(e.pointerId, [sx, sy]);
      if (d && d.pinch) { if (st.ptrs.size < 2) return; const [a, b2] = [...st.ptrs.values()], mid = [(a[0] + b2[0]) / 2, (a[1] + b2[1]) / 2];
        st.k = Math.max(0.3, Math.min(400, d.pinch.k0 * Math.hypot(a[0] - b2[0], a[1] - b2[1]) / d.pinch.d0)); const [nx, ny] = toW(mid[0], mid[1]); st.ox += d.pinch.mw[0] - nx; st.oy += d.pinch.mw[1] - ny; dibujar(); return; }
      host.querySelector("#moInfo").textContent = `x ${r2(wx)}  y ${r2(wy)} mm · cara ${st.cara} · origen = centro de la placa`;
      if (!d) return;
      if (d.pan) { st.ox = d.pan[2] - (sx - d.pan[0]) / st.k; st.oy = d.pan[3] + (sy - d.pan[1]) / st.k; dibujar(); return; }
      if (d.rect) { d.rect[2] = wx; d.rect[3] = wy; dibujar(); return; }
      if (d.h != null) { const a = W.montaje.agujeros[d.h]; a.x = r2(snap(wx - d.dx)); a.y = r2(snap(wy - d.dy)); d.moved = true; dibujar(); return; }
      if (d.piezas) { const dx = snap(wx - d.wx), dy = snap(wy - d.wy); d.piezas.forEach(o => { o.p.x = r2(o.x + dx); o.p.y = r2(o.y + dy); }); d.moved = true; dibujar(); }
    }
    function pUp(e) {
      if (e && e.pointerId != null) st.ptrs.delete(e.pointerId);
      if (st.drag && st.drag.pinch) { if (st.ptrs.size === 0) st.drag = null; return; }
      const d = st.drag; st.drag = null; if (!d) return;
      if (d.rect) { const [a, b, c, e2] = d.rect, x0 = Math.min(a, c), x1 = Math.max(a, c), y0 = Math.min(b, e2), y1 = Math.max(b, e2);
        st.sel = (M().piezas || []).filter(p => ((p.cara || "A") === st.cara || (st.cara === "A" && MLPlant.esLateral(p.cara))) && p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1).map(p => p.id); panel(); dibujar(); return; }
      if (d.moved) changed();
    }
    function tecla(e) {
      if (!host.isConnected) return;
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement && document.activeElement.tagName)) return;
      if (e.key === "Escape") { st.colocar = null; st.sel = []; barra(); libreria(); dibujar(); panel(); }
      else if (e.key === "r" || e.key === "R") accion("rot");
      else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); accion("del"); }
      else if ((e.ctrlKey || e.metaKey) && (e.key === "d" || e.key === "D")) { e.preventDefault(); accion("dup"); }
      else if (e.key.startsWith("Arrow") && st.sel.length) { e.preventDefault(); const s = st.snap || 0.1, m = e.shiftKey ? 10 * s : s; piezasSel().forEach(p => { if (e.key === "ArrowLeft") p.x = r2(p.x - m); if (e.key === "ArrowRight") p.x = r2(p.x + m); if (e.key === "ArrowUp") p.y = r2(p.y + m); if (e.key === "ArrowDown") p.y = r2(p.y - m); }); changed(); }
    }
    async function accion(a) {
      const S = piezasSel();
      if (a === "del") { if (st.selH != null) { W.montaje.agujeros.splice(st.selH, 1); st.selH = null; changed(); return; } if (!S.length) return; M().piezas = M().piezas.filter(p => !st.sel.includes(p.id)); st.sel = []; changed(); return; }
      if (!S.length) return opt.toast && opt.toast("Selecciona una pieza primero");
      if (a === "rot") { S.forEach(p => p.rot = ((p.rot || 0) + 90) % 360); changed(); }
      if (a === "dup") { const nuevos = S.map(p => Object.assign(JSON.parse(JSON.stringify(p)), { id: nuevoId(), x: r2(p.x + 2.54), y: r2(p.y - 2.54) })); M().piezas.push(...nuevos); st.sel = nuevos.map(p => p.id); changed(); }
      if (a === "cara") { S.forEach(p => { if (!MLPlant.esLateral(p.cara)) p.cara = (p.cara || "A") === "A" ? "B" : "A"; }); st.cara = S[0].cara; st.sel = S.map(p => p.id); barra(); changed(); }
      if (a === "fila") fila(S);
    }
    function fila(S) {
      const p = S[0];
      dialogo(`<h3>Repetir en fila</h3><p class="small muted">Crea copias de “${esc(p.nombre)}” a una distancia fija.</p>
        <div class="kv"><div><label>Copias</label><input id="fN" type="number" value="3" min="1"></div><div><label>Paso X (mm)</label><input id="fX" type="number" step="0.01" value="${r2((MLPlant.huella(p).x1 - MLPlant.huella(p).x0) + 1)}"></div><div><label>Paso Y (mm)</label><input id="fY" type="number" step="0.01" value="0"></div></div>`, b => {
        const n = Math.max(1, num(b.querySelector("#fN").value, 1) | 0), dx = num(b.querySelector("#fX").value, 0), dy = num(b.querySelector("#fY").value, 0), nuevos = [];
        for (let i = 1; i <= n; i++) nuevos.push(Object.assign(JSON.parse(JSON.stringify(p)), { id: nuevoId(), nombre: `${p.nombre.replace(/\s\d+$/, "")} ${i + 1}`, x: r2(p.x + dx * i), y: r2(p.y + dy * i) }));
        M().piezas.push(...nuevos); st.sel = nuevos.map(q => q.id); changed();
      });
    }
    function esquinas() {
      const b = M().base;
      dialogo(`<h3>Agujeros en las 4 esquinas</h3><div class="kv"><div><label>Margen X</label><input id="eX" type="number" step="0.1" value="2.5"></div><div><label>Margen Y</label><input id="eY" type="number" step="0.1" value="2.5"></div><div><label>Ø</label><input id="eD" type="number" step="0.1" value="3"></div></div>`, bx => {
        const L = b.forma === "redonda" ? b.d : b.L, Wd = b.forma === "redonda" ? b.d : b.W, ax = r2(L / 2 - num(bx.querySelector("#eX").value, 2.5)), ay = r2(Wd / 2 - num(bx.querySelector("#eY").value, 2.5)), d = num(bx.querySelector("#eD").value, 3);
        W.montaje.agujeros = [[-ax, -ay], [ax, -ay], [ax, ay], [-ax, ay]].map(([x, y]) => ({ x, y, d })); changed();
      });
    }
    function dialogo(html, ok) {
      const m = document.getElementById("modal"), bx = document.getElementById("modalBox");
      bx.innerHTML = html + `<div class="row" style="justify-content:flex-end"><button id="dX">Cancelar</button><button class="pri" id="dOk">Aceptar</button></div>`; m.classList.remove("hide");
      const cerrar = () => { m.classList.add("hide"); bx.innerHTML = ""; };
      bx.querySelector("#dX").onclick = cerrar; bx.querySelector("#dOk").onclick = () => { ok(bx); cerrar(); };
    }

    // ---------------- panel de propiedades
    function campoParam(p, val) {
      if (p.opts === "color") return `<div><label>${esc(p.n)}</label><input type="color" data-pp="${p.k}" value="${esc(val)}" style="height:34px;padding:2px"></div>`;
      if (Array.isArray(p.opts)) return `<div><label>${esc(p.n)}</label><select data-pp="${p.k}">${p.opts.map(o => `<option ${o === val ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></div>`;
      return `<div><label>${esc(p.n)}</label><input type="number" data-pp="${p.k}" step="${p.step}" ${p.min != null ? `min="${p.min}"` : ""} ${p.max != null ? `max="${p.max}"` : ""} value="${val}"></div>`;
    }
    function panel() {
      const box = host.querySelector("#moPanel"); if (!box) return;
      const S = piezasSel(), b = M().base;
      if (S.length === 1) {
        const p = S[0], tp = MLPlant.plantilla(p.plantilla), vals = Object.assign(MLPlant.paramsDef(tp || {}), p.params || {});
        box.innerHTML = `<div class="row" style="justify-content:space-between"><h3 style="margin:0">${esc(p.nombre)}</h3><span class="tag">${esc(tp ? tp.n : p.plantilla)}</span></div>
          <div class="grid2" style="margin-top:8px"><div><label>Nombre</label><input id="pN" value="${esc(p.nombre)}"></div><div><label>Cara</label><select id="pC">${[["A", "A (arriba)"], ["B", "B (abajo)"], ["-X", "Lateral −X (izquierda)"], ["+X", "Lateral +X (derecha)"], ["-Y", "Lateral −Y (frente)"], ["+Y", "Lateral +Y (atrás)"]].map(([v, n]) => `<option value="${v}" ${(p.cara || "A") === v ? "selected" : ""}>${n}</option>`).join("")}</select></div></div>
          <div class="kv" style="margin-top:8px"><div><label>X (mm)</label><input type="number" step="0.1" id="pX" value="${p.x}"></div><div><label>Y (mm)</label><input type="number" step="0.1" id="pY" value="${p.y}"></div><div><label>${MLPlant.esLateral(p.cara) ? "Altura Z (centro)" : "Elevación Z"}</label><input type="number" step="0.1" id="pZ" value="${p.z || 0}" title="0 = apoyada en la superficie"></div></div>
          <div style="margin-top:8px"><label>Giro</label><div class="row" style="gap:4px">${[0, 90, 180, 270].map(r => `<button class="sm ${(p.rot || 0) === r ? "on" : ""}" data-rot="${r}">${r}°</button>`).join("")}</div></div>
          ${(tp && tp.params || []).length ? `<div class="kv" style="margin-top:8px">${tp.params.map(q => campoParam(q, vals[q.k])).join("")}</div>` : ""}
          <div class="row" style="margin-top:10px"><button class="sm" data-a2="dup">⧉ Duplicar</button><button class="sm" data-a2="fila">⋯ Fila</button><button class="sm" id="pTpl">★ Guardar como plantilla</button><button class="sm danger" data-a2="del">Eliminar</button></div>
          <div class="small muted" style="margin-top:6px">Elevación 0 = apoyada en la superficie de su cara. Atajos: R girar · Supr eliminar · Ctrl+D duplicar · flechas mover.</div>`;
        const set = (k, v, d3 = true) => { p[k] = v; changed(d3); };
        box.querySelector("#pN").onchange = e => set("nombre", e.target.value.trim() || p.nombre);
        box.querySelector("#pC").onchange = e => {
          const v = e.target.value, antes = p.cara || "A";
          if (MLPlant.esLateral(v)) {   // a un costado: se pega a esa cara de la base, a media altura, apuntando hacia afuera
            const bi = MLPlant.baseInfo(M().base), L = bi.L / 2, Wd = bi.W / 2;
            if (v === "-X") p.x = -L; if (v === "+X") p.x = L; if (v === "-Y") p.y = -Wd; if (v === "+Y") p.y = Wd;
            if (!MLPlant.esLateral(antes)) { p.z = Math.round(bi.top / 2 * 100) / 100; p.rot = 0; }
            opt.toast && opt.toast(`${p.nombre}: montada en la cara ${v}. «Altura Z» = altura de su centro sobre la base; su eje apunta hacia afuera.`, 6000);
          } else if (MLPlant.esLateral(antes)) { p.z = 0; }
          st.cara = MLPlant.esLateral(v) ? "A" : v; set("cara", v); barra(); panel(); };
        box.querySelector("#pX").onchange = e => set("x", r2(num(e.target.value, p.x)));
        box.querySelector("#pY").onchange = e => set("y", r2(num(e.target.value, p.y)));
        box.querySelector("#pZ").onchange = e => set("z", Math.max(0, r2(num(e.target.value, 0))));
        box.querySelectorAll("[data-rot]").forEach(x => x.onclick = () => set("rot", +x.dataset.rot));
        box.querySelectorAll("[data-pp]").forEach(x => x.onchange = () => { const q = tp.params.find(z => z.k === x.dataset.pp); p.params = p.params || {}; p.params[q.k] = q.opts ? x.value : num(x.value, q.def); changed(); });
        box.querySelectorAll("[data-a2]").forEach(x => x.onclick = () => accion(x.dataset.a2));
        box.querySelector("#pTpl").onclick = () => guardarPlantilla(S);
      } else if (S.length > 1) {
        box.innerHTML = `<h3>${S.length} piezas seleccionadas</h3>
          <div class="small muted" style="margin-bottom:4px">Alinear</div><div class="row" style="gap:4px;margin-bottom:8px">${[["izq", "⇤ Izq."], ["cx", "↔ Centro X"], ["der", "⇥ Der."], ["arr", "⤒ Arriba"], ["cy", "↕ Centro Y"], ["aba", "⤓ Abajo"]].map(([k, n]) => `<button class="sm" data-al="${k}">${n}</button>`).join("")}</div>
          ${S.length > 2 ? `<div class="small muted" style="margin-bottom:4px">Distribuir (espacios iguales)</div><div class="row" style="gap:4px;margin-bottom:8px"><button class="sm" data-di="x">⇿ En X</button><button class="sm" data-di="y">⇳ En Y</button></div>` : ""}
          <div class="row"><button class="sm" data-a2="dup">⧉ Duplicar</button><button class="sm" data-a2="cara">⇅ Pasar a la otra cara</button><button class="sm" data-a2="rot">↻ Girar</button><button class="sm" id="pTpl">★ Guardar grupo como plantilla</button><button class="sm danger" data-a2="del">Eliminar</button></div><div class="small muted" style="margin-top:6px">Shift + clic agrega o quita piezas; Shift + arrastrar en vacío selecciona por área.</div>`;
        box.querySelectorAll("[data-a2]").forEach(x => x.onclick = () => accion(x.dataset.a2));
        box.querySelector("#pTpl").onclick = () => guardarPlantilla(S);
        box.querySelectorAll("[data-al]").forEach(x => x.onclick = () => alinear(S, x.dataset.al));
        box.querySelectorAll("[data-di]").forEach(x => x.onclick = () => distribuir(S, x.dataset.di));
      } else if (st.selH != null && W.montaje.agujeros[st.selH]) {
        const a = W.montaje.agujeros[st.selH];
        box.innerHTML = `<h3>Agujero H${st.selH + 1}</h3><div class="kv"><div><label>X</label><input type="number" step="0.1" id="hX" value="${a.x}"></div><div><label>Y</label><input type="number" step="0.1" id="hY" value="${a.y}"></div><div><label>Ø</label><input type="number" step="0.1" id="hD" value="${a.d}"></div></div><div class="row" style="margin-top:8px"><button class="sm danger" data-a2="del">Eliminar agujero</button></div>`;
        ["X", "Y", "D"].forEach(k => box.querySelector("#h" + k).onchange = e => { a[k === "D" ? "d" : k.toLowerCase()] = r2(num(e.target.value, 0)); changed(); });
        box.querySelector("[data-a2]").onclick = () => accion("del");
      } else {
        const tipo = MLPlant.tipoBase(b), bi = MLPlant.baseInfo(b), placaLike = !["motor", "servo"].includes(tipo);
        const tipos = `<div><label>Tipo de base</label><select id="bT">${Object.entries(MLPlant.BASES).map(([k, v]) => `<option value="${k}" ${tipo === k ? "selected" : ""}>${v.ic} ${esc(v.n)}</option>`).join("")}</select></div>`;
        let campos = "";
        if (placaLike) campos = `<div class="grid2" style="margin-top:8px"><div><label>Forma</label><select id="bF"><option value="rect" ${b.forma === "rect" ? "selected" : ""}>Rectangular</option><option value="redondeada" ${b.forma === "redondeada" ? "selected" : ""}>Esquinas redondeadas</option><option value="redonda" ${b.forma === "redonda" ? "selected" : ""}>Redonda</option>${b.contorno && b.contorno.length > 2 ? `<option value="contorno" ${b.forma === "contorno" ? "selected" : ""}>Contorno real (${b.contorno.length} vértices)</option>` : ""}</select></div><div><label>Color</label><input type="color" id="bC" value="${esc(b.color || "#166534")}" style="height:34px;padding:2px"></div></div>
          <div class="kv" style="margin-top:8px">${b.forma === "redonda" ? `<div><label>Diámetro</label><input type="number" step="0.1" id="bD" value="${b.d}"></div>` : `<div><label>Largo X</label><input type="number" step="0.1" id="bL" value="${b.L}" ${b.forma === "contorno" ? "disabled title=\"Medida del contorno importado\"" : ""}></div><div><label>Ancho Y</label><input type="number" step="0.1" id="bW" value="${b.W}" ${b.forma === "contorno" ? "disabled" : ""}></div>`}<div><label>${tipo === "placa" ? "Espesor" : "Altura"}</label><input type="number" step="0.1" id="bE" value="${b.espesor}"></div>${b.forma === "redondeada" ? `<div><label>Radio</label><input type="number" step="0.1" id="bR" value="${b.radio || 0}"></div>` : ""}</div>`;
        else {
          const cat = tipo === "motor" ? MLPlant.MOTORES : MLPlant.SERVOS, m = bi.medidas;
          const ks = tipo === "motor" ? [["d", "Ø / ancho"], ["plano", "Entre planos"], ["largo", "Largo cuerpo"], ["reductor", "Reductor"], ["eje_d", "Ø eje"], ["eje_l", "Largo eje"]] : [["L", "Largo cuerpo"], ["W", "Ancho"], ["alto", "Alto cuerpo"], ["oL", "Largo orejas"], ["oz0", "Altura orejas"], ["sx", "Eje desde centro"]];
          campos = `<div class="grid2" style="margin-top:8px"><div><label>Modelo</label><select id="bM">${Object.entries(cat).map(([k, v]) => `<option value="${k}" ${b.modelo === k ? "selected" : ""}>${esc(v.n)}</option>`).join("")}</select></div><div><label>Color</label><input type="color" id="bC" value="${esc(b.color || "#9ca3af")}" style="height:34px;padding:2px"></div></div>
            <div class="kv" style="margin-top:8px">${ks.map(([k, n]) => `<div><label>${n}</label><input type="number" step="0.1" data-bm="${k}" value="${m[k]}"></div>`).join("")}</div>
            <div class="row" style="margin-top:8px">${tipo === "servo" ? '<button class="sm" id="bAg">◎ Agujeros de las orejas</button>' : ""}<button class="sm" id="bRs">↺ Medidas del catálogo</button></div>
            <div class="small muted" style="margin-top:6px">${tipo === "motor" ? "Eje hacia +Z (cara A = cara del eje); terminales hacia −Z." : "Eje de salida hacia +Z; la cara A es la tapa del servo y las orejas llevan los agujeros de fijación."} Medidas típicas del fabricante: verifícalas con calibrador.</div>`;
        }
        box.innerHTML = `<h3>Base</h3>${tipos}${campos}
          <div class="small" style="margin-top:10px"><b>Agujeros:</b> ${(W.montaje.agujeros || []).length ? W.montaje.agujeros.map((a, i) => `<a href="#" data-hs="${i}">H${i + 1} Ø${a.d}</a>`).join(" · ") : "ninguno (usa ◯ Agujero o ⌗ 4 esquinas)"}</div>
          <div class="small muted" style="margin-top:8px">${(M().piezas || []).length} pieza(s) · alto sobre la base ${W.montaje.altura_superior ?? 0} mm · bajo la base ${W.montaje.altura_inferior ?? 0} mm · ${(W.pines || []).filter(p => p.pieza).length} pines automáticos · ${(W.zonas || []).filter(z => z.auto).length} zonas automáticas</div>
          <div class="small muted" style="margin-top:6px">Elige una pieza en la <b>Librería</b> y haz clic en la base. La cara B se dibuja como si vieras a través de la base desde arriba.</div>`;
        const set = (k, v) => { b[k] = v; if (k === "d" && b.forma === "redonda") { b.L = v; b.W = v; } st.fitted = false; changed(); };
        box.querySelector("#bT").onchange = e => {
          const t = e.target.value, prev = b.color; Object.keys(b).forEach(k => delete b[k]); Object.assign(b, { tipo: t }, JSON.parse(JSON.stringify(MLPlant.BASES[t].def)));
          if (t === "placa" && prev) b.color = prev; const nb = MLPlant.baseInfo(b); if (nb.agujerosDef) W.montaje.agujeros = nb.agujerosDef; st.fitted = false; changed();
        };
        const bc = box.querySelector("#bC"); if (bc) bc.onchange = e => set("color", e.target.value);
        const bf = box.querySelector("#bF"); if (bf) bf.onchange = e => { b.forma = e.target.value; if (b.forma === "redonda" && !b.d) b.d = Math.min(b.L, b.W); if (b.forma !== "redonda" && !b.L) { b.L = b.d; b.W = b.d; } if (b.forma === "redondeada" && !b.radio) b.radio = 3; st.fitted = false; changed(); };
        [["bL", "L"], ["bW", "W"], ["bD", "d"], ["bE", "espesor"], ["bR", "radio"]].forEach(([id, k]) => { const i = box.querySelector("#" + id); if (i) i.onchange = () => set(k, Math.max(0.1, r2(num(i.value, b[k])))); });
        const bm = box.querySelector("#bM"); if (bm) bm.onchange = e => { b.modelo = e.target.value; delete b.medidas; const nb = MLPlant.baseInfo(b); if (nb.agujerosDef) W.montaje.agujeros = nb.agujerosDef; st.fitted = false; changed(); };
        box.querySelectorAll("[data-bm]").forEach(i => i.onchange = () => { b.medidas = Object.assign({}, b.medidas || {}, { [i.dataset.bm]: Math.max(0, r2(num(i.value, 0))) }); st.fitted = false; changed(); });
        const ag = box.querySelector("#bAg"); if (ag) ag.onclick = () => { W.montaje.agujeros = MLPlant.baseInfo(b).agujerosDef || []; changed(); };
        const rs = box.querySelector("#bRs"); if (rs) rs.onclick = () => { delete b.medidas; st.fitted = false; changed(); };
        box.querySelectorAll("[data-hs]").forEach(x => x.onclick = ev => { ev.preventDefault(); st.selH = +x.dataset.hs; panel(); dibujar(); });
      }
      revisiones();
    }
    function alinear(S, modo) {
      const H = S.map(p => ({ p, h: MLPlant.huella(p) })).filter(o => o.h); if (H.length < 2) return;
      const x0 = Math.min(...H.map(o => o.h.x0)), x1 = Math.max(...H.map(o => o.h.x1)), y0 = Math.min(...H.map(o => o.h.y0)), y1 = Math.max(...H.map(o => o.h.y1));
      for (const { p, h } of H) {
        if (modo === "izq") p.x = r2(p.x + x0 - h.x0); if (modo === "der") p.x = r2(p.x + x1 - h.x1); if (modo === "cx") p.x = r2(p.x + (x0 + x1) / 2 - (h.x0 + h.x1) / 2);
        if (modo === "aba") p.y = r2(p.y + y0 - h.y0); if (modo === "arr") p.y = r2(p.y + y1 - h.y1); if (modo === "cy") p.y = r2(p.y + (y0 + y1) / 2 - (h.y0 + h.y1) / 2);
      }
      changed();
    }
    function distribuir(S, eje) {
      const H = S.map(p => ({ p, h: MLPlant.huella(p) })).filter(o => o.h); if (H.length < 3) return;
      const a = eje === "x" ? ["x0", "x1", "x"] : ["y0", "y1", "y"]; H.sort((m, n) => m.h[a[0]] - n.h[a[0]]);
      const total = H[H.length - 1].h[a[1]] - H[0].h[a[0]], ocup = H.reduce((t, o) => t + o.h[a[1]] - o.h[a[0]], 0), gap = (total - ocup) / (H.length - 1);
      let cur = H[0].h[a[1]] + gap;
      for (const o of H.slice(1, -1)) { const w = o.h[a[1]] - o.h[a[0]]; o.p[a[2]] = r2(o.p[a[2]] + cur - o.h[a[0]]); cur += w + gap; }
      changed();
    }
    function revisiones() {
      const R = MLPlant.revisar(W), box = host.querySelector("#moRev"); if (!box) return;
      box.innerHTML = R.length ? `<div class="panel" style="margin-top:12px"><b class="small">Revisión</b>${R.slice(0, 8).map(r => `<div class="small" style="margin-top:4px;cursor:pointer" data-rp="${esc(r.pieza)}">${r.nivel === "rojo" ? "🔴" : "🟡"} ${esc(r.msg)}</div>`).join("")}</div>` : "";
      box.querySelectorAll("[data-rp]").forEach(d => d.onclick = () => { const p = M().piezas.find(x => x.id === d.dataset.rp); if (p) { st.cara = MLPlant.esLateral(p.cara) ? "A" : (p.cara || "A"); st.sel = [p.id]; barra(); dibujar(); panel(); } });
    }
    async function guardarPlantilla(S) {
      const nombre = await new Promise(res => dialogo(`<h3>Guardar como plantilla</h3><p class="small muted">Queda en <b>Mis plantillas</b> para usarla en cualquier componente.</p><div><label>Nombre</label><input id="tN" value="${esc(S.length === 1 ? S[0].nombre.replace(/\s\d+$/, "") : "Grupo de " + S.length + " piezas")}"></div>`, b => res(b.querySelector("#tN").value.trim())));
      if (!nombre) return;
      const esp = M().base.espesor, cx = S.reduce((a, p) => a + p.x, 0) / S.length, cy = S.reduce((a, p) => a + p.y, 0) / S.length;
      const prim = [], pines = []; let zona = null;
      for (const p of S) {
        MLPlant.cuerposDe(Object.assign({}, p, { cara: "A", z: p.z || 0 }), 0).forEach(q => { const o = MLPlant.desplazar(q, -cx, -cy); delete o.pieza; prim.push(o); });
        const g = MLPlant.geom(p); g.pines.forEach(q => { const [x, y] = MLPlant.rotar(q.x, q.y, p.rot); pines.push({ n: `${pines.length + 1}`, x: r2(p.x + x - cx), y: r2(p.y + y - cy) }); });
        if (!zona && g.zona && S.length === 1) { const z = g.zona; const [x, y] = MLPlant.rotar(z.cx, z.cy, p.rot); zona = Object.assign({}, z, { cx: r2(x), cy: r2(y) }); }
      }
      const id = "tpl_" + nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) + "_" + Date.now().toString(36).slice(-3);
      try { await Store.save("plantillas", { id, nombre, prim, pines, zona, creado: new Date().toISOString().slice(0, 10), origen: W.id }, `Plantilla nueva: ${nombre}`); st.grupo = "Mis plantillas"; libreria(); opt.toast && opt.toast("Plantilla guardada en Mis plantillas"); }
      catch (e) { opt.toast && opt.toast("Error: " + e.message); }
      void esp;
    }

    // ---------------- vista 3D
    function iniciar3d() {
      const T = THREE, cont = host.querySelector("#mo3d"); if (!cont) return;
      cont.innerHTML = "";
      const ren = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
      ren.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); cont.appendChild(ren.domElement);
      const scene = new T.Scene(); scene.background = new T.Color(FONDO3D);
      const cam = new T.PerspectiveCamera(35, 1, 0.1, 5000);
      scene.add(new T.HemisphereLight(0xffffff, 0x8899aa, 0.75));
      const dl = new T.DirectionalLight(0xffffff, 0.75); dl.position.set(60, 120, 80); scene.add(dl);
      const dl2 = new T.DirectionalLight(0xffffff, 0.35); dl2.position.set(-80, -60, -40); scene.add(dl2);
      const ctl = new T.OrbitControls(cam, ren.domElement); ctl.enableDamping = true;
      const grupo = new T.Group(); scene.add(grupo);
      const rej = new T.GridHelper(200, 40, 0x1e3a5f, 0x14203a); rej.position.y = -0.01; scene.add(rej);
      let raf = 0; const loop = () => { raf = requestAnimationFrame(loop); ctl.update(); ren.render(scene, cam); }; loop();
      const resize = () => { const w = cont.clientWidth || 360, h = cont.clientHeight || 280; ren.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); };
      const vista = v => { const { R, zc } = encuadre(W); ctl.target.set(0, zc, 0);
        if (v === "arriba") cam.position.set(0, R * 1.3, 0.001); else if (v === "abajo") cam.position.set(0, -R * 1.3, 0.001); else { const sal = (W.zonas || []).map(z => z.salida), sx = sal.includes("-X") && !sal.includes("+X") ? -1 : 1, sz = sal.includes("+Y") && !sal.includes("-Y") ? -1 : 1; cam.position.set(sx * R * 0.75, zc + R * 0.8, sz * R * 0.95); } cam.lookAt(0, zc, 0); ctl.update(); };
      v3 = { T, ren, scene, cam, ctl, grupo, rej, resize, vista, stop: () => { cancelAnimationFrame(raf); ren.dispose(); } };
      resize(); vista("iso"); render3d();
    }
    function render3d() {
      if (!v3) return; const { T, grupo } = v3;
      grupo.children.slice().forEach(o => { grupo.remove(o); o.geometry && o.geometry.dispose(); o.material && o.material.dispose(); });
      const E = construir(T, W, { explotar: st.explotar, sel: st.sel, grupo });
      const bi = MLPlant.baseInfo(M().base);
      if (v3.rej) v3.rej.position.y = Math.min(0, ...bi.prim.map(c => c.z0)) - 0.02 - (st.explotar ? E : 0);
    }
    async function captura() {
      if (!v3) { opt.toast && opt.toast("La vista 3D aún no está lista"); return null; }
      const sel = st.sel; st.sel = []; render3d(); v3.vista("iso"); v3.ctl.update(); v3.scene.background = null; v3.rej.visible = false; v3.ren.setClearColor(0x000000, 0); v3.ren.render(v3.scene, v3.cam);
      const src = v3.ren.domElement.toDataURL("image/png"); v3.scene.background = new v3.T.Color(FONDO3D); v3.rej.visible = true; st.sel = sel; render3d(); return src;
    }

    if (!W.modelo || !W.modelo.base) inicio(); else { MLPlant.sincronizar(W); armar(); }
    return {
      destroy() { listeners.forEach(([el, ev, fn, o]) => { if (el) el.removeEventListener(ev, fn, o); else fn(); }); v3 && v3.stop(); },
      captura, redraw: () => dibujar(),
      api: {
        cara: c => { if (!W.modelo) return false; st.cara = c === "B" ? "B" : "A"; st.sel = []; barra(); dibujar(); panel(); return true; },
        explotar: v => { if (!W.modelo) return false; st.explotar = v == null ? !st.explotar : !!v; const b = host.querySelector("#moEx"); if (b) b.classList.toggle("on", st.explotar); render3d(); return true; },
        vista: v => { v3 && v3.vista(v || "iso"); return !!v3; },
        imagen: async () => { const src = await captura(); if (!src) return false; W.imagen = { src, origen: "render del modelo 3D" }; opt.onChange && opt.onChange(); return true; },
        colocar: (id, params, cara) => { if (!W.modelo) return false; const tp = MLPlant.plantilla(id); if (!tp) return false; const pid = nuevoId(); const n = (M().piezas || []).filter(p => p.plantilla === id).length + 1;
          M().piezas.push({ id: pid, plantilla: id, nombre: `${tp.n.split(" (")[0]} ${n}`, cara: cara === "B" ? "B" : st.cara, x: 0, y: 0, rot: 0, z: 0, params: Object.assign(MLPlant.paramsDef(tp), params || {}) }); st.sel = [pid]; changed(); return true; },
        armarColocacion: id => { if (!W.modelo || !MLPlant.plantilla(id)) return false; st.colocar = id; st.tool = "sel"; barra(); libreria(); return true; },
        todo: () => { if (!W.modelo) return false; st.sel = (M().piezas || []).filter(p => (p.cara || "A") === st.cara).map(p => p.id); dibujar(); panel(); return true; },
        ajustar: () => { st.fitted = false; dibujar(); return true; },
        tiene: () => !!(W.modelo && W.modelo.base),
      },
    };
  }
  window.MLModelo = { montar, construir, iso, encuadre, cargarThree, mallasPrims };
})();
