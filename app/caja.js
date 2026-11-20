/* MountLab · Caja mínima (envolvente) de un proyecto o subproyecto. Solo calcula MEDIDAS de la caja.
   - Toma las medidas de cada componente (montaje.pcb + alturas de la versión de conexión: soldado o jumper).
   - Empaqueta en planta (MaxRects con rotación) en 1, 2 o 3 niveles (repisas) y propone varias opciones de área mínima.
   - Permite acomodar a mano (mover, girar, cambiar de nivel) y agregar elementos de la caja: salidas de cable,
     conectores de panel, rejillas de ventilación, ventanas para pantallas, pulsadores, LED, ventilador…
   - Dibuja las tres vistas (SVG) y exporta DXF. */
(function () {
  const r1 = v => Math.round(v * 10) / 10, esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // medidas aproximadas de las partes virtuales del diagrama [largo, ancho, alto], pared = va montada en una pared
  const VDIM = {
    "@18650": { d: [77, 21, 20], n: "Portapilas 18650" }, "@lipo": { d: [50, 34, 7], n: "Batería LiPo 1S" }, "@2s": { d: [77, 41, 21], n: "Portapilas 2×18650" },
    "@switch": { d: [21, 15, 13], pared: true, n: "Interruptor de palanca" }, "@boton": { d: [12, 12, 9], pared: true, n: "Pulsador de panel" },
    "@led": { d: [6, 6, 9], pared: true, n: "LED de panel" }, "@diodo": { d: [10, 4, 4], n: "Diodo" }, "@mosfet": { d: [10, 5, 16], n: "MOSFET TO-220" },
    "@rele": { d: [50, 26, 19], n: "Módulo relé" }, "@ventilador": { d: [40, 40, 10], pared: true, n: "Ventilador 40 mm" },
    "@dc12": { d: [14, 9, 11], pared: true, n: "Jack DC de panel" }, "@usb": { abertura: [12, 8], n: "Entrada USB (cable)" }
  };
  const DIRS = ["+X", "+Y", "-X", "-Y"];   // giro 90° antihorario: +X → +Y → -X → -Y
  const girar = (d, rot) => DIRS[(DIRS.indexOf(d) + rot / 90) % 4];
  const CARAS = { "-Y": "Frente (−Y)", "+Y": "Atrás (+Y)", "-X": "Izquierda (−X)", "+X": "Derecha (+X)", tapa: "Tapa (arriba)", fondo: "Fondo (abajo)" };

  // ---------- elementos que se pueden insertar en la caja (agujero en la cara + espacio que ocupan por dentro)
  //  w × h = tamaño del agujero/ventana en la cara (mm); prof = cuánto entra hacia adentro (tuerca, conector, cable doblado)
  const ELEMENTOS = {
    cable_pot: { n: "Salida de cable de potencia (prensaestopa PG7)", ic: "🔌", w: 12.5, h: 12.5, prof: 18, cara: "-Y", forma: "circ" },
    cable_datos: { n: "Salida de cable de datos (pasacables)", ic: "〰", w: 8, h: 8, prof: 12, cara: "-Y", forma: "circ" },
    usb_c: { n: "Conector USB-C de panel", ic: "⌁", w: 10, h: 4, prof: 22, cara: "-Y", forma: "rect" },
    jack_dc: { n: "Jack DC de panel (5.5 × 2.1)", ic: "⚡", w: 8, h: 8, prof: 16, cara: "+Y", forma: "circ" },
    gx16: { n: "Conector de aviación GX16", ic: "◎", w: 16, h: 16, prof: 28, cara: "+Y", forma: "circ" },
    rj45: { n: "RJ45 de panel", ic: "🖧", w: 16, h: 14, prof: 25, cara: "+Y", forma: "rect" },
    sma: { n: "Antena SMA (pasamuro)", ic: "📡", w: 6.5, h: 6.5, prof: 10, cara: "+X", forma: "circ" },
    rejilla: { n: "Rejilla de ventilación", ic: "▤", w: 30, h: 12, prof: 0, cara: "+X", forma: "rejilla" },
    ventilador: { n: "Ventilador 40 mm", ic: "🌀", w: 38, h: 38, prof: 11, cara: "tapa", forma: "circ" },
    pantalla: { n: "Ventana para pantalla OLED 0.96\"", ic: "🖥", w: 26, h: 15, prof: 0, cara: "tapa", forma: "rect" },
    lcd1602: { n: "Ventana para LCD 16×2", ic: "▭", w: 72, h: 25, prof: 0, cara: "tapa", forma: "rect" },
    pulsador: { n: "Pulsador de panel 12 mm", ic: "●", w: 12, h: 12, prof: 20, cara: "tapa", forma: "circ" },
    led: { n: "LED de panel 5 mm", ic: "💡", w: 8, h: 8, prof: 12, cara: "tapa", forma: "circ" },
    balancin: { n: "Interruptor balancín KCD11", ic: "⏻", w: 19, h: 13, prof: 20, cara: "-Y", forma: "rect" },
    agujero: { n: "Agujero libre", ic: "○", w: 10, h: 10, prof: 0, cara: "-Y", forma: "circ" }
  };

  // ---------- dos versiones de conexión por componente: soldado (cables directo a la placa) y jumper (headers + Dupont)
  const CABLE = { soldado: "Cable soldado directo a la placa (AWG 24–28, silicona)", jumper: "Jumper Dupont 2.54 mm sobre headers" };
  function conexiones(c) {
    const m = (c && c.montaje) || {}; if (!m.pcb) return null;
    if (m.conexiones && m.conexiones.soldado && m.conexiones.jumper) return m.conexiones;
    const sup = +m.altura_superior || 0, inf = +m.altura_inferior || 0, hol = +m.holgura_inferior_cableado || 0;
    const pzs = ((c.modelo || {}).piezas) || [], hd = pzs.filter(p => /header/.test(p.plantilla || ""));
    const alto = p => +((p.params || {}).alto) || 8.5, hB = hd.filter(p => p.cara === "B"), hA = hd.filter(p => p.cara !== "B");
    let header = "ninguno", hAlt = 0, hembra = false;
    if (/Circuitos integrados|Interruptores/.test(c.categoria || "")) header = "no_aplica";
    else if (hB.length) { header = "abajo"; hAlt = Math.max(...hB.map(alto)); }
    else if (hA.length) { header = "arriba"; hAlt = Math.max(...hA.map(alto)); hembra = hA.some(p => /hembra/.test(p.plantilla)); }
    else if (inf >= 6 && hol >= 15) { header = "abajo"; hAlt = inf; }
    const base = { altura_superior: r1(sup), altura_inferior: r1(inf), holgura_inferior_cableado: 0, holgura_superior_cableado: 0 };
    let soldado, jumper;
    if (header === "no_aplica") {
      soldado = Object.assign({}, base, { holgura_inferior_cableado: hol, cable: "Soldado en la placa", nota: "Se suelda directo en la tarjeta: misma medida en las dos versiones." });
      jumper = Object.assign({}, soldado, { cable: "Zócalo o protoboard", nota: "Para pruebas en protoboard o zócalo." });
    } else if (header === "abajo") {
      soldado = Object.assign({}, base, { altura_inferior: r1(Math.min(inf, 2)), holgura_superior_cableado: 6, cable: CABLE.soldado, nota: "Sin header: los cables se sueldan en los pads por arriba; puntas recortadas ≈2 mm por debajo." });
      jumper = Object.assign({}, base, { altura_inferior: r1(Math.max(inf, hAlt)), holgura_inferior_cableado: 22, cable: CABLE.jumper, nota: `Header macho hacia abajo (${r1(hAlt)} mm) + carcasa Dupont y curva del cable ≈22 mm.` });
    } else if (header === "arriba") {
      const sinH = sup <= hAlt + 0.5 ? Math.min(sup, 3.5) : sup;
      soldado = Object.assign({}, base, { altura_superior: r1(sinH), holgura_superior_cableado: 6, cable: CABLE.soldado, nota: "Sin header: cables soldados en los pads por arriba (≈6 mm para la curva del cable)." });
      jumper = Object.assign({}, base, { altura_superior: r1(Math.max(sup, hAlt)), holgura_superior_cableado: hembra ? 12 : 16, cable: CABLE.jumper, nota: hembra ? `Header hembra arriba (${r1(hAlt)} mm): jumper macho insertado ≈12 mm.` : `Header macho arriba (${r1(hAlt)} mm): carcasa Dupont hembra + curva ≈16 mm.` });
    } else {
      soldado = Object.assign({}, base, { holgura_superior_cableado: 6, cable: CABLE.soldado, nota: "Pads o terminales: cables soldados directo." });
      jumper = Object.assign({}, base, { altura_inferior: r1(Math.max(inf, 8.5)), holgura_inferior_cableado: 22, cable: CABLE.jumper, nota: "No trae header: para usar jumpers hay que soldar un header 2.54 mm hacia abajo." });
    }
    return { header, header_alto: r1(hAlt), defecto: "soldado", soldado, jumper };
  }
  const versionDe = (c, ver) => { const cx = conexiones(c); return cx ? cx[ver === "jumper" ? "jumper" : "soldado"] : null; };

  /** Piezas de la caja a partir de las instancias del diagrama. defVer = versión de conexión por defecto. */
  function piezas(inst, comp, P, defVer) {
    const out = [], faltan = [], aberturas = [];
    for (const it of inst) {
      if (it.id === "@gnd" || it.id === "@lab" || it.id === "@motor") continue;
      if (it.id.startsWith("@")) {
        const v = VDIM[it.id]; if (!v) continue;
        if (v.abertura) { aberturas.push({ ref: it.ref, n: v.n, w: v.abertura[0], h: v.abertura[1] }); continue; }
        out.push({ ref: it.ref, sub: it._sub, n: v.n, L: v.d[0], W: v.d[1], Hc: v.d[2], abajo: 0, arriba: 0, esp: v.d[2], paredes: v.pared ? ["*"] : [], arribaZ: false });
        continue;
      }
      const c = comp(it.id); if (!c) continue;
      const m = c.montaje || {};
      if (!m.pcb) { faltan.push(`${it.ref} ${c.nombre}`); continue; }
      const ver = it.conexion || defVer || "soldado", V = versionDe(c, ver) || {};
      const [L, W, esp] = m.pcb;
      const zonas = c.zonas || [], paredes = [], notas = [];
      let arribaZ = false;
      for (const z of zonas) {
        const s = String(z.salida || "");
        const tz = (z.tipo || "") + " " + (z.nombre || "");
        if (/^[+-][XY]$/.test(s) && /usb|conector|jack|bornera|sma|rj45|rj11|db9|microsd|sd card/i.test(tz) && !/antena/i.test(tz)) paredes.push(s);
        if (s === "+Z" && /pantalla|display|oled|lcd|c[aá]mara|lente/i.test(tz)) { arribaZ = true; notas.push(`${z.nombre || z.tipo}: necesita ventana en la tapa`); }
        else if (/bot[oó]n|pulsador/i.test(tz)) notas.push(`${z.nombre || z.tipo}: opcional, agujero de acceso`);
        if (/antena/i.test(tz)) notas.push("antena: sin metal alrededor (caja plástica)");
      }
      out.push({ ref: it.ref, sub: it._sub, id: c.id, n: c.nombre, L, W, esp, ver,
        arriba: (+V.altura_superior || 0) + (+V.holgura_superior_cableado || 0), abajo: +V.altura_inferior || 0, holguraAbajo: +V.holgura_inferior_cableado || 0,
        agujeros: (m.agujeros || []).length, paredes: [...new Set(paredes)], arribaZ, notas });
    }
    return { piezas: out, faltan, aberturas };
  }

  // ---------- empaquetado MaxRects en un recipiente fijo (W × H); las piezas con pared deben tocar ese borde
  function empacar(items, W, H, conRot) {
    let libres = [{ x: 0, y: 0, w: W, h: H }]; const pos = [];
    for (const it of items) {
      let mejor = null;
      const rots = it.fijo ? [0] : conRot ? [0, 90, 180, 270] : [0, 180];
      for (const rot of rots) {
        const w = rot % 180 ? it.h : it.w, h = rot % 180 ? it.w : it.h;
        const dirs = it.paredes.filter(d => d !== "*").map(d => girar(d, rot)), cualquiera = it.paredes.includes("*");
        for (const f of libres) {
          if (w > f.w + 1e-6 || h > f.h + 1e-6) continue;
          const cands = [[f.x, f.y], [f.x + f.w - w, f.y], [f.x, f.y + f.h - h], [f.x + f.w - w, f.y + f.h - h]];
          for (const [x, y] of cands) {
            const toca = { "-X": x <= 1e-6, "+X": x + w >= W - 1e-6, "-Y": y <= 1e-6, "+Y": y + h >= H - 1e-6 };
            if (dirs.length && !toca[dirs[0]]) continue;
            if (cualquiera && !Object.values(toca).some(Boolean)) continue;
            const extra = dirs.slice(1).filter(d => !toca[d]).length;
            const score = extra * 1e6 + Math.min(f.w - w, f.h - h) * 1000 + Math.max(f.w - w, f.h - h) + (y * 1e-3);
            if (!mejor || score < mejor.score) mejor = { x, y, w, h, rot, score, faltaPared: extra };
          }
        }
      }
      if (!mejor) return null;
      pos.push(Object.assign({}, it, mejor));
      const nuevos = [];
      for (const f of libres) {
        if (mejor.x >= f.x + f.w || mejor.x + mejor.w <= f.x || mejor.y >= f.y + f.h || mejor.y + mejor.h <= f.y) { nuevos.push(f); continue; }
        if (mejor.x > f.x) nuevos.push({ x: f.x, y: f.y, w: mejor.x - f.x, h: f.h });
        if (mejor.x + mejor.w < f.x + f.w) nuevos.push({ x: mejor.x + mejor.w, y: f.y, w: f.x + f.w - mejor.x - mejor.w, h: f.h });
        if (mejor.y > f.y) nuevos.push({ x: f.x, y: f.y, w: f.w, h: mejor.y - f.y });
        if (mejor.y + mejor.h < f.y + f.h) nuevos.push({ x: f.x, y: mejor.y + mejor.h, w: f.w, h: f.y + f.h - mejor.y - mejor.h });
      }
      libres = nuevos.filter((a, i) => !nuevos.some((b, j) => j !== i && a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h && (j < i || a.w * a.h < b.w * b.h)));
    }
    return pos;
  }

  const PDEF = { gap: 3, pared: 2, espesor: 2, standoff: 5, arriba: 3, rotar: true, prop: 3, repisa: 2, nivelesMax: 3 };
  // alto de cada pieza: separadores (o pines/cables por debajo) + PCB + componentes + cables encima + holgura
  function preparar(lista, elems, p) {
    const items = lista.map(q => {
      const bajo = q.agujeros ? Math.max(p.standoff, q.holguraAbajo || 0, q.abajo || 0) : Math.max(q.holguraAbajo || 0, q.abajo || 0);
      const Ht = q.Hc != null ? q.Hc : bajo + q.esp + (q.arriba || 0) + (q.arribaZ ? 0 : p.arriba);
      return Object.assign({}, q, { w: q.L + p.gap, h: q.W + p.gap, bajo, Ht });
    });
    // elementos de pared que entran hacia adentro: reservan un rectángulo contra su pared
    (elems || []).forEach((e, i) => {
      if (!(+e.prof > 0) || !/^[+-][XY]$/.test(e.cara)) return;
      const ejeX = /Y$/.test(e.cara), L = ejeX ? +e.w : +e.prof, W = ejeX ? +e.prof : +e.w;
      items.push({ ref: "E" + (i + 1), n: e.nombre || (ELEMENTOS[e.tipo] || {}).n || "Elemento", elemento: i, L, W, esp: 0, w: L + p.gap, h: W + p.gap, bajo: 0, Ht: (+e.h || 10) + 4, Hc: null, paredes: [e.cara], nivelFijo: Math.max(0, +e.nivel || 0), fijo: true, notas: [] });
    });
    return items;
  }
  const area = it => it.w * it.h;
  function repartir(items, n) {
    const G = Array.from({ length: n }, () => []), A = new Array(n).fill(0);
    const orden = items.slice().sort((a, b) => (b.Hc != null) - (a.Hc != null) || area(b) - area(a));
    for (const it of orden) {
      let k = it.nivelFijo != null ? Math.min(n - 1, Math.max(0, +it.nivelFijo)) : A.indexOf(Math.min(...A));
      G[k].push(it); A[k] += area(it);
    }
    return G.filter(g => g.length);
  }
  const ordenar = g => g.slice().sort((a, b) => (b.paredes.length - a.paredes.length) || (area(b) - area(a)));

  // busca el recipiente W × H de menor área donde quepan todos los niveles
  function buscar(grupos, p, prop) {
    const todos = grupos.flat(), lado = it => Math.max(it.w, it.h);
    const aMax = Math.max(...grupos.map(g => g.reduce((s, x) => s + area(x), 0)));
    const wMin = Math.max(...todos.map(it => p.rotar ? Math.min(it.w, it.h) : it.w)), hMin = Math.max(...todos.map(it => p.rotar ? Math.min(it.w, it.h) : it.h));
    const wMax = Math.max(...grupos.map(g => g.reduce((s, it) => s + lado(it), 0))) + 1;
    const G = grupos.map(ordenar);
    let mejor = null;
    for (let W = wMin; W <= wMax; W += 2) {
      for (let H = Math.max(hMin, Math.ceil(aMax / W)); H <= wMax; H += 2) {
        if (W / H > prop || H / W > prop) { if (H > W * prop) break; continue; }
        if (mejor && W * H >= mejor.W * mejor.H) break;
        const pos = []; let ok = true;
        for (let k = 0; k < G.length && ok; k++) { const q = empacar(G[k], W, H, p.rotar); if (!q) ok = false; else q.forEach(x => pos.push(Object.assign(x, { nivel: k }))); }
        if (ok) { const pen = pos.reduce((s, x) => s + x.faltaPared, 0); if (!mejor || W * H < mejor.W * mejor.H || (W * H === mejor.W * mejor.H && pen < mejor.pen)) mejor = { W, H, pos, pen }; break; }
      }
    }
    if (!mejor) return null;
    mejor.pos.forEach(q => { q.mundo = q.paredes.filter(d => d !== "*").map(d => girar(d, q.rot)); });
    if (mejor.H > mejor.W && !todos.some(i => i.elemento != null)) {   // convención: X = lado más largo (se transpone si no hay elementos fijos en paredes)
      const T = { "+X": "+Y", "+Y": "+X", "-X": "-Y", "-Y": "-X" };
      mejor = { W: mejor.H, H: mejor.W, pen: mejor.pen, pos: mejor.pos.map(q => Object.assign({}, q, { x: q.y, y: q.x, w: q.h, h: q.w, rot: (q.rot + 90) % 360, mundo: q.mundo.map(d => T[d]), transp: true })) };
    }
    return mejor;
  }

  // arma el resultado final (medidas, niveles, elementos) a partir de piezas ya ubicadas (x,y = esquina de la pieza sin separación)
  function armar(pos, Lint, Wint, elems, p, extra) {
    const n = Math.max(1, ...pos.map(q => q.nivel + 1));
    const niveles = []; let z = 0;
    const fondo = Math.max(0, ...(elems || []).filter(e => e.cara === "fondo").map(e => +e.prof || 0)), tapa = Math.max(0, ...(elems || []).filter(e => e.cara === "tapa").map(e => +e.prof || 0));
    z = fondo;
    for (let k = 0; k < n; k++) { const h = r1(Math.max(5, ...pos.filter(q => q.nivel === k).map(q => q.Ht))); niveles.push({ z: r1(z), h }); z += h + (k < n - 1 ? p.repisa : 0); }
    const Hi = r1(z + p.pared + tapa);
    const piezasPos = pos.map(q => ({ ref: q.ref, sub: q.sub, n: q.n, id: q.id, ver: q.ver, elemento: q.elemento, nivel: q.nivel, x: r1(q.x), y: r1(q.y), L: r1(q.L2), W: r1(q.W2), rot: q.rot, bajo: q.bajo, esp: q.esp, arriba: q.arriba, Ht: q.Ht, Hc: q.Hc, z0: niveles[q.nivel].z,
      paredes: q.mundo || [], panel: (q.paredes || []).includes("*"), faltaPared: q.faltaPared || 0, arribaZ: q.arribaZ, notas: q.notas || [] }));
    // posición de los elementos: los que ocupan espacio interior toman la posición de su rectángulo reservado
    const elementos = (elems || []).map((e, i) => {
      const d = ELEMENTOS[e.tipo] || {}, pz = piezasPos.find(q => q.elemento === i);
      const largoCara = /Y$/.test(e.cara) ? Lint : /X$/.test(e.cara) ? Wint : Lint;
      let u = e.u != null ? +e.u : largoCara / 2;   // posición a lo largo de la cara (centro), mm desde la esquina −X / −Y
      if (pz) u = /Y$/.test(e.cara) ? pz.x + pz.L / 2 : pz.y + pz.W / 2;
      const nv = niveles[Math.min(n - 1, Math.max(0, +e.nivel || 0))];
      const v = e.v != null ? +e.v : (/^[+-][XY]$/.test(e.cara) ? nv.z + Math.min(nv.h, Math.max(+e.h, 8)) / 2 + 2 : Wint / 2);   // altura del centro (pared) o Y (tapa/fondo)
      return { i, ref: "E" + (i + 1), tipo: e.tipo, n: e.nombre || d.n || "Elemento", cara: e.cara, w: +e.w, h: +e.h, prof: +e.prof || 0, forma: e.forma || d.forma || "rect", u: r1(u), v: r1(v), nivel: +e.nivel || 0 };
    });
    const ext = { L: r1(Lint + 2 * p.espesor), W: r1(Wint + 2 * p.espesor), H: r1(Hi + 2 * p.espesor) };
    const aPl = piezasPos.filter(q => q.elemento == null).reduce((s, q) => s + q.L * q.W, 0);
    return Object.assign({ p, n, niveles, interior: { L: r1(Lint), W: r1(Wint), H: Hi }, exterior: ext, volumen: r1(Lint * Wint * Hi / 1000), ocupacion: Math.round(100 * aPl / (Lint * Wint * n)), piezas: piezasPos, elementos }, extra || {});
  }

  function desdeBusqueda(m, elems, p, extra) {
    const pos = m.pos.map(q => Object.assign({}, q, { x: q.x + p.pared, y: q.y + p.pared, L2: q.w - p.gap, W2: q.h - p.gap }));
    return armar(pos, m.W - p.gap + 2 * p.pared, m.H - p.gap + 2 * p.pared, elems, p, extra);
  }

  /** Una sola caja (compatibilidad): 1 nivel, área mínima. */
  function calcular(lista, p, elems) {
    p = Object.assign({}, PDEF, p || {}); if (!lista.length) return null;
    const items = preparar(lista, elems, p), m = buscar([items], p, p.prop);
    return m ? desdeBusqueda(m, elems, p) : null;
  }

  /** Varias opciones de caja de área mínima: 1, 2 y 3 niveles, y variantes más cuadradas. */
  function opciones(lista, p, elems) {
    p = Object.assign({}, PDEF, p || {}); if (!lista.length) return [];
    const items = preparar(lista, elems, p), out = [], vistos = new Set();
    const nPz = items.filter(i => i.elemento == null).length, nMax = Math.min(Math.max(1, +p.nivelesMax || 3), 3, Math.max(1, nPz));
    const variantes = [];
    for (let n = 1; n <= nMax; n++) { variantes.push({ n, prop: p.prop, et: n === 1 ? "Planta mínima" : `${n} niveles` }); variantes.push({ n, prop: Math.min(1.4, p.prop), et: n === 1 ? "Más cuadrada" : `${n} niveles · cuadrada` }); }
    for (const v of variantes) {
      const G = v.n === 1 ? [items] : repartir(items, v.n); if (G.length < v.n) continue;
      const m = buscar(G, p, v.prop); if (!m) continue;
      const R = desdeBusqueda(m, elems, p, { etiqueta: v.et });
      const k = `${R.interior.L}x${R.interior.W}x${R.interior.H}`; if (vistos.has(k)) continue; vistos.add(k);
      out.push(R);
    }
    out.sort((a, b) => a.interior.L * a.interior.W - b.interior.L * b.interior.W || a.volumen - b.volumen);
    const minA = Math.min(...out.map(r => r.interior.L * r.interior.W)), minV = Math.min(...out.map(r => r.volumen));
    out.forEach((r, i) => { r.id = "op" + i; r.letra = String.fromCharCode(65 + i); r.mejorArea = r.interior.L * r.interior.W === minA; r.mejorVol = r.volumen === minV; });
    return out;
  }

  /** Disposición manual: pos = { ref: {x, y, rot, nivel} } en mm (esquina de la pieza, interior). La caja = contorno de todo + holgura. */
  function manual(lista, p, elems, M) {
    p = Object.assign({}, PDEF, p || {}); if (!lista.length) return null;
    const items = preparar(lista, elems, p), pos = [], sin = [];
    for (const it of items) {
      const s = (M.pos || {})[it.ref];
      if (!s) { sin.push(it); continue; }
      const rot = ((+s.rot || 0) % 360 + 360) % 360, L2 = rot % 180 ? it.W : it.L, W2 = rot % 180 ? it.L : it.W;
      pos.push(Object.assign({}, it, { x: +s.x || 0, y: +s.y || 0, rot, L2, W2, nivel: Math.max(0, Math.min(2, +s.nivel || 0)), mundo: it.paredes.filter(d => d !== "*").map(d => girar(d, rot)) }));
    }
    // las piezas nuevas (sin posición guardada) se ponen a la derecha de todo
    let xMax = pos.length ? Math.max(...pos.map(q => q.x + q.L2)) + p.gap : p.pared;
    for (const it of sin) { pos.push(Object.assign({}, it, { x: xMax, y: p.pared, rot: 0, L2: it.L, W2: it.W, nivel: 0, mundo: it.paredes.filter(d => d !== "*") })); xMax += it.L + p.gap; }
    if (!pos.length) return null;
    // normaliza: el contorno empieza en (pared, pared)
    const x0 = Math.min(...pos.map(q => q.x)), y0 = Math.min(...pos.map(q => q.y));
    pos.forEach(q => { q.x = q.x - x0 + p.pared; q.y = q.y - y0 + p.pared; });
    const Lint = Math.max(...pos.map(q => q.x + q.L2)) + p.pared, Wint = Math.max(...pos.map(q => q.y + q.W2)) + p.pared;
    // avisos: choques entre piezas del mismo nivel y conectores que no tocan su pared
    const choques = [];
    for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) {
      const a = pos[i], b = pos[j]; if (a.nivel !== b.nivel) continue;
      const g = p.gap / 2 - 0.01;
      if (a.x - g < b.x + b.L2 + g && b.x - g < a.x + a.L2 + g && a.y - g < b.y + b.W2 + g && b.y - g < a.y + a.W2 + g) choques.push([a.ref, b.ref]);
    }
    pos.forEach(q => { const toca = { "-X": q.x <= p.pared + 0.6, "+X": q.x + q.L2 >= Lint - p.pared - 0.6, "-Y": q.y <= p.pared + 0.6, "+Y": q.y + q.W2 >= Wint - p.pared - 0.6 }; q.faltaPared = q.mundo.filter(d => !toca[d]).length; });
    const R = armar(pos, Lint, Wint, elems, p, { etiqueta: "A mano", manual: true, choques });
    return R;
  }
  /** Convierte una opción calculada en una disposición manual editable. */
  function aManual(R) { const pos = {}; R.piezas.forEach(q => { pos[q.ref] = { x: q.x, y: q.y, rot: q.rot, nivel: q.nivel }; }); return { pos }; }

  // ---------- tres vistas (planta por nivel, frente y lateral) en SVG
  const PALETA = ["#38bdf8", "#a78bfa", "#34d399", "#fbbf24", "#f472b6", "#fb923c", "#2dd4bf", "#f87171"];
  function figura(e, x, y, a, b, col, extra) {
    if (e.forma === "circ") return `<ellipse cx="${x + a / 2}" cy="${y + b / 2}" rx="${a / 2}" ry="${b / 2}" fill="none" stroke="${col}" stroke-width=".6"${extra || ""}/>`;
    if (e.forma === "rejilla") { let s = `<rect x="${x}" y="${y}" width="${a}" height="${b}" fill="none" stroke="${col}" stroke-width=".5" rx=".8"${extra || ""}/>`; const horiz = a >= b, n = Math.max(2, Math.floor((horiz ? b : a) / 3)); for (let i = 1; i < n; i++) s += horiz ? `<line x1="${x + 1.5}" y1="${y + i * b / n}" x2="${x + a - 1.5}" y2="${y + i * b / n}" stroke="${col}" stroke-width=".45"/>` : `<line x1="${x + i * a / n}" y1="${y + 1.5}" x2="${x + i * a / n}" y2="${y + b - 1.5}" stroke="${col}" stroke-width=".45"/>`; return s; }
    return `<rect x="${x}" y="${y}" width="${a}" height="${b}" fill="none" stroke="${col}" stroke-width=".6" rx=".6"${extra || ""}/>`;
  }
  function vistas(R, opt) {
    opt = opt || {}; const { L, W, H } = R.interior, e = R.p.espesor, claro = !!opt.claro;
    const tinta = claro ? "#0f172a" : "#e2e8f0", sutil = claro ? "#64748b" : "#94a3b8", fondo = claro ? "#ffffff" : "none", COLE = "#f59e0b";
    const subs = [...new Set(R.piezas.filter(q => q.elemento == null).map(q => q.sub || ""))], colSub = q => q.elemento != null ? COLE : PALETA[subs.indexOf(q.sub || "") % PALETA.length];
    const M = 26, gapV = 34, n = R.n || 1;
    // plantas de cada nivel lado a lado arriba; frente y lateral debajo
    const anchoPl = L + 2 * e + gapV, X0 = M, Y0 = M + 28, Y1 = Y0 + W + 2 * e + gapV + 10, X1 = X0 + L + 2 * e + gapV;
    const ancho = Math.max(X0 + n * anchoPl, X1 + W + 2 * e + M) + 10, alto = Y1 + H + 2 * e + 34;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ancho} ${alto}" width="100%" font-family="Segoe UI, Arial, sans-serif">${fondo !== "none" ? `<rect width="100%" height="100%" fill="${fondo}"/>` : ""}
      <defs><pattern id="cjH" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="3" stroke="${sutil}" stroke-width=".6"/></pattern></defs>`;
    const caja = (x, y, a, b) => `<rect x="${x}" y="${y}" width="${a + 2 * e}" height="${b + 2 * e}" fill="url(#cjH)" stroke="${tinta}" stroke-width=".6"/><rect x="${x + e}" y="${y + e}" width="${a}" height="${b}" fill="${claro ? "#fff" : "#0b1220"}" stroke="${tinta}" stroke-width=".6"/>`;
    const cota = (x1, y1, x2, y2, txt, vert) => vert
      ? `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${sutil}" stroke-width=".35"/><text x="${x1 - 3}" y="${(y1 + y2) / 2}" font-size="4.2" fill="${tinta}" text-anchor="middle" transform="rotate(-90 ${x1 - 3} ${(y1 + y2) / 2})">${txt}</text><line x1="${x1 - 1.5}" y1="${y1}" x2="${x1 + 1.5}" y2="${y1}" stroke="${sutil}" stroke-width=".35"/><line x1="${x1 - 1.5}" y1="${y2}" x2="${x1 + 1.5}" y2="${y2}" stroke="${sutil}" stroke-width=".35"/>`
      : `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${sutil}" stroke-width=".35"/><text x="${(x1 + x2) / 2}" y="${y1 - 1.6}" font-size="4.2" fill="${tinta}" text-anchor="middle">${txt}</text><line x1="${x1}" y1="${y1 - 1.5}" x2="${x1}" y2="${y1 + 1.5}" stroke="${sutil}" stroke-width=".35"/><line x1="${x2}" y1="${y2 - 1.5}" x2="${x2}" y2="${y2 + 1.5}" stroke="${sutil}" stroke-width=".35"/>`;
    const pared = (d, x, y) => { const s2 = { "-Y": [x, y + e + W, L, e], "+Y": [x, y, L, e], "-X": [x, y, e, W], "+X": [x + e + L, y, e, W] }[d]; return s2; };
    for (let k = 0; k < n; k++) {
      const xo = X0 + k * anchoPl;
      s += `<text x="${xo}" y="${Y0 - (n > 1 ? 20 : 12)}" font-size="5.5" font-weight="700" fill="${tinta}">${n > 1 ? `PLANTA · NIVEL ${k + 1}` : "PLANTA (vista superior)"}</text>` + caja(xo, Y0, L, W);
      if (n > 1) s += `<text x="${xo}" y="${Y0 - 13}" font-size="3.8" fill="${sutil}">${k === 0 ? "fondo de la caja" : `repisa a ${r1(R.niveles[k].z - R.p.repisa)} mm`} · alto libre ${R.niveles[k].h} mm</text>`;
      for (const q of R.piezas.filter(q2 => q2.nivel === k)) {
        const x = xo + e + q.x, y = Y0 + e + (W - q.y - q.W), col = colSub(q), el = q.elemento != null;
        s += `<rect x="${x}" y="${y}" width="${q.L}" height="${q.W}" fill="${col}" fill-opacity="${el ? .12 : .22}" stroke="${col}" stroke-width=".6" rx=".6" ${el ? 'stroke-dasharray="1.5 1"' : ""}><title>${esc(q.ref)} · ${esc(q.n)} · ${q.L}×${q.W} mm · alto ${r1(q.Ht)} mm${q.ver ? " · " + q.ver : ""}</title></rect>`;
        s += `<text x="${x + q.L / 2}" y="${y + q.W / 2 + 1.6}" font-size="${Math.max(2.4, Math.min(4.5, q.L / 3.2, q.W / 1.6))}" text-anchor="middle" font-weight="700" fill="${tinta}">${esc(q.ref)}</text>`;
        for (const d of q.paredes) { const cx = d === "-X" ? x : d === "+X" ? x + q.L : x + q.L / 2, cy = d === "+Y" ? y : d === "-Y" ? y + q.W : y + q.W / 2; s += `<circle cx="${cx}" cy="${cy}" r="1.6" fill="#f87171"><title>Necesita abertura en la pared (${d})</title></circle>`; }
        if (q.arribaZ) s += `<rect x="${x + 1}" y="${y + 1}" width="${q.L - 2}" height="${q.W - 2}" fill="none" stroke="#fbbf24" stroke-dasharray="1.5 1" stroke-width=".45"><title>Necesita ventana en la tapa</title></rect>`;
      }
      // elementos: tapa/fondo dibujados en la planta; los de pared como marca sobre la pared
      for (const el of R.elementos || []) {
        if ((el.cara === "tapa" && k === n - 1) || (el.cara === "fondo" && k === 0)) s += figura(el, xo + e + el.u - el.w / 2, Y0 + e + (W - el.v - el.h / 2), el.w, el.h, COLE, el.cara === "fondo" ? ' stroke-dasharray="1 1"' : "") + `<text x="${xo + e + el.u}" y="${Y0 + e + (W - el.v) + 1.3}" font-size="3" text-anchor="middle" fill="${COLE}">${esc(el.ref)}</text>`;
        else if (/^[+-][XY]$/.test(el.cara) && el.nivel === k) { const pw = pared(el.cara, xo, Y0), a = /Y$/.test(el.cara) ? el.w : e, b = /Y$/.test(el.cara) ? e : el.w, x = /Y$/.test(el.cara) ? xo + e + el.u - el.w / 2 : pw[0], y = /Y$/.test(el.cara) ? pw[1] : Y0 + e + (W - el.u - el.w / 2); s += `<rect x="${x}" y="${y}" width="${a}" height="${b}" fill="${COLE}"><title>${esc(el.ref)} · ${esc(el.n)} · ${CARAS[el.cara]}</title></rect>`; }
      }
      s += cota(xo + e, Y0 - 3, xo + e + L, Y0 - 3, k === 0 ? `${L} mm (int.) · ${R.exterior.L} ext.` : `${L} mm`);
      if (k === 0) s += cota(xo - 4, Y0 + e, xo - 4, Y0 + e + W, `${W} mm`, true);
    }
    // FRENTE (X–Z), visto desde −Y
    s += `<text x="${X0}" y="${Y1 - 6}" font-size="5.5" font-weight="700" fill="${tinta}">FRENTE (X–Z) · cara −Y</text>` + caja(X0, Y1, L, H);
    const base = Y1 + e + H;
    const repisas = (xo, ancho2) => R.niveles.slice(1).map(nv => `<rect x="${xo}" y="${base - nv.z}" width="${ancho2}" height="${R.p.repisa}" fill="${sutil}" fill-opacity=".35" stroke="${sutil}" stroke-width=".3"/>`).join("");
    s += repisas(X0 + e, L);
    const alzado = (q, x, a) => { const col = colSub(q), z0 = base - (q.z0 || 0); let t = "";
      if (q.elemento != null) return `<rect x="${x}" y="${z0 - q.Ht}" width="${a}" height="${q.Ht}" fill="${col}" fill-opacity=".1" stroke="${col}" stroke-width=".35" stroke-dasharray="1.5 1"/>`;
      if (q.Hc != null) return `<rect x="${x}" y="${z0 - q.Hc}" width="${a}" height="${q.Hc}" fill="${col}" fill-opacity=".25" stroke="${col}" stroke-width=".5"/>`;
      if (q.bajo) t += `<line x1="${x + 2}" y1="${z0}" x2="${x + 2}" y2="${z0 - q.bajo}" stroke="${sutil}" stroke-width=".8"/><line x1="${x + a - 2}" y1="${z0}" x2="${x + a - 2}" y2="${z0 - q.bajo}" stroke="${sutil}" stroke-width=".8"/>`;
      t += `<rect x="${x}" y="${z0 - q.bajo - q.esp}" width="${a}" height="${q.esp}" fill="${col}" fill-opacity=".55" stroke="${col}" stroke-width=".4"/>`;
      if (q.arriba) t += `<rect x="${x + 1}" y="${z0 - q.bajo - q.esp - q.arriba}" width="${a - 2}" height="${q.arriba}" fill="${col}" fill-opacity=".18" stroke="${col}" stroke-width=".35"/>`;
      return t; };
    for (const q of R.piezas) s += alzado(q, X0 + e + q.x, q.L);
    for (const el of R.elementos || []) if (el.cara === "-Y") s += figura(el, X0 + e + el.u - el.w / 2, base - el.v - el.h / 2, el.w, el.h, COLE) + `<text x="${X0 + e + el.u}" y="${base - el.v - el.h / 2 - 1}" font-size="3" text-anchor="middle" fill="${COLE}">${esc(el.ref)}</text>`;
    s += cota(X0 + 2 * e + L + 8, Y1 + e, X0 + 2 * e + L + 8, Y1 + e + H, `${H} mm`, true);
    // LATERAL (Y–Z), visto desde +X
    s += `<text x="${X1}" y="${Y1 - 12}" font-size="5.5" font-weight="700" fill="${tinta}">LATERAL (Y–Z) · cara +X</text>` + caja(X1, Y1, W, H) + repisas(X1 + e, W);
    for (const q of R.piezas) s += alzado(q, X1 + e + q.y, q.W);
    for (const el of R.elementos || []) if (el.cara === "+X") s += figura(el, X1 + e + el.u - el.w / 2, base - el.v - el.h / 2, el.w, el.h, COLE) + `<text x="${X1 + e + el.u}" y="${base - el.v - el.h / 2 - 1}" font-size="3" text-anchor="middle" fill="${COLE}">${esc(el.ref)}</text>`;
    s += cota(X1 + e, Y1 - 3, X1 + e + W, Y1 - 3, `${W} mm`);
    // cajetín
    const yc = base + e + 12;
    s += `<text x="${X0}" y="${yc}" font-size="5" font-weight="700" fill="${tinta}">${esc(opt.titulo || "Caja")}${R.etiqueta ? " · " + esc(R.etiqueta) : ""}</text>
      <text x="${X0}" y="${yc + 7}" font-size="4.2" fill="${tinta}">Interior ${L} × ${W} × ${H} mm · exterior ${R.exterior.L} × ${R.exterior.W} × ${R.exterior.H} mm (pared ${e} mm)${n > 1 ? ` · ${n} niveles, repisa ${R.p.repisa} mm` : ""}</text>
      <text x="${X0}" y="${yc + 13}" font-size="3.6" fill="${sutil}">Volumen interior ${R.volumen} cm³ · ocupación ${R.ocupacion} % · ● rojo = abertura del conector · naranja = elementos de la caja (E#)</text>`;
    return s + `</svg>`;
  }

  // ---------- editor interactivo de la planta (un nivel); el código de arrastre está en app.js
  function planoEditable(R, nivel, sel) {
    const { L, W } = R.interior, e = R.p.espesor, M = 8;
    const subs = [...new Set(R.piezas.filter(q => q.elemento == null).map(q => q.sub || ""))];
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-M - e} ${-M - e} ${L + 2 * e + 2 * M} ${W + 2 * e + 2 * M}" width="100%" style="touch-action:none;max-height:60vh" data-L="${L}" data-W="${W}">
      <rect x="${-e}" y="${-e}" width="${L + 2 * e}" height="${W + 2 * e}" fill="#334155" rx="1"/><rect x="0" y="0" width="${L}" height="${W}" fill="#0b1220"/>`;
    for (let g = 10; g < L; g += 10) s += `<line x1="${g}" y1="0" x2="${g}" y2="${W}" stroke="#1e293b" stroke-width=".25"/>`;
    for (let g = 10; g < W; g += 10) s += `<line x1="0" y1="${W - g}" x2="${L}" y2="${W - g}" stroke="#1e293b" stroke-width=".25"/>`;
    const choque = new Set((R.choques || []).flat());
    // otros niveles, de fondo
    for (const q of R.piezas.filter(q2 => q2.nivel !== nivel)) s += `<rect x="${q.x}" y="${W - q.y - q.W}" width="${q.L}" height="${q.W}" fill="none" stroke="#475569" stroke-width=".4" stroke-dasharray="1.5 1.2"/><text x="${q.x + 1}" y="${W - q.y - q.W + 3.2}" font-size="2.6" fill="#64748b">N${q.nivel + 1}·${esc(q.ref)}</text>`;
    for (const q of R.piezas.filter(q2 => q2.nivel === nivel)) {
      const el = q.elemento != null, col = el ? "#f59e0b" : PALETA[subs.indexOf(q.sub || "") % PALETA.length], mal = choque.has(q.ref), y = W - q.y - q.W;
      s += `<g data-pz="${esc(q.ref)}" style="cursor:grab"><rect x="${q.x}" y="${y}" width="${q.L}" height="${q.W}" fill="${mal ? "#7f1d1d" : col}" fill-opacity="${mal ? .55 : .25}" stroke="${sel === q.ref ? "#fff" : mal ? "#f87171" : col}" stroke-width="${sel === q.ref ? 1 : .6}" rx=".8" ${el ? 'stroke-dasharray="1.5 1"' : ""}/>
        <text x="${q.x + q.L / 2}" y="${y + q.W / 2 + 1.5}" font-size="${Math.max(2.4, Math.min(4.6, q.L / 3.2, q.W / 1.6))}" text-anchor="middle" font-weight="700" fill="#e2e8f0" pointer-events="none">${esc(q.ref)}</text>`;
      for (const d of q.paredes) { const cx = d === "-X" ? q.x : d === "+X" ? q.x + q.L : q.x + q.L / 2, cy = d === "+Y" ? y : d === "-Y" ? y + q.W : y + q.W / 2; s += `<circle cx="${cx}" cy="${cy}" r="1.5" fill="${q.faltaPared ? "#fbbf24" : "#f87171"}" pointer-events="none"/>`; }
      s += `</g>`;
    }
    for (const el of R.elementos || []) {
      if ((el.cara === "tapa" && nivel === R.n - 1) || (el.cara === "fondo" && nivel === 0)) s += figura(el, el.u - el.w / 2, W - el.v - el.h / 2, el.w, el.h, "#f59e0b", ' stroke-dasharray="1.2 .8" pointer-events="none"');
      else if (/^[+-][XY]$/.test(el.cara) && el.nivel === nivel) { const hz = /Y$/.test(el.cara); s += `<rect x="${hz ? el.u - el.w / 2 : el.cara === "-X" ? -e : L}" y="${hz ? (el.cara === "+Y" ? -e : W) : W - el.u - el.w / 2}" width="${hz ? el.w : e}" height="${hz ? e : el.w}" fill="#f59e0b" pointer-events="none"/>`; }
    }
    s += `<text x="0" y="${-e - 2}" font-size="3.2" fill="#94a3b8">+Y (atrás)</text><text x="0" y="${W + e + 4.5}" font-size="3.2" fill="#94a3b8">−Y (frente) · ${L} × ${W} mm interior</text>`;
    return s + `</svg>`;
  }

  // ---------- DXF (R12) con las vistas en mm
  function dxf(R, titulo) {
    const out = ["0", "SECTION", "2", "ENTITIES"], L = R.interior.L, W = R.interior.W, H = R.interior.H, e = R.p.espesor, n = R.n || 1;
    const lin = (x1, y1, x2, y2, capa) => out.push("0", "LINE", "8", capa, "10", r1(x1), "20", r1(y1), "11", r1(x2), "21", r1(y2));
    const rect = (x, y, a, b, capa) => { lin(x, y, x + a, y, capa); lin(x + a, y, x + a, y + b, capa); lin(x + a, y + b, x, y + b, capa); lin(x, y + b, x, y, capa); };
    const circ = (x, y, r, capa) => out.push("0", "CIRCLE", "8", capa, "10", r1(x), "20", r1(y), "40", r1(r));
    const fig = (el, cx, cy, capa) => el.forma === "circ" && Math.abs(el.w - el.h) < 0.01 ? circ(cx, cy, el.w / 2, capa) : rect(cx - el.w / 2, cy - el.h / 2, el.w, el.h, capa);
    const txt = (x, y, t, h, capa) => out.push("0", "TEXT", "8", capa || "TEXTO", "10", r1(x), "20", r1(y), "40", h || 3, "1", String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7E]/g, ""));
    const dx = L + 2 * e + 30;
    for (let k = 0; k < n; k++) {
      const ox = k * dx;
      rect(ox - e, -e, L + 2 * e, W + 2 * e, "CAJA_EXT"); rect(ox, 0, L, W, "CAJA_INT"); txt(ox, W + e + 4, n > 1 ? `PLANTA NIVEL ${k + 1}` : "PLANTA", 4);
      for (const q of R.piezas.filter(q2 => q2.nivel === k)) { rect(ox + q.x, q.y, q.L, q.W, q.elemento != null ? "ELEMENTOS" : "PIEZAS"); txt(ox + q.x + 1, q.y + 1, q.ref, 2.5, "TEXTO"); }
      for (const el of R.elementos || []) if ((el.cara === "tapa" && k === n - 1) || (el.cara === "fondo" && k === 0)) { fig(el, ox + el.u, el.v, el.cara === "tapa" ? "AGUJEROS_TAPA" : "AGUJEROS_FONDO"); txt(ox + el.u - el.w / 2, el.v + el.h / 2 + 1, el.ref, 2, "TEXTO"); }
    }
    const oy = -(H + 3 * e + 20); rect(-e, oy - e, L + 2 * e, H + 2 * e, "CAJA_EXT"); rect(0, oy, L, H, "CAJA_INT"); txt(0, oy + H + e + 4, "FRENTE (cara -Y)", 4);
    R.niveles.slice(1).forEach(nv => rect(0, oy + nv.z - R.p.repisa, L, R.p.repisa, "REPISAS"));
    const alto = q => q.Hc != null ? q.Hc : q.elemento != null ? q.Ht : q.esp + (q.arriba || 0);
    for (const q of R.piezas) rect(q.x, oy + (q.z0 || 0) + (q.elemento != null ? 0 : q.bajo), q.L, alto(q), q.elemento != null ? "ELEMENTOS" : "PIEZAS");
    for (const el of R.elementos || []) if (el.cara === "-Y") { fig(el, el.u, oy + el.v, "AGUJEROS_PARED"); txt(el.u - el.w / 2, oy + el.v + el.h / 2 + 1, el.ref, 2, "TEXTO"); }
    const ox = L + 3 * e + 20; rect(ox - e, oy - e, W + 2 * e, H + 2 * e, "CAJA_EXT"); rect(ox, oy, W, H, "CAJA_INT"); txt(ox, oy + H + e + 4, "LATERAL (cara +X)", 4);
    R.niveles.slice(1).forEach(nv => rect(ox, oy + nv.z - R.p.repisa, W, R.p.repisa, "REPISAS"));
    for (const q of R.piezas) rect(ox + q.y, oy + (q.z0 || 0) + (q.elemento != null ? 0 : q.bajo), q.W, alto(q), q.elemento != null ? "ELEMENTOS" : "PIEZAS");
    for (const el of R.elementos || []) if (el.cara === "+X") { fig(el, ox + el.u, oy + el.v, "AGUJEROS_PARED"); txt(ox + el.u - el.w / 2, oy + el.v + el.h / 2 + 1, el.ref, 2, "TEXTO"); }
    // caras con agujeros que no salen en las vistas (+Y y −X): se dibujan desplegadas
    let oy2 = oy - H - 2 * e - 30;
    for (const [cara, largo] of [["+Y", L], ["-X", W]]) {
      const E = (R.elementos || []).filter(el => el.cara === cara); if (!E.length) continue;
      rect(0, oy2, largo, H, "CARAS"); txt(0, oy2 + H + 3, `CARA ${cara} (vista desde afuera)`, 3.5);
      for (const el of E) { const u = cara === "+Y" ? largo - el.u : el.u; fig(el, u, oy2 + el.v, "AGUJEROS_PARED"); txt(u - el.w / 2, oy2 + el.v + el.h / 2 + 1, el.ref, 2, "TEXTO"); }
      oy2 -= H + 25;
    }
    txt(ox, W - 6, `${titulo || "Caja"}: interior ${L} x ${W} x ${H} mm; exterior ${R.exterior.L} x ${R.exterior.W} x ${R.exterior.H} mm${n > 1 ? `; ${n} niveles` : ""}`, 3);
    out.push("0", "ENDSEC", "0", "EOF"); return out.join("\n");
  }

  window.MLCaja = { piezas, calcular, opciones, manual, aManual, vistas, planoEditable, dxf, conexiones, versionDe, VDIM, ELEMENTOS, CARAS, PDEF, CABLE };
})();
