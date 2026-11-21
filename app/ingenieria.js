/* MountLab · Ingeniería del proyecto (rigor "de misión"):
   - Presupuestos del sistema con margen y semáforo: potencia, corriente pico, energía y autonomía, masa, térmico, volumen, costo.
   - Derating (reducción de esfuerzo) al estilo de GSFC EEE-INST-002, simplificado para piezas comerciales (COTS).
   - Revisión eléctrica de todo el proyecto: reguladores y baterías, 3.3 V contra 5 V, pines de arranque / solo entrada del ESP32.
   - Requisitos ligados a componentes + matriz de verificación (Análisis / Prueba / Inspección / Demostración).
   - FMEA (modos de falla, efecto, severidad, ocurrencia, detección, RPN) con borrador automático y opción de IA.
   - Control de configuración: versiones congeladas, diferencias y registro.
   - Fabricación: hoja de arnés para soldar (origen/destino, calibre, color, largo según la caja) e inspección basada en
     las buenas prácticas de NASA-STD-8739.4; firmware base (PlatformIO / .ino); costos por subproyecto; informe imprimible;
     solicitud de STEP de la caja. */
(function () {
  let X = {};   // contexto que entrega app.js: esc, comp, cop, precioMin, download, toast, caja(P), ia(system, user), hoy, usuario
  const r0 = v => Math.round(v), r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtI = I => I == null ? "—" : I >= 1000 ? (I / 1000).toFixed(2) + " A" : I >= 1 ? I.toFixed(0) + " mA" : (I * 1000).toFixed(0) + " µA";
  const SEM = { ok: ["🟢", "ok", "Cumple"], amarillo: ["🟡", "warn", "Margen bajo"], rojo: ["🔴", "bad", "No cumple"], na: ["⚪", "", "Sin dato"] };
  const sem = e => `<span class="tag ${SEM[e || "na"][1]}">${SEM[e || "na"][0]} ${SEM[e || "na"][2]}</span>`;
  // estado de un uso relativo (0–1+) contra el límite de derating
  const estadoPct = (pct, lim) => pct == null || isNaN(pct) ? "na" : pct <= lim ? "ok" : pct <= Math.min(1, lim + (1 - lim) / 2) ? "amarillo" : "rojo";

  // ---------------------------------------------------------------- análisis eléctrico de todos los subproyectos
  function analizar(P) {
    const subs = (P.subs || []).map((u, i) => {
      let A = null, calc = null;
      try { A = MLCircuito.analizar(u.circuito); calc = A.calcular(); } catch (e) { console.warn("Análisis", u.nombre, e); }
      if (!calc) return null;
      const redDe = {}; calc.R.forEach(r => r.pins.forEach(k => redDe[k] = r));
      return { u, i, A, calc, redDe };
    }).filter(Boolean);
    const fuentes = [], regs = [], avisos = [];
    for (const s of subs) {
      s.calc.resumenF.forEach(f => fuentes.push(Object.assign({ sub: s.u.nombre }, f)));
      s.calc.regs.filter(g => g.activo).forEach(g => regs.push({ sub: s.u.nombre, ref: g.o.it.ref, nombre: g.o.I.c.nombre, tipo: g.reg.tipo, vin: g.rin ? g.rin.V : null, vout: g.vout, Iout: g.Iout || 0, IoutP: g.IoutP || g.Iout || 0, imax: +g.reg.imax || 1000, P: g.P || 0, Iin: g.Iin || 0 }));
      s.calc.avisos.forEach(a => avisos.push(Object.assign({ sub: s.u.nombre }, a)));
    }
    return { subs, fuentes, regs, avisos };
  }

  // ---------------------------------------------------------------- derating (EEE-INST-002 simplificado para COTS)
  const LIM = { regI: 0.75, ldoP: 0.5, fuente: 0.8, res: 0.5, capCer: 0.6, capEl: 0.8, capTa: 0.5, led: 0.75, vcc: 0.92, cable: 0.75 };
  function derating(AN, arnes) {
    const filas = [], add = (sub, ref, nombre, param, uso, nom, lim, unidad, nota) => { const pct = nom > 0 && uso != null ? uso / nom : null; filas.push({ sub, ref, nombre, param, uso, nom, lim, pct, unidad, nota, estado: nom > 0 && uso != null ? estadoPct(pct, lim) : "na" }); };
    for (const g of AN.regs) {
      add(g.sub, g.ref, g.nombre, "Corriente de salida (pico)", r0(g.IoutP), g.imax, LIM.regI, "mA");
      if (g.tipo === "ldo") add(g.sub, g.ref, g.nombre, "Disipación del LDO (sin disipador ≈1 W)", r2(g.P), 1, LIM.ldoP, "W");
    }
    for (const f of AN.fuentes) add(f.sub, f.ref, f.nombre, "Corriente pico de la fuente/batería", r0(f.Ip), f.Imax, LIM.fuente, "mA");
    for (const s of AN.subs) {
      const vRed = k => (s.redDe[k] || {}).V;
      for (const o of s.calc.ins) {
        const pf = o.I.pf, it = o.it, nm = o.I.c.nombre;
        if (pf.rol === "resistencia" && o.P != null) {
          const pw = /1\/8/.test(nm) ? 0.125 : /1\/4|0805/.test(nm) ? 0.25 : /1\/2/.test(nm) ? 0.5 : (parseFloat((nm.match(/(\d+)\s*W/) || [])[1]) || 0.25);
          add(s.u.nombre, it.ref, "R " + (it.valor || nm), "Potencia disipada", r2(o.P * 1000) / 1000, pw, LIM.res, "W");
        }
        if (pf.rol === "capacitor") {
          const ks = Object.keys(o.I.pos).map(n => it.ref + "." + n), vs = ks.map(vRed).filter(v => v != null), dv = vs.length === 2 ? Math.abs(vs[0] - vs[1]) : vs.length ? Math.max(...vs.map(Math.abs)) : null;
          const t = (it.valor || "") + " " + nm + " " + it.id, m = t.match(/(\d+(?:[.,]\d+)?)\s*V\b/i), vn = m ? parseFloat(m[1].replace(",", ".")) : null;
          const tipo = /t[aá]nt/i.test(t) ? "Ta" : /electrol/i.test(t) ? "El" : "Cer", lim = tipo === "Ta" ? LIM.capTa : tipo === "El" ? LIM.capEl : LIM.capCer;
          if (dv != null) add(s.u.nombre, it.ref, "C " + (it.valor || nm), `Voltaje de trabajo (${{ Ta: "tantalio", El: "electrolítico", Cer: "cerámico" }[tipo]})`, r2(dv), vn, lim, "V", vn ? "" : "Indica el voltaje nominal en el valor (p. ej. «100n 50V»)");
        }
        if (pf.rol === "led" && o.Iled) add(s.u.nombre, it.ref, "LED", "Corriente directa (nominal 20 mA)", r1(o.Iled), 20, LIM.led, "mA");
        if ((pf.rol === "carga" || pf.rol === "mcu") && o.Vcc && pf.rango) add(s.u.nombre, it.ref, nm, "Voltaje de alimentación vs. máximo de operación", o.Vcc, pf.rango[1], LIM.vcc, "V");
      }
    }
    for (const w of (arnes || [])) add(w.sub, w.id, `${w.desde} → ${w.hasta}`, `Corriente en cable ${w.awg} AWG`, r0(w.I), w.cap * 1000, LIM.cable, "mA");
    return filas;
  }

  // ---------------------------------------------------------------- masa
  const VMASA = { "@18650": 46, "@lipo": 20, "@2s": 95, "@switch": 5, "@boton": 2, "@led": 0.4, "@diodo": 0.4, "@mosfet": 2, "@rele": 15, "@ventilador": 15, "@motor": 30, "@dc12": 4 };
  const MASA_ID = [[/18650/, 46], [/21700/, 68], [/portapilas_2x/, 22], [/portapilas_1x/, 12], [/jack_dc/, 3], [/switch|interruptor/, 4], [/header/, 3], [/microsd_\d+gb/, 0.4], [/panel_solar/, 25], [/sg90/, 13], [/xbee_s2c/, 4], [/ov2640/, 2]];
  function masaDe(c, P) {
    const man = ((P.ing || {}).masas || {})[c.id]; if (man != null && man !== "") return { g: +man, fuente: "manual" };
    const e = (c.especificaciones || []).find(x => /peso|masa/i.test(x.param || "")), m = e && String(e.valor).match(/(\d+(?:[.,]\d+)?)\s*(kg|g)\b/i);
    if (m) return { g: parseFloat(m[1].replace(",", ".")) * (/kg/i.test(m[2]) ? 1000 : 1), fuente: "ficha" };
    for (const [re, g] of MASA_ID) if (re.test(c.id)) return { g, fuente: "típica" };
    const mo = c.montaje || {}; if (mo.pcb) { const [L, W, e2] = mo.pcb; return { g: r1(L * W * ((+e2 || 1.6) + 0.5 * ((+mo.altura_superior || 0) + (+mo.altura_inferior || 0))) * 0.0011), fuente: "estimada" }; }
    return null;
  }
  function masa(P, R, arnes) {
    const filas = [];
    for (const b of P.bom || []) {
      const c = X.comp(b.id); if (!c || /^(Herramienta)$/.test(c.tipo) || c.id === "cables_dupont" || /^(Prototipado)$/.test(c.categoria)) continue;
      const m = masaDe(c, P), q = +b.cantidad || 0; if (!q) continue;
      filas.push({ id: c.id, nombre: c.nombre, q, g: m ? m.g : null, total: m ? r1(m.g * q) : null, fuente: m ? m.fuente : "sin dato" });
    }
    const vir = {}; (P.subs || []).forEach(u => u.circuito.inst.forEach(it => { if (VMASA[it.id] != null) vir[it.id] = (vir[it.id] || 0) + 1; }));
    for (const [id, q] of Object.entries(vir)) filas.push({ id, nombre: (MLCircuito.VIRT[id] || {}).nombre || id, q, g: VMASA[id], total: r1(VMASA[id] * q), fuente: "típica", virt: true });
    if (arnes && arnes.length) { const g = arnes.reduce((s, w) => s + w.largo / 1000 * (GM_AWG[w.awg] || 1.5), 0); filas.push({ id: "_arnes", nombre: `Arnés soldado (${arnes.length} cables)`, q: 1, g: r1(g), total: r1(g), fuente: "calculada" }); }
    if (R) {   // caja impresa en PLA (densidad 1.24 g/cm³), paredes macizas + repisas
      const E = R.exterior, I = R.interior, vol = (E.L * E.W * E.H - I.L * I.W * I.H) + (R.n - 1) * I.L * I.W * R.p.repisa, g = vol / 1000 * 1.24 * ((P.ing || {}).relleno || 1);
      filas.push({ id: "_caja", nombre: `Caja ${E.L}×${E.W}×${E.H} mm (PLA)`, q: 1, g: r1(g), total: r1(g), fuente: "calculada" });
    }
    const total = r1(filas.reduce((s, f) => s + (f.total || 0), 0)), sinDato = filas.filter(f => f.total == null).length;
    return { filas, total, sinDato };
  }

  // ---------------------------------------------------------------- térmico (primer orden): convección natural + ventilación
  function termico(P, AN, R) {
    const Pw = AN.fuentes.reduce((s, f) => s + f.V * (f.I || 0) / 1000, 0);
    const Tamb = +((P.ing || {}).tamb ?? 30);
    const bat = (P.bom || []).some(b => /18650|21700|lipo|bateria/i.test(b.id)) || (P.subs || []).some(u => u.circuito.inst.some(it => /@18650|@lipo|@2s/.test(it.id)));
    const carga = (P.bom || []).some(b => /tp4056|bms|cargador/i.test(b.id));
    const Tmax = carga ? 45 : bat ? 60 : 70, porque = carga ? "carga de baterías de litio (0–45 °C)" : bat ? "descarga de baterías de litio (≤60 °C)" : "electrónica comercial (0–70 °C)";
    if (!R) return { P: r2(Pw), Tamb, Tmax, porque, sinCaja: true };
    const E = R.exterior, A = 2 * (E.L * E.W + E.L * E.H + E.W * E.H) / 1e6, h = 5;   // W/m²K: caja plástica, convección natural
    let Av = 0, Qfan = 0;
    for (const e of R.elementos || []) { if (e.tipo === "rejilla") Av += e.w * e.h * 0.5 / 1e6; if (e.tipo === "ventilador") Qfan += 0.0024; }
    const H = R.interior.H / 1000, Q = dT => Qfan + 0.6 * (Av / 2) * Math.sqrt(Math.max(0, 2 * 9.81 * H * dT / (273 + Tamb)));
    const f = dT => h * A * dT + 1.2 * 1005 * Q(dT) * dT - Pw;
    let lo = 0, hi = 300; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (f(m) > 0) hi = m; else lo = m; }
    const dT = (lo + hi) / 2, Tin = Tamb + dT, margen = Tmax - Tin;
    return { P: r2(Pw), Tamb, Tmax, porque, A: r2(A * 1e4), Av: r1(Av * 1e6), Qfan, dT: r1(dT), Tin: r1(Tin), margen: r1(margen), estado: margen >= 10 ? "ok" : margen >= 0 ? "amarillo" : "rojo" };
  }

  // ---------------------------------------------------------------- costos por subproyecto y frescura de precios
  function costos(P) {
    const precio = c => { const pm = c && X.precioMin(c); return pm ? +pm.precio_cop : null; };
    const porSub = [], usados = {};
    for (const u of P.subs || []) {
      const cnt = {}; u.circuito.inst.forEach(it => { if (!it.id.startsWith("@")) cnt[it.id] = (cnt[it.id] || 0) + 1; });
      let tot = 0, sin = 0; for (const [id, q] of Object.entries(cnt)) { const p = precio(X.comp(id)); usados[id] = (usados[id] || 0) + q; if (p == null) sin++; else tot += p * q; }
      porSub.push({ nombre: u.nombre, total: tot, sin, n: Object.keys(cnt).length });
    }
    let resto = 0, sinR = 0; for (const b of P.bom || []) { const q = Math.max(0, (+b.cantidad || 0) - (usados[b.id] || 0)); if (!q) continue; const p = precio(X.comp(b.id)); if (p == null) sinR++; else resto += p * q; }
    if (resto || sinR) porSub.push({ nombre: "Fuera de los diagramas (BOM)", total: resto, sin: sinR });
    const hoy = new Date(), meses = f => { const m = String(f || "").match(/(\d{4})-(\d{2})/); return m ? (hoy.getFullYear() - +m[1]) * 12 + (hoy.getMonth() + 1 - +m[2]) : null; };
    const fres = { aldia: 0, estimado: 0, viejo: 0, sin: 0, lista: [] };
    for (const b of P.bom || []) {
      const c = X.comp(b.id); if (!c) continue; const ps = (c.precios || []).filter(p => +p.precio_cop > 0);
      if (!ps.length) { fres.sin++; fres.lista.push({ c, estado: "sin precio" }); continue; }
      const edad = Math.min(...ps.map(p => meses(p.fecha) ?? 99)), est = ps.every(p => p.estimado);
      if (edad > 6) { fres.viejo++; fres.lista.push({ c, estado: `precio de hace ${edad} meses` }); } else if (est) { fres.estimado++; fres.lista.push({ c, estado: "precio estimado" }); } else fres.aldia++;
    }
    return { porSub, total: porSub.reduce((s, x) => s + x.total, 0), fres };
  }

  // ---------------------------------------------------------------- arnés: lista de cables para soldar
  const AWG_CAP = [[28, 0.5], [26, 0.8], [24, 1.2], [22, 2.0], [20, 3.0], [18, 4.5], [16, 6.5]];   // A, conservador (mazo, aislamiento de silicona)
  const OD_AWG = { 28: 0.9, 26: 1.0, 24: 1.3, 22: 1.6, 20: 1.9, 18: 2.3, 16: 2.8 };
  const GM_AWG = { 28: 1.0, 26: 1.5, 24: 2.3, 22: 3.5, 20: 5.3, 18: 8, 16: 12 };   // g/m con silicona
  const TERMO = a => a >= 24 ? "1.6 mm (2:1)" : a >= 20 ? "2.4 mm (2:1)" : "3.2 mm (2:1)";
  function colorDe(r) {
    if (!r) return "Blanco";
    if (r.gnd) return "Negro"; if (r.V != null) return r.V > 5.5 ? "Rojo + etiqueta «" + r.V + " V»" : r.V >= 4.5 ? "Rojo" : "Naranja";
    const t = r.tipos || [];
    return t.includes("sda") ? "Azul" : t.includes("scl") ? "Amarillo" : t.includes("tx") || t.includes("rx") ? "Verde / Blanco (TX/RX)" : t.includes("mosi") ? "Morado" : t.includes("miso") ? "Gris" : t.includes("sck") ? "Café" : t.includes("cs") ? "Rosado" : t.includes("analog") ? "Verde claro" : "Blanco";
  }
  function arnes(P, AN, R, K) {
    const pieza = {}, pref = s => K && K.varios ? (K.usar.indexOf(s.u) >= 0 ? K.usar.indexOf(s.u) + 1 + "·" : "?·") : "";
    if (R) R.piezas.forEach(q => { pieza[q.ref] = q; });
    const out = []; let n = 0;
    for (const s of AN.subs) {
      const Itot = s.calc.resumenF.reduce((a, f) => a + (f.Ip || 0), 0);
      for (const w of s.u.circuito.cables || []) {
        const pa = s.A.pinPos(w.a), pb = s.A.pinPos(w.b); if (!pa || !pb) continue;
        const r = s.redDe[w.a], [ra, na] = s.A.partir(w.a), [rb, nb] = s.A.partir(w.b);
        const I = !r ? 10 : r.gnd ? Itot : r.V != null ? (r.Ip || r.I || 0) : 10;
        const fila = AWG_CAP.find(([, cap]) => I / 1000 <= cap * LIM.cable) || AWG_CAP[AWG_CAP.length - 1], awg = fila[0];
        const qa = pieza[pref(s) + ra], qb = pieza[pref(s) + rb];
        let largo = 120, conCaja = false;
        if (qa && qb) { const c = q => [q.x + q.L / 2, q.y + q.W / 2, (q.z0 || 0) + (q.bajo || 0) + (q.esp || 0)]; const A = c(qa), B = c(qb); largo = Math.max(60, Math.ceil((Math.abs(A[0] - B[0]) + Math.abs(A[1] - B[1]) + Math.abs(A[2] - B[2]) + 40) / 10) * 10); conCaja = true; }
        const nombreDe = ref => { const it = s.u.circuito.inst.find(x => x.ref === ref); const c = it && (it.id.startsWith("@") ? MLCircuito.VIRT[it.id] : X.comp(it.id)); return c ? c.nombre : ref; };
        const notas = [];
        [pa, pb].forEach((q, i) => { const p = q.p || {}; if ((p.cap || []).includes("strapping")) notas.push(`${i ? w.b : w.a} es pin de arranque`); });
        if (r && r.V != null && r.V > 5.5) notas.push("alto voltaje: etiquetar");
        n++;
        out.push({ id: "W" + String(n).padStart(2, "0"), sub: s.u.nombre, a: w.a, b: w.b, desde: `${ra}.${pa.p ? pa.p.et || na : na}`, hasta: `${rb}.${pb.p ? pb.p.et || nb : nb}`, compA: nombreDe(ra), compB: nombreDe(rb),
          red: r ? (r.nombre || (r.gnd ? "GND" : r.V != null ? r.V + " V" : (r.tipos || []).find(t => ["sda", "scl", "tx", "rx", "mosi", "miso", "sck", "cs"].includes(t))?.toUpperCase() || "señal")) : "—",
          V: r ? r.V : null, I, awg, cap: fila[1], color: colorDe(r), largo, conCaja, termo: TERMO(awg), radio: r1(3 * OD_AWG[awg]), notas });
      }
    }
    return out;
  }
  const INSPECCION = [
    ["Pelado", "3 mm de aislamiento retirado, sin hilos cortados ni mellados"],
    ["Estañado", "Hilos estañados antes de soldar; el estaño no sube más allá del aislamiento"],
    ["Soldadura", "Unión lisa y brillante, cóncava, con el contorno de los hilos visible; sin bolas ni puntas"],
    ["Aislamiento", "Separación aislamiento–soldadura ≤ 1 diámetro del cable, sin quemaduras"],
    ["Termoencogible", "Cubre la unión y el aislamiento al menos 3 mm, bien contraído"],
    ["Radio de curvatura", "Mínimo 3 × el diámetro exterior del cable (10 × en coaxial o blindado)"],
    ["Alivio de tensión", "Cable amarrado o pegado a ≤ 25 mm del punto de soldadura; no tira del pad"],
    ["Ruta", "Sin cruzar bordes filosos, alejado de reguladores calientes y de la antena"],
    ["Identificación", "Etiqueta con el número de cable (W##) en ambos extremos"],
    ["Prueba", "Continuidad extremo a extremo y aislamiento contra GND con multímetro; tirón suave"]
  ];

  // ---------------------------------------------------------------- firmware base (PlatformIO / Arduino)
  const LIBS = [
    { re: /bme280/i, lib: "adafruit/Adafruit BME280 Library", inc: "#include <Adafruit_BME280.h>", dec: n => `Adafruit_BME280 ${n};`, ini: n => `  if (!${n}.begin(0x76, &Wire)) Serial.println("${n}: no responde (prueba 0x77)");`, leer: n => `  Serial.printf("${n}: %.2f °C  %.1f %%HR  %.1f hPa\\n", ${n}.readTemperature(), ${n}.readHumidity(), ${n}.readPressure() / 100.0);` },
    { re: /bme680/i, lib: "adafruit/Adafruit BME680 Library", inc: "#include <Adafruit_BME680.h>", dec: n => `Adafruit_BME680 ${n}(&Wire);`, ini: n => `  if (!${n}.begin(0x77)) Serial.println("${n}: no responde (prueba 0x76)");`, leer: n => `  if (${n}.performReading()) Serial.printf("${n}: %.2f °C  %.1f %%HR  %.1f hPa  gas %lu Ω\\n", ${n}.temperature, ${n}.humidity, ${n}.pressure / 100.0, ${n}.gas_resistance);` },
    { re: /mpu6050|gy521/i, lib: "adafruit/Adafruit MPU6050", inc: "#include <Adafruit_MPU6050.h>", dec: n => `Adafruit_MPU6050 ${n};`, ini: n => `  if (!${n}.begin()) Serial.println("${n}: no responde");`, leer: n => `  { sensors_event_t a, g, t; ${n}.getEvent(&a, &g, &t); Serial.printf("${n}: acc %.2f %.2f %.2f m/s²  gyr %.2f %.2f %.2f rad/s\\n", a.acceleration.x, a.acceleration.y, a.acceleration.z, g.gyro.x, g.gyro.y, g.gyro.z); }` },
    { re: /bno055/i, lib: "adafruit/Adafruit BNO055", inc: "#include <Adafruit_BNO055.h>", dec: n => `Adafruit_BNO055 ${n}(55, 0x28, &Wire);`, ini: n => `  if (!${n}.begin()) Serial.println("${n}: no responde");`, leer: n => `  { sensors_event_t e; ${n}.getEvent(&e); Serial.printf("${n}: orientación %.1f %.1f %.1f°\\n", e.orientation.x, e.orientation.y, e.orientation.z); }` },
    { re: /qmc5883/i, lib: "mprograms/QMC5883LCompass", inc: "#include <QMC5883LCompass.h>", dec: n => `QMC5883LCompass ${n};`, ini: n => `  ${n}.init();`, leer: n => `  ${n}.read(); Serial.printf("${n}: rumbo %d°\\n", ${n}.getAzimuth());` },
    { re: /lm75/i, lib: "", inc: "", dec: n => `const uint8_t ${n}_DIR = 0x48;`, ini: () => "", leer: n => `  Wire.beginTransmission(${n}_DIR); Wire.write(0); Wire.endTransmission(); Wire.requestFrom(${n}_DIR, (uint8_t)2);\n  if (Wire.available() == 2) { int16_t v = (Wire.read() << 8) | Wire.read(); Serial.printf("${n}: %.2f °C\\n", (v >> 5) * 0.125); }` },
    { re: /ssd1306|oled/i, lib: "adafruit/Adafruit SSD1306", inc: "#include <Adafruit_SSD1306.h>", dec: n => `Adafruit_SSD1306 ${n}(128, 64, &Wire, -1);`, ini: n => `  if (${n}.begin(SSD1306_SWITCHCAPVCC, 0x3C)) { ${n}.clearDisplay(); ${n}.setTextColor(SSD1306_WHITE); ${n}.setCursor(0, 0); ${n}.print("MountLab"); ${n}.display(); }`, leer: () => "" },
    { re: /gps|neo-?[678m]|max-m10/i, lib: "mikalhart/TinyGPSPlus", inc: "#include <TinyGPSPlus.h>", uart: 9600, dec: n => `TinyGPSPlus ${n};`, ini: () => "", leer: (n, ser) => `  while (${ser}.available()) ${n}.encode(${ser}.read());\n  if (${n}.location.isValid()) Serial.printf("${n}: %.6f, %.6f  alt %.1f m  sat %d\\n", ${n}.location.lat(), ${n}.location.lng(), ${n}.altitude.meters(), ${n}.satellites.value());` },
    { re: /xbee|hc-?12|lora|sim808|sim800|hc-?05|rs232|max3232/i, lib: "", inc: "", uart: 9600, dec: () => "", ini: () => "", leer: (n, ser) => `  ${ser}.printf("t=%lu\\n", millis());   // telemetría de ejemplo por ${n}\n  while (${ser}.available()) Serial.write(${ser}.read());` },
    { re: /microsd|sd_?card|modulo_microsd/i, lib: "", inc: "#include <SD.h>\n#include <SPI.h>", spi: true, dec: () => "", ini: n => `  if (!SD.begin(${n}_CS)) Serial.println("${n}: tarjeta no detectada");`, leer: n => `  { File f = SD.open("/datos.csv", FILE_APPEND); if (f) { f.printf("%lu\\n", millis()); f.close(); } }` },
    { re: /ds18b20/i, lib: "milesburton/DallasTemperature", inc: "#include <OneWire.h>\n#include <DallasTemperature.h>", dec: n => `OneWire ${n}_bus(${n}_DQ);\nDallasTemperature ${n}(&${n}_bus);`, ini: n => `  ${n}.begin();`, leer: n => `  ${n}.requestTemperatures(); Serial.printf("${n}: %.2f °C\\n", ${n}.getTempCByIndex(0));` },
    { re: /dht(11|22)/i, lib: "adafruit/DHT sensor library", inc: "#include <DHT.h>", dec: n => `DHT ${n}(${n}_DATA, DHT22);`, ini: n => `  ${n}.begin();`, leer: n => `  Serial.printf("${n}: %.1f °C  %.1f %%HR\\n", ${n}.readTemperature(), ${n}.readHumidity());` },
    { re: /sg90|servo/i, lib: "madhephaestus/ESP32Servo", inc: "#include <ESP32Servo.h>", dec: n => `Servo ${n};`, ini: (n, pin) => `  ${n}.attach(${pin});`, leer: n => `  ${n}.write((millis() / 20) % 180);` }
  ];
  const ident = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").replace(/^(\d)/, "_$1");
  function firmware(P, AN) {
    const proyectos = [];
    for (const s of AN.subs) {
      const mcu = s.calc.ins.find(o => o.I.pf.rol === "mcu"); if (!mcu) continue;
      const c = mcu.I.c, esp32 = /esp32/i.test(c.id + c.nombre), esp8266 = /esp8266|wemos|d1/i.test(c.id + c.nombre) && !esp32, cam = /cam/i.test(c.id + c.nombre);
      const board = cam ? "esp32cam" : esp32 ? "esp32dev" : esp8266 ? "d1" : /nano/i.test(c.id) ? "nanoatmega328" : /uno/i.test(c.id) ? "uno" : "esp32dev";
      const plataforma = esp32 || cam ? "espressif32" : esp8266 ? "espressif8266" : "atmelavr";
      const defs = [], libs = new Set(), incs = new Set(), decl = [], ini = [], leer = [], tabla = [], avisos = [];
      const gpioDe = k => { const q = s.A.pinPos(k); return q && q.p && q.p.gpio != null ? q.p.gpio : null; };
      const mpins = Object.keys(mcu.I.pos).map(n => mcu.it.ref + "." + n);
      // por cada componente, qué GPIO del MCU toca cada uno de sus pines
      const porComp = {};
      for (const k of mpins) {
        const r = s.redDe[k], g = gpioDe(k); if (!r || g == null || r.gnd || r.V != null) continue;
        for (const o of r.pins) { if (o === k) continue; const [ref, pn] = s.A.partir(o); if (ref === mcu.it.ref) continue; const q = s.A.pinPos(o); (porComp[ref] = porComp[ref] || []).push({ pin: pn, et: (q && q.p && q.p.et) || pn, tipo: q && q.p ? q.p.tipo : "", gpio: g, k }); }
        const q = s.A.pinPos(k); if (q && q.p && (q.p.cap || []).includes("strapping")) avisos.push(`GPIO${g} es pin de arranque: el periférico no debe forzarlo al encender`);
      }
      const i2c = Object.values(porComp).flat(), sda = i2c.find(x => x.tipo === "sda"), scl = i2c.find(x => x.tipo === "scl");
      if (sda && scl) { defs.push(`#define I2C_SDA ${sda.gpio}`, `#define I2C_SCL ${scl.gpio}`); ini.push("  Wire.begin(I2C_SDA, I2C_SCL);"); incs.add("#include <Wire.h>"); }
      const spi = { mosi: i2c.find(x => x.tipo === "mosi"), miso: i2c.find(x => x.tipo === "miso"), sck: i2c.find(x => x.tipo === "sck") };
      if (spi.mosi && spi.miso && spi.sck) { defs.push(`#define SPI_MOSI ${spi.mosi.gpio}`, `#define SPI_MISO ${spi.miso.gpio}`, `#define SPI_SCK ${spi.sck.gpio}`); ini.push("  SPI.begin(SPI_SCK, SPI_MISO, SPI_MOSI);"); incs.add("#include <SPI.h>"); }
      let uarts = 0;
      for (const it of s.u.circuito.inst) {
        if (it.ref === mcu.it.ref) continue; const L = porComp[it.ref] || [];
        const cc = it.id.startsWith("@") ? Object.assign({ id: it.id }, MLCircuito.VIRT[it.id]) : X.comp(it.id); if (!cc) continue;
        const N = ident(it.ref + "_" + (it.id.startsWith("@") ? it.id.slice(1) : (cc.id.split("_")[0] || "")));
        const lib = LIBS.find(l => l.re.test(cc.id + " " + cc.nombre));
        L.forEach(x => { if (!["sda", "scl", "mosi", "miso", "sck"].includes(x.tipo)) defs.push(`#define ${N}_${ident(x.et)} ${x.gpio}`); });
        L.forEach(x => tabla.push([it.ref, cc.nombre, x.et, "GPIO" + x.gpio]));
        if (lib) {
          if (lib.lib) libs.add(lib.lib); if (lib.inc) lib.inc.split("\n").forEach(l => incs.add(l));
          let ser = null;
          if (lib.uart) {
            const tx = L.find(x => x.tipo === "tx"), rx = L.find(x => x.tipo === "rx");   // TX del módulo → RX del MCU
            if (tx || rx) { uarts++; ser = esp32 || cam ? (uarts === 1 ? "Serial2" : "Serial1") : "SerialExt"; if (esp32 || cam) ini.push(`  ${ser}.begin(${lib.uart}, SERIAL_8N1, ${tx ? tx.gpio : -1}, ${rx ? rx.gpio : -1});   // ${it.ref}: RX del MCU ← TX del módulo`); else { incs.add("#include <SoftwareSerial.h>"); decl.push(`SoftwareSerial SerialExt(${tx ? tx.gpio : -1}, ${rx ? rx.gpio : -1});`); ini.push(`  SerialExt.begin(${lib.uart});`); } }
          }
          if (lib.spi) { const cs = L.find(x => x.tipo === "cs"); defs.push(`#define ${N}_CS ${cs ? cs.gpio : 5}`); }
          const d = lib.dec(N); if (d) decl.push(d);
          const pin0 = L.find(x => !["sda", "scl", "tx", "rx", "mosi", "miso", "sck"].includes(x.tipo));
          const i0 = lib.ini(N, pin0 ? pin0.gpio : 0); if (i0) ini.push(i0);
          const l0 = lib.leer(N, ser || "Serial2"); if (l0) leer.push(l0);
        } else if (/@led|led/i.test(cc.id) && L.length) { const p = L[0]; ini.push(`  pinMode(${p.gpio}, OUTPUT);   // ${it.ref} LED`); leer.push(`  digitalWrite(${p.gpio}, (millis() / 500) % 2);   // ${it.ref} parpadea`); }
        else if (/@boton|pulsador|boton/i.test(cc.id) && L.length) { const p = L[0]; ini.push(`  pinMode(${p.gpio}, INPUT_PULLUP);   // ${it.ref} botón a GND`); leer.push(`  if (digitalRead(${p.gpio}) == LOW) Serial.println("${it.ref}: presionado");`); }
        else if (/@rele|@mosfet|rele|relay/i.test(cc.id) && L.length) { const p = L[0]; ini.push(`  pinMode(${p.gpio}, OUTPUT); digitalWrite(${p.gpio}, LOW);   // ${it.ref} apagado al arrancar`); }
        else if (L.length) leer.push(`  // TODO ${it.ref} ${cc.nombre}: pines ${L.map(x => x.et + "=GPIO" + x.gpio).join(", ")}`);
        else if (!it.id.startsWith("@") && !["fuente", "regulador", "resistencia", "capacitor", "pasivo", "interruptor", "diodo"].includes(MLCircuito.perfil(cc).rol)) avisos.push(`${it.ref} ${cc.nombre} no está conectado a ningún GPIO del MCU`);
      }
      const titulo = `${P.nombre} · ${s.u.nombre}`;
      const main = `/* ${titulo}
 * Firmware base generado por MountLab el ${new Date().toISOString().slice(0, 10)} desde el diagrama de conexiones.
 * Placa: ${c.nombre} (${board}). Revisa los TODO antes de cargarlo.
 */
#include <Arduino.h>
${[...incs].join("\n")}

// ---------- pines (según el diagrama)
${defs.join("\n") || "// (sin pines de señal conectados al MCU)"}

${decl.join("\n")}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("${titulo.replace(/"/g, "'")}");
${ini.join("\n")}
}

void loop() {
${leer.join("\n") || "  // lee aquí tus sensores"}
  delay(1000);
}
`;
      const ini2 = `; ${titulo} · generado por MountLab
[env:${board}]
platform = ${plataforma}
board = ${board}
framework = arduino
monitor_speed = 115200
${libs.size ? "lib_deps =\n" + [...libs].map(l => "  " + l).join("\n") : ""}
`;
      const readme = `# ${titulo}\n\nFirmware base generado por MountLab desde el diagrama.\n\n## Cómo usarlo\n1. Abre esta carpeta en VS Code con PlatformIO (o copia \`src/main.cpp\` en el IDE de Arduino como \`.ino\`).\n2. Conecta la placa por USB y pulsa *Upload*; abre el monitor serie a 115200.\n\n## Pines\n| Ref. | Componente | Pin | MCU |\n|---|---|---|---|\n${tabla.map(r => `| ${r.join(" | ")} |`).join("\n")}\n\n${avisos.length ? "## Avisos\n" + avisos.map(a => "- " + a).join("\n") + "\n" : ""}\n## Librerías\n${[...libs].map(l => "- " + l).join("\n") || "- (ninguna extra)"}\n`;
      proyectos.push({ sub: s.u.nombre, board, plataforma, mcu: c.nombre, main, ini: ini2, readme, tabla, avisos, libs: [...libs], carpeta: ident(P.id + "_" + s.u.nombre).toLowerCase() });
    }
    return proyectos;
  }

  // ---------------------------------------------------------------- ZIP sin compresión (para el proyecto PlatformIO)
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(archivos) {
    const enc = new TextEncoder(), partes = [], central = []; let off = 0;
    for (const [nombre, texto] of archivos) {
      const nb = enc.encode(nombre), d = enc.encode(texto), crc = crc32(d), h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint32(14, crc, true); h.setUint32(18, d.length, true); h.setUint32(22, d.length, true); h.setUint16(26, nb.length, true);
      partes.push(new Uint8Array(h.buffer), nb, d);
      const cdir = new DataView(new ArrayBuffer(46)); cdir.setUint32(0, 0x02014b50, true); cdir.setUint16(4, 20, true); cdir.setUint16(6, 20, true); cdir.setUint16(8, 0x0800, true); cdir.setUint32(16, crc, true); cdir.setUint32(20, d.length, true); cdir.setUint32(24, d.length, true); cdir.setUint16(28, nb.length, true); cdir.setUint32(42, off, true);
      central.push(new Uint8Array(cdir.buffer), nb); off += 30 + nb.length + d.length;
    }
    const tam = central.reduce((s, x) => s + x.length, 0), fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true); fin.setUint32(12, tam, true); fin.setUint32(16, off, true);
    return new Blob([...partes, ...central, new Uint8Array(fin.buffer)], { type: "application/zip" });
  }

  // ---------------------------------------------------------------- requisitos y verificación
  const TIPOS_REQ = {
    funcional: ["Funcional", "", null], autonomia_h: ["Autonomía mínima", "h", "≥"], masa_g: ["Masa máxima", "g", "≤"], temp_c: ["Temperatura interior máxima", "°C", "≤"],
    corriente_ma: ["Corriente pico máxima (total)", "mA", "≤"], potencia_w: ["Potencia típica máxima", "W", "≤"], volumen_cm3: ["Volumen exterior máximo", "cm³", "≤"],
    largo_mm: ["Largo exterior máximo", "mm", "≤"], ancho_mm: ["Ancho exterior máximo", "mm", "≤"], alto_mm: ["Alto exterior máximo", "mm", "≤"], costo_cop: ["Costo máximo", "COP", "≤"], derating: ["Todas las piezas dentro del derating", "", null]
  };
  const METODOS = ["Análisis", "Prueba", "Inspección", "Demostración"];
  function medir(tipo, B) {
    const E = B.R && B.R.exterior;
    return { autonomia_h: B.autonomia, masa_g: B.masa.total, temp_c: B.term.Tin, corriente_ma: B.Ipico, potencia_w: B.Ptip, volumen_cm3: E ? r1(E.L * E.W * E.H / 1000) : null, largo_mm: E ? E.L : null, ancho_mm: E ? E.W : null, alto_mm: E ? E.H : null, costo_cop: B.cost.total, derating: B.der.filter(f => f.estado === "rojo").length }[tipo];
  }
  function evaluarReq(q, B) {
    const T = TIPOS_REQ[q.tipo] || TIPOS_REQ.funcional, m = medir(q.tipo, B);
    if (q.tipo === "derating") return { m: m + " fuera de límite", ok: m === 0 };
    if (!T[2] || m == null || q.valor === "" || q.valor == null) return { m: m == null ? null : m, ok: null };
    return { m, ok: T[2] === "≥" ? m >= +q.valor : m <= +q.valor };
  }

  // ---------------------------------------------------------------- FMEA: borrador por reglas
  function fmeaBorrador(P, AN, der) {
    const filas = [], vistos = new Set(), pct = ref => Math.max(0, ...der.filter(d => d.ref === ref && d.pct != null).map(d => d.pct));
    const add = (ref, comp, modo, efecto, causa, S, O, D, accion) => { const k = ref + "|" + modo; if (vistos.has(k)) return; vistos.add(k); filas.push({ ref, comp, modo, efecto, causa, S, O, D, accion, auto: true }); };
    for (const s of AN.subs) for (const o of s.calc.ins) {
      const pf = o.I.pf, ref = (AN.subs.length > 1 ? s.u.nombre + "/" : "") + o.it.ref, nm = o.I.c.nombre, t = o.it.id + " " + nm;
      if (pf.rol === "fuente" && /18650|lipo|2s|bater/i.test(t)) { add(ref, nm, "Sobredescarga de la batería", "Apagado o reinicios en plena operación", "Consumo mayor al previsto o sin corte por bajo voltaje", 8, 4, 5, "BMS o corte por bajo voltaje; medir la batería con un ADC y avisar por telemetría"); add(ref, nm, "Cortocircuito en la salida", "Calentamiento, daño de cables o de la celda", "Aislamiento roto, soldadura que toca otra pista", 10, 2, 4, "Fusible o PTC en serie; termoencogible y aislamiento de los terminales"); }
      if (pf.rol === "regulador") { const u = pct(o.it.ref); add(ref, nm, "Sobrecorriente o sobretemperatura", "Caída del voltaje de salida y reinicios", "Carga por encima de su capacidad o mala disipación", 7, u > 0.9 ? 7 : u > 0.75 ? 5 : 2, 4, "Mantener ≥ 25 % de margen de corriente; disipador o regulador conmutado");
        if (pf.reg && pf.reg.ajustable) add(ref, nm, "Salida ajustable desajustada", "Sobrevoltaje en las cargas", "El trimmer se mueve por vibración", 9, 3, 5, "Ajustar y medir antes de conectar cargas; fijar el trimmer con barniz o silicona"); }
      if (pf.rol === "mcu") { add(ref, nm, "Reinicio por caída de voltaje (brownout)", "Pérdida de datos y de control", "Picos de Wi-Fi/BT o de motores", 6, 4, 5, "Capacitor 470–1000 µF cerca de la alimentación; fuente con margen; registrar el motivo del reinicio"); add(ref, nm, "Firmware bloqueado", "Sistema sin respuesta", "Error de software o periférico colgado", 7, 3, 6, "Watchdog activo; tiempos de espera en todas las lecturas"); }
      if (pf.rol === "carga" && /bme|bmp|mpu|bno|qmc|lm75|i2c|ssd1306|oled/i.test(t)) add(ref, nm, "Sensor I2C no responde / bus bloqueado", "Datos faltantes o congelados", "Cables largos, pull-ups débiles, sensor dañado", 5, 3, 4, "Reintentos y reinicio del bus; pull-ups 4.7 kΩ; cables cortos y trenzados con GND");
      if (/xbee|hc-?12|lora|sim808|gps|max-m10|rf/i.test(t)) add(ref, nm, "Pérdida de enlace o de fijación", "Sin telemetría o sin posición", "Antena tapada, orientación, interferencia", 6, 5, 3, "Antena despejada, lejos de metal; contador de paquetes en la telemetría; guardar también en microSD");
      if (/microsd|sd_card|modulo_microsd/i.test(t)) add(ref, nm, "Corrupción de datos", "Pérdida del registro de la misión", "Corte de energía mientras escribe", 7, 4, 6, "Cerrar o vaciar el archivo en cada escritura; detectar bajo voltaje y dejar de escribir");
      if (pf.motor || /servo|motor|ventilador/i.test(t)) add(ref, nm, "Ruido o pico de arranque", "Reinicio del MCU o lecturas falsas", "Corriente de arranque y ruido inductivo", 6, 5, 4, "Alimentación separada con tierra común; diodo de rueda libre; capacitor en bornes");
      if (/switch|interruptor|jack|conector/i.test(t)) add(ref, nm, "Contacto intermitente", "Apagados aleatorios", "Vibración, contacto sucio o flojo", 6, 3, 5, "Interruptor con margen de corriente; fijación mecánica; prueba de vibración");
    }
    if ((P.subs || []).some(u => (u.circuito.cables || []).length)) add("Arnés", "Cables soldados", "Fractura de la soldadura o del cable", "Circuito abierto intermitente", "Vibración, flexión repetida, sin alivio de tensión", 8, 4, 6, "Alivio de tensión a ≤ 25 mm, termoencogible, radio de curvatura ≥ 3×D; inspección de cada cable (hoja de arnés)");
    return filas;
  }

  // ---------------------------------------------------------------- versiones congeladas
  const sinVersiones = P => { const o = JSON.parse(JSON.stringify(P)); delete o.versiones; delete o.historial; return o; };
  function diferencias(a, b) {   // a = versión anterior, b = actual
    const out = [], bom = x => Object.fromEntries((x.bom || []).map(i => [i.id, +i.cantidad || 0]));
    const A = bom(a), B = bom(b);
    for (const id of new Set([...Object.keys(A), ...Object.keys(B)])) { const n = (X.comp(id) || {}).nombre || id; if (!(id in A)) out.push(`＋ BOM: ${n} × ${B[id]}`); else if (!(id in B)) out.push(`− BOM: ${n}`); else if (A[id] !== B[id]) out.push(`± BOM: ${n} ${A[id]} → ${B[id]}`); }
    const subs = x => Object.fromEntries((x.subs || []).map(u => [u.id, u]));
    const SA = subs(a), SB = subs(b);
    for (const id of new Set([...Object.keys(SA), ...Object.keys(SB)])) {
      const u = SA[id], v = SB[id]; if (!u) { out.push(`＋ Subproyecto «${v.nombre}»`); continue; } if (!v) { out.push(`− Subproyecto «${u.nombre}»`); continue; }
      const ia = new Set(u.circuito.inst.map(i => i.ref + ":" + i.id)), ib = new Set(v.circuito.inst.map(i => i.ref + ":" + i.id));
      [...ib].filter(x => !ia.has(x)).forEach(x => out.push(`＋ ${v.nombre}: ${x.split(":")[0]} (${x.split(":")[1]})`));
      [...ia].filter(x => !ib.has(x)).forEach(x => out.push(`− ${v.nombre}: ${x.split(":")[0]} (${x.split(":")[1]})`));
      const ca = new Set(u.circuito.cables.map(w => [w.a, w.b].sort().join("—"))), cb = new Set(v.circuito.cables.map(w => [w.a, w.b].sort().join("—")));
      const mas = [...cb].filter(x => !ca.has(x)), menos = [...ca].filter(x => !cb.has(x));
      if (mas.length) out.push(`＋ ${v.nombre}: ${mas.length} cable(s): ${mas.slice(0, 6).join(", ")}${mas.length > 6 ? "…" : ""}`);
      if (menos.length) out.push(`− ${v.nombre}: ${menos.length} cable(s): ${menos.slice(0, 6).join(", ")}${menos.length > 6 ? "…" : ""}`);
      const cv = (x, k) => x.circuito.inst.filter(i => i.conexion === "jumper").map(i => i.ref).join(",");
      if (cv(u) !== cv(v)) out.push(`± ${v.nombre}: versión de conexión (jumper: ${cv(v) || "ninguno"})`);
    }
    if (JSON.stringify(a.caja || {}) !== JSON.stringify(b.caja || {})) out.push("± Caja: parámetros, elementos o disposición");
    const rq = x => JSON.stringify((x.ing || {}).requisitos || []), fm = x => JSON.stringify((x.ing || {}).fmea || []);
    if (rq(a) !== rq(b)) out.push("± Requisitos o matriz de verificación"); if (fm(a) !== fm(b)) out.push("± FMEA");
    if ((a.nombre || "") !== (b.nombre || "")) out.push(`± Nombre: «${a.nombre}» → «${b.nombre}»`);
    if ((a.estado || "") !== (b.estado || "")) out.push(`± Estado: ${a.estado} → ${b.estado}`);
    return out;
  }

  // ---------------------------------------------------------------- todo junto
  function balance(P) {
    const AN = analizar(P), K = X.caja ? X.caja(P) : null, R = K && K.R;
    const ar = arnes(P, AN, R, K), der = derating(AN, ar), m = masa(P, R, ar), term = termico(P, AN, R), cost = costos(P);
    const Ptip = r2(AN.fuentes.reduce((s, f) => s + f.V * (f.I || 0) / 1000, 0)), Ppico = r2(AN.fuentes.reduce((s, f) => s + f.V * (f.Ip || 0) / 1000, 0));
    const Ipico = r0(AN.fuentes.reduce((s, f) => s + (f.Ip || 0), 0));
    const bats = AN.fuentes.filter(f => f.mAh), autonomia = bats.length ? r1(Math.min(...bats.map(f => f.horas || Infinity))) : null, Wh = r2(bats.reduce((s, f) => s + f.mAh * f.V / 1000, 0));
    return { AN, R, K, arnes: ar, der, masa: m, term, cost, Ptip, Ppico, Ipico, autonomia: autonomia === Infinity ? null : autonomia, Wh };
  }

  // ---------------------------------------------------------------- vista: pestaña 🛡 Ingeniería
  function vista(host, P, cabecera, sec) {
    P.ing = P.ing || {}; P.ing.requisitos = P.ing.requisitos || []; P.ing.fmea = P.ing.fmea || []; P.ing.masas = P.ing.masas || {};
    const B = balance(P), ui = X.ui || (X.ui = { sec: "presupuestos" }); if (sec) ui.sec = sec;
    const reqs = P.ing.requisitos.map(q => Object.assign({ ev: evaluarReq(q, B) }, q));
    const reqDe = tipo => P.ing.requisitos.find(q => q.tipo === tipo && q.valor !== "" && q.valor != null);
    const fila = (n, val, lim, est, nota) => `<tr><td>${n}</td><td class="num"><b>${val}</b></td><td class="num">${lim || "—"}</td><td>${est ? sem(est) : '<span class="small muted">sin requisito</span>'}</td><td class="small muted">${nota || ""}</td></tr>`;
    const estReq = (tipo, m) => { const q = reqDe(tipo); if (!q || m == null) return null; const T = TIPOS_REQ[tipo]; const ok = T[2] === "≥" ? m >= +q.valor : m <= +q.valor; const marg = T[2] === "≥" ? (m - q.valor) / q.valor : (q.valor - m) / q.valor; return !ok ? "rojo" : marg < 0.1 ? "amarillo" : "ok"; };
    const derR = B.der.filter(d => d.estado === "rojo").length, derA = B.der.filter(d => d.estado === "amarillo").length;
    const avR = B.AN.avisos.filter(a => a.nivel === "rojo").length, avA = B.AN.avisos.length - avR;
    const fm = P.ing.fmea.map(f => Object.assign({ rpn: (+f.S || 0) * (+f.O || 0) * (+f.D || 0) }, f)), fmR = fm.filter(f => f.rpn >= 120).length;
    const reqOk = reqs.filter(q => q.estado === "aprobado" || (q.ev.ok === true && q.metodo === "Análisis")).length;
    const tarjeta = (ic, t, v, s2, est, d) => `<button class="ing-k ${est || ""}" ${d ? `data-isec="${d}"` : ""}><span>${ic} ${t}</span><b>${v}</b><small>${s2}</small></button>`;
    const kEst = (r, a) => r ? "bad" : a ? "warn" : "ok";
    host.innerHTML = `<div class="ing-ks">
        ${tarjeta("⚡", "Potencia", B.Ptip + " W", `pico ${B.Ppico} W · ${fmtI(B.Ipico)}`, kEst(estReq("potencia_w", B.Ptip) === "rojo", 0), "presupuestos")}
        ${tarjeta("🔋", "Autonomía", B.autonomia != null ? B.autonomia + " h" : "—", B.Wh ? `${B.Wh} Wh en baterías` : "sin batería en el diagrama", { rojo: "bad", amarillo: "warn", ok: "ok" }[estReq("autonomia_h", B.autonomia)] || "", "presupuestos")}
        ${tarjeta("⚖", "Masa", B.masa.total + " g", B.masa.sinDato ? `${B.masa.sinDato} pieza(s) sin dato` : "estimada", { rojo: "bad", amarillo: "warn", ok: "ok" }[estReq("masa_g", B.masa.total)] || "", "presupuestos")}
        ${tarjeta("🌡", "Térmico", B.term.Tin != null ? B.term.Tin + " °C" : "—", B.term.Tin != null ? `interior · límite ${B.term.Tmax} °C` : "elige una caja", { ok: "ok", amarillo: "warn", rojo: "bad" }[B.term.estado] || "", "presupuestos")}
        ${tarjeta("📉", "Derating", derR + derA ? `${derR} 🔴 ${derA} 🟡` : "✓", `${B.der.length} piezas revisadas`, kEst(derR, derA), "derating")}
        ${tarjeta("🩺", "Revisión eléctrica", avR + avA ? `${avR} 🔴 ${avA} 🟡` : "✓", `${B.AN.subs.length} circuito(s)`, kEst(avR, avA), "electrica")}
        ${tarjeta("📋", "Requisitos", `${reqOk}/${reqs.length}`, reqs.length ? "verificados" : "agrega requisitos", reqs.some(q => q.ev.ok === false || q.estado === "fallido") ? "bad" : reqs.length && reqOk === reqs.length ? "ok" : "", "requisitos")}
        ${tarjeta("⚠", "FMEA", fm.length ? `${fm.length} modos` : "—", fm.length ? `${fmR} con RPN ≥ 120` : "genera el borrador", fmR ? "bad" : "", "fmea")}
        ${tarjeta("💰", "Costo", X.cop(B.cost.total), `${B.cost.fres.viejo + B.cost.fres.estimado + B.cost.fres.sin} precio(s) por revisar`, { rojo: "bad", amarillo: "warn", ok: "ok" }[estReq("costo_cop", B.cost.total)] || "", "presupuestos")}
      </div>
      <div class="tabs" style="margin:12px 0 10px">${[["presupuestos", "Presupuestos"], ["derating", "Derating"], ["electrica", "Revisión eléctrica"], ["requisitos", "Requisitos y verificación"], ["fmea", "FMEA"]].map(([k, n]) => `<button data-isec="${k}" class="${ui.sec === k ? "on" : ""}">${n}</button>`).join("")}</div>
      <div id="ingSec"></div>`;
    const S = host.querySelector("#ingSec"), repinta = () => { cabecera(); vista(host, P, cabecera); };
    host.querySelectorAll("[data-isec]").forEach(b => b.onclick = () => { ui.sec = b.dataset.isec; vista(host, P, cabecera); });

    if (ui.sec === "presupuestos") {
      const E = B.R && B.R.exterior;
      S.innerHTML = `<div class="grid2" style="align-items:start">
        <div class="panel"><h3>Presupuestos del sistema</h3><table class="t small"><tr><th>Parámetro</th><th class="num">Valor</th><th class="num">Requisito</th><th>Estado</th><th></th></tr>
          ${fila("Potencia típica", B.Ptip + " W", reqDe("potencia_w") ? "≤ " + reqDe("potencia_w").valor + " W" : "", estReq("potencia_w", B.Ptip), "suma de V × I de las fuentes")}
          ${fila("Potencia pico", B.Ppico + " W", "", null, "todas las cargas en pico a la vez (peor caso)")}
          ${fila("Corriente pico total", fmtI(B.Ipico), reqDe("corriente_ma") ? "≤ " + reqDe("corriente_ma").valor + " mA" : "", estReq("corriente_ma", B.Ipico))}
          ${fila("Energía en baterías", B.Wh ? B.Wh + " Wh" : "—", "", null)}
          ${fila("Autonomía", B.autonomia != null ? B.autonomia + " h" : "—", reqDe("autonomia_h") ? "≥ " + reqDe("autonomia_h").valor + " h" : "", estReq("autonomia_h", B.autonomia), "80 % de la capacidad útil, consumo típico")}
          ${fila("Masa total", B.masa.total + " g", reqDe("masa_g") ? "≤ " + reqDe("masa_g").valor + " g" : "", estReq("masa_g", B.masa.total), B.masa.sinDato ? `${B.masa.sinDato} sin dato (complétalas abajo)` : "")}
          ${fila("Temperatura interior", B.term.Tin != null ? B.term.Tin + " °C" : "—", `≤ ${reqDe("temp_c") ? reqDe("temp_c").valor : B.term.Tmax} °C`, reqDe("temp_c") ? estReq("temp_c", B.term.Tin) : B.term.estado, B.term.Tin != null ? `ambiente ${B.term.Tamb} °C + ${B.term.dT} °C · ${B.term.porque}` : "sin caja calculada")}
          ${fila("Caja exterior", E ? `${E.L}×${E.W}×${E.H} mm` : "—", "", ["largo_mm", "ancho_mm", "alto_mm", "volumen_cm3"].map(t => estReq(t, medir(t, B))).find(x => x === "rojo") || ["largo_mm", "ancho_mm", "alto_mm", "volumen_cm3"].map(t => estReq(t, medir(t, B))).find(Boolean) || null, E ? `${r1(E.L * E.W * E.H / 1000)} cm³ · ${B.R.n} nivel(es) · ${esc(B.R.etiqueta || "")}` : "")}
          ${fila("Costo", X.cop(B.cost.total), reqDe("costo_cop") ? "≤ " + X.cop(+reqDe("costo_cop").valor) : "", estReq("costo_cop", B.cost.total), "precio más barato de cada pieza")}
          </table>
          <div class="grid2" style="margin-top:10px"><div><label>Temperatura ambiente (°C)</label><input type="number" id="ingTa" value="${B.term.Tamb}"></div><div><label>Relleno de la impresión (0–1)</label><input type="number" step="0.05" min="0.1" max="1" id="ingRel" value="${P.ing.relleno || 1}"></div></div>
          <div class="small muted" style="margin-top:6px">Térmico de primer orden: convección natural (h ≈ 5 W/m²K sobre ${B.term.A || "—"} cm² de caja)${B.term.Av ? ` + rejillas (${B.term.Av} mm² libres)` : ""}${B.term.Qfan ? " + ventilador" : ""}. Agrega rejillas o un ventilador en la pestaña Caja si falta margen.</div></div>
        <div class="side">
          <div class="panel"><h3>Fuentes y reguladores</h3><table class="t small"><tr><th>Ref.</th><th>Pieza</th><th class="num">Típ.</th><th class="num">Pico</th><th class="num">Máx.</th><th class="num">Autonomía</th></tr>
            ${B.AN.fuentes.map(f => `<tr><td>${esc(f.ref)}</td><td>${esc(f.nombre)} · ${f.V} V</td><td class="num">${fmtI(f.I)}</td><td class="num">${fmtI(f.Ip)}</td><td class="num">${fmtI(f.Imax)}</td><td class="num">${f.horas ? r1(f.horas) + " h" : "—"}</td></tr>`).join("")}
            ${B.AN.regs.map(g => `<tr><td>${esc(g.ref)}</td><td>${esc(g.nombre)} · ${g.vin} → ${g.vout} V (${g.tipo})</td><td class="num">${fmtI(g.Iout)}</td><td class="num">${fmtI(g.IoutP)}</td><td class="num">${fmtI(g.imax)}</td><td class="num small">${g.P ? r2(g.P) + " W pérdida" : ""}</td></tr>`).join("") || ""}
            ${!B.AN.fuentes.length ? '<tr><td colspan="6" class="muted">Sin fuentes en los diagramas.</td></tr>' : ""}</table></div>
          <div class="panel"><h3>Costo por subproyecto</h3><table class="t small">${B.cost.porSub.map(x => `<tr><td>${esc(x.nombre)}</td><td class="num"><b>${X.cop(x.total)}</b></td><td class="small muted">${x.sin ? x.sin + " sin precio" : ""}</td></tr>`).join("")}<tr><td><b>Total</b></td><td class="num"><b>${X.cop(B.cost.total)}</b></td><td></td></tr></table>
            <div class="small" style="margin-top:6px">Precios: <span class="tag ok">${B.cost.fres.aldia} al día</span> <span class="tag warn">${B.cost.fres.estimado} estimados</span> <span class="tag bad">${B.cost.fres.viejo} viejos (&gt; 6 meses)</span> <span class="tag">${B.cost.fres.sin} sin precio</span></div>
            ${B.cost.fres.lista.length ? `<details style="margin-top:6px"><summary class="small">Ver piezas por actualizar</summary>${B.cost.fres.lista.map(x => `<div class="small"><a href="#/c/${esc(x.c.id)}">${esc(x.c.nombre)}</a> · <span class="muted">${esc(x.estado)}</span></div>`).join("")}</details>` : ""}</div>
        </div></div>
        <div class="panel" style="margin-top:12px;overflow:auto"><h3>Masa</h3><table class="t small"><tr><th>Pieza</th><th class="num">Cant.</th><th class="num">g c/u</th><th class="num">Total</th><th>Origen del dato</th></tr>
          ${B.masa.filas.map(f => `<tr><td>${esc(f.nombre)}</td><td class="num">${f.q}</td><td class="num">${f.id.startsWith("_") || f.virt ? (f.g ?? "—") : `<input type="number" step="0.1" data-masa="${esc(f.id)}" value="${(P.ing.masas[f.id] ?? f.g) ?? ""}" placeholder="g" style="width:80px;padding:3px 6px;text-align:right">`}</td><td class="num">${f.total ?? "—"}</td><td class="small muted">${f.fuente}</td></tr>`).join("")}
          <tr><td><b>Total</b></td><td></td><td></td><td class="num"><b>${B.masa.total} g</b></td><td></td></tr></table><div class="small muted">Escribe la masa medida con la báscula para reemplazar las estimadas.</div></div>`;
      S.querySelector("#ingTa").onchange = e => { P.ing.tamb = +e.target.value; repinta(); };
      S.querySelector("#ingRel").onchange = e => { P.ing.relleno = Math.min(1, Math.max(0.1, +e.target.value || 1)); repinta(); };
      S.querySelectorAll("[data-masa]").forEach(i => i.onchange = () => { if (i.value === "") delete P.ing.masas[i.dataset.masa]; else P.ing.masas[i.dataset.masa] = +i.value; repinta(); });
    }

    if (ui.sec === "derating") {
      const ord = B.der.slice().sort((a, b) => ({ rojo: 0, amarillo: 1, na: 2, ok: 3 }[a.estado] - { rojo: 0, amarillo: 1, na: 2, ok: 3 }[b.estado]));
      S.innerHTML = `<div class="panel" style="overflow:auto"><h3>Derating (reducción de esfuerzo)</h3>
        <div class="small muted" style="margin-bottom:8px">Cada pieza se usa por debajo de su capacidad, como pide GSFC EEE-INST-002 (adaptado a piezas comerciales): reguladores ≤ ${LIM.regI * 100} % de corriente, LDO ≤ ${LIM.ldoP * 100} % de disipación, fuentes ≤ ${LIM.fuente * 100} %, resistencias ≤ ${LIM.res * 100} % de potencia, capacitores cerámicos ≤ ${LIM.capCer * 100} % / electrolíticos ≤ ${LIM.capEl * 100} % / tantalio ≤ ${LIM.capTa * 100} % del voltaje, LED ≤ ${LIM.led * 100} %, cables ≤ ${LIM.cable * 100} % de su capacidad.</div>
        <table class="t small"><tr><th>Estado</th>${B.AN.subs.length > 1 ? "<th>Subproyecto</th>" : ""}<th>Ref.</th><th>Pieza</th><th>Parámetro</th><th class="num">Uso</th><th class="num">Nominal</th><th class="num">%</th><th class="num">Límite</th><th></th></tr>
        ${ord.map(d => `<tr><td>${sem(d.estado)}</td>${B.AN.subs.length > 1 ? `<td>${esc(d.sub)}</td>` : ""}<td>${esc(d.ref)}</td><td>${esc(d.nombre)}</td><td>${esc(d.param)}</td><td class="num">${d.uso ?? "—"} ${d.unidad}</td><td class="num">${d.nom ?? "—"} ${d.nom ? d.unidad : ""}</td><td class="num"><div class="ing-bar"><i style="width:${Math.min(100, (d.pct || 0) * 100)}%;background:${{ ok: "#22c55e", amarillo: "#eab308", rojo: "#ef4444", na: "#64748b" }[d.estado]}"></i><s style="left:${d.lim * 100}%"></s></div>${d.pct != null ? r0(d.pct * 100) + " %" : ""}</td><td class="num">${r0(d.lim * 100)} %</td><td class="small muted">${esc(d.nota || "")}</td></tr>`).join("") || '<tr><td colspan="9" class="muted">Agrega componentes y conexiones en los circuitos.</td></tr>'}</table></div>`;
    }

    if (ui.sec === "electrica") {
      const pins = [];
      for (const s of B.AN.subs) { const mcu = s.calc.ins.find(o => o.I.pf.rol === "mcu"); if (!mcu) continue;
        for (const n of Object.keys(mcu.I.pos)) { const k = mcu.it.ref + "." + n, q = s.A.pinPos(k), r = s.redDe[k]; if (!q || !q.p || q.p.gpio == null || !r || r.pins.length < 2) continue; const cap = q.p.cap || [], E = MLCircuito.ESP32;
          const otros = r.pins.filter(x => x !== k).join(", ");
          if (cap.includes("strapping")) pins.push({ sub: s.u.nombre, k, g: q.p.gpio, txt: "Pin de arranque (strapping): el periférico no debe forzar su nivel al encender", otros, nivel: E.strapping_riesgo.includes(q.p.gpio) ? "rojo" : "amarillo" });
          if (cap.includes("solo_entrada")) pins.push({ sub: s.u.nombre, k, g: q.p.gpio, txt: "Solo entrada: no puede ser salida ni tiene pull-up interno", otros, nivel: "amarillo" });
          if (cap.includes("adc2")) pins.push({ sub: s.u.nombre, k, g: q.p.gpio, txt: "ADC2: no lee analógico con Wi-Fi encendido", otros, nivel: r.tipos.includes("analog") ? "rojo" : "info" });
        } }
      S.innerHTML = `<div class="grid2" style="align-items:start"><div class="panel"><h3>Hallazgos de todo el proyecto</h3>${B.AN.avisos.length ? B.AN.avisos.slice().sort((a, b) => (a.nivel === "rojo" ? 0 : 1) - (b.nivel === "rojo" ? 0 : 1)).map(a => `<div class="small" style="margin-bottom:6px">${a.nivel === "rojo" ? "🔴" : "🟡"} ${B.AN.subs.length > 1 ? `<b>${esc(a.sub)}:</b> ` : ""}${esc(a.txt)}</div>`).join("") : '<div class="msg ok small">✓ Sin problemas eléctricos detectados (voltajes, cortos, reguladores, niveles 3.3/5 V, I2C, UART).</div>'}
          <div class="small muted" style="margin-top:8px">Incluye: cortocircuitos, fuentes en paralelo, caída de LDO, cargas sin alimentación o sin GND, sobrevoltaje, servos en el regulador del MCU, LED sin resistencia, choques de niveles 3.3 V / 5 V, TX↔TX, SDA↔SCL, direcciones I2C repetidas.</div></div>
        <div class="panel"><h3>Pines del microcontrolador</h3>${pins.length ? `<table class="t small"><tr><th></th><th>Pin</th><th>Riesgo</th><th>Conectado a</th></tr>${pins.map(p => `<tr><td>${p.nivel === "rojo" ? "🔴" : p.nivel === "amarillo" ? "🟡" : "🔵"}</td><td><b>GPIO${p.g}</b><div class="small muted">${esc((B.AN.subs.length > 1 ? p.sub + " · " : "") + p.k)}</div></td><td class="small">${esc(p.txt)}</td><td class="small">${esc(p.otros)}</td></tr>`).join("")}</table>` : '<div class="small muted">Ningún pin delicado en uso (arranque, solo entrada, ADC2).</div>'}</div></div>`;
    }

    if (ui.sec === "requisitos") {
      const refs = [...new Set((P.subs || []).flatMap(u => u.circuito.inst.map(i => i.ref)))];
      S.innerHTML = `<div class="panel" style="overflow:auto"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Requisitos y matriz de verificación</h3><div class="row"><button class="sm" id="rqSug">✨ Sugerir requisitos</button><button class="sm pri" id="rqAdd">＋ Requisito</button><button class="sm" id="rqCsv">⬇ CSV</button></div></div>
        <div class="small muted" style="margin:6px 0 10px">Los requisitos con número se verifican solos por <b>Análisis</b> con los presupuestos; los demás se aprueban con <b>Prueba</b>, <b>Inspección</b> o <b>Demostración</b> y su evidencia.</div>
        <table class="t small ing-req"><tr><th>ID</th><th>Requisito</th><th>Tipo y valor</th><th>Método</th><th>Componentes</th><th>Resultado del análisis</th><th>Estado</th><th>Evidencia</th><th></th></tr>
        ${reqs.map((q, i) => { const T = TIPOS_REQ[q.tipo] || TIPOS_REQ.funcional; return `<tr>
          <td><b>${esc(q.id)}</b></td><td><textarea data-rq="${i}" data-k="texto" rows="2" style="min-width:180px">${esc(q.texto || "")}</textarea></td>
          <td><select data-rq="${i}" data-k="tipo">${Object.entries(TIPOS_REQ).map(([k, t]) => `<option value="${k}" ${q.tipo === k ? "selected" : ""}>${t[0]}</option>`).join("")}</select>${T[2] ? `<div class="row" style="gap:4px;margin-top:4px"><span>${T[2]}</span><input type="number" data-rq="${i}" data-k="valor" value="${q.valor ?? ""}" style="width:90px;padding:3px 6px"><span class="small">${T[1]}</span></div>` : ""}</td>
          <td><select data-rq="${i}" data-k="metodo">${METODOS.map(m => `<option ${q.metodo === m ? "selected" : ""}>${m}</option>`).join("")}</select></td>
          <td><input data-rq="${i}" data-k="comps" value="${esc((q.comps || []).join(", "))}" placeholder="U1, U2…" list="rqRefs" style="width:110px;padding:3px 6px"></td>
          <td>${q.ev.ok === true ? `🟢 ${esc(q.ev.m)} ${T[1]}` : q.ev.ok === false ? `🔴 ${esc(q.ev.m)} ${T[1]}` : q.ev.m != null ? `${esc(q.ev.m)} ${T[1]}` : '<span class="muted">—</span>'}</td>
          <td><select data-rq="${i}" data-k="estado">${["pendiente", "aprobado", "fallido"].map(e => `<option value="${e}" ${(q.estado || "pendiente") === e ? "selected" : ""}>${{ pendiente: "⏳ Pendiente", aprobado: "✅ Aprobado", fallido: "❌ Fallido" }[e]}</option>`).join("")}</select></td>
          <td><input data-rq="${i}" data-k="evidencia" value="${esc(q.evidencia || "")}" placeholder="foto, medición, fecha…" style="width:140px;padding:3px 6px"></td>
          <td><button class="sm ghost" data-rqx="${i}">✕</button></td></tr>`; }).join("") || '<tr><td colspan="9" class="muted">Sin requisitos todavía. Usa «Sugerir requisitos» para empezar.</td></tr>'}</table>
        <datalist id="rqRefs">${refs.map(r => `<option value="${esc(r)}">`).join("")}</datalist></div>`;
      const nuevoId = () => "REQ-" + String(Math.max(0, ...P.ing.requisitos.map(q => +(String(q.id).match(/\d+/) || [0])[0])) + 1).padStart(2, "0");
      S.querySelector("#rqAdd").onclick = () => { P.ing.requisitos.push({ id: nuevoId(), texto: "", tipo: "funcional", metodo: "Prueba", estado: "pendiente", comps: [] }); repinta(); };
      S.querySelector("#rqSug").onclick = () => {
        const tiene = t => P.ing.requisitos.some(q => q.tipo === t), add = (tipo, texto, valor, metodo) => { if (!tiene(tipo)) P.ing.requisitos.push({ id: nuevoId(), tipo, texto, valor, metodo: metodo || "Análisis", estado: "pendiente", comps: [] }); };
        add("autonomia_h", "El sistema debe operar con batería al menos el tiempo de la misión", B.autonomia ? Math.max(1, Math.floor(B.autonomia * 0.8)) : 2);
        add("masa_g", "La masa total no debe superar el límite de la plataforma", B.masa.total ? Math.ceil(B.masa.total * 1.2 / 10) * 10 : 350);
        add("temp_c", "La temperatura interior no debe superar el límite de la pieza más sensible", B.term.Tmax);
        add("derating", "Todas las piezas deben trabajar dentro de los límites de derating", "", "Análisis");
        add("costo_cop", "El costo de materiales no debe superar el presupuesto", Math.ceil((B.cost.total || 100000) * 1.15 / 10000) * 10000);
        if (!P.ing.requisitos.some(q => q.tipo === "funcional")) P.ing.requisitos.push({ id: nuevoId(), tipo: "funcional", texto: "Los datos de los sensores deben registrarse y transmitirse cada segundo", metodo: "Demostración", estado: "pendiente", comps: [] });
        repinta(); X.toast && X.toast("Requisitos sugeridos: ajusta los valores a tu misión");
      };
      S.querySelector("#rqCsv").onclick = () => X.download(`requisitos_${P.id}.csv`, "﻿" + [["ID", "Requisito", "Tipo", "Valor", "Método", "Componentes", "Resultado", "Estado", "Evidencia"], ...reqs.map(q => [q.id, q.texto, (TIPOS_REQ[q.tipo] || [])[0], q.valor ?? "", q.metodo, (q.comps || []).join(" "), q.ev.m ?? "", q.estado || "pendiente", q.evidencia || ""])].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n"), "text/csv");
      S.querySelectorAll("[data-rq]").forEach(el => el.onchange = () => { const q = P.ing.requisitos[+el.dataset.rq], k = el.dataset.k; q[k] = k === "comps" ? el.value.split(/[,\s]+/).filter(Boolean) : k === "valor" ? (el.value === "" ? "" : +el.value) : el.value; repinta(); });
      S.querySelectorAll("[data-rqx]").forEach(b => b.onclick = () => { P.ing.requisitos.splice(+b.dataset.rqx, 1); repinta(); });
    }

    if (ui.sec === "fmea") {
      const ord = fm.map((f, i) => Object.assign({ i }, f)).sort((a, b) => b.rpn - a.rpn);
      S.innerHTML = `<div class="panel" style="overflow:auto"><div class="row" style="justify-content:space-between;flex-wrap:wrap"><h3 style="margin:0">FMEA · análisis de modos de falla</h3><div class="row"><button class="sm" id="fmAuto">🧠 Borrador automático</button>${X.ia ? '<button class="sm" id="fmIA">✨ Mejorar con IA</button>' : ""}<button class="sm" id="fmAdd">＋ Fila</button><button class="sm" id="fmCsv">⬇ CSV</button></div></div>
        <div class="small muted" style="margin:6px 0 10px">S = severidad, O = ocurrencia, D = detección (1 mejor … 10 peor). RPN = S × O × D: <span class="tag bad">≥ 120 actuar ya</span> <span class="tag warn">60–119 revisar</span>. Tras aplicar la acción, baja O o D.</div>
        <table class="t small"><tr><th>Ref.</th><th>Modo de falla</th><th>Efecto</th><th>Causa</th><th>S</th><th>O</th><th>D</th><th>RPN</th><th>Acción recomendada</th><th></th></tr>
        ${ord.map(f => `<tr class="${f.rpn >= 120 ? "fm-r" : f.rpn >= 60 ? "fm-a" : ""}"><td><input data-fm="${f.i}" data-k="ref" value="${esc(f.ref)}" style="width:80px;padding:3px 5px"><div class="small muted">${esc(f.comp || "")}</div></td>
          ${["modo", "efecto", "causa"].map(k => `<td><textarea data-fm="${f.i}" data-k="${k}" rows="2">${esc(f[k] || "")}</textarea></td>`).join("")}
          ${["S", "O", "D"].map(k => `<td><input type="number" min="1" max="10" data-fm="${f.i}" data-k="${k}" value="${f[k] || ""}" style="width:46px;padding:3px 4px"></td>`).join("")}
          <td><b>${f.rpn}</b></td><td><textarea data-fm="${f.i}" data-k="accion" rows="2" style="min-width:200px">${esc(f.accion || "")}</textarea></td><td><button class="sm ghost" data-fmx="${f.i}">✕</button></td></tr>`).join("") || '<tr><td colspan="10" class="muted">Pulsa «Borrador automático» para proponer los modos de falla de cada pieza.</td></tr>'}</table></div>`;
      S.querySelector("#fmAuto").onclick = () => { const nuevos = fmeaBorrador(P, B.AN, B.der).filter(f => !P.ing.fmea.some(g => g.ref === f.ref && g.modo === f.modo)); P.ing.fmea.push(...nuevos); repinta(); X.toast && X.toast(nuevos.length ? `${nuevos.length} modos de falla agregados` : "No hay modos nuevos que agregar"); };
      S.querySelector("#fmAdd").onclick = () => { P.ing.fmea.push({ ref: "", modo: "", efecto: "", causa: "", S: 5, O: 3, D: 5, accion: "" }); repinta(); };
      S.querySelector("#fmCsv").onclick = () => X.download(`fmea_${P.id}.csv`, "﻿" + [["Ref", "Componente", "Modo de falla", "Efecto", "Causa", "S", "O", "D", "RPN", "Acción"], ...ord.map(f => [f.ref, f.comp || "", f.modo, f.efecto, f.causa, f.S, f.O, f.D, f.rpn, f.accion])].map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n"), "text/csv");
      S.querySelectorAll("[data-fm]").forEach(el => el.onchange = () => { const f = P.ing.fmea[+el.dataset.fm], k = el.dataset.k; f[k] = ["S", "O", "D"].includes(k) ? Math.min(10, Math.max(1, +el.value || 1)) : el.value; delete f.auto; repinta(); });
      S.querySelectorAll("[data-fmx]").forEach(b => b.onclick = () => { P.ing.fmea.splice(+b.dataset.fmx, 1); repinta(); });
      const bIA = S.querySelector("#fmIA");
      if (bIA) bIA.onclick = async () => {
        bIA.disabled = true; bIA.textContent = "Pensando…";
        const resumen = { proyecto: P.nombre, descripcion: P.descripcion, piezas: B.AN.subs.flatMap(s => s.calc.ins.map(o => `${o.it.ref} ${o.I.c.nombre}`)), fuentes: B.AN.fuentes.map(f => `${f.ref} ${f.nombre} ${f.V}V`), derating_en_rojo: B.der.filter(d => d.estado !== "ok").map(d => `${d.ref} ${d.param} ${d.pct != null ? r0(d.pct * 100) + "%" : ""}`), fmea_actual: P.ing.fmea.map(f => `${f.ref}: ${f.modo}`) };
        try {
          const r = await X.ia("Eres ingeniero de confiabilidad (estilo NASA/ECSS) y respondes en español. Devuelve SOLO un arreglo JSON de modos de falla NUEVOS (no repitas los existentes) con objetos {ref, comp, modo, efecto, causa, S, O, D, accion}; S/O/D enteros 1-10. Máximo 12 filas, concretas para este proyecto de electrónica soldada.", JSON.stringify(resumen));
          const m = String(r && r.text || "").match(/\[[\s\S]*\]/); const L = m ? JSON.parse(m[0]) : [];
          const nuevos = L.filter(f => f && f.modo && !P.ing.fmea.some(g => g.ref === f.ref && g.modo === f.modo)).map(f => ({ ref: String(f.ref || ""), comp: String(f.comp || ""), modo: String(f.modo), efecto: String(f.efecto || ""), causa: String(f.causa || ""), S: +f.S || 5, O: +f.O || 3, D: +f.D || 5, accion: String(f.accion || ""), ia: true }));
          P.ing.fmea.push(...nuevos); repinta(); X.toast && X.toast(`${nuevos.length} modos de falla propuestos por la IA: revísalos`);
        } catch (e) { bIA.disabled = false; bIA.textContent = "✨ Mejorar con IA"; X.toast && X.toast("La IA no respondió: " + e.message, 5000); }
      };
    }
  }

  // ---------------------------------------------------------------- vista: pestaña 🔧 Fabricación
  function vistaFab(host, P, cabecera) {
    const B = balance(P), FW = firmware(P, B.AN), ui = X.uiF || (X.uiF = { sec: "arnes" });
    const metros = {}; B.arnes.forEach(w => { const k = `${w.awg} AWG · ${w.color}`; metros[k] = (metros[k] || 0) + w.largo; });
    const cajaInfo = B.R ? `${B.R.exterior.L} × ${B.R.exterior.W} × ${B.R.exterior.H} mm · ${esc(B.R.etiqueta || "")}` : "sin caja";
    const stepRuta = `data/cajas/${P.id}.step`;
    host.innerHTML = `<div class="tabs" style="margin-bottom:10px">${[["arnes", "🧵 Arnés para soldar"], ["firmware", "💾 Firmware"], ["cad", "📐 Caja a CAD"], ["informe", "📄 Informe"]].map(([k, n]) => `<button data-fsec="${k}" class="${ui.sec === k ? "on" : ""}">${n}</button>`).join("")}</div><div id="fabSec"></div>`;
    host.querySelectorAll("[data-fsec]").forEach(b => b.onclick = () => { ui.sec = b.dataset.fsec; vistaFab(host, P, cabecera); });
    const S = host.querySelector("#fabSec");
    if (ui.sec === "arnes") {
      S.innerHTML = `<div class="panel" style="overflow:auto"><div class="row" style="justify-content:space-between;flex-wrap:wrap"><h3 style="margin:0">Hoja de arnés · ${B.arnes.length} cables</h3><div class="row"><button class="sm" id="arCsv">⬇ CSV</button><button class="sm pri" id="arPrint">🖨 Hoja para el banco</button></div></div>
        <div class="small muted" style="margin:6px 0 10px">Largos ${B.R ? `medidos sobre la caja elegida (${cajaInfo}) + 40 mm de servicio` : "por defecto (elige una caja para medirlos)"}. Calibre con ${LIM.cable * 100} % de margen sobre la capacidad del cable. Todos soldados directo a la placa.${B.arnes.some(w => !w.conCaja) ? " * = largo estimado (una de las piezas no está dentro de la caja, p. ej. la entrada USB)." : ""}</div>
        <table class="t small"><tr><th>Cable</th>${B.AN.subs.length > 1 ? "<th>Subproyecto</th>" : ""}<th>Desde</th><th>Hasta</th><th>Red</th><th class="num">Corriente</th><th>Calibre</th><th>Color</th><th class="num">Largo</th><th>Termoencogible</th><th class="num">Radio mín.</th><th>Notas</th></tr>
        ${B.arnes.map(w => `<tr><td><b>${w.id}</b></td>${B.AN.subs.length > 1 ? `<td>${esc(w.sub)}</td>` : ""}<td>${esc(w.desde)}<div class="small muted">${esc(w.compA)}</div></td><td>${esc(w.hasta)}<div class="small muted">${esc(w.compB)}</div></td><td>${esc(w.red)}</td><td class="num">${fmtI(w.I)}</td><td>${w.awg} AWG</td><td>${esc(w.color)}</td><td class="num">${w.largo} mm${w.conCaja ? "" : " *"}</td><td>${w.termo}</td><td class="num">${w.radio} mm</td><td class="small">${w.notas.map(esc).join("; ")}</td></tr>`).join("") || '<tr><td colspan="12" class="muted">Sin cables en los diagramas.</td></tr>'}</table>
        ${Object.keys(metros).length ? `<h3 style="margin-top:14px">Compra de cable</h3><div class="small">${Object.entries(metros).map(([k, mm]) => `<span class="tag" style="margin:2px">${esc(k)}: ${Math.ceil(mm * 1.2 / 100) / 10} m</span>`).join("")} <span class="muted">(+20 % de desperdicio)</span></div>` : ""}
        <h3 style="margin-top:14px">Inspección de cada cable</h3><div class="small muted" style="margin-bottom:6px">Basada en las buenas prácticas de NASA-STD-8739.4 (crimpado, cables y arneses). Es un resumen para el banco: no reemplaza la norma.</div>
        <ol class="small">${INSPECCION.map(([t, d]) => `<li><b>${t}:</b> ${d}</li>`).join("")}</ol></div>`;
      S.querySelector("#arCsv").onclick = () => X.download(`arnes_${P.id}.csv`, "﻿" + [["Cable", "Subproyecto", "Desde", "Componente desde", "Hasta", "Componente hasta", "Red", "Corriente mA", "AWG", "Color", "Largo mm", "Termoencogible", "Radio min mm", "Notas"], ...B.arnes.map(w => [w.id, w.sub, w.desde, w.compA, w.hasta, w.compB, w.red, r0(w.I), w.awg, w.color, w.largo, w.termo, w.radio, w.notas.join("; ")])].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n"), "text/csv");
      S.querySelector("#arPrint").onclick = () => imprimir(`Arnés · ${P.nombre}`, seccionArnes(B, true));
    }
    if (ui.sec === "firmware") {
      S.innerHTML = FW.length ? FW.map((f, i) => `<div class="panel" style="margin-bottom:12px"><div class="row" style="justify-content:space-between;flex-wrap:wrap"><h3 style="margin:0">💾 ${esc(f.sub)} · ${esc(f.mcu)}</h3><div class="row"><button class="sm pri" data-fwz="${i}">⬇ Proyecto PlatformIO (.zip)</button><button class="sm" data-fwi="${i}">⬇ .ino</button><button class="sm" data-fwc="${i}">📋 Copiar</button></div></div>
          <div class="small muted" style="margin:6px 0">Placa <code>${f.board}</code> · ${f.libs.length ? "librerías: " + f.libs.map(esc).join(", ") : "sin librerías extra"}</div>
          ${f.avisos.length ? `<div class="msg warn small">${f.avisos.map(esc).join("<br>")}</div>` : ""}
          ${f.tabla.length ? `<table class="t small" style="margin:6px 0"><tr><th>Ref.</th><th>Componente</th><th>Pin</th><th>MCU</th></tr>${f.tabla.map(r => `<tr>${r.map(v => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</table>` : ""}
          <pre class="ing-code">${esc(f.main)}</pre></div>`).join("") : '<div class="panel muted">Ningún circuito tiene microcontrolador. Agrega un ESP32 (u otro MCU) en ⚡ Circuitos.</div>';
      S.querySelectorAll("[data-fwz]").forEach(b => b.onclick = () => { const f = FW[+b.dataset.fwz], blob = zip([[f.carpeta + "/platformio.ini", f.ini], [f.carpeta + "/src/main.cpp", f.main], [f.carpeta + "/README.md", f.readme]]), a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = f.carpeta + ".zip"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); });
      S.querySelectorAll("[data-fwi]").forEach(b => b.onclick = () => { const f = FW[+b.dataset.fwi]; X.download(f.carpeta + ".ino", f.main, "text/plain"); });
      S.querySelectorAll("[data-fwc]").forEach(b => b.onclick = () => { navigator.clipboard.writeText(FW[+b.dataset.fwc].main).then(() => X.toast("Código copiado")); });
    }
    if (ui.sec === "cad") {
      S.innerHTML = `<div class="panel"><h3>Caja a CAD (STEP)</h3>${B.R ? `<p class="small">Caja elegida: <b>${cajaInfo}</b>, ${B.R.piezas.filter(q => q.elemento == null).length} piezas, ${(B.R.elementos || []).length} elementos.</p>
          <p class="small muted">Se genera en GitHub con CadQuery: base hueca con pared de ${B.R.p.espesor} mm, tapa, repisas de cada nivel, los agujeros y ventanas de los elementos ya cortados, y cada componente como un bloque con su referencia. Se abre directo en SolidWorks, Fusion o Rhino (Archivo → Abrir → .step).</p>
          <div class="row" style="flex-wrap:wrap;gap:8px"><button class="pri" id="cadPedir">⚙ Generar STEP de esta caja</button><button id="cadJson">⬇ Datos de la caja (JSON)</button></div>
          <div class="small muted" style="margin-top:8px">El STEP tarda 1–2 minutos en estar listo después de pedirlo (lo hace la Action de GitHub). Mientras tanto puedes usar el DXF de la pestaña Caja.</div>` : '<div class="muted">Primero elige una caja en la pestaña 📦 Caja.</div>'}</div>`;
      if (B.R) fetch(`data/cajas/${P.id}.json?nc=${Date.now()}`).then(r => r.ok ? r.json() : null).then(j => {
        const fila = S.querySelector(".row"); if (!j || !fila) return;
        const a = j.generado ? `<a class="btn" href="${stepRuta}?v=${encodeURIComponent(j.generado)}" download>⬇ Descargar STEP (${esc(j.generado)})</a>` : `<span class="tag warn">⏳ STEP en proceso…</span>`;
        if (!fila.querySelector("a.btn")) fila.insertAdjacentHTML("beforeend", a);
      }).catch(() => { });
      const datos = () => ({ id: P.id, nombre: P.nombre, fecha: new Date().toISOString(), pendiente: true, interior: B.R.interior, exterior: B.R.exterior, p: B.R.p, niveles: B.R.niveles, piezas: B.R.piezas.map(q => ({ ref: q.ref, n: q.n, elemento: q.elemento, nivel: q.nivel, x: q.x, y: q.y, L: q.L, W: q.W, z0: q.z0, bajo: q.bajo, esp: q.esp, Ht: q.Ht, Hc: q.Hc })), elementos: B.R.elementos });
      const bJ = S.querySelector("#cadJson"); if (bJ) bJ.onclick = () => X.download(`caja_${P.id}.json`, JSON.stringify(datos(), null, 1), "application/json");
      const bP = S.querySelector("#cadPedir");
      if (bP) bP.onclick = async () => {
        bP.disabled = true; bP.textContent = "Enviando…";
        try { const txt = JSON.stringify(datos(), null, 1) + "\n"; await X.putFile(`data/cajas/${P.id}.json`, btoa(unescape(encodeURIComponent(txt))), `Caja ${P.id}: generar STEP`); X.toast("Pedido enviado: el STEP estará listo en 1–2 minutos (recarga esta pestaña).", 6000); vistaFab(host, P, cabecera); }
        catch (e) { bP.disabled = false; bP.textContent = "⚙ Generar STEP de esta caja"; X.toast("No se pudo enviar (¿token de GitHub?): " + e.message, 6000); }
      };
    }
    if (ui.sec === "informe") {
      S.innerHTML = `<div class="panel"><h3>Informe del proyecto</h3><p class="small">Un documento con todo: portada y versión, presupuestos con semáforo, requisitos y matriz de verificación, BOM con precios y costo por subproyecto, el diagrama de cada circuito con su revisión eléctrica, la caja en tres vistas, la hoja de arnés con su inspección, derating y FMEA.</p>
        <label class="small" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="infDia" checked style="width:auto"> Incluir los diagramas</label>
        <div class="row" style="margin-top:10px"><button class="pri" id="infGo">📄 Abrir informe (Imprimir → Guardar como PDF)</button></div>
        <div class="small muted" style="margin-top:8px">En el celular: el informe se abre en otra pestaña; usa Compartir → Imprimir → Guardar como PDF.</div></div>`;
      S.querySelector("#infGo").onclick = () => informe(P, B, { diagramas: S.querySelector("#infDia").checked });
    }
  }

  // ---------------------------------------------------------------- informe imprimible
  function imprimir(titulo, cuerpo) {
    const w = window.open("", "_blank"); if (!w) { X.toast && X.toast("El navegador bloqueó la ventana: permite ventanas emergentes", 5000); return null; }
    w.document.open(); w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titulo)}</title><style>
      body{font:11.5px/1.45 "Segoe UI",Arial,sans-serif;color:#0f172a;margin:22px;max-width:1100px}h1{font-size:24px;margin:0}h2{font-size:15px;margin:22px 0 8px;border-bottom:2px solid #0ea5e9;padding-bottom:3px}h3{font-size:13px;margin:14px 0 6px}
      table{border-collapse:collapse;width:100%;margin:4px 0}th,td{border:1px solid #cbd5e1;padding:3px 6px;text-align:left;vertical-align:top}th{background:#e0f2fe}.num{text-align:right}.muted{color:#64748b}
      .k{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}.k div{border:1px solid #cbd5e1;border-radius:8px;padding:8px 10px}.k b{display:block;font-size:17px}
      .ok{color:#15803d}.warn{color:#a16207}.bad{color:#b91c1c}.dia{border:1px solid #cbd5e1;border-radius:8px;padding:6px;text-align:center;margin:6px 0}.dia svg{max-width:100%;height:auto}
      .cab{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #0f172a;padding-bottom:8px}.np{background:#e0f2fe;padding:8px 12px;border-radius:8px;margin-bottom:12px}
      .chk td{font-size:10px}.box{display:inline-block;width:10px;height:10px;border:1px solid #334155;margin-right:3px;vertical-align:-1px}
      @media print{.np{display:none}h2{page-break-after:avoid}tr,.dia{page-break-inside:avoid}.salto{page-break-before:always}}</style></head><body>
      <div class="np">Usa <b>Imprimir → Guardar como PDF</b>. <button onclick="print()">🖨 Imprimir / PDF</button></div>${cuerpo}<script>setTimeout(()=>print(),800)<\/script></body></html>`);
    w.document.close(); return w;
  }
  const tabla = (cab, filas) => `<table><tr>${cab.map(c => `<th>${c}</th>`).join("")}</tr>${filas.map(f => `<tr>${f.map(v => `<td>${v}</td>`).join("")}</tr>`).join("")}</table>`;
  const semTxt = e => ({ ok: '<span class="ok">● Cumple</span>', amarillo: '<span class="warn">● Margen bajo</span>', rojo: '<span class="bad">● No cumple</span>' }[e] || '<span class="muted">—</span>');
  function seccionArnes(B, hojaBanco) {
    return `<h2>Hoja de arnés (${B.arnes.length} cables, soldados)</h2>${tabla(["Cable", "Desde", "Hasta", "Red", "I", "AWG", "Color", "Largo", "Termo", ...(hojaBanco ? ["Pel.", "Est.", "Sold.", "Termo", "Alivio", "Cont.", "Etiq."] : [])],
      B.arnes.map(w => [`<b>${w.id}</b>`, `${esc(w.desde)}<br><span class="muted">${esc(w.compA)}</span>`, `${esc(w.hasta)}<br><span class="muted">${esc(w.compB)}</span>`, esc(w.red), fmtI(w.I), w.awg, esc(w.color), w.largo + " mm", w.termo, ...(hojaBanco ? Array(7).fill('<span class="box"></span>') : [])]))}
      <h3>Inspección (basada en NASA-STD-8739.4, resumen)</h3><ol>${INSPECCION.map(([t, d]) => `<li><b>${t}:</b> ${d}</li>`).join("")}</ol>${hojaBanco ? `<p>Armó: ____________________ Inspeccionó: ____________________ Fecha: ____________</p>` : ""}`;
  }
  function informe(P, B, opt) {
    const diag = [];
    if (opt.diagramas) for (const s of B.AN.subs) {
      const h = document.createElement("div"); h.style.cssText = "position:fixed;left:-20000px;top:0;width:1400px;height:900px;overflow:hidden"; document.body.appendChild(h);
      try { const api = MLCircuito.montar(h, { id: P.id, nombre: s.u.nombre, circuito: JSON.parse(JSON.stringify(s.u.circuito)) }, {}); diag.push({ s, svg: api.svgClaro() }); api.destroy && api.destroy(); } catch (e) { console.warn(e); }
      h.remove();
    }
    const v = (P.versiones || []).slice(-1)[0], reqs = ((P.ing || {}).requisitos || []).map(q => Object.assign({ ev: evaluarReq(q, B) }, q));
    const fm = ((P.ing || {}).fmea || []).map(f => Object.assign({ rpn: (+f.S || 0) * (+f.O || 0) * (+f.D || 0) }, f)).sort((a, b) => b.rpn - a.rpn);
    const bom = (P.bom || []).map(b => { const c = X.comp(b.id) || {}, pm = c.id && X.precioMin(c); return [esc(c.nombre || b.id), esc(b.valor || ""), b.cantidad, pm ? X.cop(pm.precio_cop) : "—", pm ? X.cop(pm.precio_cop * b.cantidad) : "—", pm ? esc(pm.proveedor) : ""]; });
    const E = B.R && B.R.exterior;
    const cuerpo = `<div class="cab"><div><div class="muted">MountLab · Informe de proyecto</div><h1>${esc(P.nombre)}</h1><div>${esc(P.descripcion || "")}</div></div>
      <div class="muted" style="text-align:right">${new Date().toLocaleDateString("es-CO")}<br>Proyecto ${esc(P.id)} · estado ${esc(P.estado || "")}${v ? `<br>Versión <b>${esc(v.nombre)}</b> (${esc(v.estado)}, ${esc(v.fecha)})` : ""}</div></div>
      <h2>Resumen</h2><div class="k">
        <div><span class="muted">Potencia</span><b>${B.Ptip} W</b>pico ${B.Ppico} W</div><div><span class="muted">Autonomía</span><b>${B.autonomia != null ? B.autonomia + " h" : "—"}</b>${B.Wh ? B.Wh + " Wh" : ""}</div>
        <div><span class="muted">Masa</span><b>${B.masa.total} g</b>${B.masa.sinDato ? B.masa.sinDato + " sin dato" : "estimada"}</div><div><span class="muted">Temperatura interior</span><b>${B.term.Tin != null ? B.term.Tin + " °C" : "—"}</b>límite ${B.term.Tmax} °C</div>
        <div><span class="muted">Caja exterior</span><b>${E ? `${E.L}×${E.W}×${E.H}` : "—"}</b>mm</div><div><span class="muted">Costo</span><b>${X.cop(B.cost.total)}</b>materiales</div>
        <div><span class="muted">Derating</span><b>${B.der.filter(d => d.estado === "rojo").length} rojos</b>${B.der.filter(d => d.estado === "amarillo").length} amarillos</div><div><span class="muted">Revisión eléctrica</span><b>${B.AN.avisos.length} avisos</b>${B.AN.avisos.filter(a => a.nivel === "rojo").length} críticos</div></div>
      ${reqs.length ? `<h2>Requisitos y matriz de verificación</h2>${tabla(["ID", "Requisito", "Valor", "Método", "Componentes", "Resultado", "Estado", "Evidencia"], reqs.map(q => { const T = TIPOS_REQ[q.tipo] || TIPOS_REQ.funcional; return [`<b>${esc(q.id)}</b>`, esc(q.texto), T[2] ? `${T[2]} ${q.valor} ${T[1]}` : esc(T[0]), q.metodo, esc((q.comps || []).join(", ")), q.ev.ok === true ? `<span class="ok">● ${esc(q.ev.m)}</span>` : q.ev.ok === false ? `<span class="bad">● ${esc(q.ev.m)}</span>` : esc(q.ev.m ?? "—"), { aprobado: "✅ Aprobado", fallido: "❌ Fallido" }[q.estado] || "⏳ Pendiente", esc(q.evidencia || "")]; }))}` : ""}
      <h2>Presupuestos del sistema</h2>${tabla(["Fuente / regulador", "Típico", "Pico", "Máximo", "Autonomía / pérdida"], [...B.AN.fuentes.map(f => [`${esc(f.ref)} ${esc(f.nombre)} · ${f.V} V`, fmtI(f.I), fmtI(f.Ip), fmtI(f.Imax), f.horas ? r1(f.horas) + " h" : "—"]), ...B.AN.regs.map(g => [`${esc(g.ref)} ${esc(g.nombre)} ${g.vin}→${g.vout} V`, fmtI(g.Iout), fmtI(g.IoutP), fmtI(g.imax), g.P ? r2(g.P) + " W" : "—"])])}
      <p class="muted">Térmico: ${B.term.Tin != null ? `${B.term.P} W dentro de la caja, ambiente ${B.term.Tamb} °C → ${B.term.Tin} °C interior (margen ${B.term.margen} °C contra ${B.term.Tmax} °C, ${B.term.porque})` : "sin caja"}. Cálculos de primer orden en corriente continua; verificar en banco.</p>
      ${tabla(["Masa: pieza", "Cant.", "g c/u", "Total", "Origen"], B.masa.filas.map(f => [esc(f.nombre), f.q, f.g ?? "—", f.total ?? "—", f.fuente]).concat([["<b>Total</b>", "", "", `<b>${B.masa.total} g</b>`, ""]]))}
      <h2>Lista de materiales y costos</h2>${tabla(["Componente", "Valor", "Cant.", "Unitario", "Subtotal", "Proveedor"], bom)}
      ${tabla(["Subproyecto", "Costo", ""], B.cost.porSub.map(x => [esc(x.nombre), X.cop(x.total), x.sin ? x.sin + " sin precio" : ""]).concat([["<b>Total</b>", `<b>${X.cop(B.cost.total)}</b>`, ""]]))}
      ${B.AN.subs.map(s => { const d = diag.find(x => x.s === s); return `<h2 class="salto">Circuito · ${esc(s.u.nombre)}</h2>${d ? `<div class="dia">${d.svg}</div>` : ""}<h3>Revisión eléctrica</h3>${s.calc.avisos.length ? `<ul>${s.calc.avisos.map(a => `<li class="${a.nivel === "rojo" ? "bad" : "warn"}">${esc(a.txt)}</li>`).join("")}</ul>` : '<p class="ok">✓ Sin problemas detectados.</p>'}`; }).join("")}
      ${B.R ? `<h2 class="salto">Caja</h2><div class="dia">${MLCaja.vistas(B.R, { titulo: P.nombre, claro: true })}</div>` : ""}
      ${B.arnes.length ? seccionArnes(B, false) : ""}
      <h2>Derating</h2>${tabla(["Ref.", "Pieza", "Parámetro", "Uso", "Nominal", "%", "Límite", "Estado"], B.der.map(d => [esc(d.ref), esc(d.nombre), esc(d.param), `${d.uso ?? "—"} ${d.unidad}`, `${d.nom ?? "—"} ${d.unidad}`, d.pct != null ? r0(d.pct * 100) + " %" : "—", r0(d.lim * 100) + " %", semTxt(d.estado)]))}
      <p class="muted">Límites al estilo GSFC EEE-INST-002, adaptados a piezas comerciales.</p>
      ${fm.length ? `<h2>FMEA</h2>${tabla(["Ref.", "Modo de falla", "Efecto", "Causa", "S", "O", "D", "RPN", "Acción"], fm.map(f => [esc(f.ref), esc(f.modo), esc(f.efecto), esc(f.causa), f.S, f.O, f.D, `<b class="${f.rpn >= 120 ? "bad" : f.rpn >= 60 ? "warn" : ""}">${f.rpn}</b>`, esc(f.accion)]))}` : ""}
      ${(P.versiones || []).length ? `<h2>Control de configuración</h2>${tabla(["Versión", "Estado", "Fecha", "Autor", "Nota"], P.versiones.map(x => [esc(x.nombre), esc(x.estado), esc(x.fecha), esc(x.autor || ""), esc(x.nota || "")]))}` : ""}`;
    imprimir(`Informe · ${P.nombre}`, cuerpo);
  }

  // ---------------------------------------------------------------- vista: versiones
  const ESTV = { borrador: "📝 Borrador", aprobado: "✅ Diseño aprobado", construido: "🔧 Construido", modificado: "✏ Modificado", volado: "🚀 Probado / lanzado" };
  function vistaVersiones(host, P, cabecera, restaurar) {
    P.versiones = P.versiones || [];
    const actual = sinVersiones(P), ult = P.versiones[P.versiones.length - 1], dif = ult ? diferencias(ult.snap, actual) : null;
    host.innerHTML = `<div class="grid2" style="align-items:start"><div class="panel"><h3>Congelar una versión</h3>
        <div class="small muted" style="margin-bottom:8px">Una versión guarda una copia fija del proyecto (BOM, circuitos, caja, requisitos, FMEA). Así sabes exactamente qué se aprobó y qué se construyó.</div>
        <div class="grid2"><div><label>Nombre</label><input id="vNm" value="v${P.versiones.length + 1}"></div><div><label>Estado</label><select id="vEs">${Object.entries(ESTV).map(([k, n]) => `<option value="${k}">${n}</option>`).join("")}</select></div></div>
        <div style="margin-top:8px"><label>Autor</label><input id="vAu" value="${esc(X.usuario ? X.usuario() : "")}"></div>
        <div style="margin-top:8px"><label>Nota (qué cambió y por qué)</label><textarea id="vNo" rows="3"></textarea></div>
        <button class="pri" id="vGo" style="margin-top:10px">🧊 Congelar versión</button>
        ${dif ? `<h3 style="margin-top:16px">Cambios desde ${esc(ult.nombre)}</h3>${dif.length ? `<ul class="small">${dif.map(d => `<li>${esc(d)}</li>`).join("")}</ul>` : '<div class="small muted">Sin cambios.</div>'}` : ""}</div>
      <div class="panel"><h3>Historial de versiones</h3>${P.versiones.length ? P.versiones.slice().reverse().map((x, j) => { const i = P.versiones.length - 1 - j, prev = P.versiones[i - 1], d = prev ? diferencias(prev.snap, x.snap) : null;
        return `<div class="ing-ver"><div class="row" style="justify-content:space-between"><div><b>${esc(x.nombre)}</b> <span class="tag">${ESTV[x.estado] || esc(x.estado)}</span></div><div class="small muted">${esc(x.fecha)} · ${esc(x.autor || "")}</div></div>
          ${x.nota ? `<div class="small" style="margin-top:4px">${esc(x.nota)}</div>` : ""}${d ? `<details class="small" style="margin-top:4px"><summary>${d.length} cambio(s) respecto a ${esc(prev.nombre)}</summary><ul>${d.map(t => `<li>${esc(t)}</li>`).join("")}</ul></details>` : ""}
          <div class="row" style="margin-top:6px;gap:6px"><button class="sm" data-vd="${i}">⬇ JSON</button><button class="sm ghost" data-vr="${i}">↺ Restaurar</button><button class="sm ghost" data-vx="${i}">✕</button></div></div>`; }).join("") : '<div class="small muted">Todavía no hay versiones. Congela la primera cuando el diseño esté aprobado.</div>'}</div></div>`;
    host.querySelector("#vGo").onclick = () => {
      const v = { id: "v" + Date.now().toString(36), nombre: host.querySelector("#vNm").value.trim() || "v" + (P.versiones.length + 1), estado: host.querySelector("#vEs").value, autor: host.querySelector("#vAu").value.trim(), nota: host.querySelector("#vNo").value.trim(), fecha: new Date().toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }), snap: sinVersiones(P) };
      if (v.autor && X.recordarUsuario) X.recordarUsuario(v.autor);
      P.versiones.push(v); P.historial = P.historial || []; P.historial.push({ fecha: X.hoy ? X.hoy() : new Date().toISOString().slice(0, 10), nota: `Versión ${v.nombre} congelada (${ESTV[v.estado] || v.estado})` });
      cabecera(); vistaVersiones(host, P, cabecera, restaurar); X.toast && X.toast(`Versión ${v.nombre} congelada. Pulsa Guardar para subirla.`, 5000);
    };
    host.querySelectorAll("[data-vd]").forEach(b => b.onclick = () => { const x = P.versiones[+b.dataset.vd]; X.download(`${P.id}_${x.nombre}.json`, JSON.stringify(x.snap, null, 1), "application/json"); });
    host.querySelectorAll("[data-vx]").forEach(b => b.onclick = () => { P.versiones.splice(+b.dataset.vx, 1); cabecera(); vistaVersiones(host, P, cabecera, restaurar); });
    host.querySelectorAll("[data-vr]").forEach(b => b.onclick = () => { const x = P.versiones[+b.dataset.vr]; if (restaurar) restaurar(x); });
  }

  window.MLIng = { init: ctx => { X = Object.assign(X, ctx); }, analizar, balance, derating, masa, termico, costos, arnes, firmware, zip, fmeaBorrador, diferencias, sinVersiones, vista, vistaFab, vistaVersiones, informe, LIM, INSPECCION, TIPOS_REQ };
})();
