/* MountLab · Cerebro local (sin internet, sin clave, gratis).
   Inspirado en el tutor del Simulador ECG: no inventa, recupera de la biblioteca.
   A · Índice: alias de cada componente (nombre, id, referencia, alias aprendidos) + contexto (categoría, etiquetas, ficha)
   B · Motor de búsqueda: TF-IDF + tolerancia a errores (wsim / Levenshtein)
   C · Red neuronal (MLP, trigramas de letras) como segunda oportunidad
   D · Plantillas con variables {nombre} {voltaje}… para responder por campo
   E · Sistema experto: reglas explícitas para revisar un proyecto */
(function () {
  // ---------------- texto
  const STOP = new Set("que qué cual cuál cuales es son el la los las lo de del a al en y o u un una unos unas por para con sin se me mi mis tu tus su sus como cómo donde dónde cuando hay tengo tiene tienen tenemos este esta estos estas ese esa eso dime dame quiero saber necesito sobre muestrame muéstrame mostrar explica explicame explícame significa ver favor porfa porfavor hola gracias puedes podrias podrías algo cuanto cuánto cuantos cuántos le les ya mas más muy".split(" ").map(w => w.normalize("NFD").replace(/[̀-ͯ]/g, "")));
  const GEN = new Set("modulo módulo sensor placa tarjeta componente componentes funciona sirve tipo tipos ejemplo general dato datos info informacion información".split(" ").map(w => w.normalize("NFD").replace(/[̀-ͯ]/g, "")));
  const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const clean = s => norm(s).replace(/[^a-z0-9\s]/g, " ");
  const tok = s => clean(s).split(/\s+/).filter(w => w && !STOP.has(w));
  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 9;
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  function wsim(a, b) {
    if (a === b) return 1;
    const m = Math.min(a.length, b.length);
    if (m >= 4 && (a.startsWith(b) || b.startsWith(a))) return 0.85;
    if (m >= 5 && a.slice(0, 5) === b.slice(0, 5) && Math.abs(a.length - b.length) <= 2) return 0.8;
    if (m >= 5 && lev(a, b) <= (Math.max(a.length, b.length) >= 8 ? 2 : 1)) return 0.75;
    if (/\d/.test(a) && /\d/.test(b) && a.replace(/o/g, "0") === b.replace(/o/g, "0")) return 0.9; // bme28o → bme280
    return 0;
  }

  // ---------------- A · índice
  let IX = null;
  function aliasDe(c) {
    const a = [c.nombre, c.id.replace(/_/g, " "), c.referencia, [c.fabricante, c.referencia].filter(Boolean).join(" ")];
    const sinPar = String(c.nombre || "").replace(/\(.*?\)/g, " "); a.push(sinPar);
    (String(c.nombre).match(/\(([^)]+)\)/g) || []).forEach(x => a.push(x.slice(1, -1)));
    (c.alias || []).forEach(x => a.push(x));
    return [...new Set(a.filter(Boolean).map(s => tok(s).join(" ")).filter(Boolean))];
  }
  function contextoDe(c) {
    const F = c.ficha || {};
    return tok([c.categoria, (c.etiquetas || []).join(" "), F.interfaz, F.voltaje, F.descripcion, F.funcionamiento, c.tipo].join(" "));
  }
  function construir(comps) {
    const docs = comps.map(c => ({ c, alias: aliasDe(c).map(s => s.split(" ")), ctx: contextoDe(c) }));
    const df = new Map(), vocab = new Set();
    for (const d of docs) { const ws = new Set([...d.alias.flat(), ...d.ctx]); ws.forEach(w => { vocab.add(w); df.set(w, (df.get(w) || 0) + 1); }); }
    IX = { docs, df, vocab: [...vocab], N: docs.length, firma: comps.map(c => c.id + ":" + (c.alias || []).join(",") + ":" + c.nombre).join("|") };
    entrenar();
    return IX;
  }
  function asegurar(comps) { const f = comps.map(c => c.id + ":" + (c.alias || []).join(",") + ":" + c.nombre).join("|"); if (!IX || IX.firma !== f) construir(comps); }

  // ---------------- B · motor de búsqueda
  function pesar(qw) {
    return qw.map(w => {
      let best = null, s = 0;
      for (const v of IX.vocab) { const x = wsim(w, v); if (x > s) { s = x; best = v; } if (s === 1) break; }
      if (s < 0.75) return { w, v: null, s: 0, p: 0.3 };
      const idf = Math.log(1 + IX.N / (IX.df.get(best) || 1));
      return { w, v: best, s, p: idf * (GEN.has(w) ? 0.25 : 1) };
    });
  }
  function buscar(q, n) {
    if (!IX) return [];
    const qw = tok(q); if (!qw.length) return [];
    const P = pesar(qw), tot = P.reduce((a, b) => a + b.p, 0) || 1, frase = clean(q);
    const out = [];
    for (const d of IX.docs) {
      let mejor = 0, mqv = 0;
      for (const al of d.alias) {
        let ac = 0, cub = 0;
        for (const aw of al) {
          let m = 0, idx = -1; P.forEach((p, i) => { const x = p.v ? wsim(p.v, aw) * p.s : wsim(p.w, aw); if (x > m) { m = x; idx = i; } });
          ac += m; if (idx >= 0 && m >= 0.75) cub += P[idx].p * m;
        }
        ac /= al.length; const qv = Math.min(1, cub / tot);
        const bonus = (frase.includes(al.join(" ")) ? 0.1 * qv : 0) + Math.min(3, al.length) * 0.01;
        const sc = ac * (0.4 + 0.6 * qv) + bonus;
        if (sc > mejor) { mejor = sc; mqv = qv; }
      }
      let cub = 0; for (const p of P) if (p.v && d.ctx.some(w => wsim(p.v, w) >= 0.8)) cub += p.p;
      const ctx = Math.min(1, cub / tot);
      out.push({ c: d.c, s: Math.max(mejor, 0.62 * ctx), alias: mejor, qv: mqv, ctx });
    }
    return out.sort((a, b) => b.s - a.s).slice(0, n || 10);
  }

  // ---------------- C · red neuronal (MLP de una capa oculta, como en el simulador)
  function softmax(z) { const m = Math.max(...z); let s = 0; const e = z.map(v => { v = Math.exp(v - m); s += v; return v; }); return e.map(v => v / s); }
  class MLP {
    constructor(i, h, o) { this.i = i; this.h = h; this.o = o; const r = (n, s) => Float32Array.from({ length: n }, () => (Math.random() * 2 - 1) * s); this.W1 = r(i * h, Math.sqrt(1 / i)); this.b1 = new Float32Array(h); this.W2 = r(h * o, Math.sqrt(1 / h)); this.b2 = new Float32Array(o); this.a = new Float32Array(h); }
    fwd(x) { const { i, h, o, W1, W2, b1, b2, a } = this; a.set(b1); for (const [k, xk] of x) for (let j = 0; j < h; j++) a[j] += W1[k * h + j] * xk; for (let j = 0; j < h; j++) a[j] = Math.tanh(a[j]); const z = new Array(o); for (let c = 0; c < o; c++) { let s = b2[c]; for (let j = 0; j < h; j++) s += W2[j * o + c] * a[j]; z[c] = s; } return softmax(z); }
    step(x, y, lr) { const p = this.fwd(x), { h, o, W1, W2, b1, b2, a } = this, d1 = new Float32Array(h); for (let j = 0; j < h; j++) { let s = 0; for (let c = 0; c < o; c++) s += W2[j * o + c] * (p[c] - (c === y ? 1 : 0)); d1[j] = s * (1 - a[j] * a[j]); } for (let j = 0; j < h; j++) for (let c = 0; c < o; c++) W2[j * o + c] -= lr * (p[c] - (c === y ? 1 : 0)) * a[j]; for (let c = 0; c < o; c++) b2[c] -= lr * (p[c] - (c === y ? 1 : 0)); for (const [k, xk] of x) for (let j = 0; j < h; j++) W1[k * h + j] -= lr * d1[j] * xk; for (let j = 0; j < h; j++) b1[j] -= lr * d1[j]; }
  }
  const trig = w => { const s = "#" + w + "#", o = []; for (let i = 0; i <= s.length - 3; i++) o.push(s.slice(i, i + 3)); return o; };
  const rasgos = t => { const f = []; for (const w of tok(t)) { f.push("w:" + w); if (w.length >= 4) f.push(...trig(w)); } return f; };
  function vec(t, mapa) { const m = new Map(); for (const f of rasgos(t)) { const k = mapa.get(f); if (k != null) m.set(k, (m.get(k) || 0) + 1); } let n = 0; m.forEach(v => n += v * v); n = Math.sqrt(n) || 1; return [...m].map(([k, v]) => [k, v / n]); }
  const RED = { net: null, mapa: null, estado: "sin entrenar", listo: false, acierto: null };
  function errata(s) { if (s.length < 5) return s; const i = 1 + Math.floor(Math.random() * (s.length - 2)); return Math.random() < 0.5 ? s.slice(0, i) + s.slice(i + 1) : s.slice(0, i - 1) + s[i] + s[i - 1] + s.slice(i + 1); }
  function entrenar(onDone) {
    const docs = IX.docs, ej = [];
    docs.forEach((d, y) => {
      for (const al of d.alias) { const t = al.join(" "); ej.push([t, y], [t, y], [errata(t), y], [errata(t), y]); }
      const F = d.c.ficha || {};
      String([F.descripcion, F.funcionamiento].join(". ")).split(/[.;:]/).map(s => s.trim()).filter(s => s.length > 12).slice(0, 6).forEach(s => ej.push([s, y]));
      if ((d.c.etiquetas || []).length) ej.push([d.c.etiquetas.join(" ") + " " + d.c.categoria, y]);
    });
    const mapa = new Map(); ej.forEach(([t]) => rasgos(t).forEach(f => { if (!mapa.has(f)) mapa.set(f, mapa.size); }));
    const data = ej.map(([t, y]) => [vec(t, mapa), y]).filter(([x]) => x.length);
    const net = new MLP(mapa.size, 32, docs.length);
    RED.listo = false; RED.estado = "entrenando…";
    let ep = 0; const EP = 30;
    (function loop() {
      data.sort(() => Math.random() - 0.5);
      for (const [x, y] of data) net.step(x, y, 0.2);
      if (++ep < EP) return setTimeout(loop, 0);
      let ok = 0; docs.forEach((d, y) => { const p = net.fwd(vec(d.c.nombre, mapa)); if (p.indexOf(Math.max(...p)) === y) ok++; });
      Object.assign(RED, { net, mapa, listo: true, acierto: ok, estado: `${docs.length} componentes · ${mapa.size} rasgos · reconoce ${ok} de ${docs.length} nombres` });
      onDone && onDone(); document.dispatchEvent(new CustomEvent("ml-red"));
    })();
  }
  function red(q, n) {
    if (!RED.listo) return [];
    const x = vec(q, RED.mapa); if (!x.length) return [];
    const p = RED.net.fwd(x);
    return p.map((v, i) => ({ c: IX.docs[i].c, p: v })).sort((a, b) => b.p - a.p).slice(0, n || 3);
  }

  // ---------------- D · intención y plantillas
  const CAMPOS = [
    ["voltaje", /\b(voltaje|tension|alimenta\w*|volt\w*|3\.?3|5 ?v)\b/, "⚡ **{nombre}** — voltaje: {voltaje}"],
    ["corriente", /\b(corriente|consumo|consume|amper\w*|ma|potencia)\b/, "🔋 **{nombre}** — consumo: {corriente}"],
    ["pines", /\b(pin|pines|pinout|conexion\w*|conecto|conectar|cablear|cableado)\b/, "📌 **{nombre}** — pines:\n{pines}"],
    ["medidas", /\b(medida\w*|dimension\w*|tamano|agujero\w*|montaje|soporte\w*|tornillo\w*|huella)\b/, "📐 **{nombre}** — {medidas}"],
    ["datasheet", /\b(datasheet|hoja|manual|pdf|ficha tecnica)\b/, "📄 **{nombre}** — datasheet: {datasheet}"],
    ["precio", /\b(precio\w*|cuesta|vale|valor|costo|comprar|compro|tienda\w*|proveedor\w*)\b/, "💲 **{nombre}** — {precios}"],
    ["interfaz", /\b(interfaz|protocolo|comunica\w*|i2c|spi|uart|direccion)\b/, "🔌 **{nombre}** — interfaz: {interfaz}"],
    ["proyectos", /\b(proyecto\w*|donde lo uso|usado|uso en)\b/, "📁 **{nombre}** — {proyectos}"],
  ];
  function vars(c, db) {
    const F = c.ficha || {}, M = c.montaje;
    const cop = n => "$" + Math.round(n).toLocaleString("es-CO");
    const ps = (c.precios || []).filter(p => +p.precio_cop > 0).sort((a, b) => a.precio_cop - b.precio_cop);
    const proy = (db.proyectos || []).filter(p => (p.bom || []).some(b => b.id === c.id));
    return {
      nombre: c.nombre, id: c.id, voltaje: F.voltaje || "no está en la ficha", corriente: F.corriente || "no está en la ficha", interfaz: F.interfaz || "no está en la ficha",
      datasheet: F.datasheet || "sin enlace (pídeselo al asistente en la nube para que lo busque)",
      pines: (c.pines || []).length ? c.pines.slice(0, 40).map(p => `• ${p.n}${p.func ? " — " + p.func : ""}`).join("\n") : "no hay pines registrados",
      medidas: M && M.pcb ? `placa ${M.pcb[0]} × ${M.pcb[1]} × ${M.pcb[2] ?? 1.6} mm, ${(M.agujeros || []).length} agujero(s)${(M.agujeros || []).length ? " (" + M.agujeros.map(h => `Ø${h.d} en ${h.x}, ${h.y}`).join("; ") + ")" : ""}, fijación ${M.fijacion || "—"}. Origen al centro. ${c.estado === "verificado" ? "✓ verificado" : "⚠ sin verificar con calibrador"}` : (F.dimensiones ? "dimensiones: " + F.dimensiones + " (sin montaje definido)" : "no tiene medidas registradas"),
      precios: ps.length ? ps.map(p => `${p.proveedor} ${cop(p.precio_cop)}${p.estimado ? " (estimado)" : ""}`).join(" · ") : "sin precios registrados",
      proyectos: proy.length ? "está en: " + proy.map(p => `${p.nombre} (×${p.bom.find(b => b.id === c.id).cantidad})`).join(", ") : "no está en ningún proyecto",
    };
  }
  const plantilla = (t, v) => t.replace(/\{(\w+)\}/g, (m, k) => v[k] ?? m);
  function resumen(c, db) {
    const v = vars(c, db), F = c.ficha || {};
    return `**${c.nombre}** · ${c.categoria}${c.estado === "verificado" ? " · ✓ verificado" : ""}\n${F.descripcion ? F.descripcion + "\n" : ""}⚡ ${v.voltaje}\n🔋 ${v.corriente}\n🔌 ${v.interfaz}\n💲 ${v.precios}\n📁 ${v.proyectos}`;
  }

  // ---------------- respuesta principal
  /** Devuelve { texto, via, confianza, ids:[sugeridos], accion? } — texto con [[id]] y **negrita** */
  function responder(q, db) {
    asegurar(db.componentes);
    const qn = norm(q).trim();
    let m;
    if ((m = qn.match(/^aprende\s*:\s*(.+?)\s*=\s*(.+)$/))) {
      const alias = m[1].trim(), dest = buscar(m[2], 1)[0];
      if (!dest || dest.s < 0.5) return { texto: `No encontré el componente “${m[2]}”. Escribe su nombre o id tal como aparece en el catálogo.`, via: "comando", confianza: 0 };
      return { texto: `Voy a enseñarle que **“${alias}”** es [[${dest.c.id}]]. Confirma para guardarlo como alias.`, via: "comando", confianza: 1, accion: { tipo: "alias", id: dest.c.id, alias } };
    }
    if ((m = qn.match(/^olvida\s*:\s*(.+)$/))) {
      const a = m[1].trim(), c = db.componentes.find(x => (x.alias || []).some(y => norm(y) === a));
      if (!c) return { texto: `No hay ningún alias “${a}”.`, via: "comando", confianza: 0 };
      return { texto: `Quitaré el alias **“${a}”** de [[${c.id}]]. Confirma.`, via: "comando", confianza: 1, accion: { tipo: "olvida", id: c.id, alias: a } };
    }
    if ((m = qn.match(/^revisa\w*\s+(?:el\s+)?(?:proyecto\s+)?(.+)$/))) {
      const p = db.proyectos.map(p => ({ p, s: Math.max(...[p.nombre, p.id].map(t => { const a = tok(t), b = tok(m[1]); return b.length ? b.filter(w => a.some(x => wsim(w, x) >= 0.75)).length / b.length : 0; })) })).sort((a, b) => b.s - a.s)[0];
      if (p && p.s >= 0.5) { const al = revisar(p.p, db); return { texto: `🧪 Revisión de **${p.p.nombre}**:\n` + (al.length ? al.map(a => `${a.nivel === "rojo" ? "🔴" : a.nivel === "amarillo" ? "🟡" : "🔵"} ${a.msg}`).join("\n") : "Sin observaciones."), via: "sistema experto", confianza: 1 }; }
    }
    // intención: el campo cuya palabra aparece primero; esa palabra se quita antes de buscar el componente
    let campo = null, pos = 1e9, qb = qn;
    for (const C of CAMPOS) { const mm = qn.match(C[1]); if (mm && mm.index < pos) { pos = mm.index; campo = C; } }
    if (campo) qb = (qn.slice(0, pos) + " " + qn.slice(pos).replace(campo[1], " ")).trim() || qn;
    const R = buscar(qb, 12);
    const top = R[0];
    // Listas: "qué sensores i2c tengo", "componentes de energía"
    const Lc = R.filter(r => r.ctx >= 0.6 && r.s >= 0.5);
    const lista = /\b(cuales|lista|todos|todas|tengo|hay|tenemos)\b/.test(qn) && Lc.length >= 2 && !(top && top.alias >= 0.9 && top.qv >= 0.9);
    if (lista) {
      const L = Lc;
      return { texto: `Encontré ${L.length} en tu biblioteca:\n` + L.map(r => `• [[${r.c.id}]]${campo ? " — " + plantilla(`{${campo[0] === "medidas" ? "medidas" : campo[0]}}`, vars(r.c, db)).slice(0, 90) : r.c.ficha && r.c.ficha.voltaje ? " — " + r.c.ficha.voltaje.slice(0, 60) : ""}`).join("\n"), via: "búsqueda", confianza: Math.min(1, L[0].s), ids: [] };
    }
    let elegido = null, via = "búsqueda", conf = 0;
    if (top && top.s >= 0.7 && (top.qv >= 0.55 || top.alias >= 0.85)) { elegido = top.c; conf = top.s; }
    else if (top && top.s >= 0.55 && (!R[1] || top.s - R[1].s >= 0.08)) { elegido = top.c; conf = top.s; via = "búsqueda (aproximada)"; }
    else {
      const N = red(qb, 3);
      if (N.length && N[0].p >= 0.5 && ((top && N[0].c.id === top.c.id) || !top || top.s < 0.4 || (N[0].p >= 0.95 && top.s < 0.55))) { elegido = N[0].c; via = "red neuronal"; conf = N[0].p; }
    }
    if (elegido) {
      const v = vars(elegido, db);
      const txt = campo ? plantilla(campo[2], v) : resumen(elegido, db);
      const cerca = R.filter(r => r.c.id !== elegido.id && r.s >= 0.6 && top && top.s - r.s < 0.1).slice(0, 3).map(r => r.c.id);
      return { texto: txt.replace(elegido.nombre, `[[${elegido.id}]]`), via, confianza: Math.min(1, conf), ids: cerca, id: elegido.id };
    }
    const sug = R.filter(r => r.s >= 0.35).slice(0, 3).map(r => r.c.id);
    return { texto: sug.length ? "No estoy seguro de qué componente me pides. ¿Era alguno de estos?" : "No encontré eso en tu biblioteca.", via: "nada", confianza: top ? top.s : 0, ids: sug, sinRespuesta: true };
  }

  // ---------------- E · sistema experto: revisión de un proyecto
  const UMBRAL = { corriente3v3_mA: 500, servoPorUnidad_mA: 700, logica_maxV: 3.6 };
  function rangoV(txt) {
    const t = String(txt || "").replace(/,/g, ".");
    const s = t.replace(/chip[^;]*/gi, "").replace(/\([^)]*\)/g, "");       // "Módulo 3.3–5 V; chip 2.4–3.6 V" → usa el módulo
    let m = s.match(/(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s*V/i); if (m) return [+m[1], +m[2]];
    m = s.match(/(\d+(?:\.\d+)?)\s*V/i); if (m) return [+m[1], +m[1]];
    return null;
  }
  function maxCorriente_mA(txt) {
    let mx = 0; const re = /(\d+(?:[.,]\d+)?)\s*(mA|A)\b/g; let m;
    while ((m = re.exec(String(txt || "")))) { const v = parseFloat(m[1].replace(",", ".")) * (m[2] === "A" ? 1000 : 1); if (v > mx) mx = v; }
    return mx;
  }
  function i2cDirs(c) {
    const F = c.ficha || {}; const t = [F.interfaz, (c.especificaciones || []).map(e => e.param + " " + e.valor).join(" "), c.i2c && JSON.stringify(c.i2c)].join(" ");
    return [...new Set((t.match(/0x[0-9a-f]{2}/gi) || []).map(x => x.toLowerCase()))];
  }
  const pasivo = c => c.tipo !== "electronico" || /cable|header|protoboard|conector|switch|interruptor|jack|portapilas|fuente/i.test(c.id + " " + c.categoria);
  function revisar(p, db) {
    const A = [], add = (nivel, msg, por) => A.push({ nivel, msg, por });
    const items = (p.bom || []).map(b => ({ b, c: db.componentes.find(c => c.id === b.id) }));
    items.filter(x => !x.c).forEach(x => add("rojo", `“${x.b.id}” no existe en la biblioteca.`, "El BOM apunta a un id que se borró o cambió."));
    const L = items.filter(x => x.c);
    const has = re => L.filter(x => re.test(x.c.id + " " + x.c.nombre + " " + x.c.categoria));
    const mcu = has(/esp32|arduino|microcontrol/i);
    // I2C: agrupa dispositivos que comparten direcciones y propone una asignación
    const devs = L.filter(x => i2cDirs(x.c).length).map(x => ({ c: x.c, d: i2cDirs(x.c) }));
    const grupos = [];
    for (const dv of devs) { const g = grupos.filter(G => G.some(o => o.d.some(a => dv.d.includes(a)))); const nuevo = [dv, ...g.flat()]; g.forEach(G => grupos.splice(grupos.indexOf(G), 1)); grupos.push(nuevo); }
    for (const G of grupos.filter(G => G.length > 1)) {
      const usadas = new Set(), asig = [];
      for (const dv of G.slice().sort((a, b) => a.d.length - b.d.length)) { const d = dv.d.find(x => !usadas.has(x)); if (d) { usadas.add(d); asig.push(`[[${dv.c.id}]] → ${d}`); } else asig.push(`[[${dv.c.id}]] → ✗ sin dirección libre`); }
      const falta = asig.some(t => t.includes("✗"));
      add(falta ? "rojo" : "amarillo", `I2C: ${G.length} dispositivos comparten direcciones (${[...new Set(G.flatMap(x => x.d))].join("/")}). ${falta ? "No alcanzan las direcciones: usa un segundo bus I2C o un multiplexor TCA9548A. " : "Asignación posible: "}${asig.join(", ")}.`, "Dos dispositivos con la misma dirección en un mismo bus I2C no se pueden leer; se cambia con el pin ADDR/SDO/A0 del módulo.");
    }
    if (L.some(x => i2cDirs(x.c).length && (x.b.cantidad || 1) > 1)) add("azul", "Hay sensores I2C con cantidad > 1: si vas a usar varias unidades iguales a la vez, cada una necesita su propia dirección.", "La revisión cuenta una unidad de cada componente (el resto puede ser repuesto).");
    // Lógica 3.3 V
    const act = has(/servo|sg90|mg996|motor/i);
    if (mcu.length) L.filter(x => !pasivo(x.c) && !/energ|bater|fuente|regul|adaptador|actuador/i.test(x.c.categoria + x.c.id) && !mcu.includes(x) && !act.includes(x)).forEach(x => {
      const r = rangoV((x.c.ficha || {}).voltaje); if (r && r[0] > UMBRAL.logica_maxV) add("amarillo", `[[${x.c.id}]] se alimenta con ${r[0]}–${r[1]} V: su señal puede salir a 5 V y el ESP32 solo tolera 3.3 V. Usa divisor o adaptador de nivel en sus salidas.`, `Mínimo de alimentación > ${UMBRAL.logica_maxV} V.`);
      if (/no tolerante a 5/i.test((x.c.ficha || {}).voltaje)) add("azul", `[[${x.c.id}]] no tolera 5 V: aliméntalo de 3.3 V.`, "Indicado en su ficha.");
    });
    // Consumo (una unidad de cada componente; el GSM se revisa aparte)
    const consumo = L.filter(x => !pasivo(x.c) && !/energ|bater|fuente|regul|bms|tp4056|lm2596|ams1117|sim808|gsm|adaptador|microsd_16/i.test(x.c.categoria + x.c.id) && !act.includes(x)).reduce((s, x) => s + maxCorriente_mA((x.c.ficha || {}).corriente), 0);
    if (consumo > UMBRAL.corriente3v3_mA) add("amarillo", `Los picos de consumo de la electrónica (una unidad de cada uno) suman ≈${Math.round(consumo)} mA. El regulador de 3.3 V de una placa ESP32 da ~500–600 mA: usa un regulador aparte (ej. [[ams1117_33]] o [[lm2596]]).`, `Umbral ${UMBRAL.corriente3v3_mA} mA.`);
    else if (consumo) add("azul", `Consumo pico estimado de la electrónica (una unidad de cada uno): ≈${Math.round(consumo)} mA.`, "Suma de los valores máximos de las fichas.");
    const nServ = act.reduce((s, x) => s + (x.b.cantidad || 1), 0);
    if (nServ) { const tot = nServ * UMBRAL.servoPorUnidad_mA, fuente = has(/lm2596|fuente|bms|bater/i).length;
      add(fuente ? "amarillo" : "rojo", `${nServ} servo(s): hasta ≈${(tot / 1000).toFixed(1)} A en arranque. ${fuente ? "Aliméntalos desde la fuente/regulador de potencia, no desde el ESP32, y une las tierras." : "No hay fuente de potencia en el BOM: agrega una (ej. [[lm2596]] o una fuente de 5–6 V)."}`, `${UMBRAL.servoPorUnidad_mA} mA por servo en arranque.`); }
    if (has(/sim808|gsm/i).length) add(has(/lm2596|fuente/i).length ? "amarillo" : "rojo", "El [[sim808]] pide picos de 2 A al transmitir: necesita fuente dedicada y un condensador grande (≥1000 µF) cerca.", "Ficha del SIM808.");
    // Baterías
    const bat = has(/18650|21700|lipo|bateria|batería/i).filter(x => !/portapilas/i.test(x.c.id));
    if (bat.length && !has(/bms|tp4056|protec/i).length) add("rojo", "Hay baterías de litio sin protección (BMS o TP4056 con protección) en el BOM.", "Una celda de litio sin protección puede sobredescargarse, sobrecargarse o hacer cortocircuito.");
    if (has(/2x18650|2s/i).length && !has(/bms_2s/i).length) add("amarillo", "Pack 2S sin BMS 2S: el [[tp4056]] solo carga 1 celda.", "Un 2S necesita balanceo y carga a 8.4 V.");
    // ADC
    if (mcu.length && L.some(x => !mcu.includes(x) && /anal[oó]g|adc/i.test((x.c.ficha || {}).interfaz))) add("azul", "Sensores analógicos con ESP32: usa ADC1 (GPIO32–39); ADC2 no funciona con el Wi-Fi activo.", "Limitación del ESP32.");
    // Datos
    const sinVer = L.filter(x => x.c.montaje && x.c.estado !== "verificado").length; if (sinVer) add("azul", `${sinVer} componente(s) con montaje sin verificar con calibrador.`, "Las medidas vienen de modelos o datasheets.");
    const sinPrecio = L.filter(x => !(x.c.precios || []).some(p => +p.precio_cop > 0)).length; if (sinPrecio) add("azul", `${sinPrecio} componente(s) sin precio.`, "El costo del proyecto queda incompleto.");
    const orden = { rojo: 0, amarillo: 1, azul: 2 };
    return A.sort((a, b) => orden[a.nivel] - orden[b.nivel]);
  }

  window.MLLocal = { construir, asegurar, buscar, red, responder, revisar, estado: () => RED.estado, UMBRAL, tok, wsim };
})();
