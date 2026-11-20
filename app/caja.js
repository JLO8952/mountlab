/* MountLab · Caja mínima (envolvente) de un proyecto o subproyecto.
   Toma las medidas de cada componente (montaje.pcb + alturas), las zonas que necesitan pared (USB, jack,
   bornera, antena…) y empaqueta los rectángulos en planta (MaxRects con rotación) buscando el área mínima.
   Devuelve las medidas interiores y exteriores de la caja, la posición de cada pieza y las tres vistas (SVG / DXF). */
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

  /** Piezas de la caja a partir de las instancias del diagrama. */
  function piezas(inst, comp, P) {
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
      const [L, W, esp] = m.pcb, sup = +m.altura_superior || 0, inf = +m.altura_inferior || 0;
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
      out.push({ ref: it.ref, sub: it._sub, id: c.id, n: c.nombre, L, W, esp, arriba: sup, abajo: inf, holguraAbajo: +m.holgura_inferior_cableado || 0, agujeros: (m.agujeros || []).length, paredes: [...new Set(paredes)], arribaZ, notas });
    }
    return { piezas: out, faltan, aberturas };
  }

  // ---------- empaquetado MaxRects en un recipiente fijo (W × H); las piezas con pared deben tocar ese borde
  function empacar(items, W, H, conRot) {
    let libres = [{ x: 0, y: 0, w: W, h: H }]; const pos = [];
    for (const it of items) {
      let mejor = null;
      const rots = conRot ? [0, 90, 180, 270] : [0, 180];
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
      // partir los rectángulos libres que se cruzan con la pieza
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

  /** Calcula la caja mínima. p = { gap, pared, espesor, standoff, arriba, rotar, prop } en mm. */
  function calcular(lista, p) {
    p = Object.assign({ gap: 3, pared: 2, espesor: 2, standoff: 5, arriba: 8, rotar: true, prop: 3 }, p || {});
    if (!lista.length) return null;
    // altura de cada pieza: separadores (o pines/cables por debajo) + PCB + componentes + espacio para cables encima
    const items = lista.map(q => {
      const bajo = q.agujeros ? Math.max(p.standoff, q.holguraAbajo || 0, q.abajo || 0) : Math.max(q.holguraAbajo || 0, q.abajo || 0);
      const Ht = q.Hc != null ? q.Hc : bajo + q.esp + (q.arriba || 0) + (q.arribaZ ? 0 : p.arriba);
      return Object.assign({}, q, { w: q.L + p.gap, h: q.W + p.gap, bajo, Ht });
    }).sort((a, b) => (b.paredes.length - a.paredes.length) || (b.w * b.h - a.w * a.h));
    const area = items.reduce((s, x) => s + x.w * x.h, 0), lado = it => Math.max(it.w, it.h);
    const wMin = Math.max(...items.map(it => p.rotar ? Math.min(it.w, it.h) : it.w)), hMin = Math.max(...items.map(it => p.rotar ? Math.min(it.w, it.h) : it.h));
    const wMax = items.reduce((s, it) => s + lado(it), 0) + 1;
    let mejor = null;
    for (let W = wMin; W <= wMax; W += 2) {
      for (let H = Math.max(hMin, Math.ceil(area / W)); H <= wMax; H += 2) {
        if (W / H > p.prop || H / W > p.prop) { if (H > W * p.prop) break; continue; }
        if (mejor && W * H >= mejor.W * mejor.H) break;
        const pos = empacar(items, W, H, p.rotar);
        if (pos) { const pen = pos.reduce((s, x) => s + x.faltaPared, 0); if (!mejor || W * H < mejor.W * mejor.H || (W * H === mejor.W * mejor.H && pen < mejor.pen)) mejor = { W, H, pos, pen }; break; }
      }
    }
    if (!mejor) return null;
    mejor.pos.forEach(q => { q.mundo = q.paredes.filter(d => d !== "*").map(d => girar(d, q.rot)); });
    if (mejor.H > mejor.W) {   // convención: X = lado más largo (se transpone el resultado)
      const T = { "+X": "+Y", "+Y": "+X", "-X": "-Y", "-Y": "-X" };
      mejor = { W: mejor.H, H: mejor.W, pen: mejor.pen, pos: mejor.pos.map(q => Object.assign({}, q, { x: q.y, y: q.x, w: q.h, h: q.w, rot: (q.rot + 90) % 360, mundo: q.mundo.map(d => T[d]) })) };
    }
    // medidas: el recipiente incluye la separación de la última fila; se cambia por la holgura a las paredes
    const Li = r1(mejor.W - p.gap + 2 * p.pared), Wi = r1(mejor.H - p.gap + 2 * p.pared), Hi = r1(Math.max(...items.map(x => x.Ht)) + p.pared);
    const piezasPos = mejor.pos.map(x => ({ ref: x.ref, sub: x.sub, n: x.n, id: x.id, x: r1(x.x + p.pared), y: r1(x.y + p.pared), L: r1(x.w - p.gap), W: r1(x.h - p.gap), rot: x.rot, bajo: x.bajo, esp: x.esp, arriba: x.arriba, Ht: x.Ht, Hc: x.Hc,
      paredes: x.mundo, panel: x.paredes.includes("*"), faltaPared: x.faltaPared, arribaZ: x.arribaZ, notas: x.notas || [] }));
    const ext = { L: r1(Li + 2 * p.espesor), W: r1(Wi + 2 * p.espesor), H: r1(Hi + 2 * p.espesor) };
    return { p, interior: { L: Li, W: Wi, H: Hi }, exterior: ext, volumen: r1(Li * Wi * Hi / 1000), ocupacion: Math.round(100 * items.reduce((s, x) => s + x.L * x.W, 0) / (Li * Wi)), piezas: piezasPos };
  }

  // ---------- tres vistas (planta, frente y lateral) en SVG
  const PALETA = ["#38bdf8", "#a78bfa", "#34d399", "#fbbf24", "#f472b6", "#fb923c", "#2dd4bf", "#f87171"];
  function vistas(R, opt) {
    opt = opt || {}; const { L, W, H } = R.interior, e = R.p.espesor, claro = !!opt.claro;
    const tinta = claro ? "#0f172a" : "#e2e8f0", sutil = claro ? "#64748b" : "#94a3b8", fondo = claro ? "#ffffff" : "none";
    const subs = [...new Set(R.piezas.map(q => q.sub || ""))], colSub = s => PALETA[subs.indexOf(s || "") % PALETA.length];
    const M = 26, gapV = 34, X0 = M, Y0 = M + 20, X1 = X0 + L + 2 * e + gapV, Y1 = Y0 + W + 2 * e + gapV + 10;
    const ancho = X1 + W + 2 * e + M + 30, alto = Y1 + H + 2 * e + M + 24;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ancho} ${alto}" width="100%" font-family="Segoe UI, Arial, sans-serif">${fondo !== "none" ? `<rect width="100%" height="100%" fill="${fondo}"/>` : ""}
      <defs><pattern id="cjH" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="3" stroke="${sutil}" stroke-width=".6"/></pattern></defs>`;
    const caja = (x, y, a, b) => `<rect x="${x}" y="${y}" width="${a + 2 * e}" height="${b + 2 * e}" fill="url(#cjH)" stroke="${tinta}" stroke-width=".6"/><rect x="${x + e}" y="${y + e}" width="${a}" height="${b}" fill="${claro ? "#fff" : "#0b1220"}" stroke="${tinta}" stroke-width=".6"/>`;
    const cota = (x1, y1, x2, y2, txt, vert) => vert
      ? `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${sutil}" stroke-width=".35"/><text x="${x1 - 3}" y="${(y1 + y2) / 2}" font-size="4.2" fill="${tinta}" text-anchor="middle" transform="rotate(-90 ${x1 - 3} ${(y1 + y2) / 2})">${txt}</text><line x1="${x1 - 1.5}" y1="${y1}" x2="${x1 + 1.5}" y2="${y1}" stroke="${sutil}" stroke-width=".35"/><line x1="${x1 - 1.5}" y1="${y2}" x2="${x1 + 1.5}" y2="${y2}" stroke="${sutil}" stroke-width=".35"/>`
      : `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${sutil}" stroke-width=".35"/><text x="${(x1 + x2) / 2}" y="${y1 - 1.6}" font-size="4.2" fill="${tinta}" text-anchor="middle">${txt}</text><line x1="${x1}" y1="${y1 - 1.5}" x2="${x1}" y2="${y1 + 1.5}" stroke="${sutil}" stroke-width=".35"/><line x1="${x2}" y1="${y2 - 1.5}" x2="${x2}" y2="${y2 + 1.5}" stroke="${sutil}" stroke-width=".35"/>`;
    // PLANTA (X a la derecha, Y hacia arriba en la caja → abajo en el SVG se invierte para que coincida con las otras vistas)
    s += `<text x="${X0}" y="${Y0 - 12}" font-size="5.5" font-weight="700" fill="${tinta}">PLANTA (vista superior)</text>` + caja(X0, Y0, L, W);
    for (const q of R.piezas) {
      const x = X0 + e + q.x, y = Y0 + e + (W - q.y - q.W), col = colSub(q.sub);
      s += `<rect x="${x}" y="${y}" width="${q.L}" height="${q.W}" fill="${col}" fill-opacity=".22" stroke="${col}" stroke-width=".6" rx=".6"><title>${esc(q.ref)} · ${esc(q.n)} · ${q.L}×${q.W} mm · alto ${r1(q.Ht)} mm</title></rect>`;
      s += `<text x="${x + q.L / 2}" y="${y + q.W / 2 + 1.6}" font-size="${Math.min(4.5, q.L / 3.2)}" text-anchor="middle" font-weight="700" fill="${tinta}">${esc(q.ref)}</text>`;
      for (const d of q.paredes) { const cx = d === "-X" ? x : d === "+X" ? x + q.L : x + q.L / 2, cy = d === "+Y" ? y : d === "-Y" ? y + q.W : y + q.W / 2; s += `<circle cx="${cx}" cy="${cy}" r="1.6" fill="#f87171"><title>Necesita abertura en la pared (${d})</title></circle>`; }
      if (q.arribaZ) s += `<rect x="${x + 1}" y="${y + 1}" width="${q.L - 2}" height="${q.W - 2}" fill="none" stroke="#fbbf24" stroke-dasharray="1.5 1" stroke-width=".45"><title>Necesita ventana en la tapa</title></rect>`;
    }
    s += cota(X0 + e, Y0 - 3, X0 + e + L, Y0 - 3, `${L} mm (int.) · ${R.exterior.L} ext.`) + cota(X0 - 4, Y0 + e, X0 - 4, Y0 + e + W, `${W} mm`, true);
    // FRENTE (X–Z)
    s += `<text x="${X0}" y="${Y1 - 6}" font-size="5.5" font-weight="700" fill="${tinta}">FRENTE (X–Z)</text>` + caja(X0, Y1, L, H);
    const base = Y1 + e + H;
    for (const q of R.piezas) { const col = colSub(q.sub), x = X0 + e + q.x;
      if (q.Hc != null) { s += `<rect x="${x}" y="${base - q.Hc}" width="${q.L}" height="${q.Hc}" fill="${col}" fill-opacity=".25" stroke="${col}" stroke-width=".5"/>`; continue; }
      if (q.bajo) s += `<line x1="${x + 2}" y1="${base}" x2="${x + 2}" y2="${base - q.bajo}" stroke="${sutil}" stroke-width=".8"/><line x1="${x + q.L - 2}" y1="${base}" x2="${x + q.L - 2}" y2="${base - q.bajo}" stroke="${sutil}" stroke-width=".8"/>`;
      s += `<rect x="${x}" y="${base - q.bajo - q.esp}" width="${q.L}" height="${q.esp}" fill="${col}" fill-opacity=".55" stroke="${col}" stroke-width=".4"/>`;
      if (q.arriba) s += `<rect x="${x + 1}" y="${base - q.bajo - q.esp - q.arriba}" width="${q.L - 2}" height="${q.arriba}" fill="${col}" fill-opacity=".18" stroke="${col}" stroke-width=".35"/>`;
    }
    s += cota(X0 + e + L + 5, Y1 + e, X0 + e + L + 5, Y1 + e + H, `${H} mm`, true);
    // LATERAL (Y–Z)
    s += `<text x="${X1}" y="${Y1 - 12}" font-size="5.5" font-weight="700" fill="${tinta}">LATERAL (Y–Z)</text>` + caja(X1, Y1, W, H);
    for (const q of R.piezas) { const col = colSub(q.sub), y = X1 + e + (W - q.y - q.W);
      if (q.Hc != null) { s += `<rect x="${y}" y="${base - q.Hc}" width="${q.W}" height="${q.Hc}" fill="${col}" fill-opacity=".25" stroke="${col}" stroke-width=".5"/>`; continue; }
      s += `<rect x="${y}" y="${base - q.bajo - q.esp}" width="${q.W}" height="${q.esp}" fill="${col}" fill-opacity=".55" stroke="${col}" stroke-width=".4"/>`;
      if (q.arriba) s += `<rect x="${y + 1}" y="${base - q.bajo - q.esp - q.arriba}" width="${q.W - 2}" height="${q.arriba}" fill="${col}" fill-opacity=".18" stroke="${col}" stroke-width=".35"/>`;
    }
    s += cota(X1 + e, Y1 - 3, X1 + e + W, Y1 - 3, `${W} mm`);
    // cajetín
    s += `<text x="${X1}" y="${Y0 + 4}" font-size="5" font-weight="700" fill="${tinta}">${esc(opt.titulo || "Caja")}</text>
      <text x="${X1}" y="${Y0 + 11}" font-size="4.2" fill="${tinta}">Interior ${L} × ${W} × ${H} mm</text>
      <text x="${X1}" y="${Y0 + 17}" font-size="4.2" fill="${tinta}">Exterior ${R.exterior.L} × ${R.exterior.W} × ${R.exterior.H} mm (pared ${e} mm)</text>
      <text x="${X1}" y="${Y0 + 23}" font-size="4.2" fill="${sutil}">Volumen interior ${R.volumen} cm³ · ocupación en planta ${R.ocupacion} %</text>
      <text x="${X1}" y="${Y0 + 29}" font-size="3.6" fill="${sutil}">● rojo = abertura en pared · rayas amarillas = ventana en tapa</text>
      ${subs.length > 1 ? subs.map((u, i) => `<rect x="${X1}" y="${Y0 + 33 + i * 6}" width="4" height="4" fill="${colSub(u)}"/><text x="${X1 + 6}" y="${Y0 + 36.4 + i * 6}" font-size="3.8" fill="${tinta}">${esc(u || "—")}</text>`).join("") : ""}`;
    return s + `</svg>`;
  }

  // ---------- DXF (R12) con las tres vistas en mm
  function dxf(R, titulo) {
    const out = ["0", "SECTION", "2", "ENTITIES"], L = R.interior.L, W = R.interior.W, H = R.interior.H, e = R.p.espesor;
    const lin = (x1, y1, x2, y2, capa) => out.push("0", "LINE", "8", capa, "10", r1(x1), "20", r1(y1), "11", r1(x2), "21", r1(y2));
    const rect = (x, y, a, b, capa) => { lin(x, y, x + a, y, capa); lin(x + a, y, x + a, y + b, capa); lin(x + a, y + b, x, y + b, capa); lin(x, y + b, x, y, capa); };
    const txt = (x, y, t, h, capa) => out.push("0", "TEXT", "8", capa || "TEXTO", "10", r1(x), "20", r1(y), "40", h || 3, "1", String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7E]/g, ""));
    // planta en el origen, frente debajo, lateral a la derecha del frente
    rect(-e, -e, L + 2 * e, W + 2 * e, "CAJA_EXT"); rect(0, 0, L, W, "CAJA_INT"); txt(0, W + e + 4, "PLANTA", 4);
    for (const q of R.piezas) { rect(q.x, q.y, q.L, q.W, "PIEZAS"); txt(q.x + 1, q.y + 1, q.ref, 2.5, "TEXTO"); }
    const oy = -(H + 3 * e + 20); rect(-e, oy - e, L + 2 * e, H + 2 * e, "CAJA_EXT"); rect(0, oy, L, H, "CAJA_INT"); txt(0, oy + H + e + 4, "FRENTE", 4);
    for (const q of R.piezas) rect(q.x, oy + q.bajo, q.L, q.Hc != null ? q.Hc : q.esp + (q.arriba || 0), "PIEZAS");
    const ox = L + 3 * e + 20; rect(ox - e, oy - e, W + 2 * e, H + 2 * e, "CAJA_EXT"); rect(ox, oy, W, H, "CAJA_INT"); txt(ox, oy + H + e + 4, "LATERAL", 4);
    for (const q of R.piezas) rect(ox + q.y, oy + q.bajo, q.W, q.Hc != null ? q.Hc : q.esp + (q.arriba || 0), "PIEZAS");
    txt(ox, W - 6, `${titulo || "Caja"}: interior ${L} x ${W} x ${H} mm; exterior ${R.exterior.L} x ${R.exterior.W} x ${R.exterior.H} mm`, 3);
    out.push("0", "ENDSEC", "0", "EOF"); return out.join("\n");
  }

  window.MLCaja = { piezas, calcular, vistas, dxf, VDIM };
})();
