/* MountLab · Importar un modelo STEP y convertirlo al modelo propio de la app.
   El STEP (de SolidWorks, KiCad, del fabricante…) solo se usa como materia prima: se lee en el navegador
   (occt-import-js, OpenCascade en WebAssembly), se reconoce la placa, su contorno, espesor y agujeros,
   y cada pieza se convierte en primitivas (caja, cilindro o perfil extruido en su mejor eje).
   Al aprobar queda solo el modelo generado; el archivo original se descarta.
   Todo en mm. Marco final: origen en el centro de la placa, X a lo largo, cara inferior de la placa en z = 0. */
(function () {
  const r2 = v => (Math.round(v * 100) / 100) || 0, r3 = v => (Math.round(v * 1000) / 1000) || 0;
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };
  const hex = c => c ? "#" + c.slice(0, 3).map(v => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, "0")).join("") : null;

  // ------------------------------------------------------------------ lectura (Web Worker con OpenCascade)
  let worker = null;
  /** Lee un STEP (ArrayBuffer) y devuelve el resultado de occt-import-js: { root, meshes }. */
  function leer(buffer, avance) {
    return new Promise((ok, no) => {
      if (!worker) worker = new Worker("app/vendor/occt/worker.js");
      const t = setTimeout(() => no(new Error("El STEP tardó demasiado en leerse (más de 4 min)")), 240000);
      worker.onmessage = ev => { const d = ev.data || {}; if (d.avance) { avance && avance(d.avance); return; } clearTimeout(t); if (d.error) no(new Error(d.error)); else if (!d.success) no(new Error("OpenCascade no pudo leer el archivo (¿es un STEP válido?)")); else ok(d); };
      worker.onerror = e => { clearTimeout(t); worker = null; no(new Error(e.message || "No se pudo cargar el lector de STEP")); };
      worker.postMessage({ buffer, params: { linearUnit: "millimeter", linearDeflectionType: "bounding_box_ratio", linearDeflection: 0.0008, angularDeflection: 0.35 } }, [buffer]);
    });
  }

  // ------------------------------------------------------------------ geometría 2D
  function hull(P) {   // casco convexo (cadena monótona), CCW
    const p = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p;
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
    for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 1e-12) lo.pop(); lo.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 1e-12) up.pop(); up.push(q); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  const area = P => { let A = 0; P.forEach((p, i) => { const q = P[(i + 1) % P.length]; A += p[0] * q[1] - q[0] * p[1]; }); return A / 2; };
  /** Rectángulo de área mínima que contiene el casco: { ang, cx, cy, L, W } (L ≥ W). */
  function rectMin(H) {
    let best = null;
    for (let i = 0; i < H.length; i++) {
      const a = H[i], b = H[(i + 1) % H.length], ang = Math.atan2(b[1] - a[1], b[0] - a[0]), c = Math.cos(ang), s = Math.sin(ang);
      let x0 = 1e18, x1 = -1e18, y0 = 1e18, y1 = -1e18;
      for (const p of H) { const u = p[0] * c + p[1] * s, v = -p[0] * s + p[1] * c; x0 = Math.min(x0, u); x1 = Math.max(x1, u); y0 = Math.min(y0, v); y1 = Math.max(y1, v); }
      const A = (x1 - x0) * (y1 - y0); if (!best || A < best.A - 1e-9) best = { A, ang, x0, x1, y0, y1 };
    }
    let { ang, x0, x1, y0, y1 } = best, L = x1 - x0, W = y1 - y0, um = (x0 + x1) / 2, vm = (y0 + y1) / 2;
    if (W > L) { ang += Math.PI / 2; [L, W] = [W, L]; }
    // ángulo en (−90°, 90°] y casi alineado → exacto
    while (ang > Math.PI / 2 + 1e-9) ang -= Math.PI; while (ang <= -Math.PI / 2 + 1e-9) ang += Math.PI;
    const c0 = Math.cos(best.ang), s0 = Math.sin(best.ang);
    return { ang, cx: um * c0 - vm * s0, cy: um * s0 + vm * c0, L, W };
  }
  /** Simplificación Douglas–Peucker de un polígono cerrado. */
  function simplificar(P, tol) {
    if (P.length < 5) return P.slice();
    // partir por los dos puntos más lejanos
    let i0 = 0, i1 = 0, dmax = -1; for (let i = 0; i < P.length; i++) { const d = Math.hypot(P[i][0] - P[0][0], P[i][1] - P[0][1]); if (d > dmax) { dmax = d; i1 = i; } }
    const dp = (pts) => { if (pts.length < 3) return pts; const a = pts[0], b = pts[pts.length - 1], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1e-12;
      let im = -1, dm = -1; for (let i = 1; i < pts.length - 1; i++) { const d = Math.abs((pts[i][0] - a[0]) * dy - (pts[i][1] - a[1]) * dx) / l; if (d > dm) { dm = d; im = i; } }
      if (dm <= tol) return [a, b]; const L1 = dp(pts.slice(0, im + 1)), L2 = dp(pts.slice(im)); return L1.slice(0, -1).concat(L2); };
    const A = dp(P.slice(i0, i1 + 1)), B = dp(P.slice(i1).concat([P[0]]));
    return A.slice(0, -1).concat(B.slice(0, -1));
  }
  /** Ajuste de círculo (Kåsa). Devuelve { cx, cy, r, dev } con la desviación máxima relativa. */
  function circulo(P) {
    const n = P.length; if (n < 6) return null;
    let sx = 0, sy = 0; P.forEach(p => { sx += p[0]; sy += p[1]; }); const mx = sx / n, my = sy / n;
    let suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
    for (const p of P) { const u = p[0] - mx, v = p[1] - my; suu += u * u; svv += v * v; suv += u * v; suuu += u * u * u; svvv += v * v * v; suvv += u * v * v; svuu += v * u * u; }
    const det = suu * svv - suv * suv; if (Math.abs(det) < 1e-12) return null;
    const b1 = (suuu + suvv) / 2, b2 = (svvv + svuu) / 2, uc = (b1 * svv - b2 * suv) / det, vc = (suu * b2 - suv * b1) / det;
    const cx = uc + mx, cy = vc + my, r = Math.sqrt(uc * uc + vc * vc + (suu + svv) / n);
    let dev = 0; for (const p of P) dev = Math.max(dev, Math.abs(Math.hypot(p[0] - cx, p[1] - cy) - r));
    // que la vuelta esté completa (ángulos repartidos)
    const angs = P.map(p => Math.atan2(p[1] - cy, p[0] - cx)).sort((a, b) => a - b); let hueco = 0; for (let i = 0; i < angs.length; i++) hueco = Math.max(hueco, ((angs[(i + 1) % angs.length] - angs[i]) + 2 * Math.PI) % (2 * Math.PI) || 0);
    return { cx, cy, r, dev: dev / Math.max(r, 1e-9), completo: hueco < 1.2 };
  }

  // ------------------------------------------------------------------ partes del STEP
  /** Agrupa las mallas en piezas según el árbol del ensamble. */
  function partes(res) {
    const M = res.meshes;
    const juntar = n => (n.meshes || []).concat(...(n.children || []).map(juntar));
    let nodo = res.root; while (nodo && !(nodo.meshes || []).length && (nodo.children || []).length === 1) nodo = nodo.children[0];
    const raiz = nodo || res.root, out = [];
    if ((raiz.children || []).length) { if ((raiz.meshes || []).length) out.push({ nombre: raiz.name || "Cuerpo", mallas: raiz.meshes }); raiz.children.forEach(ch => { const ms = juntar(ch); if (ms.length) out.push({ nombre: ch.name || "Pieza", mallas: ms }); }); }
    else M.forEach((m, i) => out.push({ nombre: m.name || raiz.name || `Cuerpo ${i + 1}`, mallas: [i] }));
    return { titulo: (res.root.children && res.root.children.length === 1 ? res.root.children[0].name : res.root.name) || raiz.name || "", partes: out };
  }
  const colorMalla = m => { if (m.color) return m.color; const f = (m.brep_faces || []).filter(x => x.color); if (!f.length) return null; const cnt = {}; let best = null; for (const x of f) { const k = x.color.join(","); cnt[k] = (cnt[k] || 0) + (x.last - x.first + 1); if (!best || cnt[k] > cnt[best]) best = k; } return best.split(",").map(Number); };
  /** Volumen con signo de una malla cerrada (en el marco dado por la función tr). */
  function volMalla(pos, idx) {
    let V = 0; for (let t = 0; t < idx.length; t += 3) { const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      V += (pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c])) / 6; }
    return V;
  }

  // ------------------------------------------------------------------ nombres y tipos
  const limpiarNombre = s => String(s || "").replace(/--3DModel-STEP-\d+/gi, "").replace(/\.(step|stp|sldprt|sldasm|iges?|wrl)$/i, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  const TIPOS = [
    { re: /usb.?c\b|type.?c|usb4105|usb4110|usb4085|usb.?3\.?1|gct.?usb4/i, n: "USB-C", zona: "usb", col: "#cbd5e1" },
    { re: /micro.?usb|usb.?micro|10118194|zx62/i, n: "Micro USB", zona: "usb", col: "#cbd5e1" },
    { re: /\busb\b|usb.?a\b|usb.?b\b/i, n: "USB", zona: "usb", col: "#cbd5e1" },
    { re: /\bsma\b|rp.?sma|sma.?(f|m|j)|\bbnc\b|coax|rfbat|bjpt/i, n: "Conector coaxial (SMA)", zona: "antena", col: "#d4a017" },
    { re: /u\.?fl|ipex|mhf|w\.fl|\bufl\b/i, n: "Conector u.FL / IPEX", zona: "antena", col: "#d4a017" },
    { re: /antena|antenna|\bant\b|chip.?ant/i, n: "Antena", zona: "antena", col: "#f472b6" },
    { re: /rj.?45|rj.?11|8p8c|ethernet|magjack/i, n: "RJ45", zona: "conector", col: "#94a3b8" },
    { re: /jack|barrel|dc.?power|pj.?0\d\d|\bdc.?jack/i, n: "Jack DC", zona: "conector", col: "#1f2937" },
    { re: /\bjst\b|sm\d\dB|\bgh\b|ghs|\bxh\b|\bph\b|\bsh\b.?\d|pinheader.?1\.0|b\d+b.?(ph|xh|gh|sh)|molex|picoblade|\bzh\b/i, n: "Conector JST / Molex", zona: "conector", col: "#f1f5f9" },
    { re: /terminal|bornera|screw.?term|kf\d{3}|dg\d{3}/i, n: "Bornera", zona: "conector", col: "#2563eb" },
    { re: /sd.?card|micro.?sd|tf.?card|dm3/i, n: "Ranura microSD", zona: "conector", col: "#cbd5e1" },
    { re: /header|pinhead|pin.?head|socket|\bmms\b|mms-|tsw-|ssw-|bss-|c-63|idc|box.?header|pin.?strip|regleta|2\.54/i, n: "Regleta / header", zona: "pines", col: "#1f2937" },
    { re: /\bled\b|led_|_led|0805.?led|0603.?led|ws2812|sk6812|apa102/i, n: "LED", zona: "led", col: "#facc15" },
    { re: /switch|\bsw\b|tl33|tact|button|pulsador|boton|botón|kmr|evqp|pts\d|ayz\d|slide|deslizante|ss12|mss\d|js20\d/i, n: "Pulsador / interruptor", zona: "boton", col: "#9ca3af" },
    { re: /buzzer|zumbador|speaker|parlante/i, n: "Buzzer", zona: null, col: "#1f2937" },
    { re: /zed.?f9|neo.?m\d|neo.?\d|max.?m\d|um98\d|um96\d|lc29|gnss|\bgps\b|ublox|u-blox|quectel.?l\d|mosaic/i, n: "Módulo GNSS", zona: null, col: "#cbd5e1" },
    { re: /esp32|wroom|wrover|esp.?12|esp8266/i, n: "Módulo ESP", zona: "antena", col: "#cbd5e1" },
    { re: /oled|lcd|display|tft|e.?paper|pantalla/i, n: "Pantalla", zona: null, col: "#0f172a" },
    { re: /cap|capacitor|condensador|electrolit/i, n: "Capacitor", zona: null, col: "#2563eb" },
    { re: /crystal|xtal|cristal|oscill/i, n: "Cristal", zona: null, col: "#cbd5e1" },
    { re: /inductor|choke|bobina/i, n: "Inductor", zona: null, col: "#334155" },
    { re: /battery|bater|cr20\d\d|coin.?cell|18650/i, n: "Batería", zona: null, col: "#334155" },
    { re: /heat.?sink|disipador/i, n: "Disipador", zona: "calor", col: "#cbd5e1" },
    { re: /relay|relé|rele\b/i, n: "Relé", zona: null, col: "#2563eb" },
    { re: /pot|trimmer|potenci/i, n: "Potenciómetro", zona: "ajuste", col: "#2563eb" },
  ];
  const tipoDe = n => TIPOS.find(t => t.re.test(n)) || null;
  const MODULOS = /\b(zed.?f9\w*|um98\d|um96\d|neo.?m\d\w*|max.?m\d\w*|esp32\w*|sim\d{3}\w*|bme\d{3}|mpu\d{4})\b/ig;

  // ------------------------------------------------------------------ conversión
  /**
   * Convierte el resultado de occt-import-js en un componente de MountLab.
   * Devuelve { base, piezas, agujeros, info, partesVista, avisos, metricas }.
   */
  function convertir(res, opt) {
    opt = opt || {};
    const { titulo, partes: PA } = partes(res), M = res.meshes, avisos = [];
    // datos por parte
    const P = PA.map((p, i) => {
      const ms = p.mallas.map(k => M[k]).filter(m => m && m.attributes && m.index);
      let x0 = 1e18, y0 = 1e18, z0 = 1e18, x1 = -1e18, y1 = -1e18, z1 = -1e18, n = 0;
      for (const m of ms) { const a = m.attributes.position.array; n += a.length / 3; for (let k = 0; k < a.length; k += 3) { x0 = Math.min(x0, a[k]); x1 = Math.max(x1, a[k]); y0 = Math.min(y0, a[k + 1]); y1 = Math.max(y1, a[k + 1]); z0 = Math.min(z0, a[k + 2]); z1 = Math.max(z1, a[k + 2]); } }
      return { i, nombre: limpiarNombre(p.nombre) || `Pieza ${i + 1}`, crudo: p.nombre, ms, n, bb: [x0, x1, y0, y1, z0, z1] };
    }).filter(p => p.n > 0);
    if (!P.length) throw new Error("El STEP no tiene sólidos");

    // ---- 1. la placa: la parte con la mayor cara plana y poco espesor en esa dirección
    function planos(p) {   // área por normal (agrupando n y −n)
      const G = new Map();
      for (const m of p.ms) { const a = m.attributes.position.array, ix = m.index.array;
        for (let t = 0; t < ix.length; t += 3) { const A = [a[ix[t] * 3], a[ix[t] * 3 + 1], a[ix[t] * 3 + 2]], B = [a[ix[t + 1] * 3], a[ix[t + 1] * 3 + 1], a[ix[t + 1] * 3 + 2]], C = [a[ix[t + 2] * 3], a[ix[t + 2] * 3 + 1], a[ix[t + 2] * 3 + 2]];
          let nn = cross(sub(B, A), sub(C, A)); const ar = Math.hypot(...nn) / 2; if (ar < 1e-9) continue; nn = nn.map(v => v / (2 * ar));
          const s = (Math.abs(nn[2]) > 1e-6 ? Math.sign(nn[2]) : Math.abs(nn[1]) > 1e-6 ? Math.sign(nn[1]) : Math.sign(nn[0])) || 1, q = nn.map(v => v * s), k = q.map(v => Math.round(v * 40)).join(",");
          const g = G.get(k) || { A: 0, n: [0, 0, 0] }; g.A += ar; g.n = g.n.map((v, j) => v + q[j] * ar); G.set(k, g); } }
      let best = null; for (const g of G.values()) if (!best || g.A > best.A) best = g; return best ? { A: best.A, n: norm(best.n) } : null;
    }
    const extension = (p, n) => { let lo = 1e18, hi = -1e18; for (const m of p.ms) { const a = m.attributes.position.array; for (let k = 0; k < a.length; k += 3) { const d = a[k] * n[0] + a[k + 1] * n[1] + a[k + 2] * n[2]; lo = Math.min(lo, d); hi = Math.max(hi, d); } } return [lo, hi]; };
    let pcb = null, nPcb = null;
    const candidatos = P.map(p => { const pl = planos(p); if (!pl) return null; const [lo, hi] = extension(p, pl.n), e = hi - lo; return { p, pl, e, lo, hi, pun: (/pcb|board|placa|tarjeta|\bbrd\b/i.test(p.crudo) && e < 40 ? 1e6 : 0) + (e > 0.25 && e < 4 && pl.A > 30 ? pl.A * (e <= 2.2 ? 1 : 0.35) : 0) }; }).filter(Boolean).sort((a, b) => b.pun - a.pun);
    if (candidatos.length && candidatos[0].pun > 0) { pcb = candidatos[0].p; nPcb = candidatos[0].pl.n; }
    // sin placa: la parte más grande hace de base (prisma) con su cara mayor hacia abajo
    if (!pcb) { const big = P.slice().sort((a, b) => (b.bb[1] - b.bb[0]) * (b.bb[3] - b.bb[2]) * (b.bb[5] - b.bb[4]) - (a.bb[1] - a.bb[0]) * (a.bb[3] - a.bb[2]) * (a.bb[5] - a.bb[4]))[0]; pcb = big; nPcb = (planos(big) || { n: [0, 0, 1] }).n; avisos.push("No encontré una placa (PCB): la pieza más grande quedó como base."); }
    const esPlaca = !avisos.length;

    // ---- 2. marco de la placa
    let Z = nPcb; const e1 = norm(Math.abs(Z[0]) < 0.9 ? cross(Z, [1, 0, 0]) : cross(Z, [0, 1, 0])), e2 = cross(Z, e1);
    const ptsPcb = []; for (const m of pcb.ms) { const a = m.attributes.position.array; for (let k = 0; k < a.length; k += 3) { const q = [a[k], a[k + 1], a[k + 2]]; ptsPcb.push([dot(q, e1), dot(q, e2)]); } }
    const R = rectMin(hull(ptsPcb));
    let X = norm(e1.map((v, j) => v * Math.cos(R.ang) + e2[j] * Math.sin(R.ang)));
    // ejes casi alineados con los del archivo → exactos (evita 0.0001° sueltos)
    const snap = v => { const k = v.map(Math.abs).indexOf(Math.max(...v.map(Math.abs))); return Math.abs(v[k]) > 0.99999 ? v.map((_, j) => j === k ? Math.sign(v[k]) : 0) : v; };
    Z = snap(Z); X = snap(X);
    { const k = X.map(Math.abs).indexOf(Math.max(...X.map(Math.abs))); if (X[k] < 0) X = X.map(v => -v); }   // conserva el sentido del archivo
    const [zLo, zHi] = extension(pcb, Z); let esp = zHi - zLo;
    const c2 = [R.cx, R.cy], O0 = [0, 1, 2].map(j => e1[j] * c2[0] + e2[j] * c2[1] + Z[j] * zLo);
    // ¿hacia dónde está la cara A (la que tiene más volumen de piezas)?
    let arriba = 0, abajo = 0; const mid = (zLo + zHi) / 2;
    for (const p of P) { if (p === pcb) continue; const [lo, hi] = extension(p, Z), vol = (p.bb[1] - p.bb[0]) * (p.bb[3] - p.bb[2]) * (p.bb[5] - p.bb[4]); if ((lo + hi) / 2 >= mid) arriba += vol; else abajo += vol; }
    let O = O0; if (abajo > arriba * 1.05) { Z = Z.map(v => -v); O = [0, 1, 2].map(j => O0[j] + Z[j] * -esp); }   // se voltea (giro de 180° sobre X): la cara con más piezas queda arriba
    let Y = cross(Z, X);
    const aMarco = q => { const d = sub(q, O); return [dot(d, X), dot(d, Y), dot(d, Z)]; };
    // si al girar quedó la placa al revés, la cara inferior es z = 0
    // transforma todas las mallas al marco de la placa
    const T = P.map(p => p.ms.map(m => { const a = m.attributes.position.array, b = new Float32Array(a.length); for (let k = 0; k < a.length; k += 3) { const q = aMarco([a[k], a[k + 1], a[k + 2]]); b[k] = q[0]; b[k + 1] = q[1]; b[k + 2] = q[2]; } return { pos: b, idx: Uint32Array.from(m.index.array), color: colorMalla(m) }; }));
    P.forEach((p, i) => { p.T = T[i]; let x0 = 1e18, y0 = 1e18, z0 = 1e18, x1 = -1e18, y1 = -1e18, z1 = -1e18; for (const m of p.T) for (let k = 0; k < m.pos.length; k += 3) { x0 = Math.min(x0, m.pos[k]); x1 = Math.max(x1, m.pos[k]); y0 = Math.min(y0, m.pos[k + 1]); y1 = Math.max(y1, m.pos[k + 1]); z0 = Math.min(z0, m.pos[k + 2]); z1 = Math.max(z1, m.pos[k + 2]); } p.b = [x0, x1, y0, y1, z0, z1]; });
    // reajuste fino: la placa de z 0 a esp exactos
    const zb = pcb.b[4]; if (Math.abs(zb) > 1e-4) for (const p of P) { for (const m of p.T) for (let k = 2; k < m.pos.length; k += 3) m.pos[k] -= zb; p.b[4] -= zb; p.b[5] -= zb; }
    esp = pcb.b[5] - pcb.b[4];

    // ---- 3. contorno y agujeros de la placa (bordes de la cara superior)
    let base, agujeros = [], pinesTHT = 0, otros = [];
    if (esPlaca) {
      const key = (x, y) => Math.round(x * 500) + ":" + Math.round(y * 500), ptsK = new Map(), cuenta = new Map();
      for (const m of pcb.T) { const a = m.pos, ix = m.idx;
        for (let t = 0; t < ix.length; t += 3) { const A = ix[t] * 3, B = ix[t + 1] * 3, C = ix[t + 2] * 3;
          if (a[A + 2] < esp - 0.02 || a[B + 2] < esp - 0.02 || a[C + 2] < esp - 0.02) continue;
          const nz = (a[B] - a[A]) * (a[C + 1] - a[A + 1]) - (a[B + 1] - a[A + 1]) * (a[C] - a[A]); if (Math.abs(nz) < 1e-12) continue;
          const ks = [A, B, C].map(o => { const k = key(a[o], a[o + 1]); ptsK.set(k, [a[o], a[o + 1]]); return k; });
          for (let j = 0; j < 3; j++) { const u = ks[j], v = ks[(j + 1) % 3]; if (u === v) continue; const e = u < v ? u + "|" + v : v + "|" + u; cuenta.set(e, (cuenta.get(e) || 0) + 1); } } }
      const ady = new Map(); for (const [e, c] of cuenta) if (c === 1) { const [u, v] = e.split("|"); (ady.get(u) || ady.set(u, []).get(u)).push(v); (ady.get(v) || ady.set(v, []).get(v)).push(u); }
      const usados = new Set(), lazos = [];
      for (const k0 of ady.keys()) { if (usados.has(k0)) continue; const L = [k0]; usados.add(k0); let prev = null, cur = k0;
        for (let g = 0; g < 200000; g++) { const nx = (ady.get(cur) || []).find(v => v !== prev && !usados.has(v)); if (!nx) break; L.push(nx); usados.add(nx); prev = cur; cur = nx; }
        if (L.length >= 3) lazos.push(L.map(k => ptsK.get(k))); }
      lazos.sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));
      const ext = lazos.length ? lazos[0] : null;
      for (const h of lazos.slice(1)) { const c = circulo(h); if (c && c.dev < 0.04 && c.completo) { const d = 2 * c.r; if (d >= 1.9 && d <= 7) agujeros.push({ x: r2(c.cx), y: r2(c.cy), d: r2(d) }); else if (d < 1.9) pinesTHT++; else otros.push(`agujero Ø${r2(d)}`); } else otros.push(`recorte de ${r2(Math.abs(area(h)))} mm²`); }
      const bx = pcb.b, L = bx[1] - bx[0], W = bx[3] - bx[2];
      const grueso = esp > 3.2;   // un cuerpo grueso (fuente, chip, carcasa) es base "prisma", no PCB
      base = { tipo: grueso ? "prisma" : "placa", forma: "rect", L: r2(L), W: r2(W), d: r2(L), espesor: r2(esp), radio: 0, color: hex(colorMalla(pcb.ms[0])) || (grueso ? "#475569" : "#166534") };
      if (ext) {
        const AE = Math.abs(area(ext)), AR = L * W, cc = circulo(ext);
        if (cc && cc.dev < 0.01 && Math.abs(L - W) < 0.05 * L) Object.assign(base, { forma: "redonda", d: r2(2 * cc.r), L: r2(2 * cc.r), W: r2(2 * cc.r) });
        else if (AE > AR * 0.997) base.forma = "rect";
        else {
          const r = Math.sqrt(Math.max(0, AR - AE) / (4 - Math.PI)), cx = (bx[0] + bx[1]) / 2, cy = (bx[2] + bx[3]) / 2;
          // ¿todos los puntos del borde están sobre un rectángulo de esquinas redondeadas de radio r?
          const enRR = ([x, y]) => { const u = Math.abs(x - cx) - (L / 2 - r), v = Math.abs(y - cy) - (W / 2 - r); if (u > 0 && v > 0) return Math.abs(Math.hypot(u, v) - r); return Math.min(Math.abs(Math.abs(x - cx) - L / 2), Math.abs(Math.abs(y - cy) - W / 2)); };
          if (r > 0.2 && r < Math.min(L, W) / 2 && ext.every(p => enRR(p) < 0.06)) Object.assign(base, { forma: "redondeada", radio: r2(r) });
          else { let s = simplificar(ext, 0.02); for (let tol = 0.04; s.length > 160 && tol < 1; tol *= 1.6) s = simplificar(ext, tol); if (area(s) < 0) s.reverse(); Object.assign(base, { forma: "contorno", contorno: s.map(p => [r2(p[0] - cx), r2(p[1] - cy)]) }); }
        }
      }
      if (otros.length) avisos.push(`La placa tiene ${otros.join(", ")} que no son de montaje: no se cortan en el modelo.`);
    } else {
      const bx = pcb.b; base = { tipo: "prisma", forma: "rect", L: r2(bx[1] - bx[0]), W: r2(bx[3] - bx[2]), d: r2(bx[1] - bx[0]), espesor: r2(esp), radio: 0, color: hex(colorMalla(pcb.ms[0])) || "#475569" };
    }
    // centro de la placa = origen
    const cx0 = (pcb.b[0] + pcb.b[1]) / 2, cy0 = (pcb.b[2] + pcb.b[3]) / 2;
    if (Math.abs(cx0) > 1e-4 || Math.abs(cy0) > 1e-4) { for (const p of P) { for (const m of p.T) for (let k = 0; k < m.pos.length; k += 3) { m.pos[k] -= cx0; m.pos[k + 1] -= cy0; } p.b[0] -= cx0; p.b[1] -= cx0; p.b[2] -= cy0; p.b[3] -= cy0; } agujeros = agujeros.map(a => ({ x: r2(a.x - cx0), y: r2(a.y - cy0), d: a.d })); }
    const Lp = base.L, Wp = base.W;

    // ---- 4. cada parte → primitivas
    const ptsDe = ms => { const out = []; for (const m of ms) for (let k = 0; k < m.pos.length; k += 3) out.push([m.pos[k], m.pos[k + 1], m.pos[k + 2]]); return out; };
    const volDe = ms => Math.abs(ms.reduce((s, m) => s + volMalla(m.pos, m.idx), 0));
    /** Mejor prisma para un conjunto de puntos: prueba los ejes z, x, y. */
    function prisma(pts, V) {
      const ops = [];
      for (const eje of ["z", "x", "y"]) {
        const [iu, iv, iw] = eje === "z" ? [0, 1, 2] : eje === "x" ? [1, 2, 0] : [0, 2, 1];
        let lo = 1e18, hi = -1e18; const P2 = []; const vistos = new Set();
        for (const q of pts) { lo = Math.min(lo, q[iw]); hi = Math.max(hi, q[iw]); const k = Math.round(q[iu] * 200) + ":" + Math.round(q[iv] * 200); if (!vistos.has(k)) { vistos.add(k); P2.push([q[iu], q[iv]]); } }
        const H = hull(P2), A = Math.abs(area(H)), Vp = A * (hi - lo);
        ops.push({ eje, H, A, lo, hi, f: Vp > 1e-9 ? Math.min(1, V / Vp) : 0 });
      }
      const fmax = Math.max(...ops.map(o => o.f)); return ops.find(o => o.f >= fmax - 0.08) || ops[0];   // a igualdad, z
    }
    /** Escalonado: corta el cuerpo con planos perpendiculares al eje y agrupa los tramos de sección parecida
        (bridas, tuercas, cuerpos y vástagos de conectores). Devuelve uno o varios prismas { eje, H, lo, hi }. */
    function escalonar(ms, o, V) {
      const len = o.hi - o.lo; if (len < 1.2 || o.f > 0.9) return [o];
      const [iu, iv, iw] = o.eje === "z" ? [0, 1, 2] : o.eje === "x" ? [1, 2, 0] : [0, 2, 1];
      const N = Math.max(10, Math.min(48, Math.round(len / 0.35))), paso = len / N, C = [...Array(N)].map((_, i) => o.lo + (i + 0.5) * paso), S = C.map(() => []), niveles = new Set();
      for (const m of ms) { const a = m.pos, ix = m.idx;
        for (let k = 0; k < a.length; k += 3) niveles.add(Math.round(a[k + iw] * 100) / 100);
        for (let t = 0; t < ix.length; t += 3) {
          const P = [ix[t] * 3, ix[t + 1] * 3, ix[t + 2] * 3], w = P.map(q => a[q + iw]), w0 = Math.min(...w), w1 = Math.max(...w); if (w1 - w0 < 1e-9) continue;
          for (let i = Math.max(0, Math.ceil((w0 - o.lo) / paso - 0.5)); i < N && C[i] <= w1; i++) { const c = C[i]; if (c < w0) continue;
            for (let e = 0; e < 3; e++) { const A = P[e], B = P[(e + 1) % 3], wa = a[A + iw], wb = a[B + iw]; if ((wa - c) * (wb - c) > 0 || wa === wb) continue; const f = (c - wa) / (wb - wa); S[i].push([a[A + iu] + f * (a[B + iu] - a[A + iu]), a[A + iv] + f * (a[B + iv] - a[A + iv])]); } }
        } }
      const H = S.map(p => p.length >= 3 ? hull(p) : null), A = H.map(h => h ? Math.abs(area(h)) : 0), cen = H.map(h => { if (!h) return null; const us = h.map(p => p[0]), vs = h.map(p => p[1]); return [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)]; });
      // tramos de sección parecida
      let T = [];
      for (let i = 0; i < N; i++) { if (!H[i]) { T.push(null); continue; } const u = T[T.length - 1];
        if (u && Math.abs(A[i] - u.A) <= 0.1 * Math.max(A[i], u.A) && cen[i].every((v, j) => Math.abs(v - u.b[j]) < 0.25)) { u.i1 = i; u.pts.push(...S[i]); } else T.push({ i0: i, i1: i, A: A[i], b: cen[i], pts: S[i].slice() }); }
      T = T.filter(Boolean);
      // como mucho 6 tramos: se juntan los vecinos más parecidos
      while (T.length > 6) { let k = 0, best = 1e18; for (let i = 0; i < T.length - 1; i++) { const d = Math.abs(T[i].A - T[i + 1].A) / Math.max(T[i].A, T[i + 1].A, 1e-9); if (d < best) { best = d; k = i; } }
        const a2 = T[k], b2 = T[k + 1]; T.splice(k, 2, { i0: a2.i0, i1: b2.i1, A: Math.max(a2.A, b2.A), b: a2.b, pts: a2.pts.concat(b2.pts) }); }
      if (T.length < 2) return [o];
      // bordes de cada tramo: el nivel real (vértices) entre los dos planos de corte más cercano al punto medio
      const lv = [...niveles].sort((m, n) => m - n), borde = (i) => { const c0 = C[i], c1 = C[i + 1], mid = (c0 + c1) / 2; let b = mid, d = 1e9; for (const x of lv) if (x > c0 && x < c1 && Math.abs(x - mid) < d) { d = Math.abs(x - mid); b = x; } return b; };
      const segs = T.map((t, k) => ({ eje: o.eje, H: hull(t.pts), lo: t.i0 === 0 ? o.lo : (k > 0 && T[k - 1].i1 === t.i0 - 1 ? borde(t.i0 - 1) : borde(t.i0 - 1)), hi: t.i1 === N - 1 ? o.hi : borde(t.i1) }));
      const Vs = segs.reduce((s2, q) => s2 + Math.abs(area(q.H)) * (q.hi - q.lo), 0), Vo = o.A * len;
      return Vs < Vo * 0.93 && Vs > V * 0.7 ? segs : [o];   // solo si se parece más al original
    }
    function prim(o, color) {
      const c = o.H.length >= 10 ? circulo(o.H) : null;
      if (c && c.dev < 0.035 && c.completo) {
        if (o.eje === "z") return { f: "cil", cx: r3(c.cx), cy: r3(c.cy), d: r3(2 * c.r), z0: r3(o.lo), z1: r3(o.hi), color };
        return { f: "perfil", eje: o.eje, circ: [r3(c.cx), r3(c.cy), r3(c.r)], a0: r3(o.lo), a1: r3(o.hi), color };
      }
      let H = simplificar(o.H, 0.03); for (let tol = 0.06; H.length > 40 && tol < 2; tol *= 1.5) H = simplificar(o.H, tol);
      if (area(H) < 0) H.reverse();
      // rectángulo alineado → caja
      const us = H.map(p => p[0]), vs = H.map(p => p[1]), u0 = Math.min(...us), u1 = Math.max(...us), v0 = Math.min(...vs), v1 = Math.max(...vs);
      if (o.eje === "z" && Math.abs(area(H)) > (u1 - u0) * (v1 - v0) * 0.985) return { f: "caja", cx: r3((u0 + u1) / 2), cy: r3((v0 + v1) / 2), w: r3(u1 - u0), h: r3(v1 - v0), z0: r3(o.lo), z1: r3(o.hi), color };
      return { f: "perfil", eje: o.eje, pts: H.map(p => [r3(p[0]), r3(p[1])]), a0: r3(o.lo), a1: r3(o.hi), color };
    }
    const piezas = [], vista = [], metricas = [];
    let nPz = 0;
    for (const p of P) {
      const col0 = hex(colorMalla(p.ms[0])) || null;
      vista.push({ nombre: p.nombre, esPlaca: p === pcb, mallas: p.T.map(m => ({ pos: m.pos, idx: m.idx, color: hex(m.color) || col0 || (p === pcb ? "#166534" : "#94a3b8") })) });
      if (p === pcb) continue;
      const tipo = tipoDe(p.crudo + " " + p.nombre), b = p.b, Vtot = volDe(p.T);
      // color dominante: el del cuerpo más grande de la pieza
      const colP = (() => { let best = null, vb = -1; for (const m of p.T) { let x0 = 1e18, x1 = -1e18, y0 = 1e18, y1 = -1e18, z0 = 1e18, z1 = -1e18; for (let k = 0; k < m.pos.length; k += 3) { x0 = Math.min(x0, m.pos[k]); x1 = Math.max(x1, m.pos[k]); y0 = Math.min(y0, m.pos[k + 1]); y1 = Math.max(y1, m.pos[k + 1]); z0 = Math.min(z0, m.pos[k + 2]); z1 = Math.max(z1, m.pos[k + 2]); } const v = (x1 - x0) * (y1 - y0) * (z1 - z0); if (v > vb && m.color) { vb = v; best = m.color; } } return hex(best); })();
      if ((b[1] - b[0]) * (b[3] - b[2]) * (b[5] - b[4]) < 0.02) continue;   // polvo
      // un prisma para toda la pieza o, si no se parece, uno por cuerpo (los más grandes)
      const todo = prisma(ptsDe(p.T), Vtot);
      let prims;
      if (todo.f >= 0.68 || p.T.length === 1) prims = escalonar(p.T, todo, Vtot).map(o => prim(o, colP || col0 || (tipo && tipo.col) || "#64748b"));
      else {
        const cuerpos = p.T.map(m => { const v = Math.abs(volMalla(m.pos, m.idx)); let x0 = 1e18, x1 = -1e18, y0 = 1e18, y1 = -1e18, z0 = 1e18, z1 = -1e18; for (let k = 0; k < m.pos.length; k += 3) { x0 = Math.min(x0, m.pos[k]); x1 = Math.max(x1, m.pos[k]); y0 = Math.min(y0, m.pos[k + 1]); y1 = Math.max(y1, m.pos[k + 1]); z0 = Math.min(z0, m.pos[k + 2]); z1 = Math.max(z1, m.pos[k + 2]); } return { m, v, vb: (x1 - x0) * (y1 - y0) * (z1 - z0) }; }).sort((a, c) => c.vb - a.vb);
        const vbTot = cuerpos.reduce((s, c) => s + c.vb, 0); let acum = 0; prims = [];
        for (const c of cuerpos) { if (prims.length >= 18 || (acum > 0.97 * vbTot && prims.length >= 2) || c.vb < 0.004 * cuerpos[0].vb) break; acum += c.vb; const vc = c.v || c.vb * 0.5; prims.push(...escalonar([c.m], prisma(ptsDe([c.m]), vc), vc).map(o => prim(o, hex(c.m.color) || col0 || (tipo && tipo.col) || "#64748b"))); }
      }
      // cara: A si está arriba de la mitad de la placa
      const B = b[5] <= esp * 0.5 + 1e-6, cx = r2((b[0] + b[1]) / 2), cy = r2((b[2] + b[3]) / 2);
      const local = q => { const f = ([x, y, z]) => [x - cx, y - cy, B ? -z : z - esp];
        if (q.f === "perfil") { const o = MLPlant.perfilMap(q, f); delete o.cx; delete o.cy; delete o.w; delete o.h; delete o.z0; delete o.z1; return o; }
        const z0 = B ? -q.z1 : q.z0 - esp, z1 = B ? -q.z0 : q.z1 - esp; return Object.assign({}, q, { cx: r3(q.cx - cx), cy: r3(q.cy - cy), z0: r3(z0), z1: r3(z1) }); };
      const primL = prims.map(local);
      // zona de acceso
      let zona = null;
      const sobre = { "+X": b[1] - Lp / 2, "-X": -Lp / 2 - b[0], "+Y": b[3] - Wp / 2, "-Y": -Wp / 2 - b[2] }, lado = Object.entries(sobre).sort((m, n) => n[1] - m[1])[0];
      let zt = tipo && tipo.zona;
      if (!zt && lado[1] > 2 && todo.eje !== "z") zt = "conector";   // algo que sale de lado por el borde
      if (zt) {
        const bordes = ["usb", "conector", "antena"].includes(zt), sal = bordes && lado[1] > -3 ? lado[0] : B ? "-Z" : "+Z";
        const hol = { usb: 15, conector: 15, antena: 20, pines: 22, boton: 5, led: 2, calor: 10, ajuste: 8 }[zt] || 5;
        zona = { tipo: zt, cx: 0, cy: 0, w: r2(b[1] - b[0]), h: r2(b[3] - b[2]), z0: r2(B ? -b[5] : b[4] - esp), z1: r2(B ? -b[4] : b[5] - esp), salida: sal, holgura: hol };
      }
      const nombre = tipo ? `${tipo.n} · ${p.nombre}` : p.nombre;
      nPz++;
      const pz = { id: "s" + nPz, plantilla: "importada", nombre: nombre.slice(0, 70), cara: B ? "B" : "A", x: cx, y: cy, rot: 0, z: 0, params: { prim: primL, zona }, origen: "step" };
      if (lado[1] > 0.3) pz.sobresale = true;
      piezas.push(pz);
      const Vm = primL.reduce((s, q) => s + MLPlant.volumen(q.f === "perfil" ? Object.assign({}, q) : q), 0);
      metricas.push({ id: pz.id, nombre: pz.nombre, tipo: tipo ? tipo.n : "", cara: pz.cara, medidas: [r2(b[1] - b[0]), r2(b[3] - b[2]), r2(b[5] - b[4])], prims: primL.length, forma: primL.map(q => q.f === "perfil" ? (q.circ ? `cilindro (eje ${q.eje})` : `perfil ${q.pts.length} lados (eje ${q.eje})`) : q.f === "cil" ? "cilindro" : "caja").join(", "),
        vOrig: r2(Vtot), vMod: r2(Vm), sale: lado[1] > 0.3 ? `${r2(lado[1])} mm por ${lado[0]}` : "", zona: zona ? zona.tipo : "" });
    }
    // avisos útiles
    const tit = String(titulo || ""), enTit = (tit.match(MODULOS) || []).map(s => s.toLowerCase().replace(/[^a-z0-9]/g, "")), enPz = P.flatMap(p => (p.crudo.match(MODULOS) || []).map(s => s.toLowerCase().replace(/[^a-z0-9]/g, "")));
    if (enTit.length && enPz.length && !enTit.some(t => enPz.some(q => q.startsWith(t.slice(0, 5)) || t.startsWith(q.slice(0, 5))))) avisos.push(`El archivo se llama «${limpiarNombre(tit)}» pero el módulo que trae adentro es «${P.find(p => MODULOS.test(p.crudo)) ? limpiarNombre(P.find(p => (MODULOS.lastIndex = 0, MODULOS.test(p.crudo))).crudo) : enPz[0]}»: el fabricante pudo reusar el modelo. Revisa que sea la versión correcta.`);
    MODULOS.lastIndex = 0;
    const sal = metricas.filter(m => m.sale); if (sal.length) avisos.push(`Sobresalen del borde de la placa: ${sal.map(m => `${m.nombre.split(" · ")[0]} (${m.sale})`).join("; ")}. Quedan como zonas de acceso para la caja.`);
    if (pinesTHT) avisos.push(`${pinesTHT} agujeros pequeños (pines pasantes) no se usan para montaje.`);
    // alturas
    let top = esp, bot = 0; P.forEach(p => { if (p !== pcb) { top = Math.max(top, p.b[5]); bot = Math.min(bot, p.b[4]); } });
    const total = { L: r2(Math.max(...P.map(p => p.b[1])) - Math.min(...P.map(p => p.b[0]))), W: r2(Math.max(...P.map(p => p.b[3])) - Math.min(...P.map(p => p.b[2]))), H: r2(top - bot) };
    return { titulo: limpiarNombre(titulo), base, piezas, agujeros, avisos, metricas, vista, info: { esp: r2(esp), alturaSup: r2(top - esp), alturaInf: r2(-bot), total, partes: P.length, mallas: M.length, placa: esPlaca } };
  }

  /** Construye el componente (o el bloque modelo + montaje) a partir de la conversión. */
  function aComponente(cv, sel) {
    const piezas = cv.piezas.filter(p => !sel || sel[p.id] !== false);
    const c = { modelo: { version: 1, base: cv.base, piezas, nota: "Generado desde un modelo STEP (el archivo original no se guarda)." },
      montaje: { origen: "centro", fijacion: cv.agujeros.length ? "tornillo" : "adhesivo", agujeros: cv.agujeros.slice(), altura_superior: 0, altura_inferior: 0, holgura_inferior_cableado: 0, nota: cv.agujeros.length ? `Agujeros de montaje Ø${[...new Set(cv.agujeros.map(a => a.d))].join(" / ")} mm tomados del STEP.` : "" } };
    MLPlant.sincronizar(c);
    return c;
  }

  window.MLStepImp = { leer, convertir, aComponente, partes, limpiarNombre, _geo: { hull, rectMin, simplificar, circulo, area } };
})();
