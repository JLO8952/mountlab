/* MountLab · Modelo 3D — plantillas paramétricas y motor de sincronización.
   Coordenadas: mm, origen en el centro de la placa, X a lo largo, Y a lo ancho (vista superior).
   Z: 0 = cara inferior de la placa; la placa ocupa 0..espesor. Cara A crece hacia +Z desde el espesor; cara B hacia −Z desde 0.
   Cada plantilla devuelve, en coordenadas locales de la pieza (z desde su superficie):
     prim  : [{f:"caja", cx, cy, w, h, z0, z1, color, r?} | {f:"cil", cx, cy, d, z0, z1, color}]
     zona  : {tipo, cx, cy, w, h, z0, z1, salida: "+X|-X|+Y|-Y|+Z", holgura} (opcional)
     pines : [{n, x, y}] (opcional) */
(function () {
  const C = { negro: "#1f2937", plastico: "#334155", gris: "#9ca3af", metal: "#cbd5e1", oro: "#d4a017", blanco: "#f1f5f9", azul: "#2563eb", rojo: "#dc2626", verde: "#16a34a", ambar: "#f59e0b", amarillo: "#facc15", cobre: "#b45309", pcb: "#166534", azulPcb: "#1e3a8a" };
  const caja = (cx, cy, w, h, z0, z1, color, r) => ({ f: "caja", cx, cy, w, h, z0, z1, color, ...(r ? { r } : {}) });
  const cil = (cx, cy, d, z0, z1, color) => ({ f: "cil", cx, cy, d, z0, z1, color });
  const P = (k, n, def, min, max, step, opts) => ({ k, n, def, min, max, step: step || 0.1, ...(opts ? { opts } : {}) });

  // -------- generadores reutilizables
  function header(p, hembra) {
    const n = Math.max(1, p.n | 0), f = Math.max(1, p.filas | 0), pas = p.paso, L = n * pas, W = f * pas;
    const prim = [], pines = [];
    if (hembra) prim.push(caja(0, 0, L, W, 0, p.alto, C.negro));
    else prim.push(caja(0, 0, L, W, 0, 2.5, C.negro));
    for (let j = 0; j < f; j++) for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * pas, y = ((f - 1) / 2 - j) * pas;
      if (!hembra) prim.push(caja(x, y, 0.64, 0.64, 2.5, p.alto, C.oro));
      pines.push({ n: f > 1 ? `${j + 1}.${i + 1}` : String(i + 1), x, y });
    }
    return { prim, pines, zona: { tipo: "pines", cx: 0, cy: 0, w: L, h: W, z0: 0, z1: p.alto, salida: "+Z", holgura: hembra ? 12 : 22 } };
  }
  function conectorPaso(p, color, alto, prof) {
    const n = Math.max(1, p.n | 0), L = n * p.paso + 1.5, pines = [];
    for (let i = 0; i < n; i++) pines.push({ n: String(i + 1), x: (i - (n - 1) / 2) * p.paso, y: 0 });
    return { prim: [caja(0, 0, L, prof, 0, alto, color)], pines, zona: { tipo: "conector", cx: 0, cy: prof / 2, w: L, h: prof, z0: 0, z1: alto, salida: "+Y", holgura: 15 } };
  }

  // -------- librería
  const LIB = [
    // Conectores
    { id: "header_macho", g: "Conectores", n: "Header macho", params: [P("n", "Pines", 8, 1, 40, 1), P("filas", "Filas", 1, 1, 2, 1), P("paso", "Paso", 2.54, 1, 5, 0.01), P("alto", "Alto total", 11, 4, 20)], gen: p => header(p, false) },
    { id: "header_hembra", g: "Conectores", n: "Header hembra", params: [P("n", "Pines", 8, 1, 40, 1), P("filas", "Filas", 1, 1, 2, 1), P("paso", "Paso", 2.54, 1, 5, 0.01), P("alto", "Alto", 8.5, 4, 15)], gen: p => header(p, true) },
    { id: "micro_usb", g: "Conectores", n: "Micro USB", params: [P("sal", "Sobresale del borde", 1, 0, 3)], gen: p => ({ prim: [caja(0, p.sal / 2, 7.5, 5.6, 0, 2.6, C.metal)], zona: { tipo: "usb", cx: 0, cy: p.sal / 2, w: 7.5, h: 5.6, z0: 0, z1: 2.6, salida: "+Y", holgura: 20 } }) },
    { id: "usb_c", g: "Conectores", n: "USB-C", params: [P("sal", "Sobresale del borde", 1, 0, 3)], gen: p => ({ prim: [caja(0, p.sal / 2, 8.9, 7.3, 0, 3.2, C.metal, 1.2)], zona: { tipo: "usb", cx: 0, cy: p.sal / 2, w: 8.9, h: 7.3, z0: 0, z1: 3.2, salida: "+Y", holgura: 22 } }) },
    { id: "jack_dc", g: "Conectores", n: "Jack DC 2.1 mm", params: [], gen: () => ({ prim: [caja(0, 0, 9, 14, 0, 11, C.negro), cil(0, 7, 6, 3, 9, C.plastico)], zona: { tipo: "conector", cx: 0, cy: 0, w: 9, h: 14, z0: 0, z1: 11, salida: "+Y", holgura: 25 } }) },
    { id: "jst_xh", g: "Conectores", n: "JST-XH (2.5 mm)", params: [P("n", "Pines", 2, 2, 12, 1)], gen: p => conectorPaso({ ...p, paso: 2.5 }, C.blanco, 7, 5.75) },
    { id: "jst_ph", g: "Conectores", n: "JST-PH (2.0 mm)", params: [P("n", "Pines", 2, 2, 12, 1)], gen: p => conectorPaso({ ...p, paso: 2.0 }, C.blanco, 6, 4.5) },
    { id: "bornera", g: "Conectores", n: "Bornera de tornillo (5 mm)", params: [P("n", "Vías", 2, 2, 6, 1)], gen: p => { const r = conectorPaso({ ...p, paso: 5.0 }, C.azul, 10, 7.5); for (let i = 0; i < p.n; i++) r.prim.push(cil((i - (p.n - 1) / 2) * 5, -1, 3, 10, 10.4, C.metal)); return r; } },
    // Chips
    { id: "soic", g: "Chips", n: "SOIC / SOP", params: [P("n", "Pines", 8, 4, 28, 2), P("ancho", "Ancho cuerpo", 3.9, 3, 8)], gen: p => { const L = (p.n / 2) * 1.27 + 0.4; return { prim: [caja(0, 0, L, p.ancho, 0, 1.6, C.negro), caja(0, 0, L - 0.4, p.ancho + 2, 0, 0.3, C.metal)] }; } },
    { id: "tssop", g: "Chips", n: "TSSOP", params: [P("n", "Pines", 16, 8, 38, 2)], gen: p => { const L = (p.n / 2) * 0.65 + 0.6; return { prim: [caja(0, 0, L, 4.4, 0, 1.1, C.negro), caja(0, 0, L - 0.4, 6.4, 0, 0.25, C.metal)] }; } },
    { id: "qfn", g: "Chips", n: "QFN", params: [P("lado", "Lado", 5, 2, 12)], gen: p => ({ prim: [caja(0, 0, p.lado, p.lado, 0, 0.9, C.negro)] }) },
    { id: "tqfp", g: "Chips", n: "TQFP / LQFP", params: [P("lado", "Lado cuerpo", 7, 5, 20)], gen: p => ({ prim: [caja(0, 0, p.lado, p.lado, 0, 1.2, C.negro), caja(0, 0, p.lado + 2, p.lado + 2, 0, 0.2, C.metal)] }) },
    { id: "wroom", g: "Chips", n: "Módulo ESP32-WROOM", params: [], gen: () => ({ prim: [caja(0, -3.2, 18, 19.2, 0, 3.1, C.metal), caja(0, 0, 18, 25.5, 0, 0.8, C.azulPcb)], zona: { tipo: "antena", cx: 0, cy: 9.5, w: 18, h: 6.4, z0: 0, z1: 3.1, salida: "+Y", holgura: 10 } }) },
    { id: "cristal", g: "Chips", n: "Cristal HC-49", params: [], gen: () => ({ prim: [caja(0, 0, 11, 4.6, 0, 3.5, C.metal, 2.2)] }) },
    // Pasivos
    { id: "smd", g: "Pasivos", n: "Resistencia / capacitor SMD", params: [P("tam", "Tamaño", "0805", null, null, null, ["0402", "0603", "0805", "1206"])], gen: p => { const t = { "0402": [1, 0.5, 0.35], "0603": [1.6, 0.8, 0.45], "0805": [2, 1.25, 0.5], "1206": [3.2, 1.6, 0.55] }[p.tam] || [2, 1.25, 0.5]; return { prim: [caja(0, 0, t[0] * 0.6, t[1], 0, t[2], C.negro), caja(-t[0] * 0.4, 0, t[0] * 0.2, t[1], 0, t[2], C.metal), caja(t[0] * 0.4, 0, t[0] * 0.2, t[1], 0, t[2], C.metal)] }; } },
    { id: "electrolitico", g: "Pasivos", n: "Capacitor electrolítico", params: [P("d", "Diámetro", 6.3, 4, 18), P("alto", "Alto", 11, 5, 35)], gen: p => ({ prim: [cil(0, 0, p.d, 0, p.alto, C.azul), cil(0, 0, p.d * 0.8, p.alto, p.alto + 0.1, C.metal)] }) },
    { id: "inductor", g: "Pasivos", n: "Inductor SMD", params: [P("lado", "Lado", 6, 3, 15), P("alto", "Alto", 3, 1, 8)], gen: p => ({ prim: [caja(0, 0, p.lado, p.lado, 0, p.alto, C.plastico, 0.8)] }) },
    { id: "trimmer", g: "Pasivos", n: "Trimmer / potenciómetro", params: [], gen: () => ({ prim: [caja(0, 0, 6.5, 6.5, 0, 4.5, C.azul), cil(0, 0, 3, 4.5, 5.5, C.blanco)], zona: { tipo: "ajuste", cx: 0, cy: 0, w: 6.5, h: 6.5, z0: 0, z1: 5.5, salida: "+Z", holgura: 5 } }) },
    // Interfaz
    { id: "pulsador", g: "Interfaz", n: "Pulsador 6×6", params: [P("vastago", "Alto del botón", 1.5, 0.5, 8)], gen: p => ({ prim: [caja(0, 0, 6, 6, 0, 3.5, C.negro), cil(0, 0, 3.5, 3.5, 3.5 + p.vastago, C.gris)], zona: { tipo: "boton", cx: 0, cy: 0, w: 6, h: 6, z0: 0, z1: 3.5 + p.vastago, salida: "+Z", holgura: 3 } }) },
    { id: "led_th", g: "Interfaz", n: "LED 3/5 mm", params: [P("d", "Diámetro", 5, 3, 10), P("color", "Color", "rojo", null, null, null, ["rojo", "verde", "azul", "amarillo", "blanco"])], gen: p => ({ prim: [cil(0, 0, p.d, 0, p.d * 1.5, { rojo: C.rojo, verde: C.verde, azul: C.azul, amarillo: C.amarillo, blanco: C.blanco }[p.color] || C.rojo)], zona: { tipo: "led", cx: 0, cy: 0, w: p.d, h: p.d, z0: 0, z1: p.d * 1.5, salida: "+Z", holgura: 2 } }) },
    { id: "led_smd", g: "Interfaz", n: "LED SMD", params: [], gen: () => ({ prim: [caja(0, 0, 2, 1.25, 0, 0.8, C.amarillo)], zona: { tipo: "led", cx: 0, cy: 0, w: 2, h: 1.25, z0: 0, z1: 0.8, salida: "+Z", holgura: 2 } }) },
    { id: "interruptor", g: "Interfaz", n: "Interruptor deslizante", params: [], gen: () => ({ prim: [caja(0, 0, 8.6, 3.6, 0, 3.6, C.metal), caja(0, 2.6, 1.5, 1.6, 1.5, 3, C.negro)], zona: { tipo: "boton", cx: 0, cy: 0, w: 8.6, h: 3.6, z0: 0, z1: 3.6, salida: "+Y", holgura: 5 } }) },
    { id: "buzzer", g: "Interfaz", n: "Buzzer", params: [P("d", "Diámetro", 12, 8, 30), P("alto", "Alto", 9.5, 3, 15)], gen: p => ({ prim: [cil(0, 0, p.d, 0, p.alto, C.negro), cil(0, 0, 2, p.alto, p.alto + 0.1, C.gris)] }) },
    { id: "pantalla", g: "Interfaz", n: "Pantalla (OLED/LCD)", params: [P("w", "Ancho módulo", 27, 10, 120), P("h", "Alto módulo", 27, 10, 90), P("aw", "Área visible ancho", 22, 5, 110), P("ah", "Área visible alto", 11, 5, 80), P("alto", "Alto sobre la placa", 4, 1, 15)], gen: p => ({ prim: [caja(0, 0, p.w, p.h, 0, p.alto - 1.2, C.azulPcb), caja(0, 0, p.aw + 2, p.ah + 2, p.alto - 1.2, p.alto, C.negro)], zona: { tipo: "otra", cx: 0, cy: 0, w: p.aw, h: p.ah, z0: 0, z1: p.alto, salida: "+Z", holgura: 1 } }) },
    // Potencia
    { id: "sot223", g: "Potencia", n: "Regulador SOT-223", params: [], gen: () => ({ prim: [caja(0, -0.6, 6.5, 3.5, 0, 1.8, C.negro), caja(0, 2.4, 3, 1.6, 0, 0.3, C.metal)], zona: { tipo: "calor", cx: 0, cy: 0, w: 6.5, h: 7, z0: 0, z1: 1.8, salida: "+Z", holgura: 8 } }) },
    { id: "to220", g: "Potencia", n: "TO-220 (vertical)", params: [], gen: () => ({ prim: [caja(0, 0, 10, 4.5, 3, 12, C.negro), caja(0, 1.6, 10, 1.3, 3, 18.5, C.metal)], zona: { tipo: "calor", cx: 0, cy: 0, w: 10, h: 4.5, z0: 0, z1: 18.5, salida: "+Z", holgura: 10 } }) },
    { id: "disipador", g: "Potencia", n: "Disipador", params: [P("w", "Largo", 20, 5, 80), P("h", "Ancho", 15, 5, 80), P("alto", "Alto", 10, 2, 40)], gen: p => ({ prim: [caja(0, 0, p.w, p.h, 0, p.alto, C.metal)], zona: { tipo: "calor", cx: 0, cy: 0, w: p.w, h: p.h, z0: 0, z1: p.alto, salida: "+Z", holgura: 10 } }) },
    { id: "rele", g: "Potencia", n: "Relé (tipo SRD)", params: [], gen: () => ({ prim: [caja(0, 0, 19, 15.5, 0, 15.3, C.azul)] }) },
    // Accesorios
    { id: "separador", g: "Accesorios", n: "Separador (standoff)", params: [P("d", "Ø exterior", 5, 3, 10), P("alto", "Alto", 10, 2, 40)], gen: p => ({ prim: [cil(0, 0, p.d, 0, p.alto, C.oro)] }) },
    { id: "tornillo", g: "Accesorios", n: "Cabeza de tornillo", params: [P("m", "Métrica (M)", 3, 2, 5, 0.5)], gen: p => ({ prim: [cil(0, 0, p.m * 1.8, 0, p.m * 0.7, C.metal)] }) },
    { id: "tuerca", g: "Accesorios", n: "Tuerca", params: [P("m", "Métrica (M)", 3, 2, 5, 0.5)], gen: p => ({ prim: [cil(0, 0, p.m * 1.9, 0, p.m * 0.8, C.metal)] }) },
    { id: "antena", g: "Accesorios", n: "Antena (varilla)", params: [P("d", "Diámetro", 8, 3, 15), P("largo", "Largo", 50, 10, 200)], gen: p => ({ prim: [cil(0, 0, p.d, 0, p.largo, C.negro)], zona: { tipo: "antena", cx: 0, cy: 0, w: p.d, h: p.d, z0: 0, z1: p.largo, salida: "+Z", holgura: 10 } }) },
    { id: "portapilas_18650", g: "Accesorios", n: "Portapilas 18650", params: [], gen: () => ({ prim: [caja(0, 0, 77, 21, 0, 4, C.negro), cil(0, 0, 18.4, 2, 20.4, C.azul)] }) },
    // Formas libres
    { id: "f_caja", g: "Formas libres", n: "Caja / rectángulo", params: [P("w", "Largo X", 10, 0.2, 300), P("h", "Ancho Y", 6, 0.2, 300), P("alto", "Alto Z", 3, 0.1, 100), P("r", "Radio esquinas", 0, 0, 50), P("color", "Color", "#64748b", null, null, null, "color")], gen: p => ({ prim: [caja(0, 0, p.w, p.h, 0, p.alto, p.color, p.r || 0)] }) },
    { id: "f_cil", g: "Formas libres", n: "Cilindro / círculo", params: [P("d", "Diámetro", 6, 0.2, 300), P("alto", "Alto Z", 3, 0.1, 100), P("color", "Color", "#64748b", null, null, null, "color")], gen: p => ({ prim: [cil(0, 0, p.d, 0, p.alto, p.color)] }) },
  ];
  const BYID = Object.fromEntries(LIB.map(t => [t.id, t]));
  const GRUPOS = ["Conectores", "Chips", "Pasivos", "Interfaz", "Potencia", "Accesorios", "Formas libres"];

  function plantilla(id) {
    if (BYID[id]) return BYID[id];
    const u = (window.Store && Store.db.plantillas || []).find(t => t.id === id);
    if (u) return { id: u.id, g: "Mis plantillas", n: u.nombre, params: [], propia: true, gen: () => ({ prim: u.prim || [], zona: u.zona || null, pines: u.pines || [] }) };
    return null;
  }
  function todas() { return LIB.concat((window.Store && Store.db.plantillas || []).map(u => plantilla(u.id))); }
  function paramsDef(t) { return Object.fromEntries((t.params || []).map(p => [p.k, p.def])); }

  // -------- transformaciones
  const r2 = v => (Math.round(v * 1000) / 1000) || 0;
  function rotar(x, y, rot) { const a = (rot || 0) * Math.PI / 180, c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a)); return [x * c - y * s, x * s + y * c]; }
  function rotDir(d, rot) { const ord = ["+X", "+Y", "-X", "-Y"]; const i = ord.indexOf(d); return i < 0 ? d : ord[(i + Math.round((rot || 0) / 90) + 4) % 4]; }
  function geom(pz) {
    const t = plantilla(pz.plantilla); if (!t) return { prim: [], zona: null, pines: [] };
    const p = Object.assign(paramsDef(t), pz.params || {});
    try { const g = t.gen(p); return { prim: g.prim || [], zona: g.zona || null, pines: g.pines || [] }; } catch (e) { return { prim: [], zona: null, pines: [] }; }
  }
  /** Primitivas en coordenadas del mundo (z absoluto). */
  function cuerposDe(pz, esp) {
    const g = geom(pz), off = +pz.z || 0, B = pz.cara === "B";
    return g.prim.map(q => {
      const [x, y] = rotar(q.cx, q.cy, pz.rot); const sw = (pz.rot / 90) % 2 === 1;
      const z0 = B ? -(q.z1 + off) : esp + q.z0 + off, z1 = B ? -(q.z0 + off) : esp + q.z1 + off;
      const o = { f: q.f, cx: r2(pz.x + x), cy: r2(pz.y + y), z0: r2(z0), z1: r2(z1), color: q.color, pieza: pz.id };
      if (q.f === "cil") o.d = q.d; else { o.w = sw ? q.h : q.w; o.h = sw ? q.w : q.h; if (q.r) o.r = q.r; }
      return o;
    });
  }
  function huella(pz) { // rectángulo envolvente en planta (mundo)
    const cs = cuerposDe(pz, 0); if (!cs.length) return null;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const c of cs) { const w = c.f === "cil" ? c.d : c.w, h = c.f === "cil" ? c.d : c.h; x0 = Math.min(x0, c.cx - w / 2); x1 = Math.max(x1, c.cx + w / 2); y0 = Math.min(y0, c.cy - h / 2); y1 = Math.max(y1, c.cy + h / 2); }
    return { x0, y0, x1, y1 };
  }

  // -------- Fase 4: tipos de base (la "pieza madre" sobre la que se colocan las demás)
  const BASES = {
    placa: { n: "Placa (PCB)", ic: "▭", def: { forma: "rect", L: 30, W: 20, d: 30, espesor: 1.6, radio: 0, color: "#166534" } },
    prisma: { n: "Prisma / caja", ic: "▣", def: { forma: "rect", L: 40, W: 25, d: 25, espesor: 15, radio: 0, color: "#475569" } },
    cilindro: { n: "Cilindro", ic: "◉", def: { forma: "redonda", L: 25, W: 25, d: 25, espesor: 30, radio: 0, color: "#64748b" } },
    motor: { n: "Motor DC", ic: "⚙", def: { modelo: "130", color: "#9ca3af" } },
    servo: { n: "Servo", ic: "⛭", def: { modelo: "SG90", color: "#1d4ed8" } },
  };
  const MOTORES = {
    "130": { n: "Motor DC 130 (Ø20, 3–6 V)", d: 20, plano: 15, largo: 25, eje_d: 2, eje_l: 8, buje_d: 6.2, buje_l: 1.6, reductor: 0 },
    N20: { n: "Micromotor N20 con reductor", d: 12, plano: 10, largo: 15, eje_d: 3, eje_l: 10, buje_d: 4, buje_l: 1, reductor: 9 },
    "370": { n: "Motor DC 370 (Ø24.4)", d: 24.4, plano: 24.4, largo: 30.5, eje_d: 2.3, eje_l: 11, buje_d: 6.5, buje_l: 2, reductor: 0 },
    TT: { n: "Motorreductor TT amarillo", d: 20, plano: 15, largo: 25, eje_d: 5.4, eje_l: 9, buje_d: 7, buje_l: 0, reductor: 37 },
  };
  const SERVOS = {
    SG90: { n: "SG90 (9 g)", L: 22.8, W: 12.2, alto: 22.7, oL: 32.3, oz0: 15.9, oe: 2.5, sx: 5.4, dome_d: 11.8, dome_h: 4, sp_d: 4.8, sp_h: 3.2, ag: [[-13.9, 0], [13.9, 0]], ag_d: 2.2 },
    MG90S: { n: "MG90S (metálico)", L: 22.8, W: 12.2, alto: 22.5, oL: 32.1, oz0: 15.6, oe: 2.5, sx: 5.4, dome_d: 11.8, dome_h: 4, sp_d: 4.8, sp_h: 3.6, ag: [[-13.85, 0], [13.85, 0]], ag_d: 2.2 },
    MG996R: { n: "MG996R (estándar)", L: 40.7, W: 19.7, alto: 37, oL: 54.5, oz0: 26.5, oe: 2.5, sx: 10.35, dome_d: 20, dome_h: 3, sp_d: 5.8, sp_h: 4, ag: [[-24.75, -5], [-24.75, 5], [24.75, -5], [24.75, 5]], ag_d: 4.4 },
  };
  const tipoBase = b => (b && BASES[b.tipo]) ? b.tipo : "placa";
  /** Información de la base: envolvente en planta, altura de la cara A y primitivas propias (motor/servo). */
  function baseInfo(b) {
    const tipo = tipoBase(b);
    if (tipo === "motor") {
      const m = Object.assign({}, MOTORES[b.modelo] || MOTORES["130"], b.medidas || {}), col = b.color || "#9ca3af";
      const top = r2(m.largo + (m.reductor || 0)), prim = [];
      prim.push(Object.assign(caja(0, 0, m.d, m.plano, 0, m.largo, col, Math.max(0, Math.min(m.plano, m.d) / 2 - 0.05)), { base: true, pieza: "base" }));
      if (m.reductor) prim.push(Object.assign(caja(0, 0, m.d, m.plano, m.largo, top, b.modelo === "TT" ? "#facc15" : C.gris), { base: true, pieza: "base" }));
      if (m.buje_l) prim.push(Object.assign(cil(0, 0, m.buje_d, top, top + m.buje_l, C.metal), { base: true, pieza: "base" }));
      prim.push(Object.assign(cil(0, 0, m.eje_d, top + (m.buje_l || 0), top + (m.buje_l || 0) + m.eje_l, C.metal), { base: true, pieza: "base" }));
      [-1, 1].forEach(s => prim.push(Object.assign(caja(s * m.d * 0.28, 0, 1.4, 0.5, -2.5, 0, C.cobre), { base: true, pieza: "base" })));
      return { tipo, L: m.d, W: m.plano, top, forma: "rect", prim, medidas: m, zonas: [{ tipo: "soldadura", nombre: "Terminales del motor", cx: 0, cy: 0, w: m.d * 0.8, h: 2, z: [-2.5, 0], salida: "-Z", holgura: 8 }] };
    }
    if (tipo === "servo") {
      const m = Object.assign({}, SERVOS[b.modelo] || SERVOS.SG90, b.medidas || {}), col = b.color || "#1d4ed8";
      const prim = [caja(0, 0, m.L, m.W, 0, m.alto, col), Object.assign(caja(0, 0, m.oL, m.W, m.oz0, m.oz0 + m.oe, col), { orejas: true }),
        cil(m.sx, 0, m.dome_d, m.alto, m.alto + m.dome_h, col), cil(m.sx, 0, m.sp_d, m.alto + m.dome_h, m.alto + m.dome_h + m.sp_h, C.blanco)].map(q => Object.assign(q, { base: true, pieza: "base" }));
      return { tipo, L: m.oL, W: m.W, top: m.alto, forma: "rect", prim, medidas: m, agujerosDef: m.ag.map(([x, y]) => ({ x, y, d: m.ag_d })),
        zonas: [{ tipo: "conector", nombre: "Cable del servo", cx: r2(-m.L / 2), cy: 0, w: 2, h: 4, z: [2, 6], salida: "-X", holgura: 20 }, { tipo: "otra", nombre: "Giro del brazo (horn)", cx: m.sx, cy: 0, w: m.dome_d, h: m.dome_d, z: [m.alto + m.dome_h, m.alto + m.dome_h + m.sp_h], salida: "+Z", holgura: 6 }] };
    }
    const red = b.forma === "redonda", L = red ? b.d : b.L, W = red ? b.d : b.W;
    return { tipo, L, W, top: +b.espesor || 1.6, forma: b.forma || "rect", prim: [], zonas: [] };
  }

  /** Recalcula montaje (placa, alturas), zonas automáticas, pines automáticos y cuerpos a partir de c.modelo. */
  function sincronizar(c) {
    const M = c.modelo; if (!M || !M.base) return c;
    const b = M.base, bi = baseInfo(b);
    if (bi.tipo === "motor" || bi.tipo === "servo") { b.L = r2(bi.L); b.W = r2(bi.W); b.espesor = r2(bi.top); b.forma = "rect"; }
    const esp = +b.espesor || 1.6, L = bi.L, W = bi.W;
    c.montaje = Object.assign({ origen: "centro", fijacion: "tornillo", agujeros: [], altura_superior: 0, altura_inferior: 0, holgura_inferior_cableado: 0, nota: "" }, c.montaje || {});
    c.montaje.pcb = [r2(L), r2(W), r2(esp)]; c.montaje.forma = bi.forma || "rect";
    if (bi.tipo !== "placa") c.montaje.base_tipo = bi.tipo; else delete c.montaje.base_tipo;
    if (b.forma === "redondeada" && bi.tipo !== "motor" && bi.tipo !== "servo") c.montaje.radio = b.radio || 0; else delete c.montaje.radio;
    const cuerpos = bi.prim.map(q => Object.assign({}, q)), zonas = bi.zonas.map(z => Object.assign({}, z, { auto: true, pieza: "base", z: z.z.map(r2) })), pines = [];
    const prevPines = {}; (c.pines || []).filter(p => p.pieza).forEach(p => { prevPines[p.pieza + "#" + p.idx] = p; });
    let top = esp, bot = 0;
    cuerpos.forEach(q => { top = Math.max(top, q.z1); bot = Math.min(bot, q.z0); });
    for (const pz of M.piezas || []) {
      const cs = cuerposDe(pz, esp); cuerpos.push(...cs);
      cs.forEach(q => { top = Math.max(top, q.z1); bot = Math.min(bot, q.z0); });
      const g = geom(pz), off = +pz.z || 0, B = pz.cara === "B";
      if (g.zona) {
        const z = g.zona, [x, y] = rotar(z.cx, z.cy, pz.rot), sw = (pz.rot / 90) % 2 === 1;
        let sal = rotDir(z.salida, pz.rot); if (sal === "+Z" && B) sal = "-Z";
        zonas.push({ tipo: z.tipo, nombre: pz.nombre || plantilla(pz.plantilla)?.n || z.tipo, cx: r2(pz.x + x), cy: r2(pz.y + y), w: r2(sw ? z.h : z.w), h: r2(sw ? z.w : z.h),
          z: B ? [r2(-(z.z1 + off)), r2(-(z.z0 + off))] : [r2(esp + z.z0 + off), r2(esp + z.z1 + off)], salida: sal, holgura: z.holgura, auto: true, pieza: pz.id });
      }
      g.pines.forEach((q, i) => {
        const [x, y] = rotar(q.x, q.y, pz.rot), prev = prevPines[pz.id + "#" + i];
        pines.push({ n: prev ? prev.n : `${pz.nombre || pz.plantilla}.${q.n}`, func: prev ? prev.func : "", x: r2(pz.x + x), y: r2(pz.y + y), conector: pz.nombre || plantilla(pz.plantilla)?.n || "", pieza: pz.id, idx: i, cara: pz.cara || "A" });
      });
    }
    c.zonas = (c.zonas || []).filter(z => !z.auto).concat(zonas);
    c.pines = (c.pines || []).filter(p => !p.pieza).concat(pines);
    c.montaje.altura_superior = r2(top - esp); c.montaje.altura_inferior = r2(-bot);
    M.cuerpos = cuerpos;
    return c;
  }

  /** Revisiones: piezas fuera de la placa, encimadas en la misma cara, sobre agujeros. */
  function revisar(c) {
    const M = c.modelo, out = []; if (!M || !M.base) return out;
    const b = M.base, bi = baseInfo(b), L = bi.L, W = bi.W;
    const hs = (M.piezas || []).map(pz => ({ pz, h: huella(pz) })).filter(x => x.h);
    for (const { pz, h } of hs) {
      const fuera = b.forma === "redonda" ? [[h.x0, h.y0], [h.x1, h.y0], [h.x0, h.y1], [h.x1, h.y1]].some(([x, y]) => Math.hypot(x, y) > b.d / 2 + 0.01) : (h.x0 < -L / 2 - 0.01 || h.x1 > L / 2 + 0.01 || h.y0 < -W / 2 - 0.01 || h.y1 > W / 2 + 0.01);
      const tp = plantilla(pz.plantilla), sobresaleOk = (tp && ["micro_usb", "usb_c", "jack_dc"].includes(tp.id)) || /^zona:(usb|conector|antena)/.test(pz.origen || "");
      if (fuera && !sobresaleOk) out.push({ nivel: "amarillo", pieza: pz.id, msg: `${pz.nombre || tp?.n} sale de la placa.` });
      for (const a of (c.montaje && c.montaje.agujeros) || []) {
        const m = a.d / 2 + 1.5; if (a.x + m > h.x0 && a.x - m < h.x1 && a.y + m > h.y0 && a.y - m < h.y1 && !(tp && ["separador", "tornillo", "tuerca"].includes(tp.id))) out.push({ nivel: "rojo", pieza: pz.id, msg: `${pz.nombre || tp?.n} queda sobre el agujero (x ${a.x}, y ${a.y}) o sin espacio para la cabeza del tornillo.` });
      }
    }
    for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) {
      const A = hs[i], B = hs[j]; if ((A.pz.cara || "A") !== (B.pz.cara || "A")) continue;
      const ov = Math.min(A.h.x1, B.h.x1) - Math.max(A.h.x0, B.h.x0), oh = Math.min(A.h.y1, B.h.y1) - Math.max(A.h.y0, B.h.y0);
      if (ov > 0.05 && oh > 0.05 && (+A.pz.z || 0) === (+B.pz.z || 0)) out.push({ nivel: "amarillo", pieza: B.pz.id, msg: `${A.pz.nombre || plantilla(A.pz.plantilla)?.n} y ${B.pz.nombre || plantilla(B.pz.plantilla)?.n} se enciman en la cara ${A.pz.cara || "A"}.` });
    }
    return out;
  }

  /** Modelo inicial a partir del montaje y zonas existentes (componentes ya creados). */
  function desdeMontaje(c) {
    const M = c.montaje && c.montaje.pcb ? c.montaje : null;
    const base = M ? { forma: M.forma || "rect", L: M.pcb[0], W: M.pcb[1], d: M.pcb[0], espesor: M.pcb[2] || 1.6, radio: M.radio || 0, color: "#166534" } : { forma: "rect", L: 30, W: 20, d: 30, espesor: 1.6, radio: 0, color: "#166534" };
    const esp = base.espesor, piezas = [];
    (c.zonas || []).filter(z => !z.auto).forEach((z, i) => {
      const zz = z.z || [esp, esp + 2], B = zz[1] <= 0.01;
      const alto = Math.max(0.2, B ? -zz[0] : zz[1] - Math.max(zz[0], esp)), elev = B ? Math.max(0, -zz[1]) : Math.max(0, zz[0] - esp);
      const col = { usb: "#cbd5e1", conector: "#a78bfa", antena: "#f472b6", boton: "#9ca3af", pines: "#1f2937", calor: "#64748b", sensor: "#34d399", led: "#facc15" }[z.tipo] || "#64748b";
      piezas.push({ id: "z" + (i + 1), plantilla: "f_caja", origen: "zona:" + z.tipo, nombre: z.nombre || z.tipo, cara: B ? "B" : "A", x: z.cx, y: z.cy, rot: 0, z: r2(elev), params: { w: z.w, h: z.h, alto: r2(alto), r: 0, color: col } });
    });
    return { version: 1, base, piezas, nota: piezas.length ? "Piezas iniciales creadas a partir de las zonas del componente." : "" };
  }

  window.MLPlant = { BASES, MOTORES, SERVOS, baseInfo, tipoBase, LIB, GRUPOS, plantilla, todas, paramsDef, geom, cuerposDe, huella, sincronizar, revisar, desdeMontaje, rotar, C };
})();
