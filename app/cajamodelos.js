/* MountLab · modelos 3D completos de los elementos de la caja (ventiladores, prensaestopas, pulsadores, conectores, pantallas…)
   y los volúmenes que ocupan por dentro, que entran en el cálculo de choques de la caja.
   Coordenadas locales del elemento (mm): x a lo largo de la cara, y hacia arriba de la cara (o +Y en tapa/fondo),
   z = 0 en la superficie EXTERIOR de la pared, z > 0 hacia afuera; la pared ocupa −esp…0 y el interior empieza en z = −esp.
   Primitivas en el formato de MLPlant: {f:"caja", cx, cy, w, h, z0, z1, r?, color} | {f:"cil", cx, cy, d, z0, z1, color} | {f:"perfil", eje:"z", pts, a0, a1, color}.
   Espacios: {tipo:"aire"|"cable"|"soldar"|"tuerca"|"conector", cx, cy, w, h, z0, z1} — no se dibujan como sólidos pero reservan lugar. */
(function () {
  const r2 = v => Math.round(v * 100) / 100;
  const K = { metal: "#cbd5e1", acero: "#94a3b8", negro: "#1f2937", plast: "#334155", gris: "#64748b", rojo: "#dc2626", verde: "#16a34a", amarillo: "#facc15", azul: "#2563eb", oro: "#d4a017", pcb: "#166534", pcbAz: "#1d4ed8", blanco: "#f1f5f9", nylon: "#475569", vidrio: "#0f172a" };
  // ---------------- constructores (z0 < z1)
  const cil = (d, z0, z1, color, x = 0, y = 0) => ({ f: "cil", cx: r2(x), cy: r2(y), d: r2(d), z0: r2(z0), z1: r2(z1), color });
  const caja = (w, h, z0, z1, color, x = 0, y = 0, r) => Object.assign({ f: "caja", cx: r2(x), cy: r2(y), w: r2(w), h: r2(h), z0: r2(z0), z1: r2(z1), color }, r ? { r } : {});
  const pol = (pts, z0, z1, color) => ({ f: "perfil", eje: "z", pts: pts.map(([x, y]) => [r2(x), r2(y)]), a0: r2(z0), a1: r2(z1), color });
  const hex = (af, z0, z1, color, x = 0, y = 0) => { const R = af / Math.sqrt(3); return pol([0, 1, 2, 3, 4, 5].map(k => [x + R * Math.cos(k * Math.PI / 3), y + R * Math.sin(k * Math.PI / 3)]), z0, z1, color); };
  const esp = (tipo, w, h, z0, z1, x = 0, y = 0) => ({ tipo, cx: r2(x), cy: r2(y), w: r2(w), h: r2(h), z0: r2(z0), z1: r2(z1) });

  // tablas de medidas reales
  const PG = { pg7: [15, 6.5, 8], pg9: [19, 8, 8], pg11: [22, 10, 8], pg135: [24, 12, 9], m12x15: [15, 6.5, 8], m16x15: [19, 10, 9], m20x15: [24, 14, 9] };   // hexágono, cable máx, rosca
  const PANT = { oled091: [38, 12, 4], oled096: [27.3, 27.8, 4], oled13: [35.4, 33.5, 4.5], oled15: [44.6, 37, 4.5], epaper154: [48, 33, 5], epaper213: [59.2, 29.2, 5], epaper29: [89.5, 38, 5],
    tft18: [56.3, 34.5, 6.5], tft24: [72.4, 42.7, 9], tft28: [86, 50, 9], tft35: [98, 56, 9], nextion43: [120, 74, 15], lcd7: [165, 107, 20], lcd1602: [80, 36, 13], lcd2004: [98, 60, 13], seg7_4: [50.4, 19, 8] };

  /** Modelo de un elemento: { prims, espacios, pared: [mín, máx] | null, nota } en orientación horizontal. */
  function base(e, ep) {
    const d = (window.MLCajaEl && MLCajaEl.def(e.tipo)) || {}, k = d.k || e.tipo, g = d.grupo || "", par = d.par || {};
    const vert = (e.orient || d.orient) === "v", [w0, h0] = MLCajaEl.medida(e), W = vert ? h0 : w0, H = vert ? w0 : h0;
    const prof = Math.max(+e.prof || 0, d.prof || 0), zi = -ep, I = (a, b) => [zi - b, zi - a];   // I(a, b): de a a b mm hacia adentro desde la cara interior
    const P = [], S = []; let pared = null, nota = "";
    const ci = (dd, a, b, col, x, y) => P.push(cil(dd, ...I(a, b), col, x, y)), ce = (dd, a, b, col, x, y) => P.push(cil(dd, a, b, col, x, y));
    const bi = (w, h, a, b, col, x, y, r) => P.push(caja(w, h, ...I(a, b), col, x, y, r)), be = (w, h, a, b, col, x, y, r) => P.push(caja(w, h, a, b, col, x, y, r));
    const hi = (af, a, b, col, x, y) => P.push(hex(af, ...I(a, b), col, x, y)), he = (af, a, b, col, x, y) => P.push(hex(af, a, b, col, x, y));
    const si = (tipo, w, h, a, b, x, y) => S.push(esp(tipo, w, h, ...I(a, b), x, y));
    const dd = par.d || W;

    if (/^vent_/.test(k)) {   // ventilador: marco con 4 esquinas, buje, 7 aspas, tornillos y tuercas; aire libre detrás
      const s = W, ef = Math.max(8, prof - 1), r = (s - 2) / 2, hs = s / 2, sep = par.sep / 2, t = par.tornillo;
      [[1, 1], [-1, 1], [-1, -1], [1, -1]].forEach(([sx, sy]) => {   // cada esquina del marco: cuadrante menos el círculo
        const aA = Math.atan2(sy, 0), aB = sx > 0 ? 0 : (sy > 0 ? Math.PI : -Math.PI), arc = [];
        for (let i = 1; i < 10; i++) { const a = aA + (aB - aA) * i / 10; arc.push([r * Math.cos(a), r * Math.sin(a)]); }
        P.push(pol([[sx * r, 0], [sx * hs, 0], [sx * hs, sy * hs], [0, sy * hs], [0, sy * r]].concat(arc), ...I(0, ef), K.negro)); });
      ci(s * 0.4, 1, ef - 1, K.plast);
      for (let a = 0; a < 7; a++) { const t0 = a * 2 * Math.PI / 7, r0 = s * 0.2, r1 = r - 1, sw = 0.5; P.push(pol([[r0 * Math.cos(t0), r0 * Math.sin(t0)], [r1 * Math.cos(t0 + 0.25), r1 * Math.sin(t0 + 0.25)], [r1 * Math.cos(t0 + 0.25 + sw), r1 * Math.sin(t0 + 0.25 + sw)], [r0 * Math.cos(t0 + sw * 0.8), r0 * Math.sin(t0 + sw * 0.8)]], ...I(2, ef - 2), K.plast)); }
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b]) => { ce(t * 1.9, 0, t * 0.6, K.metal, a * sep, b * sep); ci(t * 1.8, ef, ef + t * 0.8, K.metal, a * sep, b * sep); });
      bi(4, 2, ef - 3, ef, K.rojo, hs - 3, -hs + 1);
      si("aire", s, s, ef, ef + 12); nota = "Deja 12 mm libres detrás para el aire.";
    } else if (PANT[k] || g === "Pantallas (ventanas)") {   // módulo de pantalla: vidrio contra la pared, PCB detrás, separadores y header
      let [a, b, prof2] = PANT[k] || [W + 6, H + 8, 6]; if ((a >= b) !== (W >= H)) [a, b] = [b, a]; a = Math.max(a, W + 2); b = Math.max(b, H + 2);
      const vid = Math.min(1.8, prof2 * 0.35), gpcb = 1.2;
      bi(Math.min(a - 1, W + 4), Math.min(b - 1, H + 5), 0, vid, K.vidrio); bi(a, b, vid, vid + gpcb, /oled|epaper|seg7/.test(k) ? K.pcbAz : K.pcb);
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([x, y]) => ci(5, 0, vid, K.oro, x * (a / 2 - 2.5), y * (b / 2 - 2.5)));
      bi(Math.min(a * 0.6, 2.54 * 8), 2.54, vid + gpcb, prof2, K.negro, 0, -b / 2 + 2.5);
      si("cable", Math.min(a * 0.6, 20), 6, prof2, prof2 + 10, 0, -b / 2 + 2.5); pared = [0, 6]; nota = "Se fija con 4 tornillos M2/M3 y separadores.";
    } else if (/^led(3|5|8|10)$/.test(k)) {
      const dl = dd - 0.2; ce(dl, 0, dl * 0.55, K.rojo); ci(dl, 0, 6, K.rojo); ci(dl + 0.9, 0, 1, K.rojo); [-1, 1].forEach(s => ci(0.5, 6, 20, K.metal, s * 1.27));
      si("soldar", 6, 4, 6, 22); pared = [0, 3];
    } else if (/^portaled/.test(k)) {
      ce(dd + 2.5, 0, 2, K.metal); ce(dd - 2, 2, 4, K.rojo); hi(dd + 3, 0, 2.5, K.metal); ci(dd, 0, prof - 4, K.metal); [-1, 1].forEach(s => ci(0.5, prof - 4, prof + 6, K.metal, s * 1.27));
      si("tuerca", dd + 14, dd + 14, 0, 5); pared = [0.5, 6];
    } else if (/^piloto/.test(k)) {
      ce(dd + 4, 0, 2.5, K.metal); ce(dd - 0.5, 2.5, 5, K.rojo); hi(dd + 4, 0, 3, K.metal); ci(dd - 0.4, 0, prof - 6, K.metal); [-1, 1].forEach(s => bi(1.6, 0.5, prof - 6, prof, K.oro, s * dd * 0.2));
      si("tuerca", dd + 16, dd + 16, 0, 6); si("soldar", dd, dd, prof - 6, prof + 8); pared = [0.5, Math.min(8, dd * 0.5)];
    } else if (k === "anillo_led") {
      const ro = par.d / 2 + 1.5, ri = par.di / 2 - 1.5, N = 12, qs = [];
      for (let q = 0; q < 4; q++) { const a0 = q * Math.PI / 2, a1 = a0 + Math.PI / 2, pts = []; for (let i = 0; i <= 6; i++) { const a = a0 + (a1 - a0) * i / 6; pts.push([ro * Math.cos(a), ro * Math.sin(a)]); } for (let i = 6; i >= 0; i--) { const a = a0 + (a1 - a0) * i / 6; pts.push([ri * Math.cos(a), ri * Math.sin(a)]); } qs.push(pts); }
      qs.forEach(pts => P.push(pol(pts, ...I(1.6, 3.2), K.negro)));
      for (let i = 0; i < N; i++) { const a = i * 2 * Math.PI / N, rm = (ro + ri) / 2; bi(5, 5, 0, 1.6, K.blanco, rm * Math.cos(a), rm * Math.sin(a)); }
      si("cable", 8, 6, 3.2, 10, 0, -ro + 3);
    } else if (k === "tactil") {
      bi(6, 6, 2, 5.5, K.negro); ci(3.5, 0.3, 2, K.negro); bi(9, 9, 5.5, 7.1, K.pcb); nota = "Se acciona con una varilla o botón impreso a través del agujero.";
    } else if (k === "pbs110") {
      ce(9.5, 0, 6, K.rojo); hi(10, 0, 2, K.metal); ci(7, 0, 14, K.negro); [-1, 1].forEach(s => bi(1.5, 0.5, 14, 20, K.metal, s * 2.5));
      si("tuerca", 22, 22, 0, 5); si("soldar", 10, 6, 14, 26); pared = [0.5, 8];
    } else if (/^puls(12|16|19)/.test(k)) {
      ce(dd + 3, 0, 1.5, K.metal); if (/led/.test(k)) ce(dd - 2.5, 1.5, 1.7, K.azul); ce(dd - 4, 1.5, 2.1, K.metal);
      hi(dd + 5, 0, 3, K.metal); ci(dd - 0.3, 0, prof - 6, K.metal); [-1, 1].forEach(s => bi(2, 0.6, prof - 6, prof, K.oro, s * dd * 0.2)); if (/led/.test(k)) [-1, 1].forEach(s => bi(0.6, 2, prof - 6, prof, K.oro, 0, s * dd * 0.2));
      si("tuerca", dd + 16, dd + 16, 0, 6); si("soldar", dd + 6, dd + 6, prof - 6, prof + 10); pared = [0.5, 6];
    } else if (k === "puls22" || k === "puls22led" || k === "emergencia") {
      if (k === "emergencia") { ce(60, 0, 1, K.amarillo); ce(30, 1, 6, K.negro); ce(20, 6, 10, K.rojo); ce(40, 10, 20, K.rojo); }
      else { ce(30, 0, 5, K.negro); ce(24, 5, 9, k === "puls22led" ? K.azul : K.verde); }
      ci(32, 0, 4, K.negro); bi(30, 30, 4, 12, K.negro); bi(28, 30, 12, 42, K.amarillo, 0, 0, 1); [-1, 1].forEach(s => ci(5, 42, 44, K.metal, s * 8, 0));
      si("tuerca", 44, 44, 0, 6); si("soldar", 34, 34, 42, 52); pared = [1, 6]; nota = "Bloque de contactos de 22 mm: tornillos de los terminales hacia adentro.";
    } else if (/^kcd/.test(k)) {
      const doble = k === "kcd4", col = k === "kcd3" ? K.rojo : K.negro;
      be(W + 3, H + 3, 0, 2, K.negro, 0, 0, 1);
      if (doble) [-1, 1].forEach(s => { be((W - 4) / 2, H - 3, 2, 5, col, s * W / 4, 0); });
      else { be((W - 3) / 2, H - 3, 2, 5, col, -(W - 3) / 4, 0); be((W - 3) / 2, H - 3, 2, 3.5, col, (W - 3) / 4, 0); }
      bi(W - 0.4, H - 0.4, 0, prof - 8, K.negro);
      const nT = k === "kcd3" ? 3 : doble ? 4 : 2; for (let i = 0; i < nT; i++) bi(0.8, 4.8, prof - 8, prof, K.metal, (i - (nT - 1) / 2) * Math.min(5, (W - 4) / Math.max(1, nT - 1)), 0);
      si("soldar", W + 4, H + 4, prof - 8, prof + 10); pared = [0.8, 2.5]; nota = "Se encaja a presión: la pared debe tener 0.8–2.5 mm.";
    } else if (k === "mts6" || k === "palanca12") {
      const sc = k === "mts6" ? 1 : 1.6; he(8 * sc, 0, 2, K.metal); ce(2.6 * sc, 2, 12 * sc, K.metal); hi(8 * sc, 0, 2, K.metal); bi(13 * sc, 8 * sc, 2, 2 + 10 * sc, K.negro);
      for (let i = -1; i <= 1; i++) bi(0.8, 2, 2 + 10 * sc, 6 + 10 * sc, K.metal, i * 4.7 * sc); si("soldar", 15 * sc, 10 * sc, 2 + 10 * sc, 12 + 10 * sc); si("tuerca", 18 * sc, 18 * sc, 0, 4); pared = [0.5, 5];
    } else if (k === "deslizante") {
      be(1.5, 1.5, 0, 1.5, K.negro); bi(8.6, 3.6, 0.5, 4.1, K.metal); bi(12, 8, 4.1, 5.7, K.pcb);
    } else if (k === "llave") {
      ce(dd + 3, 0, 3, K.metal); be(1, 5, 3, 3.1, K.negro); hi(dd + 5, 0, 3, K.metal); ci(dd - 0.5, 0, prof - 6, K.metal); bi(12, 4, prof - 6, prof, K.metal);
      si("tuerca", dd + 16, dd + 16, 0, 6); pared = [0.5, 8];
    } else if (k === "rotativo" || k === "encoder" || k === "pote16") {
      he(10, 0, 2, K.metal); ce(16, 2.5, 17, K.negro); be(1, 5, 17, 17.2, K.blanco, 0, 4);
      if (k === "encoder") { bi(12.4, 13.2, 0, 6.5, K.metal); for (let i = -1; i <= 1; i++) bi(0.8, 0.5, 6.5, 10, K.metal, i * 2.5, -5); }
      else { ci(16.5, 0, 7, K.metal); for (let i = -1; i <= 1; i++) bi(1, 0.6, 7, 12, K.metal, i * 5, -6); }
      si("soldar", 18, 12, 7, 18, 0, -4); pared = [0.5, 5];
    } else if (["usbc", "microusb", "miniusb", "jack_pcb", "sd", "microsd"].includes(k)) {
      si("conector", W + 2, H + 2, 0, prof); nota = "Abertura para el conector de una placa: la placa queda detrás, alineada.";
    } else if (["usbc_tornillos", "usba", "usbb", "hdmi"].includes(k)) {
      const fw = par.sep + 7, fh = H + 8, bw = { usbc_tornillos: 12, usba: 14.5, usbb: 14, hdmi: 17 }[k], bh = { usbc_tornillos: 7, usba: 7.5, usbb: 13, hdmi: 8 }[k];
      be(fw, fh, 0, 1.5, K.metal, 0, 0, 1.5); [-1, 1].forEach(s => ce(5, 1.5, 3, K.metal, s * par.sep / 2));
      bi(bw, bh, 0, prof, K.metal); ci(4.5, prof, prof + 8, K.negro); si("cable", 14, 14, prof, prof + 25); pared = [0.5, 4];
    } else if (k === "jack_dc022" || k === "jack_dc099") {
      const g22 = k === "jack_dc022"; ce(g22 ? 13.5 : 10, 0, 2, g22 ? K.negro : K.metal); hi(g22 ? 14 : 10, 0, 2, K.metal); ci(g22 ? 11 : 8, 0, g22 ? 14 : 13, K.negro);
      for (let i = -1; i <= 1; i++) bi(2, 0.5, g22 ? 14 : 13, (g22 ? 14 : 13) + 5, K.metal, i * 3); si("soldar", 14, 10, 14, 26); si("tuerca", 24, 24, 0, 5); pared = [0.5, g22 ? 6 : 4];
    } else if (k === "xt60" || k === "xt30") {
      const x6 = k === "xt60"; be(par.sep + (x6 ? 8.6 : 6), H + (x6 ? 2 : 2), 0, 2, K.amarillo, 0, 0, 1); bi(W, H, 0, x6 ? 16 : 11, K.amarillo, 0, 0, 1);
      [-1, 1].forEach(s => ci(x6 ? 4.5 : 3, x6 ? 16 : 11, x6 ? 22 : 15, K.oro, s * (x6 ? 3.6 : 2.5))); si("soldar", W + 8, H + 8, x6 ? 16 : 11, (x6 ? 22 : 15) + 10); pared = [1, 3];
    } else if (k === "iec_c14" || k === "iec_c8") {
      const c14 = k === "iec_c14"; be(c14 ? par.sep + 8 : W + 4, H + 4, 0, 3, K.negro, 0, 0, 1); bi(W, H, 0, c14 ? 18 : 15, K.negro, 0, 0, 1);
      (c14 ? [[-7, 3], [7, 3], [0, -4]] : [[-4, 0], [4, 0]]).forEach(([x, y]) => bi(0.8, 6.3, c14 ? 18 : 15, (c14 ? 18 : 15) + 8, K.metal, x, y));
      si("soldar", W + 8, H + 8, c14 ? 18 : 15, (c14 ? 18 : 15) + 14); pared = [1, 3]; nota = c14 ? "Tensión de red: aisla los terminales (fundas termocontráctiles)." : "";
    } else if (k === "banana4" || k === "bornera_panel") {
      const col = k === "banana4" ? K.rojo : K.negro; ce(11, 0, 3, col); ce(8.5, 3, 20, col); hi(10, 0, 3, K.metal); ci(4, 0, 20, K.metal); bi(6, 0.6, 3, 4, K.metal, 0, -3);
      si("tuerca", 22, 22, 0, 6); pared = [0.5, 8];
    } else if (k === "fusible") {
      ce(18, 0, 2, K.negro); ce(15, 2, 16, K.negro); hi(16, 0, 3, K.negro); ci(12, 0, 35, K.negro); [-1, 1].forEach(s => bi(3, 0.6, 35, 43, K.metal, s * 3));
      si("soldar", 16, 12, 35, 48); si("tuerca", 28, 28, 0, 6); pared = [1, 6];
    } else if (k === "solar_cable") {
      ce(8.5, 0, 2, K.negro); ci(8.5, 0, 3, K.negro); si("cable", 10, 10, 3, 20);
    } else if (/^rj45|^rj11$/.test(k)) {
      const tor = k === "rj45_tornillos"; if (tor) { be(par.sep + 7, H + 10, 0, 3, K.negro, 0, 0, 1.5); [-1, 1].forEach(s => ce(5.5, 3, 4, K.metal, s * par.sep / 2)); } else be(W + 2, H + 2, 0, 1, K.plast, 0, 0, 0.5);
      bi(tor ? 18 : W, tor ? 16 : H, 0, k === "rj11" ? 18 : 22, K.metal); ci(6, k === "rj11" ? 18 : 22, (k === "rj11" ? 18 : 22) + 6, K.azul); si("cable", 18, 18, 22, 50); pared = [0.5, 3];
    } else if (/^db(9|15|25)$/.test(k)) {
      const fw = par.sep + 6, a = par.arriba / 2 + 1, b = par.abajo / 2 + 1, hh = par.alto / 2 + 1;
      be(fw, 12.5, 0, 1, K.metal, 0, 0, 1); [-1, 1].forEach(s => he(4.8, 1, 5.5, K.metal, s * par.sep / 2));
      P.push(pol([[-a, hh], [a, hh], [b, -hh], [-b, -hh]], ...I(0, 8), K.metal)); bi(par.arriba + 3, par.alto + 3, 8, 14, K.negro);
      si("soldar", par.arriba + 8, par.alto + 8, 14, 26); pared = [0.5, 3];
    } else if (k === "sma" || k === "rpsma") {
      he(8, 0, 2.4, K.oro); ce(6.35, 2.4, 9, K.oro); ce(1.3, 9, 9.3, K.blanco); hi(8, 0, 2, K.oro); ci(6.5, 0, 8, K.oro); ci(1.6, 8, 22, K.negro);
      si("cable", 10, 10, 8, 30); si("tuerca", 18, 18, 0, 4); pared = [0.5, 5]; nota = "Coaxial: respeta el radio de curvatura del pigtail (≥ 10 mm).";
    } else if (k === "bnc") {
      ce(9.5, 0, 11, K.metal); [-1, 1].forEach(s => be(1.2, 1.2, 6, 7.2, K.metal, s * 5.3)); hi(14, 0, 2.5, K.metal); ci(9.7, 0, 12, K.metal); ci(3, 12, 16, K.oro);
      si("tuerca", 24, 24, 0, 5); si("soldar", 12, 12, 12, 22); pared = [0.5, 5];
    } else if (k === "conector_n") {
      be(25.4, 25.4, 0, 2, K.metal, 0, 0, 1); ce(16, 2, 18, K.metal); ci(12, 0, 10, K.metal); si("cable", 14, 14, 10, 40); pared = [0.5, 4];
    } else if (/^gx(12|16|20)$/.test(k)) {
      const n = +k.slice(2); ce(n + 3, 0, 2, K.metal); ce(n - 0.5, 2, 11, K.metal); hi(n + 6, 0, 3, K.metal); ci(n - 1, 0, prof - 8, K.metal); ci(n - 4, prof - 8, prof - 2, K.negro);
      si("soldar", n + 6, n + 6, prof - 2, prof + 12); si("tuerca", n + 18, n + 18, 0, 6); pared = [0.5, n >= 16 ? 6 : 5];
    } else if (k === "m8" || k === "m12") {
      const n = k === "m8" ? 8 : 12; he(n + 5, 0, 3, K.metal); ce(n, 3, 11, K.metal); hi(n + 5, 0, 3, K.metal); ci(n - 1, 0, prof - 6, K.metal); ci(4, prof - 6, prof + 4, K.negro);
      si("cable", 12, 12, prof - 6, prof + 20); si("tuerca", n + 16, n + 16, 0, 6); pared = [0.5, 5];
    } else if (k === "audio35") {
      ce(8, 0, 2, K.metal); bi(6, 7, 0, 12, K.negro); for (let i = -1; i <= 1; i++) bi(1, 0.5, 12, 16, K.metal, i * 2); si("soldar", 10, 10, 12, 22); pared = [0.5, 4];
    } else if (PG[k]) {   // prensaestopa: cuerpo hexagonal, domo, rosca y contratuerca; curva del cable por dentro
      const [af, cab, ros] = PG[k];
      he(af, 0, 4, K.nylon); ce(af * 0.95, 4, 4 + af * 0.75, K.nylon); ce(cab, 4 + af * 0.75, 4 + af * 0.75 + 12, K.negro);
      hi(af + 2, 0, 4, K.nylon); ci(dd - 0.2, 0, ros, K.nylon); ci(cab, ros, ros + 10, K.negro);
      const curva = Math.round(4 * cab); si("cable", cab * 2 + 4, cab * 2 + 4, ros, ros + curva); si("tuerca", af + 14, af + 14, 0, 5);
      pared = [0.5, ros - 4]; nota = `Reserva la curva del cable (radio ≥ 4 × Ø ${cab} mm = ${curva} mm) y espacio para la llave de ${af + 2} mm.`;
    } else if (/^goma/.test(k)) {
      ce(dd + 4, 0, 1.5, K.negro); ci(dd + 4, 0, 1.5, K.negro); si("cable", dd * 2, dd * 2, 1.5, 1.5 + 4 * (dd - 1.5)); pared = [0.8, 2.5];
    } else if (k === "ranura_cinta") {
      si("cable", W, 6, 0, 12);
    } else if (k === "buzzer") {
      ci(12, 0, 9.5, K.negro); [-1, 1].forEach(s => ci(0.6, 9.5, 14, K.metal, s * 3.8)); si("soldar", 14, 12, 9.5, 18);
    } else if (k === "camara") {
      ci(8, 0, 5, K.negro); bi(8.5, 8.5, 5, 9, K.negro); bi(24, 24, 9, 10.6, K.pcbAz); si("cable", 20, 10, 10.6, 22, 0, -10);
    }
    return { prims: P, espacios: S, pared, nota };
  }

  /** Modelo listo para colocar: orientado ("v" gira 90°) y con espejo en x si la cara lo pide. */
  function modelo(e, ep, espejo) {
    const m = base(e, ep), d = (window.MLCajaEl && MLCajaEl.def(e.tipo)) || {}, vert = (e.orient || d.orient) === "v" && !(d.libre && !d.patron);
    const rot = q => { if (!vert) return q; if (q.f === "perfil") return MLPlant.perfilMap(q, ([x, y, z]) => [-y, x, z]); const o = Object.assign({}, q, { cx: r2(-q.cy), cy: r2(q.cx) }); if (q.w != null) { o.w = q.h; o.h = q.w; } return o; };
    const esp = q => { if (!espejo) return q; if (q.f === "perfil") return MLPlant.perfilMap(q, ([x, y, z]) => [-x, y, z]); return Object.assign({}, q, { cx: r2(-q.cx) }); };
    m.prims = m.prims.map(q => esp(rot(q))).map(q => q.f === "perfil" && q.cx == null ? Object.assign(q, MLPlant.cajaPerfil(q)) : q);
    m.espacios = m.espacios.map(s => { let o = Object.assign({}, s); if (vert) o = Object.assign(o, { cx: r2(-s.cy), cy: r2(s.cx), w: s.h, h: s.w }); if (espejo) o.cx = r2(-o.cx); return o; });
    return m;
  }
  /** Lo que ocupa el elemento por dentro de la caja (cuerpo + espacios): { ancho (a lo largo de la cara), alto, prof (desde la cara interior), partes }. */
  function volumen(e, ep) {
    const m = modelo(e, ep, false), zi = -ep; let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 0;
    const add = (cx, cy, w, h, za) => { if (za >= zi - 0.01) return; x0 = Math.min(x0, cx - w / 2); x1 = Math.max(x1, cx + w / 2); y0 = Math.min(y0, cy - h / 2); y1 = Math.max(y1, cy + h / 2); z0 = Math.min(z0, za); };
    for (const q of m.prims) { if (q.f === "perfil") { const b = MLPlant.cajaPerfil(q); add(b.cx, b.cy, b.w, b.h, q.a0); } else add(q.cx, q.cy, q.f === "cil" ? q.d : q.w, q.f === "cil" ? q.d : q.h, q.z0); }
    for (const s of m.espacios) add(s.cx, s.cy, s.w, s.h, s.z0);
    if (x1 < x0) return { ancho: 0, alto: 0, prof: 0, cx: 0, cy: 0, modelo: m };
    return { ancho: r2(x1 - x0), alto: r2(y1 - y0), prof: r2(zi - z0), cx: r2((x0 + x1) / 2), cy: r2((y0 + y1) / 2), modelo: m };
  }
  /** Marco del elemento en la caja (coordenadas de la caja: origen en la esquina interior −X −Y del fondo). Derecho siempre; si la cara lo pide, el modelo va con espejo en x. */
  function marco(R, el) {
    const { L, W, H } = R.interior, e = R.p.espesor, u = el.u, v = el.v;
    const M = { "-Y": [[u, -e, v], [1, 0, 0], [0, 0, 1], [0, -1, 0], false], "+Y": [[u, W + e, v], [-1, 0, 0], [0, 0, 1], [0, 1, 0], true], "-X": [[-e, u, v], [0, -1, 0], [0, 0, 1], [-1, 0, 0], true],
      "+X": [[L + e, u, v], [0, 1, 0], [0, 0, 1], [1, 0, 0], false], tapa: [[u, v, H + e], [1, 0, 0], [0, 1, 0], [0, 0, 1], false], fondo: [[u, v, -e], [-1, 0, 0], [0, 1, 0], [0, 0, -1], true] }[el.cara];
    if (!M) return null; return { T: { O: M[0], X: M[1], Y: M[2], Z: M[3] }, espejo: M[4] };
  }
  /** Modelo de un elemento ya ubicado en la caja: { T, prims, espacios, pared, nota }. */
  function enCaja(R, el) { const m = marco(R, el); if (!m) return null; const mod = modelo(el, R.p.espesor, m.espejo); return Object.assign(mod, { T: m.T }); }

  Object.assign(window.MLCajaEl = window.MLCajaEl || {}, { modelo, volumen, marco, enCaja, modeloBase: base });
})();
