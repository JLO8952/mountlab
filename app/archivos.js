/* MountLab · archivos que subes al chat (fotos y datasheets).
   - Lee PDF en el navegador con pdf.js (app/vendor/pdfjs, se carga solo cuando hace falta) y saca el texto por líneas.
   - Reduce las fotos (para la IA y para la imagen del componente).
   - analizar(): "cerebro local" para datasheets: referencia, fabricante, voltaje, corriente, interfaz, dirección I2C,
     temperatura, encapsulado y medidas, pines y descripción → propuesta para crear el componente (sin internet).
   Nada se guarda hasta que apruebes la propuesta. */
(function () {
  const MAX_PAG = 80;
  const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const r2 = v => Math.round(v * 100) / 100;
  let pdfjs = null;
  function cargarPdfjs() {
    if (pdfjs) return pdfjs;
    pdfjs = new Promise((res, rej) => {
      if (window.pdfjsLib) return res(window.pdfjsLib);
      const s = document.createElement("script"); s.src = "app/vendor/pdfjs/pdf.min.js";
      s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "app/vendor/pdfjs/pdf.worker.min.js"; res(window.pdfjsLib); };
      s.onerror = () => { pdfjs = null; rej(new Error("No se pudo cargar el lector de PDF")); }; document.head.appendChild(s);
    });
    return pdfjs;
  }
  const leerBuffer = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsArrayBuffer(f); });
  const leerUrl = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
  function b64DeBuffer(buf) { const u8 = new Uint8Array(buf); let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
  function reducir(src, max, tipo, fondo) {
    return new Promise((res, rej) => {
      const im = new Image(); im.onload = () => {
        const k = Math.min(1, max / Math.max(im.width, im.height)), cv = document.createElement("canvas"); cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
        const g = cv.getContext("2d"); if (fondo) { g.fillStyle = fondo; g.fillRect(0, 0, cv.width, cv.height); } g.drawImage(im, 0, 0, cv.width, cv.height); res(cv.toDataURL(tipo || "image/jpeg", 0.86));
      }; im.onerror = () => rej(new Error("Imagen no válida")); im.src = src;
    });
  }

  /** Lee un archivo → { id, nombre, mime, tam, kind: "pdf"|"imagen"|"texto", b64, dataUrl, thumb, texto, paginas } */
  async function leer(f) {
    const id = "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), mime = f.type || "", nombre = f.name || "archivo";
    const a = { id, nombre, mime, tam: f.size };
    if (mime === "application/pdf" || /\.pdf$/i.test(nombre)) {
      a.kind = "pdf"; a.mime = "application/pdf";
      const buf = await leerBuffer(f); a.b64 = b64DeBuffer(buf);
      try {
        const lib = await cargarPdfjs(), doc = await lib.getDocument({ data: new Uint8Array(buf) }).promise; a.paginas = doc.numPages;
        const L = [];
        for (let p = 1; p <= Math.min(doc.numPages, MAX_PAG); p++) {
          const pg = await doc.getPage(p), tc = await pg.getTextContent(), filas = new Map();
          for (const it of tc.items) { if (!it.str) continue; const y = Math.round(it.transform[5] / 2.5); const f2 = filas.get(y) || []; f2.push(it); filas.set(y, f2); }
          const ys = [...filas.keys()].sort((m, n) => n - m);
          L.push(`\f[página ${p}]`);
          for (const y of ys) { const its = filas.get(y).sort((m, n) => m.transform[4] - n.transform[4]); let s = "", x1 = null;
            for (const it of its) { const x = it.transform[4]; if (x1 != null && x - x1 > 1.5) s += x - x1 > 14 ? "   " : " "; s += it.str; x1 = x + (it.width || 0); }
            if (s.trim()) L.push(s.replace(/\s+$/, "")); }
          if (p === 1) { try { const vp = pg.getViewport({ scale: 1 }), k = 360 / vp.width, cv = document.createElement("canvas"), v2 = pg.getViewport({ scale: k }); cv.width = v2.width; cv.height = v2.height; const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height); await pg.render({ canvasContext: g, viewport: v2 }).promise; a.thumb = cv.toDataURL("image/jpeg", 0.8); } catch (e) { } }
        }
        a.texto = L.join("\n");
      } catch (e) { a.error = e.message; a.texto = ""; }
      return a;
    }
    if (/^image\//.test(mime) || /\.(jpe?g|png|webp|gif|bmp)$/i.test(nombre)) {
      a.kind = "imagen"; const src = await leerUrl(f);
      a.dataUrl = await reducir(src, 1600, "image/jpeg", "#fff"); a.mime = "image/jpeg"; a.b64 = a.dataUrl.split(",")[1];
      a.thumb = await reducir(src, 240, "image/jpeg", "#fff"); a.foto = await reducir(src, 900, "image/jpeg", "#fff");
      return a;
    }
    if (/^text\//.test(mime) || /\.(txt|md|csv|json)$/i.test(nombre)) { a.kind = "texto"; a.texto = await f.text(); return a; }
    throw new Error(`No sé leer “${nombre}”: sube una foto (JPG/PNG) o un PDF`);
  }

  // ------------------------------------------------------------------ análisis local de un datasheet
  const FABRICANTES = ["Texas Instruments", "Bosch Sensortec", "Bosch", "STMicroelectronics", "Microchip", "Atmel", "Analog Devices", "Maxim Integrated", "NXP", "Espressif", "InvenSense", "TDK", "Infineon", "onsemi", "ON Semiconductor", "Nordic Semiconductor", "Silicon Labs", "Sensirion", "Vishay", "Diodes Incorporated", "Allegro", "Renesas", "ROHM", "Murata", "Adafruit", "SparkFun", "SIMCom", "u-blox", "Quectel", "Melexis", "ams OSRAM", "ams AG", "Honeywell", "TE Connectivity", "Omron", "Panasonic", "Toshiba", "Winbond", "Raspberry Pi", "Advanced Monolithic Systems", "Arduino", "DFRobot", "Seeed", "WCH", "Semtech", "Nexperia", "Littelfuse", "Alpha & Omega", "Monolithic Power", "Richtek", "Torex", "Hope RF", "HopeRF", "Ai-Thinker", "Waveshare", "Pololu", "Broadcom", "Avago", "Cypress", "Lattice", "Xilinx", "Asair", "Aosong", "Winsen", "Plantower", "Hanwei", "Everlight", "Kingbright", "Cree", "Sharp", "Hitachi", "Fairchild", "Samsung", "Sony"];
  const CAT = [
    [/accelerometer|gyroscope|imu\b|magnetometer|temperature sensor|humidity|pressure sensor|barometric|gas sensor|light sensor|ambient light|proximity|hall|current sensor|heart rate|pulse oximet|spo2|ecg|thermocouple|load cell|ultrasonic|infrared|pir|color sensor|sensor/, ["Sensores", "Sensor"]],
    [/microcontroller|\bmcu\b|system on chip|\bsoc\b|wi-?fi.*bluetooth|risc-?v|arm cortex|xtensa/, ["Microcontroladores", "Controladores", "MCU"]],
    [/\b(gsm|gprs|lte|nb-iot|gnss|gps|lora|lorawan|zigbee|bluetooth low energy|ble|transceiver|rf module|nrf24)\b/, ["Comunicación", "Comunicaciones", "Módulos"]],
    [/ldo|voltage regulator|buck|boost|dc-dc|step-down|step-up|battery charger|charge controller|li-?ion|power management|protection ic/, ["Potencia", "Alimentación", "Energía", "Baterías"]],
    [/motor driver|h-bridge|stepper|servo|solenoid|relay/, ["Actuadores", "Motores", "Drivers"]],
    [/oled|lcd|display|tft|e-paper|led driver|7-segment/, ["Pantallas", "Displays", "Interfaz"]],
    [/amplifier|op-?amp|instrumentation amplifier|adc\b|analog-to-digital|dac\b|comparator/, ["Analógicos", "Sensores", "Otros"]],
    [/connector|header|terminal block/, ["Conectores"]],
  ];
  const INTERF = [["I2C", /\bI\s?[2²]\s?C\b|\bIIC\b|\bTWI\b/i], ["SPI", /\bSPI\b/], ["UART", /\bUART\b|\bUSART\b|\bRS-?232\b/], ["1-Wire", /\b1-?wire\b/i], ["CAN", /\bCAN\b(?! bus off)/], ["USB", /\bUSB\b/], ["I2S", /\bI2S\b|\bI²S\b/], ["PWM", /\bPWM\b/], ["Analógica", /analog output|analogue output|\bADC input\b/i], ["SDIO", /\bSDIO\b/], ["RS-485", /RS-?485/i]];
  const num = s => parseFloat(String(s).replace(",", "."));
  function cerca(T, claves, re, ventana) { // primer patrón re cerca de alguna palabra clave
    for (const k of claves) { const rk = new RegExp(k, "ig"); let m; while ((m = rk.exec(T))) { const seg = T.slice(m.index, m.index + (ventana || 160)); const r = seg.match(re); if (r) return r; } } return null;
  }
  function referencia(T, nombreArchivo) {
    const p1 = T.split("\f").slice(0, 3).join("\n"), cuenta = new Map();
    const re = /\b((?:[A-Z]{2,5}-)?[A-Z]{1,6}-?[0-9]{2,5}[A-Z0-9]{0,8}(?:-[A-Z0-9]{1,6})?)\b/g; let m;
    while ((m = re.exec(p1))) { const t = m[1]; if (/^(ISO|IEC|AEC|JESD|RoHS|REV|PAGE|DS|AN|UL|EN|IPC|JEDEC|ESD|HBM|CDM|MSL|PIN|GND|VDD|VCC|ADC|QFN|LGA|SOT|SOIC|TSSOP|DFN|MSOP|SO|VQFN|WLCSP|BGA|DIP)[-]?\d/.test(t)) continue; if (/^\d/.test(t)) continue; cuenta.set(t, (cuenta.get(t) || 0) + 1); }
    const nf = String(nombreArchivo || "").toUpperCase().replace(/\.PDF$/, "").replace(/[_ ]+/g, "-");
    let mejor = null; for (const [t, c] of cuenta) { const s = c + (nf.includes(t) ? 5 : 0) + (p1.slice(0, 400).includes(t) ? 3 : 0); if (!mejor || s > mejor.s) mejor = { t, s }; }
    return mejor && mejor.s >= 2 ? mejor.t : null;
  }
  function categoriaDe(t, existentes) {
    for (const [re, opciones] of CAT) if (re.test(t)) { for (const o of opciones) { const e = existentes.find(x => norm(x) === norm(o) || norm(x).startsWith(norm(o).slice(0, 6))); if (e) return e; } return opciones[0]; }
    return existentes.includes("Otros") ? "Otros" : "Otros";
  }
  function pinesDe(lineas) {
    let mejor = [], cur = [];
    for (const l of lineas) {
      const m = l.match(/^\s*(\d{1,3}|[A-H]\d{1,2})\s{1,}([A-Z][A-Z0-9_/+\-.#]{0,14})\s{2,}(.{3,90})$/) || l.match(/^\s*([A-Z][A-Z0-9_/+\-.#]{0,14})\s{2,}(\d{1,3})\s{2,}(.{3,90})$/);
      if (m) { const [n1, n2] = /^\d/.test(m[1]) || /^[A-H]\d/.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]]; cur.push({ n: n2, num: n1, func: m[3].replace(/\s{2,}.*/, "").trim().slice(0, 80) }); }
      else if (cur.length) { if (cur.length > mejor.length) mejor = cur; cur = []; }
    }
    if (cur.length > mejor.length) mejor = cur;
    const vistos = new Set(); return mejor.length >= 3 ? mejor.filter(p => !vistos.has(p.num) && vistos.add(p.num)).slice(0, 80).map(p => ({ n: p.n, func: `Pin ${p.num} · ${p.func}` })) : [];
  }
  function descripcion(lineas) {
    const i = lineas.findIndex(l => /^\s*(\d[\d.]*\s+)?(general description|description|overview|product overview|introduction|descripci[oó]n)\s*$/i.test(l));
    const desde = i >= 0 ? lineas.slice(i + 1, i + 14) : lineas.slice(2, 40);
    const t = desde.filter(l => l.length > 30 && !/^\[página/.test(l) && !/revision|\brev\.|copyright|(january|february|march|april|may|june|july|august|september|october|november|december)\s+20\d\d|all rights/i.test(l)).slice(0, 10).join(" ").replace(/\s+/g, " ").trim();
    const fr = t.match(/^(.{40,300}?[.])\s/); if (fr) return fr[1].trim();
    const c = t.slice(0, 280); return (t.length > 280 ? c.replace(/\s+\S*$/, "") + "…" : c).trim();
  }

  /** Propuesta (formato mountlab-propuesta) a partir del texto de un datasheet. */
  function analizar(a, opt) {
    opt = opt || {}; const T = a.texto || "", lin = T.split("\n"), tl = norm(T.slice(0, 60000)), cambios = {}, conf = {}, hall = [];
    const existentes = opt.categorias || [];
    const ref = referencia(T, a.nombre);
    let fab = null; for (const f of FABRICANTES) if (new RegExp("\\b" + f.replace(/[.*+?^${}()|[\]\\&]/g, "\\$&") + "\\b", "i").test(T.slice(0, 20000))) { fab = f; break; }
    // título: línea de la primera página que contiene la referencia y algo más
    const pag1 = T.split("\f")[1] || T.slice(0, 3000), l1 = pag1.split("\n").map(s => s.trim()).filter(s => s && !/^\[página/.test(s));
    const okT = s => s.length < 80 && !/^(this|the|these)\b/i.test(s) && !/datasheet|copyright|www\.|rev\.|revision|confidential|describes/i.test(s);
    let titulo = l1.find(s => ref && s.includes(ref) && s.length > ref.length + 6 && okT(s)) || l1.find(s => s.length > 12 && /[a-z]/.test(s) && okT(s)) || "";
    titulo = titulo.replace(/\s{2,}/g, " ").replace(/\b(datasheet|data sheet|product specification|preliminary)\b/ig, "").trim();
    const descTmp = descripcion(lin), que = (descTmp.match(/\b(?:is|are)\s+(?:an?|as|the)\s+(.{8,70}?)(?=\s+(?:based|with|that|which|for|in)\b|[.;(]|$)/i) || [])[1];
    let resto = ref ? titulo.replace(ref, "").replace(/^[\s:–\-,]+|[\s:–\-,]+$/g, "") : "";
    if (ref && resto.length < 4) resto = que ? que.replace(/,\s*$/, "") : "";
    const nombre = ref ? (resto ? `${ref} – ${resto.charAt(0).toUpperCase()}${resto.slice(1)}` : ref) : (titulo || a.nombre.replace(/\.pdf$/i, ""));
    cambios.nombre = nombre.slice(0, 90); conf.nombre = ref ? "media" : "baja";
    const id = (opt.idDe || (s => norm(s).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")))(ref || nombre).slice(0, 40) || "componente_nuevo";
    cambios.tipo = "electronico";
    cambios.categoria = categoriaDe(tl.slice(0, 8000), existentes); conf.categoria = "media";
    if (fab) { cambios.fabricante = fab; conf.fabricante = "alta"; }
    if (ref) { cambios.referencia = ref; conf.referencia = "alta"; }
    const desc = descripcion(lin); if (desc) { cambios["ficha.descripcion"] = desc; conf["ficha.descripcion"] = "media"; }
    // voltaje
    const RV = /(\d{1,2}(?:[.,]\d{1,2})?)\s*V?\s*(?:to|–|-|~|…|\.\.\.?)\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*V\b/i;
    let v = cerca(T, ["supply voltage", "operating voltage", "input voltage", "power supply", "\\bVDD\\b", "\\bVCC\\b", "\\bVIN\\b", "voltage range"], RV, 200) || T.slice(0, 6000).match(RV);
    if (v && num(v[1]) < num(v[2]) && num(v[2]) <= 60) { cambios["ficha.voltaje"] = `${num(v[1])} – ${num(v[2])} V`; conf["ficha.voltaje"] = "media"; hall.push("voltaje " + cambios["ficha.voltaje"]); }
    // corriente
    const RI = /(\d{1,4}(?:[.,]\d{1,3})?)\s*(µA|uA|μA|mA|A)\b/;
    const ci = cerca(T, ["supply current", "current consumption", "operating current", "active current", "power consumption", "\\bIDD\\b", "\\bICC\\b", "quiescent current"], RI, 220);
    if (ci) { cambios["ficha.corriente"] = `${num(ci[1])} ${ci[2].replace(/u|μ/, "µ")} (típ.)`; conf["ficha.corriente"] = "baja"; }
    // interfaces
    const ifs = INTERF.filter(([, re]) => { const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"); return (T.slice(0, 80000).match(g) || []).length >= 2; }).map(([n]) => n);
    if (ifs.length) { cambios["ficha.interfaz"] = ifs.join(", "); conf["ficha.interfaz"] = "alta"; hall.push(ifs.join("/")); }
    // especificaciones
    const esp = [];
    const ad = cerca(T, ["slave address", "i2c address", "i²c address", "device address", "7-bit address", "default address"], /0x([0-7][0-9A-F])\b/i, 120); if (ad && ifs.includes("I2C") && parseInt(ad[1], 16) >= 8 && parseInt(ad[1], 16) <= 0x77) esp.push({ param: "Dirección I2C", valor: "0x" + ad[1].toUpperCase() });
    const tp = T.match(/(?:operating|ambient)?\s*temperature[^\n]{0,80}?(-\s?\d{2,3})\s*(?:°C|℃)?\s*(?:to|–|-|~|…)\s*\+?\s?(\d{2,3})\s*(?:°C|℃)/i); if (tp) esp.push({ param: "Temperatura de operación", valor: `${tp[1].replace(/\s/g, "")} a +${tp[2]} °C` });
    const ENC = /\b(LGA|QFN|VQFN|DFN|SOIC|SO|SOP|TSSOP|MSOP|SOT-?23|SOT-?223|SOT-?89|TO-?220|TO-?92|DIP|PDIP|BGA|WLCSP|QFP|LQFP|TQFP|HTSSOP|SON|USON)[- ]?(\d{1,3})?\b/;
    const enc = cerca(T, ["package", "packaging", "encapsulado"], ENC, 140) || T.slice(0, 8000).match(ENC); if (enc) esp.push({ param: "Encapsulado", valor: enc[0] });
    const RES = cerca(T, ["resolution"], /(\d{1,2})\s*-?\s*bits?/i, 80); if (RES) esp.push({ param: "Resolución", valor: RES[1] + " bits" });
    const ACC = cerca(T, ["accuracy"], /±\s?\d+(?:[.,]\d+)?\s*(?:°C|%|%RH|hPa|Pa|LSB|mg)/, 120); if (ACC) esp.push({ param: "Precisión", valor: ACC[0].replace(/\s/g, "") });
    if (esp.length) { cambios.especificaciones = esp; conf.especificaciones = "media"; }
    // medidas
    const RD = /(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:mm)?\s*[x×X]\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:mm)?(?:\s*[x×X]\s*(\d{1,3}(?:[.,]\d{1,2})?))?\s*mm/;
    let dm = cerca(T, ["dimension", "package", "size", "footprint", "outline", "module size"], RD, 160) || T.slice(0, 12000).match(RD);
    let dm2 = null;   // tabla de medidas tipo "Símbolo  Mín  Típ  Máx" (A = largo, B = ancho, C = alto)
    for (let i = 0; i < lin.length && !dm2; i++) if (/min.*typ.*max/i.test(lin[i]) && lin.slice(Math.max(0, i - 25), i + 25).some(l => /mechanical|dimension|package outline|medidas/i.test(l))) {
      const v = {}; for (const l of lin.slice(i + 1, i + 14)) { const m = l.match(/^\s*([A-C])\s+(-|[\d.,]+)\s+([\d.,]+)\s+(-|[\d.,]+)\s*$/) || l.match(/^\s*([A-C])\s+([\d.,]+)\s*$/); if (m) v[m[1]] = num(m.length > 3 ? m[3] : m[2]); }
      if (v.A && v.B) dm2 = [null, String(v.A), String(v.B), v.C ? String(v.C) : undefined];
    }
    const valido = d => d && num(d[1]) >= 0.5 && num(d[2]) >= 0.5 && num(d[1]) <= 300 && num(d[2]) <= 300;
    if (dm2 && (!valido(dm) || /mechanical/i.test(T))) dm = valido(dm2) ? dm2 : dm;
    const esModulo = /\bmodule\b|breakout|evaluation board|development board|\bboard\b/i.test(T.slice(0, 4000));
    if (dm) {
      const L = num(dm[1]), W = num(dm[2]), H = dm[3] ? num(dm[3]) : null;
      if (valido(dm)) {
        cambios["ficha.dimensiones"] = `${L} × ${W}${H ? " × " + H : ""} mm`; conf["ficha.dimensiones"] = "media"; hall.push("medidas " + cambios["ficha.dimensiones"]);
        const Lm = Math.max(L, W), Wm = Math.min(L, W);
        if (H && Lm <= 35 && H <= 6) {   // chip o módulo SMD (sin pines de agujero): un prisma con sus medidas
          cambios.montaje = { pcb: [Lm, Wm, H], agujeros: [], altura_superior: 0, altura_inferior: 0, fijacion: "soldadura" };
          cambios.modelo = { base: { tipo: "prisma", forma: "rect", L: Lm, W: Wm, d: Lm, espesor: H, radio: 0, color: esModulo ? "#9ca3af" : "#1f2937" }, piezas: [] };
        } else if (Lm >= 6) {             // placa / módulo con pines
          cambios.montaje = { pcb: [Lm, Wm, 1.6], agujeros: [], altura_superior: H && H >= 3 ? r2(H - 1.6) : 0, altura_inferior: 0 };
          cambios.modelo = { base: { tipo: "placa", forma: "rect", L: Lm, W: Wm, d: Lm, espesor: 1.6, radio: 0, color: "#166534" }, piezas: [] };
        } else {
          const h = H || 1;
          cambios.montaje = { pcb: [Lm, Wm, h], agujeros: [], altura_superior: 0, altura_inferior: 0, fijacion: "soldadura" };
          cambios.modelo = { base: { tipo: "prisma", forma: "rect", L: Lm, W: Wm, d: Lm, espesor: h, radio: 0, color: "#1f2937" }, piezas: [] };
        }
        conf.montaje = "media"; conf.modelo = "media";
      }
    }
    const pins = pinesDe(lin); if (pins.length) { cambios.pines = pins; conf.pines = "baja"; hall.push(pins.length + " pines"); }
    cambios.etiquetas = [...new Set([...ifs.filter(i => i !== "Analógica"), ...(enc ? [enc[1]] : []), ...(fab ? [fab.split(" ")[0]] : [])])];
    if (!cambios.etiquetas.length) delete cambios.etiquetas;
    const fuentes = {}; Object.keys(cambios).forEach(k => fuentes[k] = "");
    return {
      componente: id, resumen: `Leído del PDF “${a.nombre}” (${a.paginas || "?"} págs.) sin internet${hall.length ? ": " + hall.join(" · ") : ""}. Revisa los campos marcados “baja”.`,
      cambios, confianza: conf, fuentes: {}, origen: "local",
    };
  }

  window.MLArchivos = { leer, analizar, reducir, cargarPdfjs };
})();
