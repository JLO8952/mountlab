/* MountLab · utilidades de pasivos: leer valores ("4k7", "100n", "104", "01C"), formatear, series E,
   código de colores (4/5/6 bandas), código SMD (3/4 dígitos y EIA-96) y código de capacitores. */
(function () {
  const E24 = [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1];
  const E96 = [100, 102, 105, 107, 110, 113, 115, 118, 121, 124, 127, 130, 133, 137, 140, 143, 147, 150, 154, 158, 162, 165, 169, 174, 178, 182, 187, 191, 196, 200, 205, 210, 215, 221, 226, 232, 237, 243, 249, 255, 261, 267, 274, 280, 287, 294, 301, 309, 316, 324, 332, 340, 348, 357, 365, 374, 383, 392, 402, 412, 422, 432, 442, 453, 464, 475, 487, 499, 511, 523, 536, 549, 562, 576, 590, 604, 619, 634, 649, 665, 681, 698, 715, 732, 750, 768, 787, 806, 825, 845, 866, 887, 909, 931, 953, 976].map(v => v / 100);
  const S = { E3: [1, 2.2, 4.7], E6: [1, 1.5, 2.2, 3.3, 4.7, 6.8], E12: [1, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2], E24, E48: E96.filter((v, i) => i % 2 === 0), E96 };
  const ORDEN = ["E3", "E6", "E12", "E24", "E48", "E96"];
  const COL = [["Negro", "#111111"], ["Marrón", "#7c3f12"], ["Rojo", "#dc2626"], ["Naranja", "#f97316"], ["Amarillo", "#facc15"], ["Verde", "#16a34a"], ["Azul", "#2563eb"], ["Violeta", "#7c3aed"], ["Gris", "#6b7280"], ["Blanco", "#f8fafc"]];
  const ORO = ["Dorado", "#d4a017"], PLATA = ["Plateado", "#c0c0c0"];
  const TOL = { "1": ["Marrón", "±1 %"], "2": ["Rojo", "±2 %"], "0.5": ["Verde", "±0.5 %"], "0.25": ["Azul", "±0.25 %"], "0.1": ["Violeta", "±0.1 %"], "0.05": ["Gris", "±0.05 %"], "5": ["Dorado", "±5 %"], "10": ["Plateado", "±10 %"] };
  const LETRAS = { Z: 0.001, Y: 0.01, R: 0.01, X: 0.1, S: 0.1, A: 1, B: 10, H: 10, C: 100, D: 1000, E: 10000, F: 100000 };
  const SI = { p: 1e-12, n: 1e-9, u: 1e-6, "µ": 1e-6, "μ": 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, G: 1e9 };
  const limpio = v => +(+v).toPrecision(6);

  const fmtR = v => v == null ? "" : v === 0 ? "0 Ω (puente)" : v >= 1e6 ? limpio(v / 1e6) + " MΩ" : v >= 1e3 ? limpio(v / 1e3) + " kΩ" : v < 1 ? limpio(v * 1e3) + " mΩ" : limpio(v) + " Ω";
  const fmtC = v => v == null ? "" : v >= 0.05 ? limpio(v) + " F" : v >= 1e-6 ? limpio(v * 1e6) + " µF" : v >= 1e-9 ? limpio(v * 1e9) + " nF" : limpio(v * 1e12) + " pF";
  /** Notación RKM (IEC 60062): 4k7, 2R2, 1M0, R10. */
  function rkm(v) {
    const [d, l] = v >= 1e6 ? [v / 1e6, "M"] : v >= 1e3 ? [v / 1e3, "k"] : [v, "R"]; const s = String(limpio(d));
    return s.includes(".") ? s.replace(".", l) : s + l;
  }
  function rkmC(v) { const [d, l] = v >= 1e-6 ? [v * 1e6, "u"] : v >= 1e-9 ? [v * 1e9, "n"] : [v * 1e12, "p"]; const s = String(limpio(d)); return s.includes(".") ? s.replace(".", l) : s + l; }

  /** Interpreta un texto → [{ tipo: "R"|"C", valor, como }] (puede haber varias lecturas, ej. "104"). */
  function leer(txt) {
    let t = String(txt || "").trim().replace(/\s+/g, "").replace(",", ".").replace(/ohms?|Ω/i, "Ω"); if (!t) return [];
    const out = [], add = (tipo, valor, como) => { if (isFinite(valor) && valor >= 0 && !out.some(o => o.tipo === tipo && Math.abs(o.valor - valor) < valor * 1e-9)) out.push({ tipo, valor, como }); };
    let m;
    if ((m = t.match(/^(\d*\.?\d+)\s*([pnuµμmkKMG]?)(F|f)$/))) add("C", +m[1] * (SI[m[2]] || 1), "capacitancia");
    else if ((m = t.match(/^(\d+)([pnuµμ])(\d*)$/))) add("C", +(m[1] + "." + (m[3] || "0")) * SI[m[2]], "notación " + m[2] + " (ej. 4n7)");
    else if ((m = t.match(/^(\d*\.?\d+)([pnuµμ])$/))) add("C", +m[1] * SI[m[2]], "capacitancia");
    if ((m = t.match(/^(\d*\.?\d+)\s*([kKMGm]?)Ω$/))) add("R", +m[1] * (SI[m[2]] || 1), "resistencia");
    if ((m = t.match(/^(\d*)([RkKM])(\d*)$/)) && (m[1] || m[3])) add("R", +((m[1] || "0") + "." + (m[3] || "0")) * (m[2] === "R" ? 1 : SI[m[2]]), "RKM (ej. 4k7)");
    if ((m = t.match(/^(\d*\.?\d+)([kKM])$/))) add("R", +m[1] * SI[m[2]], "resistencia");
    if ((m = t.match(/^(\d{2})(\d)$/))) { add("R", +m[1] * Math.pow(10, +m[2]), "código SMD de 3 dígitos"); add("C", +m[1] * Math.pow(10, +m[2]) * 1e-12, "código de capacitor (pF)"); }
    if ((m = t.match(/^(\d{3})(\d)$/))) add("R", +m[1] * Math.pow(10, +m[2]), "código SMD de 4 dígitos (1 %)");
    if ((m = t.match(/^(\d{2})(\d)([JKMZ])$/i))) add("C", +m[1] * Math.pow(10, +m[2]) * 1e-12, `código de capacitor, tolerancia ${({ J: "±5 %", K: "±10 %", M: "±20 %", Z: "+80/−20 %" })[m[3].toUpperCase()]}`);
    if ((m = t.match(/^(\d[A-Z])(\d{2})(\d)([JKM])$/i))) add("C", +m[2] * Math.pow(10, +m[3]) * 1e-12, `código de película: ${VOLT_PELICULA[m[1].toUpperCase()] || m[1]}, tolerancia ${({ J: "±5 %", K: "±10 %", M: "±20 %" })[m[4].toUpperCase()]}`);
    if ((m = t.match(/^(\d{2})([A-Z])$/i)) && +m[1] >= 1 && +m[1] <= 96 && LETRAS[m[2].toUpperCase()]) add("R", E96[+m[1] - 1] * 100 * LETRAS[m[2].toUpperCase()], "código EIA-96 (1 %)");
    if ((m = t.match(/^(\d*)R(\d+)$/i))) add("R", +((m[1] || "0") + "." + m[2]), "decimal con R");
    if ((m = t.match(/^(\d*\.?\d+)$/))) add("R", +m[1], "número (Ω)");
    return out;
  }
  const VOLT_PELICULA = { "1H": "50 V", "2A": "100 V", "2E": "250 V", "2G": "400 V", "2J": "630 V", "1J": "63 V", "2W": "450 V" };

  /** Mantisa en [1,10) y exponente. */
  const desc = v => { if (!(v > 0)) return [0, 0]; let e = Math.floor(Math.log10(v)); let m = v / Math.pow(10, e); if (m >= 9.9995) { m /= 10; e++; } return [+m.toFixed(4), e]; };
  function series(v) { const [m] = desc(v); return ORDEN.filter(k => S[k].some(x => Math.abs(x - m) < 0.0051)); }
  function cercano(v, k) { const [m, e] = desc(v); let mej = null; for (const x of [...S[k], 10]) { const d = Math.abs(Math.log(x / m)); if (!mej || d < mej.d) mej = { x, d }; } return limpio(mej.x * Math.pow(10, e)); }
  /** Lista de valores de una familia (desde su serie o lista explícita). */
  function lista(val) {
    if (!val) return []; if (val.lista) return val.lista.slice();
    const s = S[val.serie] || S.E12, out = val.extra ? val.extra.slice() : [];
    for (let e = Math.floor(Math.log10(val.min)) - 1; e <= Math.ceil(Math.log10(val.max)); e++) for (const x of s) { const v = limpio(x * Math.pow(10, e)); if (v >= val.min * 0.999 && v <= val.max * 1.001) out.push(v); }
    return out;
  }
  /** Bandas de color de una resistencia: n = 4 (2 dígitos) o 5 (3 dígitos) [+ 6ª de coef. térmico]. */
  function bandas(v, n, tol) {
    n = n || 4; const dig = n >= 5 ? 3 : 2; if (!(v > 0)) return null;
    let [m, e] = desc(v); let sig = Math.round(m * Math.pow(10, dig - 1)); if (sig >= Math.pow(10, dig)) { sig /= 10; e++; }
    const mult = e - (dig - 1); if (mult < -2 || mult > 9) return null;
    const exacto = Math.abs(sig * Math.pow(10, mult) - v) / v < 1e-6;
    const ds = String(sig).padStart(dig, "0").split("").map(d => COL[+d]);
    const bm = mult === -1 ? ORO : mult === -2 ? PLATA : COL[mult];
    const t = TOL[String(tol || (n >= 5 ? 1 : 5))] || TOL["5"], bt = t[0] === "Dorado" ? ORO : t[0] === "Plateado" ? PLATA : COL.find(c => c[0] === t[0]);
    const L = [...ds, bm, bt]; if (n === 6) L.push(COL[1]);
    return { bandas: L, exacto, tolerancia: t[1], aproximado: exacto ? null : limpio(sig * Math.pow(10, mult)) };
  }
  function smd(v) {
    const r = {}; if (!(v >= 0)) return r;
    if (v === 0) return { tres: "0", cuatro: "0000" };
    let [m, e] = desc(v);
    if (v < 10) { r.tres = rkm(v).replace("k", "K"); r.cuatro = r.tres; }
    else { const s2 = Math.round(m * 10), s3 = Math.round(m * 100);
      if (Math.abs(s2 * Math.pow(10, e - 1) - v) / v < 1e-6) r.tres = `${s2}${e - 1}`;
      if (Math.abs(s3 * Math.pow(10, e - 2) - v) / v < 1e-6 && e - 2 >= 0) r.cuatro = `${s3}${e - 2}`; }
    const i = E96.findIndex(x => Math.abs(x - m) < 0.0051);
    if (i >= 0) { const mult = Math.pow(10, e - 2), L = Object.entries({ Z: 0.001, Y: 0.01, X: 0.1, A: 1, B: 10, C: 100, D: 1000, E: 10000, F: 100000 }).find(([, f]) => Math.abs(f - mult) / mult < 1e-6); if (L) r.eia96 = String(i + 1).padStart(2, "0") + L[0]; }
    return r;
  }
  /** Código de capacitor (3 dígitos en pF). */
  function codC(v) { const pf = v * 1e12; if (pf < 10) return String(limpio(pf)).replace(".", "R"); const [m, e] = desc(pf); const s2 = Math.round(m * 10); return Math.abs(s2 * Math.pow(10, e - 1) - pf) / pf < 1e-6 ? `${s2}${e - 1}` : null; }

  /** Resistencia de color (SVG). */
  function svgResistencia(L, w, h) {
    w = w || 260; h = h || 70; const bx = w * 0.18, bw = w * 0.64;
    const xs = L.length <= 5 ? [0.16, 0.3, 0.44, 0.58, 0.84] : [0.12, 0.24, 0.36, 0.48, 0.66, 0.86];
    return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" stroke="#cbd5e1" stroke-width="3"/>
      <rect x="${bx}" y="${h * 0.18}" width="${bw}" height="${h * 0.64}" rx="${h * 0.26}" fill="#e7c9a0" stroke="#a16207"/>
      ${L.map((c, i) => `<rect x="${bx + bw * xs[i] - 5}" y="${h * 0.18}" width="10" height="${h * 0.64}" fill="${c[1]}" stroke="rgba(0,0,0,.25)"><title>${c[0]}</title></rect>`).join("")}</svg>`;
  }

  window.MLPas = { S, ORDEN, COL, ORO, PLATA, TOL, LETRAS, E96, VOLT_PELICULA, leer, fmtR, fmtC, rkm, rkmC, desc, series, cercano, lista, bandas, smd, codC, svgResistencia };
})();
