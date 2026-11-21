/* MountLab · exportación de la caja aprobada como ENSAMBLE: caja (base con paredes y fondo), tapa, repisas,
   cada componente con su modelo 3D completo de la biblioteca y cada accesorio (ventiladores, prensaestopas, pulsadores,
   LED, conectores…). Salidas: STEP AP214 (ensamble con colores), Parasolid vía SolidWorks y DXF de 6 vistas con una
   capa y un color por pieza. Coordenadas de la caja: x largo, y ancho, z alto; origen en la esquina interior (−X, −Y) del fondo. */
(function () {
  const r2 = v => Math.round(v * 100) / 100;
  const nmC = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "pieza";
  // colores bien distintos (uno por pieza) y su número ACI más cercano para el DXF
  const ACI = [1, 3, 5, 2, 6, 4, 30, 140, 210, 40, 170, 230, 90, 110, 190, 250, 10, 50, 130, 150, 200, 220, 70, 240];
  const ACI_RGB = { 1: "#ff0000", 2: "#ffff00", 3: "#00ff00", 4: "#00ffff", 5: "#0000ff", 6: "#ff00ff", 10: "#ff4c4c", 30: "#ff7f00", 40: "#ffbf00", 50: "#ffff4c", 70: "#7fff00", 90: "#00ff3f", 110: "#00ff7f", 130: "#00ffbf", 140: "#00bfff", 150: "#007fff", 170: "#003fff", 190: "#3f00ff", 200: "#7f00ff", 210: "#bf00ff", 220: "#ff00bf", 230: "#ff007f", 240: "#ff3f7f", 250: "#545454" };

  // ---------------- perfiles: bucles de segmentos (los mismos que usa MLCad.step)
  function invertir(loop) {   // mismo camino recorrido al revés
    const n = loop.length;
    return loop.map((_, k) => { const i = (n - k) % n, s = loop[(n - 1 - k + n) % n], fin = loop[i]; return Object.assign({}, s, { p: fin.p, ccw: s.t === "A" ? !s.ccw : undefined }); });
  }
  function area(loop) {   // signo del área (aprox. con los puntos y los puntos medios de los arcos)
    const P = []; loop.forEach((s, i) => { P.push(s.p); if (s.t === "A") { const e = loop[(i + 1) % loop.length].p, a0 = Math.atan2(s.p[1] - s.c[1], s.p[0] - s.c[0]); let a1 = Math.atan2(e[1] - s.c[1], e[0] - s.c[0]); if (s.ccw && a1 <= a0) a1 += 2 * Math.PI; if (!s.ccw && a1 >= a0) a1 -= 2 * Math.PI; const m = (a0 + a1) / 2; P.push([s.c[0] + s.r * Math.cos(m), s.c[1] + s.r * Math.sin(m)]); } });
    let A = 0; P.forEach((p, i) => { const q = P[(i + 1) % P.length]; A += p[0] * q[1] - q[0] * p[1]; }); return A / 2;
  }
  const orientar = (loop, ccw) => (area(loop) > 0) === ccw ? loop : invertir(loop);
  const espejoX = loop => loop.map(s => Object.assign({}, s, { p: [-s.p[0], s.p[1]], c: s.c ? [-s.c[0], s.c[1]] : undefined, ccw: s.t === "A" ? !s.ccw : undefined }));
  const extension = loop => { const xs = loop.flatMap(s => s.t === "A" ? [s.c[0] - s.r, s.c[0] + s.r] : [s.p[0]]), ys = loop.flatMap(s => s.t === "A" ? [s.c[1] - s.r, s.c[1] + s.r] : [s.p[1]]); return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]; };
  /** corte de la app → bucle (en coordenadas de la cara) */
  function bucleDe(c) {
    if (c.t === "c") return MLCad.circP(c.x, c.y, c.r, true);
    if (c.t === "r") return MLCad.rectP(c.x, c.y, c.w, c.h, c.r);
    if (c.t === "p") return c.pts.map(p => ({ p, t: "L" }));
    return null;
  }
  const rectL = (x0, x1, y0, y1) => MLCad.rectP((x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0, 0);

  // ---------------- marcos de cada cara (local → caja); en local: x = a lo largo, y = hacia arriba, z = hacia afuera
  function caras(R) {
    const { L, W, H } = R.interior, e = R.p.espesor;
    return {
      fondo: { T: { O: [0, 0, 0], X: [1, 0, 0], Y: [0, -1, 0], Z: [0, 0, -1] }, rect: [-e, L + e, -(W + e), e], uv: (u, v) => [u, -v] },
      tapa: { T: { O: [0, 0, H], X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] }, rect: [-e, L + e, -e, W + e], uv: (u, v) => [u, v] },
      "-Y": { T: { O: [0, 0, 0], X: [1, 0, 0], Y: [0, 0, 1], Z: [0, -1, 0] }, rect: [-e, L + e, 0, H], uv: (u, v) => [u, v] },
      "+Y": { T: { O: [0, W, 0], X: [-1, 0, 0], Y: [0, 0, 1], Z: [0, 1, 0] }, rect: [-(L + e), e, 0, H], uv: (u, v) => [-u, v], espejo: true },
      "-X": { T: { O: [0, 0, 0], X: [0, -1, 0], Y: [0, 0, 1], Z: [-1, 0, 0] }, rect: [-W, 0, 0, H], uv: (u, v) => [-u, v], espejo: true },
      "+X": { T: { O: [L, 0, 0], X: [0, 1, 0], Y: [0, 0, 1], Z: [1, 0, 0] }, rect: [0, W, 0, H], uv: (u, v) => [u, v] },
    };
  }
  const NOMBRE_CARA = { fondo: "Fondo", tapa: "Tapa", "-Y": "Pared frontal", "+Y": "Pared trasera", "-X": "Pared izquierda", "+X": "Pared derecha" };
  /** placa de una cara con todos sus agujeros */
  function placaCara(R, k, F, color, omitidos) {
    const e = R.p.espesor, [x0, x1, y0, y1] = F.rect, huecos = [], cajas = [];
    for (const el of (R.elementos || []).filter(q => q.cara === k)) {
      const B = [], H2 = [];
      for (const c of el.cortes || []) {
        let b = bucleDe(c); if (!b) continue;
        b = b.map(s => Object.assign({}, s, { p: F.uv(s.p[0], s.p[1]), c: s.c ? F.uv(s.c[0], s.c[1]) : undefined, ccw: s.t === "A" ? (F.espejo || k === "fondo" ? !s.ccw : s.ccw) : undefined }));
        const bb = extension(b); if (bb[0] <= x0 + 0.2 || bb[1] >= x1 - 0.2 || bb[2] <= y0 + 0.2 || bb[3] >= y1 - 0.2) continue;   // corte que se sale de la cara: se omite
        B.push(bb); H2.push(orientar(b, false));
      }
      // un elemento que se monta sobre otro ya cortado no se corta (el sólido quedaría inválido); se avisa
      if (B.some(p => cajas.some(q => q[0] < p[1] - 0.05 && p[0] < q[1] - 0.05 && q[2] < p[3] - 0.05 && p[2] < q[3] - 0.05))) { omitidos.push(el.ref); continue; }
      cajas.push(...B); huecos.push(...H2);
    }
    return { nombre: NOMBRE_CARA[k], color, z0: 0, z1: e, ext: orientar(rectL(x0, x1, y0, y1), true), huecos, T: F.T };
  }

  // ---------------- accesorios: forma 3D sencilla de cada elemento (local: z = 0 en la cara exterior, z > 0 hacia afuera)
  const cil = (nombre, d, z0, z1, color) => ({ nombre, color, z0, z1, ext: MLCad.circP(0, 0, d / 2, true), huecos: [] });
  const rec = (nombre, w, h, z0, z1, color, r) => ({ nombre, color, z0, z1, ext: MLCad.rectP(0, 0, w, h, r || 0), huecos: [] });
  function accesorio(el, e) {
    const d = (window.MLCajaEl && MLCajaEl.def(el.tipo)) || {}, g = d.grupo || "", f = d.forma || el.forma, P = [], prof = Math.max(0, +el.prof || +d.prof || 0), dentro = -e;
    if (f === "anillo_ventana" || f === "ranuras" || f === "agujeros") return P;
    const D = Math.max(el.w, el.h), dc = (d.par && d.par.d) || D;
    if (/^vent_/.test(el.tipo)) { const s = el.w, pf = prof || Math.max(10, s / 4); P.push({ nombre: "Marco ventilador", color: "#1f2937", z0: dentro - pf, z1: dentro, ext: MLCad.rectP(0, 0, s, s, 2), huecos: [MLCad.circP(0, 0, (s - 2) / 2, false)] }, cil("Rotor", s * 0.42, dentro - pf + 1, dentro - 1, "#374151")); return P; }
    if (g === "Pasacables" && /^pg|^m\d/.test(el.tipo)) { P.push(cil("Tuerca exterior", dc * 1.45, 0, 3, "#334155"), cil("Domo", dc * 1.2, 3, 10, "#475569"), cil("Contratuerca", dc * 1.6, dentro - 4, dentro, "#334155")); return P; }
    if (g === "Pasacables") { if (f === "circ") P.push(cil("Pasacables de goma", dc + 3, 0, 1.5, "#111827")); return P; }
    if (g === "LED e indicadores") { P.push(cil("Bisel", dc + 2.5, 0, 1.5, "#cbd5e1"), cil("Lente", Math.max(2.5, dc - 0.6), 1.5, 4.5, "#ef4444"), cil("Cuerpo", dc, dentro - Math.max(4, prof), dentro, "#334155")); return P; }
    if (g === "Pulsadores") { const em = el.tipo === "emergencia"; P.push(cil("Bisel", dc + 3, 0, 1.5, "#cbd5e1"), cil("Botón", em ? dc + 12 : Math.max(1.5, dc - 2), 1.5, em ? 12 : 4, em ? "#dc2626" : /led/.test(el.tipo) ? "#2563eb" : "#111827"), cil("Cuerpo", dc, dentro - Math.max(4, prof), dentro, "#334155")); return P; }
    if (g === "Interruptores" && f !== "circ" && f !== "plano" && f !== "antigiro") { P.push(rec("Marco", el.w + 3, el.h + 3, 0, 2, "#111827", 1), rec("Balancín", Math.max(1, el.w - 2), Math.max(1, el.h - 2), 2, 5, el.tipo === "kcd3" ? "#dc2626" : "#1f2937", 1), rec("Cuerpo", el.w, el.h, dentro - Math.max(4, prof), dentro, "#334155")); return P; }
    if (g === "Interruptores") { const perilla = /rotativo|encoder|pote/.test(el.tipo); P.push(cil("Tuerca", dc + 4, 0, 2, "#cbd5e1"), perilla ? cil("Perilla", 15, 2, 16, "#111827") : cil(el.tipo === "llave" ? "Cilindro de llave" : "Palanca", el.tipo === "llave" ? dc - 1 : 3, 2, el.tipo === "llave" ? 4 : 14, "#cbd5e1"), cil("Cuerpo", dc, dentro - Math.max(4, prof), dentro, "#334155")); return P; }
    if (/USB|Alimentación|Datos y RF/.test(g)) {
      if (f === "circ" || f === "plano") { const largo = /^gx|^m8|^m12/.test(el.tipo) ? 9 : /sma|bnc|^conector_n/.test(el.tipo) ? 8 : /fusible/.test(el.tipo) ? 12 : 2; P.push(cil("Tuerca", dc + 4.5, 0, 2.5, "#cbd5e1"), cil("Cuerpo exterior", Math.max(2, dc - 0.5), 2.5, 2.5 + largo, /fusible/.test(el.tipo) ? "#111827" : "#94a3b8")); }
      else if (f === "tornillos2" || f === "dsub" || f === "chaflan") P.push(rec("Brida", el.w + 2, el.h + 4, 0, 1, "#94a3b8", 1));
      if (prof > 0) P.push(f === "circ" || f === "plano" ? cil("Cuerpo", dc, dentro - prof, dentro, "#475569") : rec("Cuerpo", Math.min(el.w, (d.par && d.par.w) || el.w), el.h, dentro - prof, dentro, "#475569"));
      return P;
    }
    return P;   // ventanas, rejillas, agujeros y fijaciones: solo el corte
  }

  // ---------------- piezas sin modelo 3D: placa + volumen; partes virtuales: un bloque con su medida
  function solidosSinModelo(q) {
    if (q.Hc != null) return [rec(q.n, q.L0 || q.L, q.W0 || q.W, 0, q.Hc, "#64748b")];
    const esp = q.esp || 1.6, arr = Math.max(0.5, (q.Ht || 0) - (q.bajo || 0) - esp);
    return [rec("PCB", q.L0 || q.L, q.W0 || q.W, 0, esp, "#166534"), rec("Volumen de componentes", Math.max(1, (q.L0 || q.L) - 1), Math.max(1, (q.W0 || q.W) - 1), esp, esp + arr, "#64748b")];
  }

  /** Escena de la caja: grupos { id, nombre, capa, tipo, T, solidos } */
  function escena(R, comp, opt) {
    opt = opt || {}; const F = caras(R), { L, W, H } = R.interior, e = R.p.espesor, G = [], omit = [];
    const caja = { id: "caja_base", nombre: "Caja (base)", tipo: "caja", T: MLCad.ID, solidos: ["fondo", "-Y", "+Y", "-X", "+X"].map(k => placaCara(R, k, F[k], "#94a3b8", omit)) };
    G.push(caja);
    G.push({ id: "tapa", nombre: "Tapa", tipo: "caja", T: MLCad.ID, solidos: [placaCara(R, "tapa", F.tapa, "#cbd5e1", omit)] });
    R.niveles.slice(1).forEach((nv, k) => G.push({ id: `repisa_${k + 2}`, nombre: `Repisa nivel ${k + 2}`, tipo: "caja", T: MLCad.ID, solidos: [{ nombre: "Repisa", color: "#64748b", z0: nv.z - R.p.repisa, z1: nv.z, ext: rectL(0.5, L - 0.5, 0.5, W - 0.5), huecos: [] }] }));
    for (const q of R.piezas.filter(q2 => q2.elemento == null)) {
      const c = q.id && comp ? comp(q.id) : null, a = (q.rot || 0) * Math.PI / 180, ca = Math.round(Math.cos(a) * 1e6) / 1e6, sa = Math.round(Math.sin(a) * 1e6) / 1e6;
      const T = { O: [q.x + q.L / 2, q.y + q.W / 2, (q.z0 || 0) + (q.Hc != null ? 0 : (q.bajo || 0))], X: [ca, sa, 0], Y: [-sa, ca, 0], Z: [0, 0, 1] };
      let S = c && c.modelo && c.modelo.base ? MLCad.solidos(c) : null;
      if (!S || !S.length) { const giro = (q.rot || 0) % 180 !== 0; S = solidosSinModelo(Object.assign({}, q, { L0: giro ? q.W : q.L, W0: giro ? q.L : q.W })); }
      G.push({ id: nmC(q.ref + "_" + (c ? c.id : q.n)), nombre: `${q.ref} ${q.n}`, tipo: "componente", T, solidos: S });
    }
    for (const el of R.elementos || []) {
      const Fc = F[el.cara]; if (!Fc) continue; const P = accesorio(el, e); if (!P.length) continue;
      const [lx, ly] = Fc.uv(el.u, el.v), base = MLCad.tP(Fc.T, lx, ly, e);
      G.push({ id: nmC(el.ref + "_" + el.tipo), nombre: `${el.ref} ${el.n}`, tipo: "accesorio", T: { O: base, X: Fc.T.X, Y: Fc.T.Y, Z: Fc.T.Z }, solidos: P });
    }
    // un color por pieza para diferenciarlas (o los colores reales del modelo)
    G.forEach((g, i) => { g.aci = ACI[i % ACI.length]; g.color = g.tipo === "caja" ? (g.id === "tapa" ? "#cbd5e1" : "#94a3b8") : ACI_RGB[g.aci]; g.capa = nmC((g.tipo === "caja" ? "CAJA_" : g.tipo === "accesorio" ? "ACC_" : "COMP_") + g.nombre).toUpperCase().slice(0, 31);
      if (g.tipo === "caja") g.aci = g.id === "tapa" ? 9 : 8;
      if (opt.colores !== "modelo") g.solidos.forEach(s => s.color = g.color); });
    G.omitidos = omit;
    return G;
  }

  function step(R, comp, opt) {
    const G = escena(R, comp, opt), nombre = (opt && opt.archivo) || "caja";
    return MLCad.stepEnsamble(G.map(g => ({ id: g.id, nombre: g.nombre, T: g.T, solidos: g.solidos })), (opt && opt.titulo) || "Caja", nombre + ".step");
  }

  // ---------------- DXF de 6 vistas (tercer diedro) con una capa por pieza
  function dxf(R, comp, opt) {
    const G = escena(R, comp, opt), o = [], f = v => String(Math.round(v * 1000) / 1000);
    const capas = {}; G.forEach(g => capas[g.capa] = g.aci); capas.TEXTO = 7;
    o.push("0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1009", "9", "$INSUNITS", "70", "4", "0", "ENDSEC");
    o.push("0", "SECTION", "2", "TABLES", "0", "TABLE", "2", "LAYER", "70", String(Object.keys(capas).length));
    for (const [k, c] of Object.entries(capas)) o.push("0", "LAYER", "2", k, "70", "0", "62", String(c), "6", "CONTINUOUS");
    o.push("0", "ENDTAB", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES");
    const lin = (l, a, b) => o.push("0", "LINE", "8", l, "10", f(a[0]), "20", f(a[1]), "30", "0", "11", f(b[0]), "21", f(b[1]), "31", "0");
    const arc = (l, c, r, a0, a1) => o.push("0", "ARC", "8", l, "10", f(c[0]), "20", f(c[1]), "30", "0", "40", f(r), "50", f(a0), "51", f(a1));
    const txt = (x, y, h, s) => o.push("0", "TEXT", "8", "TEXTO", "10", f(x), "20", f(y), "30", "0", "40", f(h), "1", String(s).replace(/[–—·]/g, "-").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "?"));
    // vistas: dirección desde la que se mira y proyección 3D → 2D
    const V = {
      sup: { d: [0, 0, 1], p: q => [q[0], q[1]] }, inf: { d: [0, 0, -1], p: q => [-q[0], q[1]] },
      fre: { d: [0, -1, 0], p: q => [q[0], q[2]] }, pos: { d: [0, 1, 0], p: q => [-q[0], q[2]] },
      der: { d: [1, 0, 0], p: q => [q[1], q[2]] }, izq: { d: [-1, 0, 0], p: q => [-q[1], q[2]] }
    };
    const comp3 = (A, B) => ({ O: MLCad.tP(A, ...B.O), X: MLCad.tD(A, ...B.X), Y: MLCad.tD(A, ...B.Y), Z: MLCad.tD(A, ...B.Z) });
    const todos = []; G.forEach(g => g.solidos.forEach(s => todos.push({ g, s, T: comp3(g.T, s.T || MLCad.ID) })));
    // caja envolvente de cada sólido en coordenadas de la caja
    const bbox = (s, T) => { const [x0, x1, y0, y1] = extension(s.ext), P = []; for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [s.z0, s.z1]) P.push(MLCad.tP(T, x, y, z)); return [0, 1, 2].map(i => [Math.min(...P.map(p => p[i])), Math.max(...P.map(p => p[i]))]); };
    const BB = [0, 1, 2].map(i => [Math.min(...todos.map(t => bbox(t.s, t.T)[i][0])), Math.max(...todos.map(t => bbox(t.s, t.T)[i][1]))]);
    const LX = BB[0][1] - BB[0][0], LY = BB[1][1] - BB[1][0], LZ = BB[2][1] - BB[2][0], gap = Math.max(20, Math.max(LX, LY, LZ) * 0.25), c = BB.map(b => (b[0] + b[1]) / 2);
    const off = { fre: [0, 0], sup: [0, LZ / 2 + gap + LY / 2], inf: [0, -(LZ / 2 + gap + LY / 2)], der: [LX / 2 + gap + LY / 2, 0], izq: [-(LX / 2 + gap + LY / 2), 0], pos: [LX / 2 + gap + LY + gap + LX / 2, 0] };
    for (const [k, v] of Object.entries(V)) {
      const cen = v.p(c), ox = off[k][0] - cen[0], oy = off[k][1] - cen[1], P2 = q => { const p = v.p(q); return [p[0] + ox, p[1] + oy]; };
      for (const { g, s, T } of todos) {
        const Z = T.Z, par = Math.abs(Z[0] * v.d[0] + Z[1] * v.d[1] + Z[2] * v.d[2]) > 0.999;
        if (par) {   // se ve de frente: el perfil con sus agujeros (en la cara que mira al observador)
          const zc = (Z[0] * v.d[0] + Z[1] * v.d[1] + Z[2] * v.d[2]) > 0 ? s.z1 : s.z0;
          const ex = MLCad.tD(T, 1, 0, 0), ey = MLCad.tD(T, 0, 1, 0), ux = v.p(ex), uy = v.p(ey), det = ux[0] * uy[1] - ux[1] * uy[0];
          for (const loop of [s.ext, ...s.huecos]) loop.forEach((sg, i) => {
            const s2 = loop[(i + 1) % loop.length], a = P2(MLCad.tP(T, sg.p[0], sg.p[1], zc)), b = P2(MLCad.tP(T, s2.p[0], s2.p[1], zc));
            if (sg.t !== "A") { lin(g.capa, a, b); return; }
            const cc = P2(MLCad.tP(T, sg.c[0], sg.c[1], zc)), a0 = Math.atan2(a[1] - cc[1], a[0] - cc[0]) * 180 / Math.PI, a1 = Math.atan2(b[1] - cc[1], b[0] - cc[0]) * 180 / Math.PI;
            if (sg.ccw === det > 0) arc(g.capa, cc, sg.r, a0, a1); else arc(g.capa, cc, sg.r, a1, a0);
          });
        } else {   // de lado: su silueta (rectángulo)
          const b3 = bbox(s, T), q = []; for (const x of b3[0]) for (const y of b3[1]) for (const z of b3[2]) q.push(P2([x, y, z]));
          const xs = q.map(p => p[0]), ys = q.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
          lin(g.capa, [x0, y0], [x1, y0]); lin(g.capa, [x1, y0], [x1, y1]); lin(g.capa, [x1, y1], [x0, y1]); lin(g.capa, [x0, y1], [x0, y0]);
        }
      }
    }
    const th = Math.max(2.5, Math.min(6, gap / 5));
    const tit = { sup: "VISTA SUPERIOR", inf: "VISTA INFERIOR", fre: "VISTA FRONTAL", pos: "VISTA POSTERIOR", der: "LATERAL DERECHA", izq: "LATERAL IZQUIERDA" };
    const ancho = { sup: LX, inf: LX, fre: LX, pos: LX, der: LY, izq: LY }, alto = { sup: LY, inf: LY, fre: LZ, pos: LZ, der: LZ, izq: LZ };
    for (const k of Object.keys(V)) txt(off[k][0] - ancho[k] / 2, off[k][1] - alto[k] / 2 - th * 2, th, tit[k]);
    txt(off.izq[0] - LY / 2, off.inf[1] - LY / 2 - th * 5, th * 1.2, `${(opt && opt.titulo) || "Caja"} - exterior ${R.exterior.L} x ${R.exterior.W} x ${R.exterior.H} mm - escala 1:1 - ${G.length} piezas (una capa y un color por pieza)`);
    o.push("0", "ENDSEC", "0", "EOF");
    return o.join("\n");
  }

  window.MLCajaExport = { escena, step, dxf };
})();
