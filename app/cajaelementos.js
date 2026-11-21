/* MountLab · catálogo de elementos que se le pueden poner a una caja y la forma EXACTA de su corte.
   Un mismo corte alimenta: las vistas 2D (SVG), el DXF, la vista 3D (three.js) y el STEP (CadQuery).
   Coordenadas del corte: mm en la cara, relativas al centro del elemento (u a lo largo de la cara, v hacia arriba / hacia +Y).
   corte = { t: "c", x, y, r } | { t: "r", x, y, w, h, r } (r = radio de esquina) | { t: "p", pts: [[x, y], …] } */
(function () {
  const r2 = v => Math.round(v * 100) / 100;
  // ---------------- generadores de corte (en orientación horizontal)
  const F = {
    circ: p => [{ t: "c", x: 0, y: 0, r: p.d / 2 }],
    rect: p => [{ t: "r", x: 0, y: 0, w: p.w, h: p.h, r: p.radio || 0 }],
    oblongo: p => [{ t: "r", x: 0, y: 0, w: p.w, h: p.h, r: Math.min(p.w, p.h) / 2 }],
    ranuras: p => { const paso = p.paso || 5, ancho = p.ranura || 2.5, n = Math.max(1, Math.floor((p.h + paso - ancho) / paso)), out = [], y0 = -((n - 1) * paso) / 2;
      for (let i = 0; i < n; i++) out.push({ t: "r", x: 0, y: y0 + i * paso, w: p.w, h: ancho, r: ancho / 2 }); return out; },
    agujeros: p => { const d = p.da || 3, paso = p.paso || 5, nx = Math.max(1, Math.floor((p.w - d) / paso) + 1), ny = Math.max(1, Math.floor((p.h - d) / paso) + 1), out = [];
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) out.push({ t: "c", x: (i - (nx - 1) / 2) * paso, y: (j - (ny - 1) / 2) * paso, r: d / 2 }); return out; },
    hex: p => { const s = p.lado || 2.2, dx = s * Math.sqrt(3) + (p.alma || 1.2), dy = s * 1.5 + (p.alma || 1.2) * 0.87, out = [];
      const nx = Math.max(1, Math.floor((p.w - 2 * s) / dx) + 1), ny = Math.max(1, Math.floor((p.h - 2 * s) / dy) + 1);
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx - (j % 2); i++) { const cx = (i - (nx - 1) / 2) * dx + (j % 2) * dx / 2, cy = (j - (ny - 1) / 2) * dy;
        out.push({ t: "p", pts: [0, 1, 2, 3, 4, 5].map(k => { const a = Math.PI / 6 + k * Math.PI / 3; return [r2(cx + s * Math.cos(a)), r2(cy + s * Math.sin(a))]; }) }); }
      return out; },
    ventilador: p => { const out = [], s = p.sep / 2, rt = p.tornillo / 2;
      if (p.rejilla === "anillos") { for (let r = p.d / 2; r > 4; r -= 4.5) out.push({ t: "anillo", x: 0, y: 0, r, ancho: 2.2 }); out.push({ t: "c", x: 0, y: 0, r: 3 }); }
      else out.push({ t: "c", x: 0, y: 0, r: p.d / 2 });
      [[-s, -s], [s, -s], [s, s], [-s, s]].forEach(([x, y]) => out.push({ t: "c", x, y, r: rt })); return out; },
    dsub: p => { const a = p.arriba / 2, b = p.abajo / 2, h = p.alto / 2, s = p.sep / 2;
      return [{ t: "p", pts: [[-a, h], [a, h], [b, -h], [-b, -h]] }, { t: "c", x: -s, y: 0, r: 1.6 }, { t: "c", x: s, y: 0, r: 1.6 }]; },
    tornillos2: p => [{ t: "r", x: 0, y: 0, w: p.w, h: p.h, r: p.radio || 0 }, { t: "c", x: -p.sep / 2, y: 0, r: p.tornillo / 2 }, { t: "c", x: p.sep / 2, y: 0, r: p.tornillo / 2 }],
    chaflan: p => { const w = p.w / 2, h = p.h / 2, c = p.chaflan || 2;   // conector polarizado (XT60, XT30)
      return [{ t: "p", pts: [[-w + c, h], [w, h], [w, -h], [-w + c, -h], [-w, -h + c], [-w, h - c]] }, ...(p.sep ? [{ t: "c", x: -p.sep / 2, y: 0, r: 1.6 }, { t: "c", x: p.sep / 2, y: 0, r: 1.6 }] : [])]; },
    llave: p => [{ t: "c", x: 0, y: 0, r: p.d / 2 }, { t: "r", x: 0, y: (p.largo || 8) / 2, w: p.ranura || 3.5, h: p.largo || 8, r: (p.ranura || 3.5) / 2 }],
    antigiro: p => [{ t: "c", x: 0, y: 0, r: p.d / 2 }, { t: "c", x: p.sep, y: 0, r: p.ra }],
    plano: p => { const r = p.d / 2, f = p.plano ? Math.max(0.2, p.plano - r) : r * 0.86;   // plano = medida entre el plano y el lado opuesto   // agujero con plano (antigiro), como potenciómetros y jacks
      const pts = []; for (let k = 0; k <= 32; k++) { const a = -Math.PI / 2 + Math.acos(Math.min(1, f / r)) + (k / 32) * (2 * Math.PI - 2 * Math.acos(Math.min(1, f / r))); pts.push([r2(r * Math.cos(a)), r2(r * Math.sin(a))]); }
      return [{ t: "p", pts: pts.map(([x, y]) => [x, y]) }]; },
  };
  const VENT = [[25, 20, 3.2, 10], [30, 24, 3.2, 10], [40, 32, 3.4, 10], [50, 40, 3.4, 15], [60, 50, 3.4, 25], [70, 61.5, 4.3, 25], [80, 71.5, 4.3, 25], [92, 82.5, 4.3, 25], [120, 105, 4.3, 25], [140, 124.5, 4.3, 25]];
  // ---------------- catálogo: [clave, nombre, icono, forma, parámetros, fondo interior (mm), cara sugerida]
  const G = {
    "Ventilación": [
      ["rejilla_h", "Rejilla de ranuras horizontales", "▤", "ranuras", { w: 30, h: 15, paso: 5, ranura: 2.5 }, 0, "+X", { orientable: true, patron: true }],
      ["rejilla_v", "Rejilla de ranuras verticales", "▥", "ranuras", { w: 30, h: 15, paso: 5, ranura: 2.5 }, 0, "+X", { orientable: true, patron: true, orient: "v" }],
      ["rejilla_agujeros", "Rejilla de agujeros redondos", "⠿", "agujeros", { w: 30, h: 20, da: 3, paso: 5 }, 0, "tapa", { patron: true }],
      ["rejilla_hex", "Rejilla hexagonal (panal)", "⬡", "hex", { w: 40, h: 25, lado: 2.2, alma: 1.2 }, 0, "tapa", { patron: true }],
      ...VENT.map(([d, sep, t]) => [`rejilla_vent_${d}`, `Rejilla de anillos para ventilador ${d} mm`, "◎", "ventilador", { w: d, h: d, d: d - 3, sep, tornillo: t, rejilla: "anillos" }, 0, "tapa"]),
    ],
    "Ventiladores": VENT.flatMap(([d, sep, t, e]) => [[`vent_${d}`, `Ventilador ${d} × ${d} × ${e} mm`, "🌀", "ventilador", { w: d, h: d, d: d - 2, sep, tornillo: t }, e + 1, "tapa"]]),
    "Pantallas (ventanas)": [
      ["oled091", "OLED 0.91\" 128×32", "🖥", "rect", { w: 24, h: 8, radio: 0.5 }, 0, "tapa"],
      ["oled096", "OLED 0.96\" 128×64", "🖥", "rect", { w: 26, h: 15, radio: 0.5 }, 0, "tapa"],
      ["oled13", "OLED 1.3\" 128×64", "🖥", "rect", { w: 31, h: 17, radio: 0.5 }, 0, "tapa"],
      ["oled15", "OLED 1.5\" 128×128", "🖥", "rect", { w: 28, h: 28, radio: 0.5 }, 0, "tapa"],
      ["epaper154", "E-paper 1.54\"", "📄", "rect", { w: 28, h: 28, radio: 0.5 }, 0, "tapa"],
      ["epaper213", "E-paper 2.13\"", "📄", "rect", { w: 49, h: 24, radio: 0.5 }, 0, "tapa"],
      ["epaper29", "E-paper 2.9\"", "📄", "rect", { w: 67, h: 30, radio: 0.5 }, 0, "tapa"],
      ["tft18", "TFT 1.8\" (ST7735)", "📱", "rect", { w: 36, h: 29, radio: 0.5 }, 0, "tapa"],
      ["tft24", "TFT 2.4\" táctil", "📱", "rect", { w: 50, h: 37, radio: 0.5 }, 0, "tapa"],
      ["tft28", "TFT 2.8\" táctil (ILI9341)", "📱", "rect", { w: 58, h: 44, radio: 0.5 }, 0, "tapa"],
      ["tft35", "TFT 3.5\" (ILI9488)", "📱", "rect", { w: 75, h: 50, radio: 0.5 }, 0, "tapa"],
      ["nextion43", "Nextion 4.3\"", "📱", "rect", { w: 96, h: 56, radio: 0.5 }, 0, "tapa"],
      ["lcd7", "LCD 7\" (HDMI)", "🖵", "rect", { w: 155, h: 88, radio: 0.5 }, 0, "tapa"],
      ["lcd1602", "LCD 16×2", "▭", "rect", { w: 71, h: 24, radio: 0.5 }, 0, "tapa"],
      ["lcd2004", "LCD 20×4", "▭", "rect", { w: 78, h: 27, radio: 0.5 }, 0, "tapa"],
      ["seg7_4", "Display 7 segmentos × 4 (0.56\")", "🔢", "rect", { w: 50, h: 19, radio: 0.5 }, 0, "tapa"],
      ["ventana_libre", "Ventana rectangular libre", "▭", "rect", { w: 40, h: 25, radio: 1 }, 0, "tapa", { libre: true }],
    ],
    "LED e indicadores": [
      ["led3", "LED 3 mm", "💡", "circ", { d: 3.2 }, 8, "tapa"], ["led5", "LED 5 mm", "💡", "circ", { d: 5.2 }, 10, "tapa"],
      ["led8", "LED 8 mm", "💡", "circ", { d: 8.2 }, 12, "tapa"], ["led10", "LED 10 mm", "💡", "circ", { d: 10.2 }, 14, "tapa"],
      ["portaled5", "Portaled cromado 5 mm", "🔆", "circ", { d: 8 }, 14, "tapa"], ["portaled3", "Portaled cromado 3 mm", "🔆", "circ", { d: 6 }, 12, "tapa"],
      ["piloto8", "Piloto metálico 8 mm", "🔴", "circ", { d: 8.2 }, 22, "tapa"], ["piloto12", "Piloto metálico 12 mm", "🔴", "circ", { d: 12.2 }, 24, "tapa"],
      ["piloto16", "Piloto metálico 16 mm", "🔴", "circ", { d: 16.2 }, 28, "tapa"], ["piloto22", "Piloto industrial 22 mm", "🔴", "circ", { d: 22.3 }, 38, "tapa"],
      ["anillo_led", "Anillo LED WS2812 (ventana 12 LED)", "⭕", "anillo_ventana", { d: 37, di: 23 }, 4, "tapa"],
    ],
    "Pulsadores": [
      ["tactil", "Pulsador táctil 6×6 (acceso con varilla)", "•", "circ", { d: 4 }, 6, "tapa"],
      ["pbs110", "Pulsador PBS-110 (7 mm)", "●", "circ", { d: 7.2 }, 18, "tapa"],
      ["puls12", "Pulsador metálico 12 mm", "●", "circ", { d: 12.2 }, 20, "tapa"], ["puls16", "Pulsador metálico 16 mm", "●", "circ", { d: 16.2 }, 26, "tapa"],
      ["puls19", "Pulsador metálico 19 mm", "●", "circ", { d: 19.2 }, 28, "tapa"], ["puls22", "Pulsador industrial 22 mm", "●", "circ", { d: 22.3 }, 40, "tapa"],
      ["puls16led", "Pulsador 16 mm con LED anillo", "◉", "circ", { d: 16.2 }, 30, "tapa"], ["puls22led", "Pulsador 22 mm con LED anillo", "◉", "circ", { d: 22.3 }, 35, "tapa"],
      ["emergencia", "Paro de emergencia (hongo) 22 mm", "🛑", "plano", { d: 22.3, plano: 21 }, 45, "tapa"],
      ["reset", "Agujero de reset (clip)", "·", "circ", { d: 1.8 }, 4, "-Y"],
    ],
    "Interruptores": [
      ["kcd11", "Balancín KCD11 mini (19 × 13)", "⏻", "rect", { w: 19.2, h: 13, radio: 0.3 }, 20, "-Y", { orientable: true }],
      ["kcd1", "Balancín KCD1 (21 × 15)", "⏻", "rect", { w: 21.2, h: 15, radio: 0.3 }, 22, "-Y", { orientable: true }],
      ["kcd3", "Balancín KCD3 con luz (28.5 × 22)", "⏻", "rect", { w: 28.5, h: 22, radio: 0.3 }, 28, "-Y", { orientable: true }],
      ["kcd4", "Balancín doble KCD4 (31 × 25)", "⏻", "rect", { w: 31, h: 25, radio: 0.3 }, 28, "-Y", { orientable: true }],
      ["mts6", "Palanca mini MTS (agujero 6 mm)", "⎇", "circ", { d: 6.2 }, 16, "-Y"], ["palanca12", "Palanca 12 mm (agujero 12 mm)", "⎇", "circ", { d: 12.2 }, 25, "-Y"],
      ["deslizante", "Deslizante SS12F (ranura 9 × 4)", "⇆", "tornillos2", { w: 9, h: 4, radio: 0.5, sep: 15, tornillo: 2.2 }, 8, "-Y", { orientable: true }],
      ["llave", "Interruptor de llave 19 mm", "🔑", "plano", { d: 19.2, plano: 18 }, 32, "-Y"],
      ["rotativo", "Selector rotativo / potenciómetro (eje 7 mm)", "🎛", "circ", { d: 7.2 }, 15, "tapa"], ["encoder", "Encoder rotativo EC11 (7 mm)", "🎛", "circ", { d: 7.2 }, 15, "tapa"],
      ["pote16", "Potenciómetro 16 mm (agujero 7 + antigiro)", "🎛", "antigiro", { d: 7.2, sep: 7.8, ra: 1.3, w: 18, h: 7.2 }, 18, "tapa"],
    ],
    "USB": [
      ["usbc", "USB-C de panel (abertura)", "⌁", "oblongo", { w: 9.4, h: 3.6 }, 22, "-Y", { orientable: true }],
      ["usbc_tornillos", "USB-C de panel con tornillos", "⌁", "tornillos2", { w: 10, h: 4, radio: 1.8, sep: 20, tornillo: 3.2 }, 25, "-Y", { orientable: true }],
      ["microusb", "Micro-USB (abertura)", "⌁", "rect", { w: 8.4, h: 3.4, radio: 0.8 }, 18, "-Y", { orientable: true }],
      ["miniusb", "Mini-USB (abertura)", "⌁", "rect", { w: 8, h: 4.4, radio: 0.8 }, 18, "-Y", { orientable: true }],
      ["usba", "USB-A de panel", "⇌", "tornillos2", { w: 13.4, h: 6, radio: 0.5, sep: 26, tornillo: 3.2 }, 25, "-Y", { orientable: true }],
      ["usbb", "USB-B de panel", "⇌", "tornillos2", { w: 12.4, h: 11.4, radio: 0.8, sep: 26, tornillo: 3.2 }, 28, "-Y"],
    ],
    "Alimentación": [
      ["jack_dc022", "Jack DC 5.5 × 2.1 de panel roscado (Ø 11 mm)", "⚡", "plano", { d: 11.2, plano: 10.4 }, 18, "+Y"],
      ["jack_dc099", "Jack DC 5.5 × 2.1 de panel (Ø 8 mm)", "⚡", "circ", { d: 8.2 }, 16, "+Y"],
      ["jack_pcb", "Jack DC de PCB (abertura 9 × 11)", "⚡", "rect", { w: 9.4, h: 11.4, radio: 1 }, 15, "+Y"],
      ["xt60", "XT60 de panel", "🔋", "chaflan", { w: 16, h: 8.4, chaflan: 2.5, sep: 21 }, 22, "+Y", { orientable: true }],
      ["xt30", "XT30 de panel", "🔋", "chaflan", { w: 11, h: 5.6, chaflan: 1.8, sep: 16 }, 18, "+Y", { orientable: true }],
      ["iec_c14", "Entrada IEC C14 (220 V)", "🔌", "tornillos2", { w: 27.5, h: 19.8, radio: 1, sep: 40, tornillo: 3.2 }, 30, "+Y"],
      ["iec_c8", "Entrada IEC C8 (ocho)", "🔌", "oblongo", { w: 19, h: 9.5 }, 22, "+Y", { orientable: true }],
      ["banana4", "Borne banana 4 mm", "⊕", "circ", { d: 8.2 }, 22, "+Y"], ["bornera_panel", "Borne de panel con rosca (M4)", "⊕", "circ", { d: 6.2 }, 25, "+Y"],
      ["fusible", "Portafusible de panel 5 × 20", "⌇", "plano", { d: 12.2, plano: 11.2 }, 40, "+Y"],
      ["solar_cable", "Paso de cable del panel solar", "☀", "circ", { d: 5 }, 8, "+Y"],
    ],
    "Datos y RF": [
      ["rj45", "RJ45 de panel", "🖧", "rect", { w: 16.2, h: 14, radio: 0.5 }, 25, "+Y"], ["rj45_tornillos", "RJ45 pasamuro con tornillos", "🖧", "tornillos2", { w: 18, h: 16, radio: 1, sep: 28, tornillo: 3.2 }, 25, "+Y"],
      ["rj11", "RJ11 / RJ12", "☎", "rect", { w: 12, h: 10, radio: 0.5 }, 20, "+Y"],
      ["db9", "DB9 (D-sub 9)", "⏚", "dsub", { arriba: 19.2, abajo: 16.4, alto: 10.6, sep: 25, w: 28.2, h: 10.6 }, 15, "+Y"],
      ["db15", "DB15 (D-sub 15)", "⏚", "dsub", { arriba: 25.7, abajo: 22.8, alto: 10.6, sep: 33.3, w: 36.5, h: 10.6 }, 15, "+Y"],
      ["db25", "DB25 (D-sub 25)", "⏚", "dsub", { arriba: 39.6, abajo: 36.8, alto: 10.6, sep: 47, w: 50.2, h: 10.6 }, 15, "+Y"],
      ["hdmi", "HDMI de panel", "🖵", "tornillos2", { w: 15.6, h: 6.2, radio: 0.8, sep: 28, tornillo: 3.2 }, 25, "+Y"],
      ["sd", "Ranura para tarjeta SD", "💾", "rect", { w: 26, h: 3, radio: 0.5 }, 30, "-Y", { orientable: true }],
      ["microsd", "Ranura para microSD", "💾", "rect", { w: 12.5, h: 2, radio: 0.5 }, 16, "-Y", { orientable: true }],
      ["sma", "Antena SMA pasamuro", "📡", "plano", { d: 6.5, plano: 5.9 }, 10, "+X"], ["rpsma", "Antena RP-SMA pasamuro", "📡", "plano", { d: 6.5, plano: 5.9 }, 10, "+X"],
      ["bnc", "BNC de panel", "◎", "plano", { d: 9.7, plano: 8.9 }, 20, "+X"], ["conector_n", "Conector N de panel", "◎", "circ", { d: 16 }, 25, "+X"],
      ["ufl_pasante", "Paso de antena u.FL (cable)", "·", "circ", { d: 3 }, 6, "+X"],
      ["gx12", "Aviación GX12", "◎", "plano", { d: 12.2, plano: 11.2 }, 25, "+Y"], ["gx16", "Aviación GX16", "◎", "plano", { d: 16.2, plano: 15.2 }, 28, "+Y"],
      ["gx20", "Aviación GX20", "◎", "plano", { d: 20.2, plano: 19.2 }, 32, "+Y"], ["m8", "Conector M8 de sensor", "◎", "circ", { d: 8.2 }, 22, "+Y"], ["m12", "Conector M12 de sensor", "◎", "circ", { d: 12.2 }, 28, "+Y"],
      ["audio35", "Jack de audio 3.5 mm", "🎧", "circ", { d: 6.2 }, 14, "-Y"],
    ],
    "Pasacables": [
      ["pg7", "Prensaestopa PG7 (cable 3–6.5 mm)", "🔌", "circ", { d: 12.7 }, 18, "-Y"], ["pg9", "Prensaestopa PG9 (cable 4–8 mm)", "🔌", "circ", { d: 15.4 }, 20, "-Y"],
      ["pg11", "Prensaestopa PG11 (cable 5–10 mm)", "🔌", "circ", { d: 18.8 }, 22, "-Y"], ["pg135", "Prensaestopa PG13.5 (cable 6–12 mm)", "🔌", "circ", { d: 20.6 }, 24, "-Y"],
      ["m12x15", "Prensaestopa métrico M12", "🔌", "circ", { d: 12.2 }, 18, "-Y"], ["m16x15", "Prensaestopa métrico M16", "🔌", "circ", { d: 16.2 }, 20, "-Y"], ["m20x15", "Prensaestopa métrico M20", "🔌", "circ", { d: 20.2 }, 22, "-Y"],
      ["goma6", "Pasacables de goma 6 mm", "〰", "circ", { d: 6.5 }, 6, "-Y"], ["goma8", "Pasacables de goma 8 mm", "〰", "circ", { d: 8.5 }, 6, "-Y"], ["goma10", "Pasacables de goma 10 mm", "〰", "circ", { d: 10.5 }, 6, "-Y"],
      ["ranura_cinta", "Ranura para cable plano (cinta)", "═", "oblongo", { w: 22, h: 2.5 }, 4, "-Y", { orientable: true }],
    ],
    "Fijación y otros": [
      ["tornillo_m3", "Agujero de tornillo M3", "⊙", "circ", { d: 3.2 }, 0, "fondo"], ["tornillo_m4", "Agujero de tornillo M4", "⊙", "circ", { d: 4.3 }, 0, "fondo"],
      ["colgar", "Ranura para colgar (ojo de cerradura)", "⚲", "llave", { d: 8, ranura: 4, largo: 8, w: 8, h: 16 }, 0, "fondo"],
      ["correa", "Ranura para correa / velcro 20 mm", "▬", "oblongo", { w: 22, h: 3 }, 0, "fondo", { orientable: true }],
      ["drenaje", "Agujero de drenaje / respiradero", "·", "circ", { d: 3 }, 0, "fondo"],
      ["buzzer", "Salida de buzzer (agujeros)", "🔊", "agujeros", { w: 12, h: 12, da: 1.5, paso: 3 }, 10, "tapa"],
      ["sensor_ventana", "Ventana para sensor (luz / IR)", "◌", "circ", { d: 8 }, 0, "tapa"],
      ["camara", "Ventana para lente de cámara", "📷", "circ", { d: 9 }, 0, "-Y"],
      ["agujero", "Agujero libre", "○", "circ", { d: 10 }, 0, "-Y", { libre: true }], ["rect_libre", "Rectángulo libre", "▭", "rect", { w: 20, h: 10, radio: 0 }, 0, "-Y", { libre: true, orientable: true }],
    ],
  };
  F.anillo_ventana = p => [{ t: "anillo", x: 0, y: 0, r: p.d / 2, ancho: (p.d - p.di) / 2 }];
  // ---------------- índice plano: clave → definición
  const ELEMENTOS = {}, GRUPOS = {};
  for (const [g, L] of Object.entries(G)) { GRUPOS[g] = []; for (const [k, n, ic, forma, par, prof, cara, extra] of L) {
    const w = par.w != null ? par.w : par.d, h = par.h != null ? par.h : par.d;
    ELEMENTOS[k] = Object.assign({ k, n, ic, forma, par, w, h, prof, cara, grupo: g }, extra || {}); GRUPOS[g].push(k); } }
  // compatibilidad con cajas guardadas antes del catálogo ampliado
  const ALIAS = { cable_pot: "pg7", cable_datos: "goma8", usb_c: "usbc", jack_dc: "jack_dc099", rejilla: "rejilla_h", ventilador: "vent_40", pantalla: "oled096", pulsador: "puls12", led: "portaled5", balancin: "kcd11" };
  const def = tipo => ELEMENTOS[tipo] || ELEMENTOS[ALIAS[tipo]] || null;

  const esLibre = d => !d || d.libre || d.patron;
  /** Tamaño real (w × h en la cara) de un elemento. En los libres y patrones son las medidas que escribe el usuario;
      en los de catálogo son fijas y la orientación vertical las intercambia. */
  function medida(e) {
    const d = def(e.tipo), vert = (e.orient || (d && d.orient)) === "v";
    if (esLibre(d)) return [e.w != null && e.w !== "" ? +e.w : d.w, e.h != null && e.h !== "" ? +e.h : d.h];
    return vert ? [d.h, d.w] : [d.w, d.h];
  }
  /** Cortes del elemento centrados en (0, 0) y orientados. */
  function cortes(e) {
    const d = def(e.tipo), forma = (d && d.forma) || e.forma || "rect", vert = (e.orient || (d && d.orient)) === "v", [w, h] = medida(e);
    const par = Object.assign({}, d ? d.par : {});
    if (esLibre(d)) { par.w = w; par.h = h; if (forma === "circ") par.d = w; }
    let girar = vert && !(d && d.libre && !d.patron);
    if (d && d.patron && vert) [par.w, par.h] = [h, w];   // el patrón se calcula horizontal y luego se gira
    let C = (F[forma] || F.rect)(par);
    if (girar) C = C.map(c => c.t === "p" ? { t: "p", pts: c.pts.map(([x, y]) => [-y, x]) } : c.t === "r" ? Object.assign({}, c, { x: -c.y, y: c.x, w: c.h, h: c.w }) : Object.assign({}, c, { x: -c.y, y: c.x }));
    return C;
  }
  /** Cortes en coordenadas absolutas de la cara (u, v = centro del elemento). */
  function cortesAbs(e) { return cortes(e).map(c => c.t === "p" ? { t: "p", pts: c.pts.map(([x, y]) => [r2(e.u + x), r2(e.v + y)]) } : Object.assign({}, c, { x: r2(e.u + c.x), y: r2(e.v + c.y) })); }
  /** SVG de los cortes con una transformación (x, y) → pantalla. */
  function svg(C, tx, ty, col, extra) {
    const k = Math.abs(tx(1) - tx(0)) || 1;
    return C.map(c => {
      if (c.t === "c") return `<circle cx="${tx(c.x)}" cy="${ty(c.y)}" r="${c.r * k}" fill="none" stroke="${col}" stroke-width=".5"${extra || ""}/>`;
      if (c.t === "anillo") return `<circle cx="${tx(c.x)}" cy="${ty(c.y)}" r="${(c.r - c.ancho / 2) * k}" fill="none" stroke="${col}" stroke-width="${c.ancho * k}" stroke-opacity=".55"${extra || ""}/>`;
      if (c.t === "r") { const x0 = Math.min(tx(c.x - c.w / 2), tx(c.x + c.w / 2)), y0 = Math.min(ty(c.y - c.h / 2), ty(c.y + c.h / 2)); return `<rect x="${x0}" y="${y0}" width="${c.w * k}" height="${c.h * k}" rx="${(c.r || 0) * k}" fill="none" stroke="${col}" stroke-width=".5"${extra || ""}/>`; }
      return `<polygon points="${c.pts.map(([x, y]) => `${tx(x)},${ty(y)}`).join(" ")}" fill="none" stroke="${col}" stroke-width=".5"${extra || ""}/>`;
    }).join("");
  }
  window.MLCajaEl = { GRUPOS, ELEMENTOS, def, medida, cortes, cortesAbs, svg, ALIAS };
})();
