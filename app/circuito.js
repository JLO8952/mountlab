/* MountLab · Diagrama de conexiones (pestaña "Diagrama" de cada proyecto).
   Modelo (proyecto.circuito):
     inst:   [{ ref:"U1", id:"esp32_38p" | "@usb", x, y, flip, rot, valor, I, Ipico, p:{V,Imax,mAh,Vf,...} }]
     cables: [{ a:"U1.GPIO21", b:"U2.SDA", color? }]      etiquetas: { "U1.3V3": "3V3" }  (mismo nombre = misma red)
   Cálculos DC estáticos: voltaje por red, corriente por red/fuente/regulador, disipación de LDO, autonomía, calibre de cable.
   Verificación (ERC), sugerencias locales de conexión, informe imprimible (PDF) y exportaciones. */
(function () {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const r2 = v => Math.round(v * 100) / 100, clone = o => JSON.parse(JSON.stringify(o));
  const num = s => parseFloat(String(s).replace(",", "."));
  const PIN = 18, CAB = 34;

  // ================================================================ partes virtuales (fuentes y básicos que no están en la biblioteca)
  const VIRT = {
    "@usb": { nombre: "USB 5 V", rol: "fuente", pines: [["VBUS", "pwr_out"], ["GND", "gnd"]], p: { V: 5, Imax: 500 }, ic: "🔌", grupo: "Fuentes" },
    "@lipo": { nombre: "Batería LiPo 1S", rol: "fuente", pines: [["+", "pwr_out"], ["−", "gnd"]], p: { V: 3.7, Imax: 2000, mAh: 1000 }, ic: "🔋", grupo: "Fuentes" },
    "@18650": { nombre: "Batería 18650", rol: "fuente", pines: [["+", "pwr_out"], ["−", "gnd"]], p: { V: 3.7, Imax: 5000, mAh: 3000 }, ic: "🔋", grupo: "Fuentes" },
    "@2s": { nombre: "Pack 2S (7.4 V)", rol: "fuente", pines: [["+", "pwr_out"], ["−", "gnd"]], p: { V: 7.4, Imax: 5000, mAh: 2600 }, ic: "🔋", grupo: "Fuentes" },
    "@lab": { nombre: "Fuente de laboratorio", rol: "fuente", pines: [["+", "pwr_out"], ["−", "gnd"]], p: { V: 12, Imax: 3000 }, ic: "⚡", grupo: "Fuentes" },
    "@dc12": { nombre: "Adaptador 12 V", rol: "fuente", pines: [["+", "pwr_out"], ["−", "gnd"]], p: { V: 12, Imax: 2000 }, ic: "⚡", grupo: "Fuentes" },
    "@gnd": { nombre: "Tierra", rol: "gnd", pines: [["GND", "gnd"]], p: {}, ic: "⏚", grupo: "Básicos" },
    "@led": { nombre: "LED", rol: "led", pines: [["A", "anodo"], ["K", "catodo"]], p: { Vf: 2.0, If: 15, color: "rojo" }, ic: "💡", grupo: "Básicos" },
    "@boton": { nombre: "Pulsador", rol: "pasivo", pines: [["1", "signal"], ["2", "signal"]], p: {}, ic: "⏺", grupo: "Básicos" },
  };
  const COLOR_LED = { rojo: [2.0, "#ef4444"], amarillo: [2.1, "#facc15"], verde: [2.2, "#22c55e"], azul: [3.1, "#3b82f6"], blanco: [3.1, "#f8fafc"] };

  // ================================================================ pines: expandir grupos ("21, 22") y clasificar
  const ESP32 = { strapping: [0, 2, 5, 12, 15], strapping_riesgo: [0, 2, 12, 15], flash: [6, 7, 8, 9, 10, 11], solo_entrada: [34, 35, 36, 39], adc1: [32, 33, 34, 35, 36, 37, 38, 39], adc2: [0, 2, 4, 12, 13, 14, 15, 25, 26, 27], preferidos: [13, 14, 25, 26, 27, 32, 33, 4, 16, 17, 18, 19, 23, 5, 2, 15] };
  const PARES = /^(SDA\/SCL|SCL\/SDA|SIOC\/SIOD|SIOD\/SIOC|VSYNC\/HREF|PWDN\/RESET|TX\/RX|RX\/TX|IN\+\/IN−|IN\+\/IN-)$/i;
  function partes(nombre) {
    let L = String(nombre || "").split(/\s*,\s*/).filter(Boolean);
    if (L.length === 1 && /\s\/\s/.test(L[0])) L = L[0].split(/\s+\/\s+/);
    if (L.length === 1 && PARES.test(L[0].replace(/\s/g, ""))) L = L[0].split("/");
    if (L.length === 1) { const m = L[0].match(/^([A-Z]+)(\d)\/\1(\d)$/i); if (m) L = [m[1] + m[2], m[1] + m[3]]; }
    const out = [];
    for (const t of L) {
      let m = t.match(/^(\d+)\s*[–-]\s*(\d+)$/); if (m && +m[2] > +m[1] && +m[2] - +m[1] < 40) { for (let k = +m[1]; k <= +m[2]; k++) out.push(String(k)); continue; }
      m = t.match(/^([A-Z]+)(\d+)\s*[–-]\s*\1?(\d+)$/i); if (m && +m[3] > +m[2] && +m[3] - +m[2] < 40) { for (let k = +m[2]; k <= +m[3]; k++) out.push(m[1] + k); continue; }
      m = t.match(/^(\d+)\s*[–-]\s*(\d+)\s*[–-]\s*(\d+)$/); if (m) { out.push(m[1], m[2], m[3]); continue; }
      out.push(t.trim());
    }
    return out;
  }
  const esMcu = c => /esp32|arduino|microcontrol|stm32|rp2040|attiny|atmega|pico\b/i.test(c.id + " " + c.nombre + " " + c.categoria) && !/expansion|expansión|adaptador/i.test(c.id + " " + c.nombre);
  function gpioDe(n, func, mcu) { let m = (n + " " + func).match(/GPIO\s?(\d+)/i); if (m) return +m[1]; if (mcu && /^\d+$/.test(n)) return +n; m = n.match(/^D(\d+)$/); if (mcu && m) return +m[1]; return null; }
  function tipoPin(n, f, rol) {
    const N = String(n).toUpperCase().replace(/\s/g, ""), t = n + " " + f;
    if (/^(GND|VSS|0V|−|-|G|V−|V-|COM-)$/.test(N) || /^(IN|OUT|B|P)[−-]$/.test(N) || (/\bGND\b|tierra|negativ|camisa \(−\)|polo negativo/i.test(t) && !/señal|positiv/i.test(t))) return "gnd";
    if (/flash spi interna|no usar|reservado/i.test(f)) return "nc";
    if (/^B\+$/.test(N) && (rol === "regulador")) return "bat";
    if (/^(VCC|VDD|VIN|V\+|5V|3V3|3\.3V|3VO|VBAT|VBUS|VOUT|IN\+|OUT\+|B\+|P\+|\+|VS|V|VREF|VCC\/VIN|VIN\(5V\)|DVDD|AVDD|DOVDD)$/.test(N) || /^(VOUT|VIN|VCC|VDD|VBAT)\b/i.test(f) || /alimentaci|entrada .*\d\s*V|salida .*\d(\.\d)?\s*V|polo positivo|pin central \(\+\)|entrada positiva|salida positiva|VCC/i.test(t)) {
      if (rol === "pasivo2") return "signal";
      if (/salida|\bVOUT\b|^OUT\+|^3VO\b|polo positivo|^P\+/i.test(N + " " + f) && !/entrada/i.test(f)) return rol === "carga" || rol === "pasivo" ? "pwr_aux" : "pwr_out";
      if (rol === "fuente") return "pwr_out";
      return "pwr_in";
    }
    if (/SDA|SIOD/i.test(t)) return "sda"; if (/SCL|SIOC/i.test(t)) return "scl";
    if (/MOSI|\bSDI\b|\bDIN\b(?!.*RX)/i.test(t) && !/DIN \(RX\)/i.test(t)) return "mosi";
    if (/MISO|\bSDO\b/i.test(t)) return "miso"; if (/\bSCK\b|\bSCLK\b|\bCLK\b|reloj spi/i.test(t)) return "sck"; if (/\bCS\b|\bCSB\b|\bSS\b|chip select|\bNSS\b/i.test(t)) return "cs";
    if (/\bTXD?\d?\b|DOUT \(TX\)|salida serial|UART\d? TX/i.test(t)) return "tx"; if (/\bRXD?\d?\b|DIN \(RX\)|entrada serial|UART\d? RX/i.test(t)) return "rx";
    if (/PWM|señal|servo/i.test(t)) return "pwm";
    if (/ADC|anal[oó]g|\bAOUT\b|\bA0\b/i.test(t)) return "analog";
    if (/\bEN\b|RESET|RST|PWRKEY|encendido/i.test(t)) return "reset";
    if (/GPIO|\bD\d+\b|digital|INT|interrup|DRDY|PPS|DIO|LED|ON\/SLEEP|DTR|CTS|RTS/i.test(t)) return "gpio";
    return "signal";
  }
  const cachePines = new Map();
  /** Pines individuales de un componente de la biblioteca (o de una parte virtual). */
  function pinesDe(c, rol) {
    const k = c.id + "|" + (c.version || 1) + "|" + rol; if (cachePines.has(k)) return cachePines.get(k);
    const mcu = esMcu(c), out = [], vistos = new Set();
    for (const p of c.pines || []) {
      const ns = partes(p.n); let fs = String(p.func || "").split(/\s*,\s*/);
      if (fs.length === ns.length && ns.length > 1) { const pre = fs[0].split(" ").slice(0, -1).join(" "); fs = fs.map((f, i) => (i > 0 && pre && !/\s/.test(f) ? pre + " " + f : f)); }
      ns.forEach((n0, i) => {
        let n = n0; if (mcu && /^\d+$/.test(n)) n = "GPIO" + n; if (/^VIN \(5V\)$/i.test(n)) n = "VIN";
        const func = fs.length === ns.length ? fs[i] : (p.func || "");
        let key = n; for (let j = 2; vistos.has(key); j++) key = n + "#" + j; vistos.add(key);
        const g = gpioDe(n, func, mcu), q = { n: key, et: n, func, tipo: rol === "pasivo2" ? "signal" : tipoPin(n, func, rol), gpio: g, x: ns.length === 1 ? p.x : null, y: ns.length === 1 ? p.y : null };
        if (mcu && g != null && /esp32/i.test(c.id + c.nombre)) {
          q.cap = []; if (ESP32.flash.includes(g)) { q.tipo = "nc"; q.cap.push("flash"); }
          if (ESP32.strapping.includes(g)) q.cap.push("strapping"); if (ESP32.solo_entrada.includes(g)) q.cap.push("solo_entrada");
          if (ESP32.adc1.includes(g)) q.cap.push("adc1"); if (ESP32.adc2.includes(g)) q.cap.push("adc2");
          if (q.tipo === "signal" || q.tipo === "analog") { if (q.tipo === "analog") q.cap.push("adc"); q.tipo = "gpio"; }
        }
        out.push(q);
      });
    }
    if (!out.length && rol === "fuente") out.push({ n: "+", et: "+", func: "Positivo", tipo: "pwr_out" }, { n: "−", et: "−", func: "Negativo", tipo: "gnd" });
    if (!out.length && rol === "pasivo2") out.push({ n: "1", et: "1", func: "Terminal", tipo: "signal" }, { n: "2", et: "2", func: "Terminal", tipo: "signal" });
    cachePines.set(k, out); return out;
  }

  // ================================================================ perfil eléctrico de un componente
  const I_RE = /(\d+(?:[.,]\d+)?)\s*(µA|uA|μA|mA|A)\b/g;
  const aMa = (v, u) => num(v) * ({ A: 1000, mA: 1, "µA": 0.001, uA: 0.001, "μA": 0.001 }[u] || 1);
  function corrientes(t) {
    const L = [...String(t || "").matchAll(I_RE)].map(m => ({ v: aMa(m[1], m[2]), i: m.index }));
    if (!L.length) { const w = String(t).match(/(\d+(?:[.,]\d+)?)\s*mW/); return w ? { typ: num(w[1]) / 3.3, pico: num(w[1]) / 3.3 } : null; }
    const pico = L.slice(1).find(x => /\bpicos?\b|peak|bloqueo|máx|\bmax|transmisi|escritura|calefactor/i.test(String(t).slice(Math.max(0, x.i - 25), x.i + 25)));
    return { typ: L[0].v, pico: Math.max(L[0].v, pico ? pico.v : Math.max(...L.map(x => x.v))) };
  }
  function rangoV(t) {
    t = String(t || ""); let m = t.match(/(\d+(?:[.,]\d+)?)\s*V?\s*(?:-|–|a|to|~)\s*(\d+(?:[.,]\d+)?)\s*V/);
    if (m && num(m[1]) < num(m[2])) return [num(m[1]), num(m[2])];
    const vs = [...t.matchAll(/(\d+(?:[.,]\d+)?)\s*V\b/g)].map(x => num(x[1])).filter(v => v > 0 && v < 60); if (!vs.length) return null;
    return [r2(Math.min(...vs) * 0.9), r2(Math.max(...vs) * 1.1)];
  }
  const cachePerfil = new Map();
  function perfil(c) {
    if (c.id.startsWith("@")) { const v = VIRT[c.id]; return { rol: v.rol, virt: true }; }
    const k = c.id + "|" + (c.version || 1); if (cachePerfil.has(k)) return cachePerfil.get(k);
    const F = c.ficha || {}, txt = c.id + " " + c.nombre + " " + (c.etiquetas || []).join(" "), tV = F.voltaje || "", tI = F.corriente || "";
    let P = { rol: "carga" };
    if (c.valores) P = { rol: c.valores.magnitud === "resistencia" ? "resistencia" : "capacitor" };
    else if (esMcu(c)) { const I = corrientes(tI) || { typ: 80, pico: 250 }; P = { rol: "mcu", I: I.typ, Ipico: I.pico, reg: { tipo: "ldo", vout: 3.3, imax: 500, drop: 1.1 }, logica: 3.3, tolera5: false }; }
    else if (/ams1117|ldo|lineal/i.test(txt) || /regulador/i.test(txt) && /3\.3|ldo/i.test(tV)) { const vo = (tV.match(/salida\s*(\d+(?:[.,]\d+)?)\s*V/i) || [, 3.3])[1]; P = { rol: "regulador", reg: { tipo: "ldo", vout: num(vo), imax: (corrientes(tI) || { typ: 1000 }).typ, drop: 1.1 }, vin: rangoV(tV) }; }
    else if (/lm2596|buck|step-?down|xl4015|mp1584/i.test(txt)) P = { rol: "regulador", reg: { tipo: "buck", vout: 5, imax: (corrientes(tI) || { typ: 2000 }).typ, eff: 0.85, ajustable: true }, vin: [4.5, 40] };
    else if (/mt3608|boost|step-?up|xl6009/i.test(txt)) P = { rol: "regulador", reg: { tipo: "boost", vout: 5, imax: 1000, eff: 0.9, ajustable: true }, vin: [2, 24] };
    else if (/tp4056|cargador|charger/i.test(txt)) P = { rol: "regulador", reg: { tipo: "paso", vout: null, imax: 1000 }, vin: [4.5, 5.5] };
    else if (/\bbms\b/i.test(txt)) P = { rol: "regulador", reg: { tipo: "paso", vout: null, imax: (corrientes(tI) || { typ: 4000 }).typ }, vin: null };
    else if (c.categoria === "Energía" && /bater|celda|18650|21700|lipo|portapila|pack|fuente|adaptador|panel solar|solar/i.test(txt)) {
      const vs = String(tV).match(/(?:nominal|salida)[^0-9]*(\d+(?:[.,]\d+)?)\s*V/i) || String(tV).match(/(\d+(?:[.,]\d+)?)\s*V/);
      const mah = (txt + " " + (c.especificaciones || []).map(e => e.param + " " + e.valor).join(" ") + " " + (F.descripcion || "")).match(/(\d{3,5})\s*mAh|(\d+(?:[.,]\d+)?)\s*Ah/i);
      const dsc = String(tI).match(/descarga[^;]*?(\d+(?:[.,]\d+)?)\s*(mA|A)\b/i);
      P = { rol: "fuente", V: vs ? num(vs[1]) : 5, Imax: dsc ? aMa(dsc[1], dsc[2]) : (corrientes(tI) || { typ: 1000 }).typ, mAh: mah ? (mah[1] ? +mah[1] : num(mah[2]) * 1000) : null };
    }
    else if (["Conectores", "Interruptores"].includes(c.categoria)) P = { rol: "pasivo" };
    else { const I = corrientes(tI); P = { rol: "carga", I: I ? I.typ : 10, Ipico: I ? I.pico : 10, sinDato: !I }; }
    if (P.rol === "carga" || P.rol === "mcu") {
      P.rango = rangoV(tV); const logic = /l[oó]gica\s*3\.3|NO tolerante/i.test(tV);
      P.tolera5 = !(logic || (P.rango && P.rango[1] <= 3.7)); if (logic) P.logica = 3.3;
      if (/servo|motor/i.test(txt)) P.motor = true;
    }
    cachePerfil.set(k, P); return P;
  }

  // ================================================================ montar el editor
  function montar(host, P, opt) {
    opt = opt || {};
    const C = P.circuito = P.circuito || { version: 1, inst: [], cables: [], etiquetas: {}, notas: "" };
    C.inst = C.inst || []; C.cables = C.cables || []; C.etiquetas = C.etiquetas || {};
    const st = { k: 1, ox: 0, oy: 0, sel: null, selC: null, desde: null, drag: null, ptrs: new Map(), tab: "redes", sug: [], hist: [], fut: [], filtro: "", ancho: 0, vista: C.vista || "esq" };
    const comp = id => id.startsWith("@") ? Object.assign({ id, nombre: VIRT[id].nombre, pines: [] }, {}) : (Store.db.componentes.find(c => c.id === id));
    const $ = (s, r) => (r || host).querySelector(s), $$ = (s, r) => [...(r || host).querySelectorAll(s)];

    // ---------- geometría de cada instancia
    function infoInst(it) {
      const c = comp(it.id); if (!c) return null;
      const pf = perfil(c), rol = pf.rol;
      let pins;
      if (it.id.startsWith("@")) pins = VIRT[it.id].pines.map(([n, t]) => ({ n, et: n, func: { pwr_out: "Salida +", gnd: "Tierra", anodo: "Ánodo", catodo: "Cátodo" }[t] || "Terminal", tipo: t }));
      else pins = pinesDe(c, rol === "resistencia" || rol === "capacitor" ? "pasivo2" : rol === "mcu" ? "mcu" : rol);
      const dos = pins.length === 2 && ["resistencia", "capacitor", "led", "pasivo"].includes(rol);
      let izq = [], der = [];
      if (dos) { izq = [pins[0]]; der = [pins[1]]; }
      else if (rol === "fuente") der = pins;
      else if (rol === "regulador") pins.forEach(p => (/OUT|VOUT|^B|^P\+|^P−/i.test(p.n) || (p.tipo === "pwr_out") ? der : izq).push(p));
      else if (rol === "mcu") { const h = Math.ceil(pins.length / 2); izq = pins.slice(0, h); der = pins.slice(h); }
      else pins.forEach(p => (["pwr_in", "pwr_out", "gnd", "bat"].includes(p.tipo) ? izq : der).push(p));
      if (it.flip) [izq, der] = [der, izq];
      const w = dos ? 76 : rol === "mcu" ? 190 : 160, h = dos ? 34 : CAB + Math.max(izq.length, der.length, 1) * PIN + 6;
      const pos = {};
      if (dos && it.rot) { const p0 = izq[0], p1 = der[0]; pos[p0.n] = { x: it.x + 17, y: it.y - 4, lado: "U", p: p0 }; pos[p1.n] = { x: it.x + 17, y: it.y + 80, lado: "D", p: p1 }; return { c, pf, pins, dos, rot: true, w: 34, h: 76, pos, izq, der }; }
      izq.forEach((p, i) => pos[p.n] = { x: it.x, y: it.y + (dos ? 17 : CAB + i * PIN + PIN / 2), lado: "L", p });
      der.forEach((p, i) => pos[p.n] = { x: it.x + w, y: it.y + (dos ? 17 : CAB + i * PIN + PIN / 2), lado: "R", p });
      return { c, pf, pins, dos, w, h, pos, izq, der };
    }
    let INFO = new Map(); let info = () => { INFO = new Map(C.inst.map(it => [it.ref, infoInst(it)])); return INFO; };
    const pinPos = key => { const [ref, n] = partir(key); const I = INFO.get(ref); return I && I.pos[n]; };
    const partir = key => { const i = key.indexOf("."); return [key.slice(0, i), key.slice(i + 1)]; };

    // ---------- redes (unión de cables y etiquetas)
    function redes() {
      const padre = {}, f = x => (padre[x] = padre[x] ?? x, padre[x] === x ? x : (padre[x] = f(padre[x]))), u = (a, b) => { padre[f(a)] = f(b); };
      for (const [ref, I] of INFO) if (I) for (const n of Object.keys(I.pos)) f(ref + "." + n);
      for (const w of C.cables) if (pinPos(w.a) && pinPos(w.b)) u(w.a, w.b);
      const porNombre = {}; for (const [k, nom] of Object.entries(C.etiquetas)) if (pinPos(k) && nom) { if (porNombre[nom]) u(k, porNombre[nom]); else porNombre[nom] = k; }
      // las partes "Tierra" y todos los pines de tierra con la etiqueta GND
      const grupos = {};
      for (const k of Object.keys(padre)) { const r = f(k); (grupos[r] = grupos[r] || []).push(k); }
      const L = Object.values(grupos).filter(g => g.length > 1 || C.etiquetas[g[0]]).map((pins, i) => ({ id: i, pins, nombre: pins.map(p => C.etiquetas[p]).find(Boolean) || null }));
      L.forEach(R => R.tipos = R.pins.map(k => (pinPos(k) || {}).p).filter(Boolean).map(p => p.tipo));
      return L;
    }

    // ---------- cálculo eléctrico
    function calcular() {
      info(); const R = redes(), redDe = {}; R.forEach(r => r.pins.forEach(k => redDe[k] = r));
      const ins = C.inst.map(it => ({ it, I: INFO.get(it.ref) })).filter(o => o.I);
      const avisos = [], add = (nivel, txt, refs) => avisos.push({ nivel, txt, refs: refs || [] });
      const pinsDe = (o, tipo) => Object.values(o.I.pos).filter(q => (Array.isArray(tipo) ? tipo.includes(q.p.tipo) : q.p.tipo === tipo)).map(q => o.it.ref + "." + q.p.n);
      const red = k => redDe[k];
      // 1) voltajes fijos: tierra y fuentes
      R.forEach(r => { r.V = null; r.fuentes = []; r.gnd = r.tipos.includes("gnd"); if (r.gnd) r.V = 0; });
      for (const o of ins) {
        const pf = o.I.pf; if (pf.rol !== "fuente") continue; const V = +(o.it.p && o.it.p.V) || pf.V || (VIRT[o.it.id] || {}).p?.V || 5;
        for (const k of pinsDe(o, "pwr_out")) { const r = red(k); if (!r) continue; if (r.gnd) add("rojo", `Cortocircuito: ${o.it.ref} (+) conectado a tierra`, [o.it.ref]); else if (r.V != null && Math.abs(r.V - V) > 0.05) add("rojo", `Dos fuentes de distinto voltaje en la misma red (${r.V} V y ${V} V)`, [o.it.ref]); r.V = V; r.fuentes.push({ o, V }); }
      }
      // 2) reguladores (y el regulador interno del MCU) en orden hasta estabilizar
      const regs = ins.filter(o => o.I.pf.reg).map(o => {
        const reg = Object.assign({}, o.I.pf.reg, o.it.p || {}), ent = pinsDe(o, ["pwr_in", "bat"]).filter(k => !/OUT|3V3|3VO/i.test(k.split(".")[1]) || o.I.pf.rol !== "mcu");
        let sal = pinsDe(o, "pwr_out"); if (reg.tipo === "paso") sal = pinsDe(o, "pwr_out").concat(Object.values(o.I.pos).filter(q => /^OUT\+|^P\+/i.test(q.p.n)).map(q => o.it.ref + "." + q.p.n));
        const entrada = reg.tipo === "paso" ? pinsDe(o, "bat").concat(Object.values(o.I.pos).filter(q => /^B\+/i.test(q.p.n)).map(q => o.it.ref + "." + q.p.n)) : ent;
        return { o, reg, ent: [...new Set(entrada)], sal: [...new Set(sal)], activo: false };
      });
      for (let paso = 0; paso < 8; paso++) for (const g of regs) {
        const rin = g.ent.map(red).find(r => r && r.V != null && !r.gnd); if (!rin) continue;
        let vout = g.reg.tipo === "paso" ? rin.V : +g.reg.vout; if (g.reg.tipo === "ldo" && rin.V < vout + (g.reg.drop || 0) - 0.01) { if (!g.avisoDrop) { g.avisoDrop = true; add("amarillo", `${g.o.it.ref}: ${rin.V} V a la entrada no alcanza para ${vout} V (caída del LDO ≈ ${g.reg.drop} V)`, [g.o.it.ref]); } vout = Math.max(0, rin.V - (g.reg.drop || 0)); }
        if (g.reg.tipo === "buck" && rin.V < vout) vout = rin.V; g.activo = true; g.rin = rin; g.vout = r2(vout);
        for (const k of g.sal) { const r = red(k); if (!r || r.gnd) continue; if (r.V == null || paso === 0) { if (r.V != null && Math.abs(r.V - vout) > 0.05 && !r.fuentes.some(f => f.g === g)) add("rojo", `Salida de ${g.o.it.ref} (${vout} V) unida a una red de ${r.V} V`, [g.o.it.ref]); r.V = r2(vout); if (!r.fuentes.some(f => f.g === g)) r.fuentes.push({ g, V: vout }); } }
      }
      // 3) consumo de cada carga en su red de alimentación
      R.forEach(r => { r.cargas = []; });
      const vRed = k => { const r = red(k); return r ? r.V : null; };
      for (const o of ins) {
        const pf = o.I.pf, it = o.it;
        if (["carga", "mcu"].includes(pf.rol)) {
          const Ityp = it.I != null && it.I !== "" ? +it.I : pf.I, Ip = it.Ipico != null && it.Ipico !== "" ? +it.Ipico : pf.Ipico;
          let pins = pinsDe(o, "pwr_in"); const g = regs.find(x => x.o === o);
          if (pf.rol === "mcu" && g && !g.activo) pins = pins.concat(pinsDe(o, "pwr_out"));   // ESP32 alimentado por 3V3
          const r = pins.map(red).find(x => x && x.V != null && !x.gnd);
          const gndOk = pinsDe(o, "gnd").some(k => red(k) && red(k).gnd);
          if (!r) { if (pinsDe(o, "pwr_in").length || pf.rol === "mcu") add("amarillo", `${it.ref} (${o.I.c.nombre}) no tiene alimentación conectada`, [it.ref]); continue; }
          if (!gndOk && pinsDe(o, "gnd").length) add("amarillo", `${it.ref} no tiene tierra (GND) conectada`, [it.ref]);
          r.cargas.push({ ref: it.ref, nombre: o.I.c.nombre, I: Ityp || 0, Ip: Ip || Ityp || 0 });
          const pin = pins.find(k => red(k) === r), pq = pinPos(pin) && pinPos(pin).p, rg = (pq && rangoV(pq.func)) || pf.rango;
          if (rg && r.V > rg[1] + 0.05) add("rojo", `${it.ref} ${o.I.c.nombre}: recibe ${r.V} V y su máximo es ${rg[1]} V`, [it.ref]);
          else if (rg && r.V < rg[0] - 0.05) add("amarillo", `${it.ref} ${o.I.c.nombre}: recibe ${r.V} V y necesita al menos ${rg[0]} V`, [it.ref]);
          if (pf.motor && regs.some(x => x.o.I.pf.rol === "mcu" && x.sal.some(k => red(k) === r))) add("rojo", `${it.ref}: el servo/motor se alimenta del regulador del MCU; usa una fuente aparte (con tierra común)`, [it.ref]);
          o.Vcc = r.V;
        }
        if (pf.rol === "resistencia" && it.valor) {
          const Rv = (MLPas.leer(it.valor).find(x => x.tipo === "R") || {}).valor, ks = Object.keys(o.I.pos).map(n => it.ref + "." + n), [va, vb] = ks.map(vRed);
          if (Rv > 0 && va != null && vb != null && va !== vb) { const I = Math.abs(va - vb) / Rv * 1000, rr = red(va > vb ? ks[0] : ks[1]); rr.cargas.push({ ref: it.ref, nombre: "R " + it.valor, I, Ip: I }); o.P = I * I / 1000 * Rv / 1000; }
          else if (Rv > 0) { // R en serie con un LED a tierra
            const lado = [0, 1].find(i => [va, vb][i] != null && [va, vb][i] > 0), otro = ks[1 - (lado ?? 0)];
            const led = lado != null && ins.find(x => x.I.pf.rol === "led" && red(x.it.ref + ".A") === red(otro) && red(x.it.ref + ".K") && red(x.it.ref + ".K").gnd);
            if (led) { const Vf = +(led.it.p && led.it.p.Vf) || 2, I = Math.max(0, ([va, vb][lado] - Vf) / Rv * 1000); red(ks[lado]).cargas.push({ ref: it.ref + "+" + led.it.ref, nombre: `LED ${led.it.ref} con ${it.valor}`, I, Ip: I }); o.P = I * I / 1e6 * Rv; led.Iled = I;
              if (I > 30) add("rojo", `${led.it.ref}: ${I.toFixed(0)} mA en el LED (máx. típico 20–30 mA); sube ${it.ref}`, [led.it.ref, it.ref]); }
          }
          if (o.P != null) { const pw = /1\/8/.test(o.I.c.nombre) ? 0.125 : /1\/4|0805/.test(o.I.c.nombre) ? 0.25 : /1\/2/.test(o.I.c.nombre) ? 0.5 : (num((o.I.c.nombre.match(/(\d+)\s*W/) || [])[1]) || 0.25);
            if (o.P > pw * 0.6) add(o.P > pw ? "rojo" : "amarillo", `${it.ref} disipa ${(o.P * 1000).toFixed(0)} mW (nominal ${pw} W): usa una de mayor potencia`, [it.ref]); }
        }
      }
      for (const o of ins) if (o.I.pf.rol === "led" && !o.Iled) { const a = red(o.it.ref + ".A"); if (a && a.V > 0 && a.fuentes.length) add("rojo", `${o.it.ref}: LED conectado directo a ${a.V} V sin resistencia`, [o.it.ref]); }
      // 4) corriente por red, incluyendo entradas de reguladores (recursivo)
      const memo = new Map();
      const demanda = (r, pico, pila) => {
        const key = r.id + (pico ? "p" : ""); if (memo.has(key)) return memo.get(key); if ((pila || []).includes(r)) return 0;
        let I = r.cargas.reduce((s, x) => s + (pico ? x.Ip : x.I), 0);
        for (const g of regs) if (g.activo && g.rin === r) {
          const out = [...new Set(g.sal.map(red).filter(x => x && !x.gnd))].reduce((s, x) => s + demanda(x, pico, [...(pila || []), r]), 0);
          g.Iout = pico ? g.Iout : out; if (pico) g.IoutP = out;
          const Iin = g.reg.tipo === "ldo" ? out + 5 : g.reg.tipo === "paso" ? out : (out * (g.vout || 0)) / Math.max(0.1, (r.V || 1) * (g.reg.eff || 0.85));
          I += Iin; if (!pico) g.Iin = Iin;
        }
        memo.set(key, I); return I;
      };
      R.forEach(r => { if (r.V != null && !r.gnd) { r.I = demanda(r, false); r.Ip = demanda(r, true); } });
      // 5) capacidad de fuentes y reguladores
      const resumenF = [];
      for (const r of R) for (const f of r.fuentes) if (f.o) {
        const Imax = +(f.o.it.p && f.o.it.p.Imax) || f.o.I.pf.Imax || (VIRT[f.o.it.id] || {}).p?.Imax || 1000, mAh = +(f.o.it.p && f.o.it.p.mAh) || f.o.I.pf.mAh || (VIRT[f.o.it.id] || {}).p?.mAh || null;
        const x = { ref: f.o.it.ref, nombre: f.o.I.c.nombre, V: f.V, I: r.I || 0, Ip: r.Ip || 0, Imax, mAh, horas: mAh && r.I ? mAh * 0.8 / r.I : null }; resumenF.push(x);
        if (x.Ip > Imax) add("rojo", `${x.ref} ${x.nombre}: picos de ${x.Ip.toFixed(0)} mA y solo entrega ${Imax} mA`, [x.ref]); else if (x.I > Imax * 0.8) add("amarillo", `${x.ref}: trabaja al ${(x.I / Imax * 100).toFixed(0)} % de su capacidad`, [x.ref]);
      }
      for (const g of regs) if (g.activo) {
        const Iout = g.Iout || 0, IoutP = g.IoutP || Iout, imax = +g.reg.imax || 1000; g.P = g.reg.tipo === "ldo" ? (g.rin.V - g.vout) * Iout / 1000 : g.reg.tipo === "paso" ? 0 : (g.vout * Iout / 1000) * (1 / (g.reg.eff || 0.85) - 1);
        if (IoutP > imax) add("rojo", `${g.o.it.ref} ${g.o.I.c.nombre}: picos de ${IoutP.toFixed(0)} mA y su máximo es ${imax} mA`, [g.o.it.ref]);
        if (g.reg.tipo === "ldo" && g.P > 0.8) add("amarillo", `${g.o.it.ref} (LDO) disipa ${g.P.toFixed(2)} W: necesita disipador o un regulador conmutado`, [g.o.it.ref]);
      }
      // 6) reglas de señales
      for (const r of R) {
        const pins = r.pins.map(k => ({ k, ref: partir(k)[0], p: (pinPos(k) || {}).p })).filter(x => x.p);
        const t = new Set(pins.map(x => x.p.tipo));
        if (r.gnd && pins.some(x => ["pwr_out"].includes(x.p.tipo) && INFO.get(x.ref).pf.rol !== "fuente")) add("rojo", `Salida de alimentación conectada a tierra (${pins.filter(x => x.p.tipo === "pwr_out").map(x => x.k).join(", ")})`);
        if (t.has("sda") && t.has("scl")) add("rojo", "SDA y SCL están unidos en la misma red", pins.map(x => x.ref));
        if (pins.filter(x => x.p.tipo === "tx").length > 1 && !t.has("rx")) add("rojo", `TX unido con TX (${pins.filter(x => x.p.tipo === "tx").map(x => x.k).join(", ")}): el UART se cruza TX→RX`, pins.map(x => x.ref));
        if (pins.filter(x => x.p.tipo === "rx").length > 1 && !t.has("tx")) add("amarillo", `RX unido con RX (${pins.filter(x => x.p.tipo === "rx").map(x => x.k).join(", ")})`, pins.map(x => x.ref));
        for (const x of pins) {
          if (x.p.tipo === "nc") add("rojo", `${x.k}: pin reservado (flash interna o no usar)`, [x.ref]);
          if ((x.p.cap || []).includes("strapping") && ESP32.strapping_riesgo.includes(x.p.gpio) && pins.length > 1) add("amarillo", `${x.k}: pin de arranque (strapping) del ESP32; puede impedir que arranque si el periférico lo fuerza`, [x.ref]);
          if ((x.p.cap || []).includes("solo_entrada") && pins.some(y => y !== x && ["pwm", "rx", "mosi", "sck", "cs"].includes(y.p.tipo))) add("rojo", `${x.k}: es solo entrada; no puede manejar ${pins.find(y => y !== x && ["pwm", "rx", "mosi", "sck", "cs"].includes(y.p.tipo)).k}`, [x.ref]);
          if ((x.p.cap || []).includes("adc2") && pins.some(y => y !== x && y.p.tipo === "analog")) add("amarillo", `${x.k}: ADC2 no funciona con Wi-Fi activo; usa un pin ADC1 (GPIO32–39)`, [x.ref]);
        }
        // niveles lógicos
        if (!r.gnd && r.V == null && pins.length > 1) {
          const niveles = pins.map(x => { const o = ins.find(y => y.it.ref === x.ref); return o && ["carga", "mcu"].includes(o.I.pf.rol) ? { x, V: o.I.pf.logica || o.Vcc, tol: o.I.pf.tolera5 } : null; }).filter(z => z && z.V);
          const SALIDAS = ["tx", "miso", "sda", "scl", "gpio", "analog", "signal"];   // pines que pueden imponer su voltaje en la red
          const alto = niveles.filter(z => z.V >= 4.5 && SALIDAS.includes(z.x.p.tipo)), bajo = niveles.filter(z => z.V <= 3.6 && !z.tol);
          if (alto.length && bajo.length) add("amarillo", `Niveles lógicos distintos en ${pins.map(x => x.k).join(" – ")}: ${alto.map(z => z.x.ref).join(", ")} trabaja a 5 V y ${bajo.map(z => z.x.ref).join(", ")} no tolera 5 V → usa un adaptador de nivel`, pins.map(x => x.ref));
        }
      }
      // I2C: direcciones repetidas en el mismo bus
      const buses = R.filter(r => r.tipos.includes("sda"));
      for (const b of buses) {
        const devs = [...new Set(b.pins.map(k => partir(k)[0]))].map(ref => ins.find(o => o.it.ref === ref)).filter(o => o && o.I.pf.rol === "carga").map(o => ({ o, d: dirI2C(o.I.c) })).filter(x => x.d);
        const vistos = {}; for (const x of devs) { if (vistos[x.d]) add("rojo", `Dirección I2C ${x.d} repetida: ${vistos[x.d]} y ${x.o.it.ref} en el mismo bus (cambia el pin ADR/SDO de uno)`, [x.o.it.ref]); vistos[x.d] = x.o.it.ref; }
        if (devs.length) b.i2c = devs.map(x => `${x.o.it.ref} ${x.d}`);
      }
      return { R, regs, resumenF, avisos, ins };
    }
    function dirI2C(c) { const t = [c.i2c && (c.i2c.direccion || JSON.stringify(c.i2c)), (c.especificaciones || []).filter(e => /direcci/i.test(e.param)).map(e => e.valor).join(" "), /bme280|bmp280/i.test(c.id) ? "0x76" : "", /bme680/i.test(c.id) ? "0x77" : "", /bno055/i.test(c.id) ? "0x28" : "", /qmc5883/i.test(c.id) ? "0x0D" : "", /ssd1306|oled/i.test(c.id) ? "0x3C" : "", /mpu6050/i.test(c.id) ? "0x68" : ""].join(" "); const m = t.match(/0x[0-9A-F]{2}/i); return m ? m[0].toUpperCase().replace("0X", "0x") : null; }

    // ---------- sugerencias locales
    function sugerir() {
      info(); const R = redes(), redDe = {}; R.forEach(r => r.pins.forEach(k => redDe[k] = r));
      const conectado = k => !!redDe[k] && redDe[k].pins.length > 1 || C.etiquetas[k];
      const out = [], usados = new Set(), sug = (a, b, motivo, grupo) => { if (a && b && a !== b && !out.some(s => (s.a === a && s.b === b) || (s.a === b && s.b === a))) { out.push({ a, b, motivo, grupo }); usados.add(a); usados.add(b); } };
      const ins = C.inst.map(it => ({ it, I: INFO.get(it.ref) })).filter(o => o.I);
      const mcu = ins.find(o => o.I.pf.rol === "mcu"), Pm = mcu ? Object.values(mcu.I.pos).map(q => ({ k: mcu.it.ref + "." + q.p.n, p: q.p })) : [];
      const libre = k => !conectado(k) && !usados.has(k);
      const pinM = (f, ...pref) => { const L = Pm.filter(x => f(x.p)); for (const g of pref) { const y = L.find(x => x.p.gpio === g && libre(x.k)); if (y) return y.k; } return (L.find(x => libre(x.k)) || L[0] || {}).k; };
      const gndRep = () => { const r = R.find(x => x.tipos.includes("gnd")); if (r) return r.pins[0]; const f = ins.find(o => o.I.pf.rol === "fuente"); if (f) return f.it.ref + "." + Object.values(f.I.pos).find(q => q.p.tipo === "gnd")?.p.n; return mcu ? Pm.find(x => x.p.tipo === "gnd")?.k : null; };
      const calc = calcular(), nets = calc.R.filter(r => r.V != null && !r.gnd);
      const fuente = V => { const r = nets.find(x => Math.abs(x.V - V) < 0.15); if (r) return r.pins.find(k => ["pwr_out"].includes((pinPos(k) || {}).p?.tipo)) || r.pins[0];
        if (mcu && Math.abs(V - 3.3) < 0.15) return Pm.find(x => x.p.tipo === "pwr_out")?.k; return null; };
      // alimentación de reguladores y MCU desde las fuentes
      const fuentes = ins.filter(o => o.I.pf.rol === "fuente");
      for (const o of ins.filter(o => o.I.pf.rol === "regulador" || o.I.pf.rol === "mcu")) {
        const pins = Object.values(o.I.pos).map(q => ({ k: o.it.ref + "." + q.p.n, p: q.p }));
        const vin = pins.find(x => (x.p.tipo === "pwr_in" || (o.I.pf.reg?.tipo === "paso" && /^B\+|^IN\+/i.test(x.p.n))) && libre(x.k));
        if (vin) { const rg = o.I.pf.vin || [4.5, 12]; const f = fuentes.find(fx => { const V = +(fx.it.p?.V) || fx.I.pf.V || VIRT[fx.it.id]?.p.V; return V >= rg[0] - 0.1 && V <= rg[1] + 0.1; }) || fuentes[0];
          if (f) sug(vin.k, f.it.ref + "." + Object.values(f.I.pos).find(q => q.p.tipo === "pwr_out").p.n, `Alimentar ${o.it.ref} desde ${f.it.ref}`, "Alimentación"); }
        for (const g of pins.filter(x => x.p.tipo === "gnd" && libre(x.k)).slice(0, 1)) { const t = gndRep(); if (t && t !== g.k) sug(g.k, t, `Tierra común de ${o.it.ref}`, "Alimentación"); }
      }
      for (const o of ins) {
        if (o === mcu || !["carga"].includes(o.I.pf.rol)) continue;
        const pins = Object.values(o.I.pos).map(q => ({ k: o.it.ref + "." + q.p.n, p: q.p })), rg = o.I.pf.rango || [3, 5.5];
        const esI2C = pins.some(x => x.p.tipo === "sda") && pins.some(x => x.p.tipo === "scl");   // módulo I2C/SPI: se usa por I2C
        for (const x of pins) {
          if (!libre(x.k)) continue; const t = x.p.tipo;
          if (esI2C && ["cs", "miso", "mosi", "sck"].includes(t)) continue;
          if (t === "pwr_in") { const V = o.I.pf.motor ? 5 : rg[0] <= 3.3 && rg[1] >= 3.3 && mcu ? 3.3 : rg[1] >= 5 ? 5 : 3.3; const dst = (o.I.pf.motor ? fuentes.map(f => f.it.ref + "." + Object.values(f.I.pos).find(q => q.p.tipo === "pwr_out").p.n).find(Boolean) : null) || fuente(V) || fuente(V === 5 ? 3.3 : 5);
            if (dst) sug(x.k, dst, `${o.it.ref} a ${V} V${o.I.pf.motor ? " (fuente aparte, no del regulador del MCU)" : ""}`, "Alimentación"); }
          else if (t === "gnd") { const dst = gndRep(); if (dst) sug(x.k, dst, `Tierra de ${o.it.ref}`, "Alimentación"); }
          if (!mcu) continue;
          if (t === "sda") sug(x.k, pinM(p => p.tipo === "sda", 21), "I2C SDA → pin SDA por defecto del MCU", "I2C");
          else if (t === "scl") sug(x.k, pinM(p => p.tipo === "scl", 22), "I2C SCL → pin SCL por defecto del MCU", "I2C");
          else if (t === "tx") sug(x.k, pinM(p => p.tipo === "rx" && !/0|USB/i.test(p.func), 16), "UART cruzado: TX del módulo → RX2 del MCU", "UART");
          else if (t === "rx") sug(x.k, pinM(p => p.tipo === "tx" && !/0|USB/i.test(p.func), 17), "UART cruzado: RX del módulo ← TX2 del MCU", "UART");
          else if (t === "mosi") sug(x.k, pinM(p => p.tipo === "mosi", 23), "SPI MOSI (VSPI)", "SPI");
          else if (t === "miso") sug(x.k, pinM(p => p.tipo === "miso", 19), "SPI MISO (VSPI)", "SPI");
          else if (t === "sck") sug(x.k, pinM(p => p.tipo === "sck", 18), "SPI SCK (VSPI)", "SPI");
          else if (t === "cs") sug(x.k, pinM(p => (p.tipo === "cs" || p.tipo === "gpio") && !(p.cap || []).includes("solo_entrada"), 5, 4, 15), "SPI CS a un GPIO libre", "SPI");
          else if (t === "analog") sug(x.k, pinM(p => (p.cap || []).includes("adc1"), 34, 35, 32, 33, 36, 39), "Salida analógica → ADC1 (funciona con Wi-Fi)", "Analógico");
          else if (t === "pwm") sug(x.k, pinM(p => p.gpio != null && !(p.cap || []).some(c => ["solo_entrada", "flash", "strapping"].includes(c)), ...ESP32.preferidos), "Señal PWM/servo a un GPIO con salida (LEDC)", "Señales");
          else if (t === "gpio" || t === "reset") { if (/CSB|PS0|PS1|ADR|SDO|ON\/SLEEP|RSSI|ASSOC|RTS|CTS|DTR|VREF/i.test(x.p.n) && !/INT|DRDY|PPS/i.test(x.p.n)) continue; sug(x.k, pinM(p => p.gpio != null && !(p.cap || []).some(c => ["flash", "strapping"].includes(c)) && p.tipo === "gpio", ...ESP32.preferidos), `${x.p.et}: ${x.p.func || "señal"} → GPIO libre`, "Señales"); }
        }
      }
      // pasivos sin conectar: sugerencias de pull-up en I2C si hay chips sueltos
      return out;
    }

    // ---------- dibujo
    const COLORES_TIPO = { pwr_aux: "#fca5a5", pwr_out: "#ef4444", pwr_in: "#ef4444", bat: "#f97316", gnd: "#94a3b8", sda: "#3b82f6", scl: "#eab308", tx: "#22c55e", rx: "#a3e635", mosi: "#c084fc", miso: "#e879f9", sck: "#f472b6", cs: "#fb7185", analog: "#2dd4bf", pwm: "#fb923c", gpio: "#38bdf8", reset: "#a78bfa", nc: "#475569", signal: "#64748b", anodo: "#ef4444", catodo: "#94a3b8" };
    const colorRed = (r, calc) => r.gnd ? "#94a3b8" : r.V != null ? (r.V >= 4.5 ? "#ef4444" : r.V > 0 ? "#f97316" : "#94a3b8") : r.tipos.includes("sda") ? "#3b82f6" : r.tipos.includes("scl") ? "#eab308" : r.tipos.some(t => t === "tx" || t === "rx") ? "#22c55e" : r.tipos.some(t => ["mosi", "miso", "sck", "cs"].includes(t)) ? "#c084fc" : r.tipos.includes("analog") ? "#2dd4bf" : r.tipos.includes("pwm") ? "#fb923c" : "#38bdf8";
    const toS = (x, y) => [(x - st.ox) * st.k, (y - st.oy) * st.k], toW = (sx, sy) => [sx / st.k + st.ox, sy / st.k + st.oy];
    function ruta(a, b) {
      const out = (q, d) => q.lado === "L" ? [q.x - d, q.y] : q.lado === "R" ? [q.x + d, q.y] : q.lado === "U" ? [q.x, q.y - d] : [q.x, q.y + d];
      const [ax, ay] = out(a, 14), [bx, by] = out(b, 14);
      const pts = [[a.x, a.y], [ax, ay]];
      if (a.lado === "U" || a.lado === "D") { const my = (ay + by) / 2; pts.push([ax, my], [bx, my]); }
      else { const mx = (a.lado === "R" && b.lado === "L" && bx > ax) || (a.lado === "L" && b.lado === "R" && bx < ax) ? (ax + bx) / 2 : a.lado === "R" ? Math.max(ax, bx) : Math.min(ax, bx); pts.push([mx, ay], [mx, by]); }
      pts.push([bx, by], [b.x, b.y]);
      return pts;
    }
    const curva = (a, b) => { const dx = Math.max(30, Math.abs(b.x - a.x) * 0.4), d = q => q.lado === "L" ? -dx : q.lado === "R" ? dx : 0, e = q => q.lado === "U" ? -dx : q.lado === "D" ? dx : 0; return `M${a.x},${a.y} C${a.x + d(a)},${a.y + e(a)} ${b.x + d(b)},${b.y + e(b)} ${b.x},${b.y}`; };
    let ULT = null;
    function dibujar() {
      info(); const calc = ULT = calcular(), svg = $("#ciSvg"); if (!svg) return;
      const redDe = {}; calc.R.forEach(r => r.pins.forEach(k => redDe[k] = r));
      const marcados = new Set(calc.avisos.filter(a => a.nivel === "rojo").flatMap(a => a.refs));
      let s = `<defs><pattern id="ciGrid" width="${20 * st.k}" height="${20 * st.k}" patternUnits="userSpaceOnUse" x="${-st.ox * st.k % (20 * st.k)}" y="${-st.oy * st.k % (20 * st.k)}"><circle cx="1" cy="1" r="1" fill="#1e2a3d"/></pattern></defs><rect width="100%" height="100%" fill="url(#ciGrid)"/>`;
      s += `<g transform="translate(${-st.ox * st.k},${-st.oy * st.k}) scale(${st.k})">`;
      // cables
      C.cables.forEach((w, i) => { const a = pinPos(w.a), b = pinPos(w.b); if (!a || !b) return; const r = redDe[w.a], col = w.color || (r ? colorRed(r) : "#38bdf8"), sel = st.selC === i;
        const d = st.vista === "real" ? curva(a, b) : "M" + ruta(a, b).map(p => p.join(",")).join(" L");
        s += `<path d="${d}" fill="none" stroke="transparent" stroke-width="10" data-w="${i}" style="cursor:pointer"/><path d="${d}" fill="none" stroke="${col}" stroke-width="${sel ? 3.2 : st.vista === "real" ? 2.6 : 2}" stroke-linejoin="round" pointer-events="none" ${sel ? 'filter="drop-shadow(0 0 4px #fff)"' : ""}/>`; });
      // sugerencias (fantasmas)
      st.sug.forEach((g, i) => { const a = pinPos(g.a), b = pinPos(g.b); if (!a || !b) return; s += `<path d="M${ruta(a, b).map(p => p.join(",")).join(" L")}" fill="none" stroke="#a78bfa" stroke-width="2" stroke-dasharray="6 4" opacity=".85" data-sg="${i}" style="cursor:pointer"><title>${esc(g.motivo)} (clic para aceptar)</title></path>`; });
      // instancias
      for (const it of C.inst) {
        const I = INFO.get(it.ref); if (!I) { s += `<text x="${it.x}" y="${it.y}" fill="#f87171" font-size="12">${esc(it.ref)}: ${esc(it.id)} no existe</text>`; continue; }
        const sel = st.sel === it.ref, mal = marcados.has(it.ref), virt = it.id.startsWith("@"), pf = I.pf;
        const borde = sel ? "#38bdf8" : mal ? "#f87171" : "#334155";
        if (st.vista === "real" && !I.dos && I.c.montaje && I.c.montaje.pcb) { s += bloqueReal(it, I, borde); continue; }
        if (I.dos) {
          const [x0, y0] = [it.x, it.y], ver = I.rot;
          const val = it.valor || (pf.rol === "led" ? (it.p?.color || "LED") : "");
          if (pf.rol === "resistencia") s += ver ? `<line x1="${x0 + 17}" y1="${y0 - 4}" x2="${x0 + 17}" y2="${y0 + 80}" stroke="#94a3b8" stroke-width="2"/><rect x="${x0 + 8}" y="${y0 + 18}" width="18" height="40" rx="3" fill="#e7c9a0" stroke="${borde}" stroke-width="2" data-i="${esc(it.ref)}"/>` : `<line x1="${x0}" y1="${y0 + 17}" x2="${x0 + 76}" y2="${y0 + 17}" stroke="#94a3b8" stroke-width="2"/><rect x="${x0 + 18}" y="${y0 + 8}" width="40" height="18" rx="3" fill="#e7c9a0" stroke="${borde}" stroke-width="2" data-i="${esc(it.ref)}"/>`;
          else if (pf.rol === "capacitor") s += ver ? `<line x1="${x0 + 17}" y1="${y0 - 4}" x2="${x0 + 17}" y2="${y0 + 34}" stroke="#94a3b8" stroke-width="2"/><line x1="${x0 + 17}" y1="${y0 + 42}" x2="${x0 + 17}" y2="${y0 + 80}" stroke="#94a3b8" stroke-width="2"/><rect x="${x0}" y="${y0 + 30}" width="34" height="16" fill="transparent" data-i="${esc(it.ref)}"/><line x1="${x0 + 4}" y1="${y0 + 34}" x2="${x0 + 30}" y2="${y0 + 34}" stroke="${sel ? "#38bdf8" : "#e2e8f0"}" stroke-width="3"/><line x1="${x0 + 4}" y1="${y0 + 42}" x2="${x0 + 30}" y2="${y0 + 42}" stroke="${sel ? "#38bdf8" : "#e2e8f0"}" stroke-width="3"/>`
            : `<line x1="${x0}" y1="${y0 + 17}" x2="${x0 + 34}" y2="${y0 + 17}" stroke="#94a3b8" stroke-width="2"/><line x1="${x0 + 42}" y1="${y0 + 17}" x2="${x0 + 76}" y2="${y0 + 17}" stroke="#94a3b8" stroke-width="2"/><rect x="${x0 + 26}" y="${y0}" width="24" height="34" fill="transparent" data-i="${esc(it.ref)}"/><line x1="${x0 + 34}" y1="${y0 + 4}" x2="${x0 + 34}" y2="${y0 + 30}" stroke="${sel ? "#38bdf8" : "#e2e8f0"}" stroke-width="3"/><line x1="${x0 + 42}" y1="${y0 + 4}" x2="${x0 + 42}" y2="${y0 + 30}" stroke="${sel ? "#38bdf8" : "#e2e8f0"}" stroke-width="3"/>`;
          else if (pf.rol === "led") { const col = (COLOR_LED[it.p?.color] || COLOR_LED.rojo)[1]; s += `<line x1="${x0}" y1="${y0 + 17}" x2="${x0 + 76}" y2="${y0 + 17}" stroke="#94a3b8" stroke-width="2"/><polygon points="${x0 + 26},${y0 + 5} ${x0 + 26},${y0 + 29} ${x0 + 48},${y0 + 17}" fill="${col}" stroke="${borde}" stroke-width="2" data-i="${esc(it.ref)}"/><line x1="${x0 + 49}" y1="${y0 + 5}" x2="${x0 + 49}" y2="${y0 + 29}" stroke="${col}" stroke-width="3"/>`; }
          else s += `<rect x="${x0 + 16}" y="${y0 + 6}" width="44" height="22" rx="11" fill="#1f2937" stroke="${borde}" stroke-width="2" data-i="${esc(it.ref)}"/>`;
          s += `<text x="${x0 + (ver ? 40 : 38)}" y="${y0 + (ver ? 40 : -4)}" fill="#cbd5e1" font-size="11" ${ver ? "" : 'text-anchor="middle"'} pointer-events="none"><tspan font-weight="700">${esc(it.ref)}</tspan> ${esc(val)}</text>`;
        } else {
          const colTop = virt ? "#7c3aed" : pf.rol === "mcu" ? "#0369a1" : pf.rol === "fuente" ? "#b45309" : pf.rol === "regulador" ? "#15803d" : "#1e3a5f";
          s += `<g data-i="${esc(it.ref)}" style="cursor:move"><rect x="${it.x}" y="${it.y}" width="${I.w}" height="${I.h}" rx="8" fill="#0f172a" stroke="${borde}" stroke-width="${sel || mal ? 2.4 : 1.4}"/>
            <path d="M${it.x} ${it.y + 8} a8 8 0 0 1 8 -8 h${I.w - 16} a8 8 0 0 1 8 8 v${CAB - 12} h-${I.w} z" fill="${colTop}"/>
            <text x="${it.x + 8}" y="${it.y + 14}" fill="#fff" font-size="11" font-weight="700">${esc(it.ref)}${virt && it.p && it.p.V ? " · " + it.p.V + " V" : ""}</text>
            <text x="${it.x + 8}" y="${it.y + 27}" fill="#e2e8f0" font-size="10.5">${esc(I.c.nombre.length > 30 ? I.c.nombre.slice(0, 29) + "…" : I.c.nombre)}</text></g>`;
        }
        // pines
        for (const q of Object.values(I.pos)) {
          const k = it.ref + "." + q.p.n, r = redDe[k], usado = r && (r.pins.length > 1 || C.etiquetas[k]), col = COLORES_TIPO[q.p.tipo] || "#64748b", activo = st.desde === k;
          const et = C.etiquetas[k];
          s += `<circle cx="${q.x}" cy="${q.y}" r="${activo ? 6 : 4.5}" fill="${usado ? col : "#0f172a"}" stroke="${col}" stroke-width="2" data-pin="${esc(k)}" style="cursor:crosshair"><title>${esc(q.p.et)} · ${esc(q.p.func || q.p.tipo)}${(q.p.cap || []).length ? " · " + q.p.cap.join(", ") : ""}${r && r.V != null ? ` · ${r.V} V` : ""}</title></circle>`;
          if (!I.dos) s += `<text x="${q.lado === "L" ? q.x + 8 : q.x - 8}" y="${q.y + 3.5}" fill="${q.p.tipo === "nc" ? "#475569" : "#cbd5e1"}" font-size="10" text-anchor="${q.lado === "L" ? "start" : "end"}" pointer-events="none">${esc(q.p.et.length > 14 ? q.p.et.slice(0, 13) + "…" : q.p.et)}</text>`;
          if (et) s += `<g pointer-events="none"><rect x="${q.lado === "R" ? q.x + 8 : q.x - 8 - et.length * 6.4 - 10}" y="${q.y - 8}" width="${et.length * 6.4 + 10}" height="16" rx="3" fill="#312e81" stroke="#a78bfa"/><text x="${q.lado === "R" ? q.x + 13 : q.x - 13 - et.length * 6.4}" y="${q.y + 4}" fill="#e0e7ff" font-size="10" font-weight="700">${esc(et)}</text></g>`;
        }
      }
      // etiqueta de voltaje / corriente en cada red con energía
      if (st.vista !== "real") for (const r of calc.R) { if (r.gnd || r.V == null) continue; const k = r.pins.find(x => ["pwr_out"].includes((pinPos(x) || {}).p?.tipo)) || r.pins[0]; const q = pinPos(k); if (!q) continue;
        const txt = `${r.V} V · ${fmtI(r.I || 0)}`, x = q.lado === "L" ? q.x - 18 - txt.length * 6 : q.x + 18, y = q.y - 16;
        s += `<g pointer-events="none"><rect x="${x - 4}" y="${y - 11}" width="${txt.length * 6 + 8}" height="15" rx="7" fill="#7f1d1d" opacity=".9"/><text x="${x}" y="${y}" fill="#fecaca" font-size="10" font-weight="700">${esc(txt)}</text></g>`; }
      // cable en curso
      if (st.desde && st.cursor) { const a = pinPos(st.desde); if (a) s += `<line x1="${a.x}" y1="${a.y}" x2="${st.cursor[0]}" y2="${st.cursor[1]}" stroke="#38bdf8" stroke-width="2" stroke-dasharray="4 3"/>`; }
      if (st.drag && st.drag.rect) { const [x0, y0, x1, y1] = st.drag.rect; s += `<rect x="${Math.min(x0, x1)}" y="${Math.min(y0, y1)}" width="${Math.abs(x1 - x0)}" height="${Math.abs(y1 - y0)}" fill="rgba(56,189,248,.08)" stroke="#38bdf8" stroke-dasharray="4 3"/>`; }
      s += `</g>`;
      if (!C.inst.length) s += `<text x="50%" y="45%" text-anchor="middle" fill="#64748b" font-size="15">Arrastra componentes desde la izquierda o pide al asistente que arme el circuito ✦</text>`;
      svg.innerHTML = s; panel(calc);
    }
    function bloqueReal(it, I, borde) { // vista real: huella de la placa a escala con los pines en su lugar físico
      const m = I.c.montaje, k = 4, L = m.pcb[0] * k, W = m.pcb[1] * k, x0 = it.x, y0 = it.y;
      let s = `<g data-i="${esc(it.ref)}" style="cursor:move"><rect x="${x0}" y="${y0}" width="${L}" height="${W}" rx="${m.forma === "redondeada" ? (m.radio || 2) * k : m.forma === "redonda" ? L / 2 : 4}" fill="${(I.c.modelo && I.c.modelo.base && I.c.modelo.base.color) || "#14532d"}" fill-opacity=".85" stroke="${borde}" stroke-width="2"/>`;
      if (I.c.imagen && I.c.imagen.src) s += `<image href="${esc(Store.imgUrl ? Store.imgUrl(I.c.imagen.src) : I.c.imagen.src)}" x="${x0 + 4}" y="${y0 + 4}" width="${L - 8}" height="${W - 8}" opacity=".35" preserveAspectRatio="xMidYMid meet"/>`;
      (m.agujeros || []).forEach(h => s += `<circle cx="${x0 + L / 2 + h.x * k}" cy="${y0 + W / 2 - h.y * k}" r="${h.d / 2 * k}" fill="#0b1220" stroke="#94a3b8"/>`);
      s += `<text x="${x0 + 6}" y="${y0 - 6}" fill="#e2e8f0" font-size="11" font-weight="700">${esc(it.ref)} · ${esc(I.c.nombre.slice(0, 34))}</text></g>`;
      return s;
    }
    const fmtI = I => I >= 1000 ? (I / 1000).toFixed(2) + " A" : I >= 1 ? I.toFixed(0) + " mA" : (I * 1000).toFixed(0) + " µA";
    // en vista real, los pines se ubican en la huella (x,y del componente) o repartidos en el borde inferior
    const infoBase = infoInst;
    function infoReal(it) {
      const I = infoBase(it); if (!I || I.dos || !I.c.montaje || !I.c.montaje.pcb) return I;
      const m = I.c.montaje, k = 4, L = m.pcb[0] * k, W = m.pcb[1] * k, pos = {}, sin = I.pins.filter(p => p.x == null || p.y == null);
      I.pins.forEach(p => { if (p.x != null && p.y != null) pos[p.n] = { x: it.x + L / 2 + p.x * k, y: it.y + W / 2 - p.y * k, lado: p.x < 0 ? "L" : "R", p }; });
      const arr = Math.ceil(sin.length / 2), abajo = sin.length > 8 ? sin.slice(arr) : sin, arriba = sin.length > 8 ? sin.slice(0, arr) : [];
      arriba.forEach((p, i) => pos[p.n] = { x: it.x + (i + 1) * L / (arriba.length + 1), y: it.y, lado: "U", p });
      abajo.forEach((p, i) => pos[p.n] = { x: it.x + (i + 1) * L / (abajo.length + 1), y: it.y + W, lado: "D", p });
      return Object.assign(I, { w: L, h: W, pos });
    }
    function infoInstSel(it) { return st.vista === "real" ? infoReal(it) : infoBase(it); }
    info = () => { INFO = new Map(C.inst.map(it => [it.ref, infoInstSel(it)])); return INFO; };

    // ---------- panel lateral
    function panel(calc) {
      const box = $("#ciPanel"); if (!box) return;
      const t = st.tab, rojos = calc.avisos.filter(a => a.nivel === "rojo").length, amar = calc.avisos.length - rojos;
      const tabs = [["redes", "Redes"], ["comp", "Componentes"], ["cables", "Cables"], ["energia", "Energía"], ["verif", `Verificación${calc.avisos.length ? ` <span class="tag ${rojos ? "bad" : "warn"}">${calc.avisos.length}</span>` : ""}`], ["sug", `Sugerencias${st.sug.length ? ` <span class="tag vio">${st.sug.length}</span>` : ""}`]];
      let h = `<div class="tabs" style="margin:0 0 10px;flex-wrap:wrap">${tabs.map(([k, n]) => `<button data-ct="${k}" class="${t === k ? "on" : ""}">${n}</button>`).join("")}</div>`;
      if (st.sel) h += panelSel(calc);
      if (t === "redes") {
        const R = calc.R.slice().sort((a, b) => (b.V ?? -1) - (a.V ?? -1));
        h += R.length ? `<table class="t small"><tr><th>Red</th><th>V</th><th class="num">I</th><th>Pines</th></tr>${R.map(r => `<tr><td><span class="sw" style="background:${colorRed(r)}"></span> ${esc(nombreRed(r))}</td><td>${r.gnd ? "0" : r.V != null ? r.V : "—"}</td><td class="num">${r.V != null && !r.gnd ? fmtI(r.I || 0) : ""}</td><td>${r.pins.map(k => `<code>${esc(k)}</code>`).join(" ")}${r.i2c ? `<div class="muted">I2C: ${esc(r.i2c.join(", "))}</div>` : ""}</td></tr>`).join("")}</table>` : '<div class="small muted">Aún no hay conexiones.</div>';
      }
      if (t === "comp") h += C.inst.map(it => { const I = INFO.get(it.ref); if (!I) return ""; const redDe = {}; calc.R.forEach(r => r.pins.forEach(k => redDe[k] = r));
        return `<details ${st.sel === it.ref ? "open" : ""}><summary class="small"><b>${esc(it.ref)}</b> ${esc(I.c.nombre)}${it.valor ? " · " + esc(it.valor) : ""}</summary><table class="t small">${I.pins.map(p => { const k = it.ref + "." + p.n, r = redDe[k], otros = r ? r.pins.filter(x => x !== k) : [];
          return `<tr><td><span class="sw" style="background:${COLORES_TIPO[p.tipo]}"></span> ${esc(p.et)}</td><td class="muted">${esc(p.func || "")}</td><td>${otros.length ? otros.map(x => `<code>${esc(x)}</code>`).join(" ") : C.etiquetas[k] ? `<span class="tag vio">${esc(C.etiquetas[k])}</span>` : '<span class="muted">—</span>'}</td></tr>`; }).join("")}</table></details>`; }).join("") || '<div class="small muted">Sin componentes.</div>';
      if (t === "cables") h += C.cables.length ? `<table class="t small"><tr><th>#</th><th>Desde</th><th>Hasta</th><th>Calibre</th><th></th></tr>${C.cables.map((w, i) => { const r = calc.R.find(x => x.pins.includes(w.a)); const I = r && r.V != null && !r.gnd ? r.Ip || r.I || 0 : 0;
          return `<tr class="${st.selC === i ? "sel" : ""}"><td>${i + 1}</td><td><code>${esc(w.a)}</code></td><td><code>${esc(w.b)}</code></td><td>${r && (r.V != null || r.gnd) ? calibre(r.gnd ? Math.max(...calc.R.filter(x => x.V > 0).map(x => x.Ip || 0), 0) : I) : "señal (26–28 AWG)"}</td><td><button class="sm ghost" data-wx="${i}">✕</button></td></tr>`; }).join("")}</table>` : '<div class="small muted">Sin cables. Clic en un pin y luego en otro para conectar.</div>';
      if (t === "energia") {
        h += calc.resumenF.length ? calc.resumenF.map(f => `<div class="panel" style="padding:10px;margin-bottom:8px"><div class="row" style="justify-content:space-between"><b>${esc(f.ref)} ${esc(f.nombre)}</b><span>${f.V} V</span></div>
          <div class="small">Típico ${fmtI(f.I)} · pico ${fmtI(f.Ip)} de ${fmtI(f.Imax)}</div><div class="kpi" style="padding:0;border:none;background:none;cursor:default"><div class="bar"><i style="width:${Math.min(100, f.Ip / f.Imax * 100)}%;${f.Ip > f.Imax ? "background:var(--bad)" : f.I > f.Imax * 0.8 ? "background:var(--warn)" : ""}"></i></div></div>
          <div class="small muted">Potencia ≈ ${(f.V * f.I / 1000).toFixed(2)} W${f.horas ? ` · autonomía ≈ <b style="color:var(--ink)">${f.horas >= 48 ? (f.horas / 24).toFixed(1) + " días" : f.horas.toFixed(1) + " h"}</b> (${f.mAh} mAh al 80 %)` : ""}</div></div>`).join("") : '<div class="small muted">Agrega una fuente (USB, batería, adaptador) y conéctala.</div>';
        const regs = calc.regs.filter(g => g.activo);
        if (regs.length) h += `<h4 class="small muted" style="margin:10px 0 4px">REGULADORES</h4><table class="t small"><tr><th>Ref.</th><th>Entrada</th><th>Salida</th><th class="num">Pérdida</th></tr>${regs.map(g => `<tr><td><b>${esc(g.o.it.ref)}</b> ${esc(g.reg.tipo.toUpperCase())}</td><td>${g.rin.V} V · ${fmtI(g.Iin || 0)}</td><td>${g.vout} V · ${fmtI(g.Iout || 0)} / ${fmtI(+g.reg.imax || 0)}</td><td class="num">${(g.P || 0).toFixed(2)} W</td></tr>`).join("")}</table>`;
        const cargas = calc.R.flatMap(r => r.cargas.map(c => Object.assign({ V: r.V }, c)));
        if (cargas.length) h += `<h4 class="small muted" style="margin:10px 0 4px">CONSUMOS</h4><table class="t small"><tr><th>Carga</th><th>V</th><th class="num">Típ.</th><th class="num">Pico</th></tr>${cargas.map(c => `<tr><td><b>${esc(c.ref)}</b> ${esc(c.nombre)}</td><td>${c.V}</td><td class="num">${fmtI(c.I)}</td><td class="num">${fmtI(c.Ip)}</td></tr>`).join("")}<tr><td colspan="2"><b>Total cargas</b></td><td class="num"><b>${fmtI(cargas.reduce((s, c) => s + c.I, 0))}</b></td><td class="num"><b>${fmtI(cargas.reduce((s, c) => s + c.Ip, 0))}</b></td></tr></table><div class="small muted" style="margin-top:6px">Valores de la ficha de cada componente; ajústalos al seleccionar el bloque. Cálculo DC (no es simulación).</div>`;
      }
      if (t === "verif") h += calc.avisos.length ? calc.avisos.map(a => `<div class="msg ${a.nivel === "rojo" ? "warn" : "info"} small" style="${a.nivel === "rojo" ? "background:var(--bad2);color:#fecaca;border-color:rgba(248,113,113,.3)" : ""}" data-refs="${esc(a.refs.join(","))}">${a.nivel === "rojo" ? "⛔" : "⚠"} ${esc(a.txt)}</div>`).join("") : '<div class="msg ok small">✓ Sin problemas detectados (voltajes, cortos, I2C, UART, pines del ESP32, consumo).</div>';
      if (t === "sug") h += `<div class="row" style="margin-bottom:8px"><button class="sm" id="ciSugR">↻ Buscar sugerencias</button>${st.sug.length ? '<button class="pri sm" id="ciSugA">✓ Aceptar todas</button><button class="sm ghost" id="ciSugX">Descartar</button>' : ""}</div>`
        + (st.sug.length ? st.sug.map((g, i) => `<div class="lst-it small" data-sgi="${i}"><span class="tag vio">${esc(g.grupo)}</span><div style="flex:1"><code>${esc(g.a)}</code> → <code>${esc(g.b)}</code><div class="muted">${esc(g.motivo)}</div></div><button class="sm" data-sga="${i}">✓</button></div>`).join("") : '<div class="small muted">Pulsa “Buscar sugerencias”: el asistente propone alimentación, tierra, I2C, UART, SPI, analógicas y PWM según los pines de cada componente. Aparecen como cables morados punteados.</div>')
        + (opt.ia ? `<div class="panel" style="margin-top:10px;padding:10px;border-color:rgba(167,139,250,.35)"><b class="small">✦ Diseñar con IA</b><textarea id="ciObj" placeholder="Describe el objetivo: “monitor de temperatura y humedad con ESP32, OLED y batería 18650 recargable por USB”" style="margin-top:6px;min-height:60px"></textarea><button class="sm pri" id="ciIA" style="margin-top:6px">Proponer circuito</button><div class="small muted" style="margin-top:4px">Usa tu biblioteca; te muestra la propuesta antes de aplicarla.</div></div>` : "");
      box.innerHTML = h;
      $$("[data-ct]", box).forEach(b => b.onclick = () => { st.tab = b.dataset.ct; panel(ULT); });
      $$("[data-wx]", box).forEach(b => b.onclick = () => { snap(); C.cables.splice(+b.dataset.wx, 1); st.selC = null; cambio(); });
      $$("[data-sga]", box).forEach(b => b.onclick = e => { e.stopPropagation(); aceptar([+b.dataset.sga]); });
      $$("[data-refs]", box).forEach(d => d.onclick = () => { const r = d.dataset.refs.split(",")[0]; if (r) { st.sel = r; centrar(r); dibujar(); } });
      const sr = $("#ciSugR", box); if (sr) sr.onclick = () => { st.sug = sugerir(); opt.toast && opt.toast(st.sug.length ? `${st.sug.length} conexiones sugeridas` : "No encontré conexiones que sugerir"); dibujar(); };
      const sa = $("#ciSugA", box); if (sa) sa.onclick = () => aceptar(st.sug.map((_, i) => i));
      const sx = $("#ciSugX", box); if (sx) sx.onclick = () => { st.sug = []; dibujar(); };
      const ia = $("#ciIA", box); if (ia) ia.onclick = async () => { const o = $("#ciObj", box).value.trim(); if (!o) return; ia.disabled = true; ia.textContent = "Pensando…"; try { await opt.ia(o, api); } catch (e) { opt.toast && opt.toast(e.message, 6000); } ia.disabled = false; ia.textContent = "Proponer circuito"; };
      bindSel(box);
    }
    const nombreRed = r => r.nombre || (r.gnd ? "GND" : r.V != null ? `${r.V} V` : r.tipos.includes("sda") ? "SDA" : r.tipos.includes("scl") ? "SCL" : r.pins[0]);
    const calibre = I => I < 500 ? "26–28 AWG (dupont)" : I < 1000 ? "24 AWG" : I < 2000 ? "22 AWG" : I < 3000 ? "20 AWG" : I < 5000 ? "18 AWG" : "16 AWG o más";
    function panelSel(calc) {
      const it = C.inst.find(x => x.ref === st.sel), I = it && INFO.get(it.ref); if (!I) return "";
      const pf = I.pf, v = VIRT[it.id], p = it.p || {};
      const campo = (k, n, val, extra) => `<div><label>${n}</label><input data-sp="${k}" value="${esc(val ?? "")}" ${extra || ""}></div>`;
      let f = "";
      if (pf.rol === "fuente") f = `<div class="grid3">${campo("V", "Voltaje (V)", p.V ?? pf.V ?? v?.p.V)}${campo("Imax", "Corriente máx. (mA)", p.Imax ?? pf.Imax ?? v?.p.Imax)}${campo("mAh", "Capacidad (mAh)", p.mAh ?? pf.mAh ?? v?.p.mAh)}</div>`;
      else if (pf.reg) f = `<div class="grid3">${pf.reg.tipo !== "paso" ? campo("vout", "Salida (V)", p.vout ?? pf.reg.vout) : ""}${campo("imax", "Corriente máx. (mA)", p.imax ?? pf.reg.imax)}${pf.reg.eff ? campo("eff", "Eficiencia (0–1)", p.eff ?? pf.reg.eff) : ""}</div>${pf.rol === "mcu" ? `<div class="grid2" style="margin-top:6px">${campo("I", "Consumo típico (mA)", it.I ?? pf.I)}${campo("Ipico", "Pico (mA)", it.Ipico ?? pf.Ipico)}</div>` : ""}`;
      else if (pf.rol === "carga") f = `<div class="grid2">${campo("I", "Consumo típico (mA)", it.I ?? pf.I)}${campo("Ipico", "Pico (mA)", it.Ipico ?? pf.Ipico)}</div>${pf.sinDato ? '<div class="small" style="color:var(--warn)">La ficha no trae consumo: valor supuesto de 10 mA.</div>' : ""}`;
      else if (pf.rol === "resistencia" || pf.rol === "capacitor") f = `<div class="grid2">${campo("valor", "Valor", it.valor, `placeholder="${pf.rol === "resistencia" ? "4k7" : "100n"}"`)}<div style="display:flex;align-items:flex-end"><button class="sm" data-sx="rot">⟳ Girar</button></div></div>`;
      else if (pf.rol === "led") f = `<div class="grid2"><div><label>Color</label><select data-sp="color">${Object.keys(COLOR_LED).map(c => `<option ${(p.color || "rojo") === c ? "selected" : ""}>${c}</option>`).join("")}</select></div>${campo("Vf", "Vf (V)", p.Vf ?? COLOR_LED[p.color || "rojo"][0])}</div>`;
      return `<div class="panel" style="padding:10px;margin-bottom:10px;border-color:rgba(56,189,248,.4)"><div class="row" style="justify-content:space-between"><b>${esc(it.ref)} · ${esc(I.c.nombre)}</b><span class="tag">${esc({ mcu: "MCU", fuente: "fuente", regulador: "regulador", carga: "carga", resistencia: "resistencia", capacitor: "capacitor", led: "LED", gnd: "tierra", pasivo: "pasivo" }[pf.rol] || pf.rol)}</span></div>
        <div style="margin-top:6px">${f}</div><div class="row" style="margin-top:8px;gap:4px"><button class="sm" data-sx="flip">⇋ Voltear</button><button class="sm" data-sx="dup">⧉ Duplicar</button>${it.id.startsWith("@") ? "" : `<a class="btn sm" href="#/c/${encodeURIComponent(it.id)}" target="_blank" rel="noopener">Ficha ↗</a>`}<button class="sm danger" data-sx="del">🗑 Quitar</button></div></div>`;
    }
    function bindSel(box) {
      const it = C.inst.find(x => x.ref === st.sel); if (!it) return;
      $$("[data-sp]", box).forEach(i => i.onchange = () => { snap(); const k = i.dataset.sp, val = i.value.trim();
        if (k === "valor") it.valor = window.ML && ML.valorBonito ? ML.valorBonito(comp(it.id), val) : val;
        else if (k === "I" || k === "Ipico") it[k] = val === "" ? null : num(val);
        else { it.p = it.p || {}; it.p[k] = k === "color" ? val : val === "" ? undefined : num(val); if (k === "color") it.p.Vf = COLOR_LED[val][0]; }
        cambio(); });
      $$("[data-sx]", box).forEach(b => b.onclick = () => accionSel(b.dataset.sx));
    }
    function accionSel(a) {
      const it = C.inst.find(x => x.ref === st.sel); if (!it) return; snap();
      if (a === "del") { C.inst = C.inst.filter(x => x !== it); C.cables = C.cables.filter(w => !w.a.startsWith(it.ref + ".") && !w.b.startsWith(it.ref + ".")); Object.keys(C.etiquetas).forEach(k => { if (k.startsWith(it.ref + ".")) delete C.etiquetas[k]; }); st.sel = null; }
      if (a === "flip") it.flip = !it.flip;
      if (a === "rot") it.rot = it.rot ? 0 : 90;
      if (a === "dup") { const n = Object.assign(clone(it), { ref: nuevaRef(it.id), x: it.x + 30, y: it.y + 30 }); C.inst.push(n); st.sel = n.ref; }
      cambio();
    }

    // ---------- referencias, colocar, aceptar
    function prefijo(id) { if (id === "@gnd") return "GND"; if (id === "@led") return "D"; if (id === "@boton") return "SW"; if (id.startsWith("@")) return "BT"; const c = comp(id); const pf = c && perfil(c); return !pf ? "U" : pf.rol === "resistencia" ? (/pot|trimmer/i.test(id) ? "RV" : "R") : pf.rol === "capacitor" ? "C" : pf.rol === "fuente" ? "BT" : pf.rol === "regulador" ? "PS" : pf.motor ? "M" : "U"; }
    function nuevaRef(id) { const p = prefijo(id); let n = 1; while (C.inst.some(x => x.ref === p + n)) n++; return p + n; }
    function colocar(id, x, y, extra) {
      const c = comp(id); if (!c) return null; snap();
      const it = Object.assign({ ref: nuevaRef(id), id, x: Math.round(x / 10) * 10, y: Math.round(y / 10) * 10 }, extra || {});
      if (VIRT[id]) it.p = Object.assign({}, VIRT[id].p, (extra || {}).p || {});
      C.inst.push(it); st.sel = it.ref; sincronizarBom(); cambio(); return it;
    }
    function sincronizarBom() {
      P.bom = P.bom || []; const cuenta = {}, clave = (id, v) => id + "|" + (v || "");
      for (const it of C.inst) { if (it.id.startsWith("@")) continue; const k = clave(it.id, it.valor); cuenta[k] = (cuenta[k] || 0) + 1; }
      P.bom = P.bom.filter(b => b.nota !== "desde el diagrama" || cuenta[clave(b.id, b.valor)]);
      for (const [k, n] of Object.entries(cuenta)) { const [id, valor] = k.split("|"); const b = P.bom.find(x => x.id === id && (x.valor || "") === valor);
        if (b) { if (b.nota === "desde el diagrama" || b.cantidad < n) b.cantidad = n; } else P.bom.push(Object.assign({ id, cantidad: n, nota: "desde el diagrama" }, valor ? { valor } : {})); }
    }
    function aceptar(idx) { snap(); const L = idx.map(i => st.sug[i]).filter(Boolean); for (const g of L) if (!C.cables.some(w => (w.a === g.a && w.b === g.b) || (w.a === g.b && w.b === g.a))) C.cables.push({ a: g.a, b: g.b }); st.sug = st.sug.filter((_, i) => !idx.includes(i)); cambio(); opt.toast && opt.toast(`${L.length} conexión(es) agregada(s)`); }
    function conectar(a, b) { if (!a || !b || a === b || !pinPos(a) || !pinPos(b)) return false; if (C.cables.some(w => (w.a === a && w.b === b) || (w.a === b && w.b === a))) return false; snap(); C.cables.push({ a, b }); cambio(); return true; }

    // ---------- orden automático
    function ordenar() {
      snap(); info();
      const col = it => { const pf = INFO.get(it.ref)?.pf; if (!pf) return 3; return pf.rol === "fuente" || it.id === "@gnd" ? 0 : pf.rol === "regulador" ? 1 : pf.rol === "mcu" ? 2 : ["resistencia", "capacitor", "led", "pasivo"].includes(pf.rol) ? 3 : 4; };
      const X = [0, 230, 470, 720, 860], Y = [0, 0, 0, 0, 0];
      for (const it of C.inst.slice().sort((a, b) => col(a) - col(b))) { const c = col(it), I = INFO.get(it.ref); it.x = X[c]; it.y = Y[c]; Y[c] += (I ? I.h : 60) + 30; }
      cambio(); ajustar();
    }
    function ajustar() {
      info(); const svg = $("#ciSvg"); if (!svg) return; const r = svg.getBoundingClientRect(); if (!C.inst.length) { st.k = 1; st.ox = -40; st.oy = -40; return; }
      const xs = [], ys = []; for (const it of C.inst) { const I = INFO.get(it.ref); if (!I) continue; xs.push(it.x - 60, it.x + I.w + 60); ys.push(it.y - 40, it.y + I.h + 30); }
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      st.k = Math.max(0.25, Math.min(1.6, Math.min(r.width / (x1 - x0), r.height / (y1 - y0)))); st.ox = x0 - (r.width / st.k - (x1 - x0)) / 2; st.oy = y0 - (r.height / st.k - (y1 - y0)) / 2;
    }
    function centrar(ref) { const it = C.inst.find(x => x.ref === ref), svg = $("#ciSvg"); if (!it || !svg) return; const r = svg.getBoundingClientRect(); st.ox = it.x - r.width / st.k / 2 + 60; st.oy = it.y - r.height / st.k / 2 + 40; }

    // ---------- deshacer / cambios
    function snap() { st.hist.push(JSON.stringify(C)); if (st.hist.length > 80) st.hist.shift(); st.fut = []; }
    function deshacer() { if (!st.hist.length) return; st.fut.push(JSON.stringify(C)); Object.assign(C, JSON.parse(st.hist.pop())); cambio(); }
    function rehacer() { if (!st.fut.length) return; st.hist.push(JSON.stringify(C)); Object.assign(C, JSON.parse(st.fut.pop())); cambio(); }
    function cambio() { sincronizarBom(); dibujar(); opt.onChange && opt.onChange(); }

    // ---------- interfaz
    host.innerHTML = `<div class="ci-layout">
      <div class="ci-lib panel"><input id="ciQ" placeholder="Buscar componente…"><div id="ciLib" class="ci-libl"></div></div>
      <div class="ci-centro"><div class="mo-bar row" style="gap:4px">
          <button class="sm" id="ciUndo" title="Deshacer (Ctrl+Z)">↶</button><button class="sm" id="ciRedo" title="Rehacer (Ctrl+Y)">↷</button><span class="mo-sep"></span>
          <button class="sm" id="ciOrd" title="Ordenar los bloques por función">▦ Ordenar</button><button class="sm" id="ciFit">Ajustar</button><button class="sm" id="ciZi">＋</button><button class="sm" id="ciZo">－</button><span class="mo-sep"></span>
          <button class="sm ${st.vista === "esq" ? "on" : ""}" data-vista="esq">Esquemático</button><button class="sm ${st.vista === "real" ? "on" : ""}" data-vista="real" title="Huella real a escala con cables tipo dupont">Vista real</button><span class="mo-sep"></span>
          <button class="sm ai-btn" id="ciSug">✦ Sugerir conexiones</button><button class="sm" id="ciPdf">🖨 Informe PDF</button>
          <select id="ciExp" class="sm" style="width:auto;padding:5px 8px"><option value="">Exportar…</option><option value="svg">Diagrama SVG</option><option value="png">Diagrama PNG</option><option value="csv">Conexiones CSV</option><option value="net">Netlist (texto)</option></select></div>
        <div class="canvas-wrap ci-canvas"><svg id="ciSvg"></svg><div class="ed-info" id="ciInfo">Clic en un pin y luego en otro para conectar · doble clic en un pin = etiqueta de red · arrastra el fondo para mover</div></div></div>
      <div class="ci-panel panel" id="ciPanel"></div></div>`;
    const svg = $("#ciSvg");
    function libreria() {
      const q = norm($("#ciQ").value.trim()), enBom = new Set((P.bom || []).map(b => b.id)), puestos = new Set(C.inst.map(i => i.id));
      const elec = Store.db.componentes.filter(c => !["Herrajes", "Materiales", "Cableado", "Prototipado"].includes(c.categoria) && c.tipo !== "mecanico" && c.tipo !== "material");
      const L = q ? elec.filter(c => norm(c.nombre + " " + c.id + " " + c.categoria + " " + (c.etiquetas || []).join(" ")).includes(q)).slice(0, 40) : elec.filter(c => enBom.has(c.id) && !puestos.has(c.id));
      const virt = Object.entries(VIRT).filter(([, v]) => !q || norm(v.nombre).includes(q));
      $("#ciLib").innerHTML = (!q && L.length ? `<div class="grp-t">Del BOM (sin colocar)</div>` : "") + L.map(c => `<div class="mo-item" draggable="true" data-add="${esc(c.id)}"><span>${esc(c.nombre)}</span><span class="muted small">${esc(c.categoria)}</span></div>`).join("")
        + (!q ? `<div class="grp-t">Fuentes y básicos</div>` : "") + virt.map(([id, v]) => `<div class="mo-item" draggable="true" data-add="${id}">${v.ic} <span>${esc(v.nombre)}</span></div>`).join("")
        + (!q ? `<div class="small muted" style="padding:8px">Escribe para buscar en toda la biblioteca (sensores, ESP32, reguladores, resistencias…).</div>` : "");
      $$("[data-add]", host).forEach(d => {
        d.onclick = () => { const r = svg.getBoundingClientRect(); const [x, y] = toW(r.width / 2 - 70, r.height / 2 - 40); colocar(d.dataset.add, x + (C.inst.length % 5) * 20, y + (C.inst.length % 5) * 20); libreria(); };
        d.ondragstart = e => e.dataTransfer.setData("text/ml-comp", d.dataset.add);
      });
    }
    $("#ciQ").oninput = libreria;
    svg.ondragover = e => e.preventDefault();
    svg.ondrop = e => { const id = e.dataTransfer.getData("text/ml-comp"); if (!id) return; e.preventDefault(); e.stopPropagation(); const r = svg.getBoundingClientRect(); const [x, y] = toW(e.clientX - r.left, e.clientY - r.top); colocar(id, x - 60, y - 20); libreria(); };
    const pt = e => { const r = svg.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    svg.onpointerdown = e => {
      const [sx, sy] = pt(e), [wx, wy] = toW(sx, sy), t = e.target; svg.setPointerCapture(e.pointerId); st.ptrs.set(e.pointerId, [sx, sy]);
      if (st.ptrs.size === 2) { const [a, b] = [...st.ptrs.values()]; st.drag = { pinch: { d0: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, k0: st.k, mw: toW((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) } }; return; }
      const pin = t.dataset && t.dataset.pin;
      if (pin) { if (st.desde && st.desde !== pin) { conectar(st.desde, pin); st.desde = null; st.cursor = null; dibujar(); } else { st.desde = st.desde === pin ? null : pin; st.drag = { desdePin: pin, sx, sy }; dibujar(); } return; }
      if (t.dataset && t.dataset.sg != null) { aceptar([+t.dataset.sg]); return; }
      if (t.dataset && t.dataset.w != null) { st.selC = +t.dataset.w; st.sel = null; st.tab = "cables"; dibujar(); return; }
      const g = t.closest && t.closest("[data-i]");
      if (g) { const ref = g.dataset.i, it = C.inst.find(x => x.ref === ref); st.sel = ref; st.selC = null; st.drag = { it, dx: wx - it.x, dy: wy - it.y, moved: false, snap: JSON.stringify(C) }; dibujar(); return; }
      if (st.desde) { st.desde = null; st.cursor = null; }
      st.sel = null; st.selC = null; st.drag = { pan: [sx, sy, st.ox, st.oy] }; dibujar();
    };
    svg.onpointermove = e => {
      const [sx, sy] = pt(e), [wx, wy] = toW(sx, sy), d = st.drag; if (st.ptrs.has(e.pointerId)) st.ptrs.set(e.pointerId, [sx, sy]);
      if (d && d.pinch) { if (st.ptrs.size < 2) return; const [a, b] = [...st.ptrs.values()], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; st.k = Math.max(0.2, Math.min(4, d.pinch.k0 * Math.hypot(a[0] - b[0], a[1] - b[1]) / d.pinch.d0)); const [nx, ny] = toW(...mid); st.ox += d.pinch.mw[0] - nx; st.oy += d.pinch.mw[1] - ny; dibujar(); return; }
      if (st.desde) { st.cursor = [wx, wy]; if (!d) { dibujar(); return; } }
      if (!d) return;
      if (d.pan) { st.ox = d.pan[2] - (sx - d.pan[0]) / st.k; st.oy = d.pan[3] - (sy - d.pan[1]) / st.k; dibujar(); }
      else if (d.it) { const nx = Math.round((wx - d.dx) / 10) * 10, ny = Math.round((wy - d.dy) / 10) * 10; if (nx !== d.it.x || ny !== d.it.y) { d.it.x = nx; d.it.y = ny; d.moved = true; dibujar(); } }
      else if (d.desdePin) dibujar();
    };
    svg.onpointerup = e => {
      st.ptrs.delete(e.pointerId); const d = st.drag; if (d && d.pinch) { if (!st.ptrs.size) st.drag = null; return; } st.drag = null;
      if (d && d.it && d.moved) { st.hist.push(d.snap); st.fut = []; opt.onChange && opt.onChange(); }
      if (d && d.desdePin) { const t = document.elementFromPoint(e.clientX, e.clientY); const p2 = t && t.dataset && t.dataset.pin; if (p2 && p2 !== d.desdePin) { conectar(d.desdePin, p2); st.desde = null; st.cursor = null; dibujar(); } }
    };
    svg.ondblclick = e => { const pin = e.target.dataset && e.target.dataset.pin; if (!pin) return; const ac = C.etiquetas[pin] || ""; const n = prompt("Etiqueta de red (los pines con el mismo nombre quedan conectados). Vacío = quitar.\nEj.: 3V3, 5V, GND, SDA", ac); if (n == null) return; snap(); if (n.trim()) C.etiquetas[pin] = n.trim().toUpperCase(); else delete C.etiquetas[pin]; st.desde = null; cambio(); };
    svg.onwheel = e => { e.preventDefault(); const [sx, sy] = pt(e), [wx, wy] = toW(sx, sy); st.k = Math.max(0.2, Math.min(4, st.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12))); st.ox = wx - sx / st.k; st.oy = wy - sy / st.k; dibujar(); };
    const onKey = e => {
      if (!host.isConnected) return document.removeEventListener("keydown", onKey);
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); deshacer(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); rehacer(); }
      else if (e.key === "Delete" || e.key === "Backspace") { if (st.selC != null) { snap(); C.cables.splice(st.selC, 1); st.selC = null; cambio(); } else if (st.sel) accionSel("del"); }
      else if (e.key === "Escape") { st.desde = null; st.cursor = null; st.sug = []; dibujar(); }
      else if (e.key.toLowerCase() === "r" && st.sel) accionSel(INFO.get(st.sel)?.dos ? "rot" : "flip");
    };
    document.addEventListener("keydown", onKey);
    $("#ciUndo").onclick = deshacer; $("#ciRedo").onclick = rehacer; $("#ciOrd").onclick = ordenar;
    $("#ciFit").onclick = () => { ajustar(); dibujar(); };
    $("#ciZi").onclick = () => { st.k = Math.min(4, st.k * 1.2); dibujar(); }; $("#ciZo").onclick = () => { st.k = Math.max(0.2, st.k / 1.2); dibujar(); };
    $("#ciSug").onclick = () => { st.sug = sugerir(); st.tab = "sug"; opt.toast && opt.toast(st.sug.length ? `${st.sug.length} conexiones sugeridas (moradas): acéptalas en el panel o con clic` : "No encontré conexiones que sugerir"); dibujar(); };
    $$("[data-vista]", host).forEach(b => b.onclick = () => { st.vista = C.vista = b.dataset.vista; $$("[data-vista]", host).forEach(x => x.classList.toggle("on", x === b)); ajustar(); dibujar(); opt.onChange && opt.onChange(); });
    $("#ciPdf").onclick = () => informe();
    $("#ciExp").onchange = e => { const v = e.target.value; e.target.value = ""; exportar(v); };
    new ResizeObserver(() => { if (host.isConnected) dibujar(); }).observe(svg);

    // ---------- exportar e informe
    function svgLimpio(fondo) {
      info(); const xs = [], ys = []; for (const it of C.inst) { const I = INFO.get(it.ref); if (!I) continue; xs.push(it.x - 80, it.x + I.w + 80); ys.push(it.y - 40, it.y + I.h + 30); }
      if (!xs.length) return "<svg xmlns='http://www.w3.org/2000/svg'/>";
      const x0 = Math.min(...xs), y0 = Math.min(...ys), W = Math.max(...xs) - x0, H = Math.max(...ys) - y0;
      const k0 = [st.k, st.ox, st.oy, st.sel, st.selC, st.sug]; st.k = 1; st.ox = x0; st.oy = y0; st.sel = null; st.selC = null; st.sug = [];
      dibujar(); const inner = $("#ciSvg").innerHTML.replace(/<rect width="100%" height="100%" fill="url\(#ciGrid\)"\/>/, fondo ? `<rect width="100%" height="100%" fill="${fondo}"/>` : "");
      [st.k, st.ox, st.oy, st.sel, st.selC, st.sug] = k0; dibujar();
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Segoe UI, Arial, sans-serif">${inner}</svg>`;
    }
    function filasCables(calc, conCal) { const Imax = Math.max(0, ...calc.R.filter(x => x.V > 0).map(x => x.Ip || 0)); return C.cables.map((w, i) => { const r = calc.R.find(x => x.pins.includes(w.a)); const f = [i + 1, w.a, w.b, r ? nombreRed(r) : "", r && r.V != null ? r.V : "", r && r.V != null && !r.gnd ? fmtI(r.I || 0) : ""]; if (conCal) f.push(r && r.gnd ? calibre(Imax) : r && r.V != null ? calibre(r.Ip || r.I || 0) : "señal (26–28 AWG)"); return f; }); }
    function exportar(tipo) {
      const nom = (P.id || "circuito") + "_diagrama", calc = calcular();
      const bajar = (txt, n, mime) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([txt], { type: mime })); a.download = n; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
      if (tipo === "svg") bajar(svgLimpio("#0b1220"), nom + ".svg", "image/svg+xml");
      if (tipo === "png") { const s = svgLimpio("#0b1220"), im = new Image(); im.onload = () => { const cv = document.createElement("canvas"); cv.width = im.width * 2; cv.height = im.height * 2; const g = cv.getContext("2d"); g.scale(2, 2); g.drawImage(im, 0, 0); cv.toBlob(b => { const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = nom + ".png"; a.click(); }); }; im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s); }
      if (tipo === "csv") bajar("﻿" + [["#", "Desde", "Hasta", "Red", "Voltaje (V)", "Corriente"], ...filasCables(calc)].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n"), nom + "_conexiones.csv", "text/csv");
      if (tipo === "net") bajar(`* Netlist MountLab · ${P.nombre}\n* Componentes\n${C.inst.map(it => `${it.ref}\t${it.id}${it.valor ? "\t" + it.valor : ""}`).join("\n")}\n* Redes\n${calc.R.map(r => `NET ${nombreRed(r).replace(/\s/g, "_")}\t${r.pins.join(" ")}`).join("\n")}\n`, nom + ".net.txt", "text/plain");
    }
    function informe() {
      const calc = calcular(), dia = svgLimpio("#ffffff").replace(/fill="#0f172a"/g, 'fill="#f8fafc"').replace(/fill="#cbd5e1" font-size="1([01])"/g, 'fill="#1e293b" font-size="1$1"').replace(/fill="#e2e8f0"/g, 'fill="#f1f5f9"').replace(/stroke="#334155"/g, 'stroke="#64748b"').replace(/fill="#1e2a3d"/g, 'fill="#e2e8f0"');
      const bom = (P.bom || []).map(b => { const c = Store.db.componentes.find(x => x.id === b.id) || {}; const pm = (c.precios || []).filter(p => +p.precio_cop > 0).sort((a, b) => a.precio_cop - b.precio_cop)[0]; return { b, c, pm }; });
      const total = bom.reduce((s, x) => s + (x.pm ? x.pm.precio_cop * x.b.cantidad : 0), 0);
      const cop = v => "$" + Math.round(v).toLocaleString("es-CO");
      const cargas = calc.R.flatMap(r => r.cargas.map(c => Object.assign({ V: r.V }, c)));
      const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Informe · ${esc(P.nombre)}</title><style>
        body{font:12px/1.45 "Segoe UI",Arial,sans-serif;color:#0f172a;margin:24px}h1{font-size:22px;margin:0}h2{font-size:15px;margin:22px 0 8px;border-bottom:2px solid #0ea5e9;padding-bottom:3px}
        table{border-collapse:collapse;width:100%;margin:4px 0}th,td{border:1px solid #cbd5e1;padding:4px 6px;text-align:left;vertical-align:top}th{background:#e0f2fe}.num{text-align:right}code{font:11px Consolas,monospace}
        .k{display:flex;gap:10px;flex-wrap:wrap}.k div{border:1px solid #cbd5e1;border-radius:8px;padding:8px 12px}.k b{display:block;font-size:18px}.rojo{color:#b91c1c}.amar{color:#a16207}.dia{border:1px solid #cbd5e1;border-radius:8px;padding:6px;text-align:center}.dia svg{max-width:100%;height:auto}
        .cab{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #0f172a;padding-bottom:8px}.muted{color:#64748b}@media print{h2{page-break-after:avoid}table,.dia{page-break-inside:avoid}.np{display:none}}</style></head><body>
        <div class="np" style="background:#e0f2fe;padding:8px 12px;border-radius:8px;margin-bottom:12px">Usa <b>Imprimir → Guardar como PDF</b> (horizontal se ve mejor si el diagrama es ancho). <button onclick="print()">🖨 Imprimir / PDF</button></div>
        <div class="cab"><div><div class="muted">MountLab · Informe de circuito</div><h1>${esc(P.nombre)}</h1><div>${esc(P.descripcion || "")}</div></div><div class="muted" style="text-align:right">${new Date().toLocaleDateString("es-CO")}<br>Proyecto ${esc(P.id)}</div></div>
        <h2>Resumen</h2><div class="k"><div><b>${C.inst.length}</b>componentes</div><div><b>${C.cables.length}</b>conexiones</div><div><b>${calc.R.length}</b>redes</div>${calc.resumenF.map(f => `<div><b>${f.V} V · ${fmtI(f.I)}</b>${esc(f.ref)} ${esc(f.nombre)} (pico ${fmtI(f.Ip)} / ${fmtI(f.Imax)})${f.horas ? ` · autonomía ≈ ${f.horas.toFixed(1)} h` : ""}</div>`).join("")}<div><b>${calc.avisos.filter(a => a.nivel === "rojo").length} / ${calc.avisos.filter(a => a.nivel !== "rojo").length}</b>errores / advertencias</div>${total ? `<div><b>${cop(total)}</b>costo estimado</div>` : ""}</div>
        <h2>Diagrama de conexiones</h2><div class="dia">${dia}</div>
        <h2>Lista de materiales</h2><table><tr><th>#</th><th>Componente</th><th>Valor</th><th class="num">Cant.</th><th>Referencias</th><th class="num">Unitario</th><th class="num">Subtotal</th></tr>${bom.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.c.nombre || x.b.id)}</td><td>${esc(x.b.valor || "")}</td><td class="num">${x.b.cantidad}</td><td>${C.inst.filter(it => it.id === x.b.id && (it.valor || "") === (x.b.valor || "")).map(it => it.ref).join(", ")}</td><td class="num">${x.pm ? cop(x.pm.precio_cop) : "—"}</td><td class="num">${x.pm ? cop(x.pm.precio_cop * x.b.cantidad) : "—"}</td></tr>`).join("")}${C.inst.filter(it => it.id.startsWith("@")).map(it => `<tr><td></td><td>${esc(VIRT[it.id].nombre)}</td><td>${it.p && it.p.V ? it.p.V + " V" : ""}</td><td class="num">1</td><td>${it.ref}</td><td></td><td></td></tr>`).join("")}</table>
        <h2>Redes (nodos eléctricos)</h2><table><tr><th>Red</th><th>Voltaje</th><th class="num">Corriente típ.</th><th class="num">Pico</th><th>Pines</th></tr>${calc.R.map(r => `<tr><td><b>${esc(nombreRed(r))}</b></td><td>${r.gnd ? "0 V" : r.V != null ? r.V + " V" : "señal"}</td><td class="num">${r.V != null && !r.gnd ? fmtI(r.I || 0) : ""}</td><td class="num">${r.V != null && !r.gnd ? fmtI(r.Ip || 0) : ""}</td><td><code>${esc(r.pins.join(", "))}</code></td></tr>`).join("")}</table>
        <h2>Conexiones por componente</h2>${C.inst.map(it => { const I = INFO.get(it.ref); if (!I) return ""; const redDe = {}; calc.R.forEach(r => r.pins.forEach(k => redDe[k] = r)); const fil = I.pins.filter(p => redDe[it.ref + "." + p.n]); if (!fil.length) return "";
          return `<table><tr><th colspan="3">${esc(it.ref)} · ${esc(I.c.nombre)}${it.valor ? " · " + esc(it.valor) : ""}</th></tr>${fil.map(p => { const k = it.ref + "." + p.n, r = redDe[k]; return `<tr><td style="width:18%"><b>${esc(p.et)}</b></td><td style="width:32%" class="muted">${esc(p.func || "")}</td><td>${esc(nombreRed(r))}: <code>${esc(r.pins.filter(x => x !== k).join(", "))}</code></td></tr>`; }).join("")}</table>`; }).join("")}
        <h2>Lista de cables</h2><table><tr><th>#</th><th>Desde</th><th>Hasta</th><th>Red</th><th>V</th><th>Corriente</th><th>Calibre sugerido</th></tr>${filasCables(calc, true).map(r => `<tr>${r.map(v => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</table>
        <h2>Presupuesto de energía</h2><table><tr><th>Carga</th><th>Voltaje</th><th class="num">Típico</th><th class="num">Pico</th></tr>${cargas.map(c => `<tr><td>${esc(c.ref)} ${esc(c.nombre)}</td><td>${c.V} V</td><td class="num">${fmtI(c.I)}</td><td class="num">${fmtI(c.Ip)}</td></tr>`).join("")}</table>
        ${calc.regs.filter(g => g.activo).length ? `<table><tr><th>Regulador</th><th>Entrada</th><th>Salida</th><th class="num">Pérdida</th></tr>${calc.regs.filter(g => g.activo).map(g => `<tr><td>${esc(g.o.it.ref)} ${esc(g.o.I.c.nombre)} (${g.reg.tipo})</td><td>${g.rin.V} V · ${fmtI(g.Iin || 0)}</td><td>${g.vout} V · ${fmtI(g.Iout || 0)} de ${fmtI(+g.reg.imax || 0)}</td><td class="num">${(g.P || 0).toFixed(2)} W</td></tr>`).join("")}</table>` : ""}
        <p class="muted">Cálculo en corriente continua con los consumos de la ficha de cada componente (no es una simulación). Verificar en banco con multímetro.</p>
        <h2>Verificación</h2>${calc.avisos.length ? `<ul>${calc.avisos.map(a => `<li class="${a.nivel === "rojo" ? "rojo" : "amar"}">${a.nivel === "rojo" ? "⛔" : "⚠"} ${esc(a.txt)}</li>`).join("")}</ul>` : "<p>✓ Sin problemas detectados.</p>"}
        ${C.notas || P.documentacion ? `<h2>Notas</h2><p style="white-space:pre-wrap">${esc(C.notas || P.documentacion)}</p>` : ""}
        <script>setTimeout(()=>print(),600)<\/script></body></html>`;
      const w = window.open("", "_blank"); if (!w) { opt.toast && opt.toast("El navegador bloqueó la ventana del informe: permite ventanas emergentes"); return; }
      w.document.open(); w.document.write(html); w.document.close();
    }

    // ---------- aplicar un circuito propuesto (IA)
    function aplicarPropuesta(j) {
      snap(); const refs = {}, base = C.inst.length; let n = 0;
      for (const p of j.componentes || []) {
        const id = p.id && (VIRT[p.id] || Store.db.componentes.some(c => c.id === p.id)) ? p.id : null; if (!id) continue;
        const it = { ref: nuevaRef(id), id, x: 0, y: (base + n++) * 40 }; if (p.valor) it.valor = window.ML && ML.valorBonito ? ML.valorBonito(comp(id), p.valor) : p.valor; if (VIRT[id]) it.p = Object.assign({}, VIRT[id].p, p.p || {});
        C.inst.push(it); refs[p.ref || it.ref] = it.ref;
      }
      info(); let ok = 0, mal = [];
      const resolver = s => { const [r, pin] = partir(String(s)); const ref = refs[r] || r, I = INFO.get(ref); if (!I) return null; if (I.pos[pin]) return ref + "." + pin; const q = I.pins.find(x => norm(x.et) === norm(pin) || norm(x.n) === norm(pin) || (x.gpio != null && ("gpio" + x.gpio === norm(pin) || String(x.gpio) === pin))); return q ? ref + "." + q.n : null; };
      for (const [a, b] of j.conexiones || []) { const A = resolver(a), B = resolver(b); if (A && B) { C.cables.push({ a: A, b: B }); ok++; } else mal.push(`${a} → ${b}`); }
      sincronizarBom(); ordenar(); cambio(); return { ok, mal };
    }

    function conectarPar(ra, rb, bus) {
      const L = sugerir(), en = k => k.startsWith(ra + ".") || k.startsWith(rb + "."), entre = g => (g.a.startsWith(ra + ".") && g.b.startsWith(rb + ".")) || (g.a.startsWith(rb + ".") && g.b.startsWith(ra + "."));
      st.sug = L.filter(g => (entre(g) && (!bus || g.grupo === bus || g.grupo === "Alimentación")) || (g.grupo === "Alimentación" && (en(g.a) || en(g.b))));
      const n = st.sug.length; if (n) aceptar(st.sug.map((_, i) => i)); return n;
    }
    const api = { conectarPar, dibujar, colocar, conectar, sugerir: () => { st.sug = sugerir(); st.tab = "sug"; dibujar(); return st.sug.length; }, aceptarTodas: () => { const n = st.sug.length; aceptar(st.sug.map((_, i) => i)); return n; }, ordenar, informe, exportar, aplicarPropuesta, calcular: () => calcular(), circuito: () => C, VIRT, buscarInst: q => C.inst.map(it => ({ it, s: window.MLAgent ? MLAgent.sim(q, it.ref + " " + (INFO.get(it.ref)?.c.nombre || "") + " " + it.id) : 0 })).sort((a, b) => b.s - a.s)[0], pinesDe: ref => INFO.get(ref)?.pins || [], verTab: t => { st.tab = t; panel(ULT || calcular()); }, destroy: () => document.removeEventListener("keydown", onKey) };
    libreria(); setTimeout(() => { ajustar(); dibujar(); }, 30);
    return api;
  }

  window.MLCircuito = { montar, pinesDe, perfil, VIRT, partes, tipoPin };
})();
