/* MountLab · exportación CAD desde el MISMO modelo 3D que se ve en la app (sin pasar por GitHub):
   - STEP AP214 con un sólido B-rep exacto por cada cuerpo (placa con sus agujeros, cajas, cajas redondeadas, cilindros), con color y nombre.
   - DXF con 6 vistas (superior, inferior, frontal, posterior, lateral izquierda y derecha) en proyección del tercer diedro.
   - Macro de SolidWorks (.swb) que abre el STEP y lo guarda como Parasolid (.x_t): el Parasolid solo lo puede escribir un núcleo Parasolid.
   Coordenadas del modelo: mm, origen en el centro de la placa, Z hacia arriba desde la cara inferior del PCB. */
(function () {
  const fx = n => { const v = Math.round(n * 1e6) / 1e6; const s = String(v); return /[.eE]/.test(s) ? s : s + "."; };

  // ------------------------------------------------------------ perfiles 2D (bucles de segmentos línea/arco)
  // segmento: { p: [x, y] inicio, t: "L" | "A", c: [cx, cy], r, ccw } ; el fin es el inicio del siguiente
  function rectP(cx, cy, w, h, r) {
    const W2 = w / 2, H2 = h / 2; r = Math.max(0, Math.min(r || 0, W2 - 0.01, H2 - 0.01));
    if (r < 0.05) return [[cx - W2, cy - H2], [cx + W2, cy - H2], [cx + W2, cy + H2], [cx - W2, cy + H2]].map(p => ({ p, t: "L" }));
    const x0 = cx - W2, x1 = cx + W2, y0 = cy - H2, y1 = cy + H2;
    return [
      { p: [x0 + r, y0], t: "L" }, { p: [x1 - r, y0], t: "A", c: [x1 - r, y0 + r], r, ccw: true },
      { p: [x1, y0 + r], t: "L" }, { p: [x1, y1 - r], t: "A", c: [x1 - r, y1 - r], r, ccw: true },
      { p: [x1 - r, y1], t: "L" }, { p: [x0 + r, y1], t: "A", c: [x0 + r, y1 - r], r, ccw: true },
      { p: [x0, y1 - r], t: "L" }, { p: [x0, y0 + r], t: "A", c: [x0 + r, y0 + r], r, ccw: true }];
  }
  const circP = (cx, cy, r, ccw) => ccw
    ? [{ p: [cx + r, cy], t: "A", c: [cx, cy], r, ccw: true }, { p: [cx - r, cy], t: "A", c: [cx, cy], r, ccw: true }]
    : [{ p: [cx + r, cy], t: "A", c: [cx, cy], r, ccw: false }, { p: [cx - r, cy], t: "A", c: [cx, cy], r, ccw: false }];

  /** Lista de sólidos extruidos { nombre, color, z0, z1, ext: bucle CCW, huecos: [bucles CW], tipo } que reproduce el modelo 3D. */
  function solidos(W) {
    const M = W.modelo; if (!M || !M.base) return [];
    const b = M.base, esp = +b.espesor || 1.6, bi = MLPlant.baseInfo(b), out = [], ag = (W.montaje && W.montaje.agujeros) || [];
    if (!bi.prim.length) {
      const ext = b.forma === "redonda" ? circP(0, 0, (b.d || b.L) / 2, true) : rectP(0, 0, b.L, b.W, b.forma === "redondeada" ? b.radio : 0);
      out.push({ nombre: "PCB", color: b.color || "#166534", z0: 0, z1: esp, ext, huecos: ag.map(a => circP(a.x, a.y, a.d / 2, false)), tipo: "placa", cx: 0, cy: 0, w: b.L || b.d, h: b.W || b.d });
    }
    const lista = bi.prim.map(c => Object.assign({ esBase: true, nombreP: "Base" }, c)).concat((M.piezas || []).flatMap(p => MLPlant.cuerposDe(p, esp).map(c => Object.assign({ nombreP: p.nombre || p.plantilla }, c))));
    lista.forEach((c, i) => {
      if (!(c.z1 > c.z0)) return;
      const nombre = `${c.nombreP || "Pieza"}_${i + 1}`;
      if (c.f === "cil") { out.push({ nombre, color: c.color, z0: c.z0, z1: c.z1, ext: circP(c.cx, c.cy, c.d / 2, true), huecos: [], tipo: "cil", cx: c.cx, cy: c.cy, w: c.d, h: c.d }); return; }
      const hs = c.orejas ? ag.filter(a => Math.abs(a.x - c.cx) < c.w / 2 && Math.abs(a.y - c.cy) < c.h / 2) : [];
      out.push({ nombre, color: c.color, z0: c.z0, z1: c.z1, ext: rectP(c.cx, c.cy, c.w, c.h, c.r), huecos: hs.map(a => circP(a.x, a.y, a.d / 2, false)), tipo: "caja", cx: c.cx, cy: c.cy, w: c.w, h: c.h, r: c.r });
    });
    return out;
  }

  // ------------------------------------------------------------ escritor STEP (AP214)
  function step(W, titulo) {
    const L = []; let n = 0;
    const E = s => { n++; L.push(`#${n}=${s};`); return n; };
    const nm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "_").replace(/'/g, "");
    const pt = (x, y, z) => E(`CARTESIAN_POINT('',(${fx(x)},${fx(y)},${fx(z)}))`);
    const dir = (x, y, z) => E(`DIRECTION('',(${fx(x)},${fx(y)},${fx(z)}))`);
    const ax = (o, z, xr) => E(`AXIS2_PLACEMENT_3D('',#${pt(...o)},#${dir(...z)},#${dir(...xr)})`);
    const ctx0 = (() => {
      const app = E("APPLICATION_CONTEXT('core data for automotive mechanical design processes')");
      E(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,#${app})`);
      const pc = E(`PRODUCT_CONTEXT('',#${app},'mechanical')`);
      const pr = E(`PRODUCT('${nm(W.id)}','${nm(titulo || W.nombre)}','',(#${pc}))`);
      E(`PRODUCT_RELATED_PRODUCT_CATEGORY('part','',(#${pr}))`);
      const pdf = E(`PRODUCT_DEFINITION_FORMATION('','',#${pr})`);
      const pdc = E(`PRODUCT_DEFINITION_CONTEXT('part definition',#${app},'design')`);
      const pd = E(`PRODUCT_DEFINITION('design','',#${pdf},#${pdc})`);
      const pds = E(`PRODUCT_DEFINITION_SHAPE('','',#${pd})`);
      const u1 = E("( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) )");
      const u2 = E("( NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.) )");
      const u3 = E("( NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT() )");
      const un = E(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-06),#${u1},'distance_accuracy_value','confusion accuracy')`);
      const gc = E(`( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${un})) GLOBAL_UNIT_ASSIGNED_CONTEXT((#${u1},#${u2},#${u3})) REPRESENTATION_CONTEXT('Context3D','3D Context with UNIT and UNCERTAINTY') )`);
      return { pds, gc };
    })();
    const origen = ax([0, 0, 0], [0, 0, 1], [1, 0, 0]);
    const solidosIds = [], estilos = [];
    const rgb = h => { const m = String(h || "#888888").replace("#", ""), v = m.length === 3 ? m.split("").map(c => c + c).join("") : m.padEnd(6, "8"); return [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16) / 255); };

    for (const S of solidos(W)) {
      const caras = [];
      const bucles = [S.ext, ...S.huecos];
      // vértices, aristas inferiores/superiores y verticales de cada bucle
      const B = bucles.map(seg => {
        const vb = seg.map(s => E(`VERTEX_POINT('',#${pt(s.p[0], s.p[1], S.z0)})`)), vt = seg.map(s => E(`VERTEX_POINT('',#${pt(s.p[0], s.p[1], S.z1)})`));
        const curva = (s, s2, z) => {
          if (s.t === "L") { const dx = s2.p[0] - s.p[0], dy = s2.p[1] - s.p[1], l = Math.hypot(dx, dy) || 1; return E(`LINE('',#${pt(s.p[0], s.p[1], z)},#${E(`VECTOR('',#${dir(dx / l, dy / l, 0)},${fx(l)})`)})`); }
          return E(`CIRCLE('',#${ax([s.c[0], s.c[1], z], [0, 0, 1], [1, 0, 0])},${fx(s.r)})`);
        };
        const eb = seg.map((s, i) => { const s2 = seg[(i + 1) % seg.length]; return E(`EDGE_CURVE('',#${vb[i]},#${vb[(i + 1) % seg.length]},#${curva(s, s2, S.z0)},${s.t === "A" && !s.ccw ? ".F." : ".T."})`); });
        const et = seg.map((s, i) => { const s2 = seg[(i + 1) % seg.length]; return E(`EDGE_CURVE('',#${vt[i]},#${vt[(i + 1) % seg.length]},#${curva(s, s2, S.z1)},${s.t === "A" && !s.ccw ? ".F." : ".T."})`); });
        const ev = seg.map((s, i) => E(`EDGE_CURVE('',#${vb[i]},#${vt[i]},#${E(`LINE('',#${pt(s.p[0], s.p[1], S.z0)},#${E(`VECTOR('',#${dir(0, 0, 1)},${fx(S.z1 - S.z0)})`)})`)},.T.)`));
        return { seg, eb, et, ev };
      });
      const oe = (e, sentido) => E(`ORIENTED_EDGE('',*,*,#${e},${sentido ? ".T." : ".F."})`);
      // tapa superior (normal +Z): bucles en su sentido
      const topB = B.map((b, k) => E(`${k ? "FACE_BOUND" : "FACE_OUTER_BOUND"}('',#${E(`EDGE_LOOP('',(${b.et.map(e => "#" + oe(e, true)).join(",")}))`)},.T.)`));
      caras.push(E(`ADVANCED_FACE('',(${topB.map(i => "#" + i).join(",")}),#${E(`PLANE('',#${ax([0, 0, S.z1], [0, 0, 1], [1, 0, 0])})`)},.T.)`));
      // tapa inferior (normal −Z): bucles recorridos al revés
      const botB = B.map((b, k) => E(`${k ? "FACE_BOUND" : "FACE_OUTER_BOUND"}('',#${E(`EDGE_LOOP('',(${b.eb.slice().reverse().map(e => "#" + oe(e, false)).join(",")}))`)},.T.)`));
      caras.push(E(`ADVANCED_FACE('',(${botB.map(i => "#" + i).join(",")}),#${E(`PLANE('',#${ax([0, 0, S.z0], [0, 0, 1], [1, 0, 0])})`)},.F.)`));
      // caras laterales: el material queda a la izquierda del recorrido, la normal exterior a la derecha
      for (const b of B) b.seg.forEach((s, i) => {
        const j = (i + 1) % b.seg.length, s2 = b.seg[j];
        const lazo = E(`EDGE_LOOP('',(#${oe(b.eb[i], true)},#${oe(b.ev[j], true)},#${oe(b.et[i], false)},#${oe(b.ev[i], false)}))`);
        const fb = E(`FACE_OUTER_BOUND('',#${lazo},.T.)`);
        let sup, mismo = ".T.";
        if (s.t === "L") { const dx = s2.p[0] - s.p[0], dy = s2.p[1] - s.p[1], l = Math.hypot(dx, dy) || 1; sup = E(`PLANE('',#${ax([s.p[0], s.p[1], S.z0], [dy / l, -dx / l, 0], [dx / l, dy / l, 0])})`); }
        else { sup = E(`CYLINDRICAL_SURFACE('',#${ax([s.c[0], s.c[1], S.z0], [0, 0, 1], [1, 0, 0])},${fx(s.r)})`); mismo = s.ccw ? ".T." : ".F."; }
        caras.push(E(`ADVANCED_FACE('',(#${fb}),#${sup},${mismo})`));
      });
      const shell = E(`CLOSED_SHELL('',(${caras.map(i => "#" + i).join(",")}))`);
      const sol = E(`MANIFOLD_SOLID_BREP('${nm(S.nombre)}',#${shell})`);
      solidosIds.push(sol);
      const [r, g, bl] = rgb(S.color);
      const col = E(`COLOUR_RGB('',${fx(r)},${fx(g)},${fx(bl)})`);
      const est = E(`PRESENTATION_STYLE_ASSIGNMENT((#${E(`SURFACE_STYLE_USAGE(.BOTH.,#${E(`SURFACE_SIDE_STYLE('',(#${E(`SURFACE_STYLE_FILL_AREA(#${E(`FILL_AREA_STYLE('',(#${E(`FILL_AREA_STYLE_COLOUR('',#${col})`)}))`)})`)}))`)})`)}))`);
      estilos.push(E(`STYLED_ITEM('color',(#${est}),#${sol})`));
    }
    const rep = E(`ADVANCED_BREP_SHAPE_REPRESENTATION('${nm(W.nombre)}',(#${origen}${solidosIds.map(i => ",#" + i).join("")}),#${ctx0.gc})`);
    E(`SHAPE_DEFINITION_REPRESENTATION(#${ctx0.pds},#${rep})`);
    if (estilos.length) E(`MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION('',(${estilos.map(i => "#" + i).join(",")}),#${ctx0.gc})`);
    const fecha = new Date().toISOString().slice(0, 19);
    return `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('MountLab: modelo 3D de ${nm(W.nombre)}'),'2;1');
FILE_NAME('${nm(W.id)}.step','${fecha}',('MountLab'),(''),'MountLab','MountLab','');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));
ENDSEC;
DATA;
${L.join("\n")}
ENDSEC;
END-ISO-10303-21;
`;
  }

  // ------------------------------------------------------------ DXF con 6 vistas (tercer diedro)
  function dxf6(W, titulo) {
    const S = solidos(W); if (!S.length) return null;
    const o = [], f = v => String(Math.round(v * 10000) / 10000);
    const CAPAS = { SUPERIOR: 3, INFERIOR: 4, FRONTAL: 1, POSTERIOR: 6, LATERAL_DER: 5, LATERAL_IZQ: 2, AGUJEROS: 1, EJES: 8, TEXTO: 7 };
    o.push("0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1009", "9", "$INSUNITS", "70", "4", "0", "ENDSEC");
    o.push("0", "SECTION", "2", "TABLES", "0", "TABLE", "2", "LAYER", "70", String(Object.keys(CAPAS).length));
    for (const [k, c] of Object.entries(CAPAS)) o.push("0", "LAYER", "2", k, "70", "0", "62", String(c), "6", k === "EJES" ? "CENTER" : "CONTINUOUS");
    o.push("0", "ENDTAB", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES");
    const lin = (l, x1, y1, x2, y2) => o.push("0", "LINE", "8", l, "10", f(x1), "20", f(y1), "30", "0", "11", f(x2), "21", f(y2), "31", "0");
    const arc = (l, x, y, r, a0, a1) => o.push("0", "ARC", "8", l, "10", f(x), "20", f(y), "30", "0", "40", f(r), "50", f(a0), "51", f(a1));
    const cir = (l, x, y, r) => o.push("0", "CIRCLE", "8", l, "10", f(x), "20", f(y), "30", "0", "40", f(r));
    const txt = (x, y, h, s) => o.push("0", "TEXT", "8", "TEXTO", "10", f(x), "20", f(y), "30", "0", "40", f(h), "1", String(s).replace(/[–—]/g, "-").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "?"));
    // bucle en planta transformado por (sx = ±1) y desplazado
    const bucle = (l, seg, ox, oy, sx) => seg.forEach((s, i) => {
      const s2 = seg[(i + 1) % seg.length], P = q => [ox + sx * q[0], oy + q[1]];
      if (s.t === "L") { const a = P(s.p), b = P(s2.p); lin(l, a[0], a[1], b[0], b[1]); return; }
      const c = P(s.c); let a0 = Math.atan2(s.p[1] - s.c[1], s.p[0] - s.c[0]) * 180 / Math.PI, a1 = Math.atan2(s2.p[1] - s.c[1], s2.p[0] - s.c[0]) * 180 / Math.PI;
      let ccw = s.ccw; if (sx < 0) { a0 = 180 - a0; a1 = 180 - a1; ccw = !ccw; }
      if (ccw) arc(l, c[0], c[1], s.r, a0, a1); else arc(l, c[0], c[1], s.r, a1, a0);
    });
    const bb = { x0: Math.min(...S.map(s => s.cx - s.w / 2)), x1: Math.max(...S.map(s => s.cx + s.w / 2)), y0: Math.min(...S.map(s => s.cy - s.h / 2)), y1: Math.max(...S.map(s => s.cy + s.h / 2)), z0: Math.min(...S.map(s => s.z0)), z1: Math.max(...S.map(s => s.z1)) };
    const LX = bb.x1 - bb.x0, LY = bb.y1 - bb.y0, LZ = bb.z1 - bb.z0, g = Math.max(15, Math.max(LX, LY, LZ) * 0.35);
    // centros de cada vista (el frontal en el origen del dibujo)
    const fr = [0, 0], sup = [0, LZ / 2 + g + LY / 2], inf = [0, -(LZ / 2 + g + LY / 2)], der = [LX / 2 + g + LY / 2, 0], izq = [-(LX / 2 + g + LY / 2), 0], post = [der[0] + LY / 2 + g + LX / 2, 0];
    const cxm = (bb.x0 + bb.x1) / 2, cym = (bb.y0 + bb.y1) / 2, czm = (bb.z0 + bb.z1) / 2;
    const orden = S.slice().sort((a, b) => a.z1 - b.z1);
    // en planta se ve lo que asoma por esa cara: la placa, lo que está de ese lado y lo que sobresale del contorno
    const placa = S.find(s => s.tipo === "placa"), pz0 = placa ? placa.z0 : -Infinity, pz1 = placa ? placa.z1 : Infinity;
    const fuera = s => !placa || s.cx - s.w / 2 < placa.cx - placa.w / 2 - 1e-6 || s.cx + s.w / 2 > placa.cx + placa.w / 2 + 1e-6 || s.cy - s.h / 2 < placa.cy - placa.h / 2 - 1e-6 || s.cy + s.h / 2 > placa.cy + placa.h / 2 + 1e-6;
    const deArriba = orden.filter(s => s === placa || s.z1 > pz1 - 1e-6 || fuera(s)), deAbajo = orden.slice().reverse().filter(s => s === placa || s.z0 < pz0 + 1e-6 || fuera(s));
    // SUPERIOR (desde +Z): X → derecha, Y → arriba
    for (const s of deArriba) { bucle("SUPERIOR", s.ext, sup[0] - cxm, sup[1] - cym, 1); s.huecos.forEach(h => bucle("AGUJEROS", h, sup[0] - cxm, sup[1] - cym, 1)); }
    // INFERIOR (desde −Z): X espejado, Y → arriba
    for (const s of deAbajo) { bucle("INFERIOR", s.ext, inf[0] + cxm, inf[1] - cym, -1); s.huecos.forEach(h => bucle("AGUJEROS", h, inf[0] + cxm, inf[1] - cym, -1)); }
    // alzados: cada cuerpo es un rectángulo (ancho en el eje horizontal de la vista × alto z0..z1)
    const rectV = (l, c, ancho, ox, oy, z0, z1) => { const x0 = ox + c - ancho / 2, x1 = ox + c + ancho / 2, y0 = oy + z0 - czm, y1 = oy + z1 - czm; lin(l, x0, y0, x1, y0); lin(l, x1, y0, x1, y1); lin(l, x1, y1, x0, y1); lin(l, x0, y1, x0, y0); };
    for (const s of S) {
      rectV("FRONTAL", s.cx - cxm, s.w, fr[0], fr[1], s.z0, s.z1);            // desde −Y: X → derecha
      rectV("POSTERIOR", -(s.cx - cxm), s.w, post[0], post[1], s.z0, s.z1);   // desde +Y: X espejado
      rectV("LATERAL_DER", s.cy - cym, s.h, der[0], der[1], s.z0, s.z1);      // desde +X: Y → derecha
      rectV("LATERAL_IZQ", -(s.cy - cym), s.h, izq[0], izq[1], s.z0, s.z1);   // desde −X: Y espejado
    }
    // agujeros en los alzados como ejes
    for (const h of S.filter(s => s.tipo === "placa").flatMap(s => s.huecos.map(q => ({ x: q[0].c[0], y: q[0].c[1], r: q[0].r, z0: s.z0, z1: s.z1 })))) {
      lin("EJES", fr[0] + h.x - cxm, fr[1] + h.z0 - czm - 2, fr[0] + h.x - cxm, fr[1] + h.z1 - czm + 2);
      lin("EJES", der[0] + h.y - cym, der[1] + h.z0 - czm - 2, der[0] + h.y - cym, der[1] + h.z1 - czm + 2);
    }
    const th = Math.max(2, Math.min(5, g / 5));
    txt(sup[0] - LX / 2, sup[1] + LY / 2 + th, th, "VISTA SUPERIOR"); txt(inf[0] - LX / 2, inf[1] - LY / 2 - th * 2, th, "VISTA INFERIOR");
    txt(fr[0] - LX / 2, fr[1] - LZ / 2 - th * 2, th, "VISTA FRONTAL"); txt(post[0] - LX / 2, post[1] - LZ / 2 - th * 2, th, "VISTA POSTERIOR");
    txt(der[0] - LY / 2, der[1] - LZ / 2 - th * 2, th, "LATERAL DERECHA"); txt(izq[0] - LY / 2, izq[1] - LZ / 2 - th * 2, th, "LATERAL IZQUIERDA");
    txt(izq[0] - LY / 2, inf[1] - LY / 2 - th * 5, th * 1.2, `${titulo || W.nombre}  -  ${Math.round(LX * 100) / 100} x ${Math.round(LY * 100) / 100} x ${Math.round(LZ * 100) / 100} mm  -  escala 1:1  -  MountLab v${W.version || 1}`);
    o.push("0", "ENDSEC", "0", "EOF");
    return o.join("\n");
  }

  // ------------------------------------------------------------ macro de SolidWorks: STEP → Parasolid (.x_t)
  function macroParasolid(base) {
    return (`' MountLab: abre ${base}.step (en la misma carpeta que esta macro) y lo guarda como Parasolid ${base}.x_t
' SolidWorks: Herramientas > Macro > Ejecutar... y elige este archivo (.swb)
Dim swApp As Object
Sub main()
  Set swApp = Application.SldWorks
  Dim carpeta As String, origen As String, destino As String
  carpeta = Left(swApp.GetCurrentMacroPathName, InStrRev(swApp.GetCurrentMacroPathName, "\\"))
  origen = carpeta & "${base}.step"
  destino = carpeta & "${base}.x_t"
  Dim errores As Long, avisos As Long
  Dim datos As Object
  Set datos = swApp.GetImportFileData(origen)
  Dim doc As Object
  Set doc = swApp.LoadFile4(origen, "r", datos, errores)
  If doc Is Nothing Then
    MsgBox "No pude abrir " & origen & " (error " & errores & ")"
    Exit Sub
  End If
  doc.Extension.SaveAs destino, 0, 1, Nothing, errores, avisos
  MsgBox "Listo: " & destino
End Sub
`).replace(/\r?\n/g, "\r\n");
  }

  window.MLCad = { solidos, step, dxf6, macroParasolid };
})();
