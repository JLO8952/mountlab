/* MountLab · generador de DXF (R12, mm, origen en el centro de la placa).
   Capas: PCB, AGUJEROS, ZONAS, ZONAS_HOLGURA, PINES, EJES, TEXTO. SolidWorks lo abre como croquis o bloque. */
(function () {
  const LAYERS = { PCB: 7, AGUJEROS: 1, ZONAS: 4, ZONAS_HOLGURA: 8, PINES: 2, EJES: 3, TEXTO: 7 };
  function f(n) { return (Math.round(n * 10000) / 10000).toString(); }
  function line(o, l, x1, y1, x2, y2) { o.push("0", "LINE", "8", l, "10", f(x1), "20", f(y1), "30", "0", "11", f(x2), "21", f(y2), "31", "0"); }
  function rect(o, l, cx, cy, w, h) {
    const x0 = cx - w / 2, y0 = cy - h / 2, x1 = cx + w / 2, y1 = cy + h / 2;
    line(o, l, x0, y0, x1, y0); line(o, l, x1, y0, x1, y1); line(o, l, x1, y1, x0, y1); line(o, l, x0, y1, x0, y0);
  }
  function circle(o, l, x, y, r) { o.push("0", "CIRCLE", "8", l, "10", f(x), "20", f(y), "30", "0", "40", f(r)); }
  function text(o, l, x, y, h, s) {
    s = String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "?");
    o.push("0", "TEXT", "8", l, "10", f(x), "20", f(y), "30", "0", "40", f(h), "1", s);
  }
  // Holgura de una zona proyectada en planta (solo salidas laterales)
  function holguraRect(z) {
    const g = +z.holgura || 0; if (!g) return null;
    switch (z.salida) {
      case "-X": return [z.cx - z.w / 2 - g / 2, z.cy, g, z.h];
      case "+X": return [z.cx + z.w / 2 + g / 2, z.cy, g, z.h];
      case "-Y": return [z.cx, z.cy - z.h / 2 - g / 2, z.w, g];
      case "+Y": return [z.cx, z.cy + z.h / 2 + g / 2, z.w, g];
    }
    return null;
  }
  function componenteADxf(c) {
    const o = [];
    o.push("0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1009", "9", "$INSUNITS", "70", "4", "0", "ENDSEC");
    o.push("0", "SECTION", "2", "TABLES", "0", "TABLE", "2", "LAYER", "70", String(Object.keys(LAYERS).length));
    for (const [n, col] of Object.entries(LAYERS)) o.push("0", "LAYER", "2", n, "70", "0", "62", String(col), "6", "CONTINUOUS");
    o.push("0", "ENDTAB", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES");
    const m = c.montaje;
    if (m && m.pcb) {
      const [L, W] = m.pcb;
      rect(o, "PCB", 0, 0, L, W);
      const e = Math.max(L, W) * 0.08;
      line(o, "EJES", -e, 0, e, 0); line(o, "EJES", 0, -e, 0, e);
      for (const h of m.agujeros || []) { circle(o, "AGUJEROS", h.x, h.y, h.d / 2); }
      for (const z of c.zonas || []) {
        rect(o, "ZONAS", z.cx, z.cy, z.w, z.h);
        const hr = holguraRect(z); if (hr) rect(o, "ZONAS_HOLGURA", ...hr);
        text(o, "TEXTO", z.cx - z.w / 2, z.cy + z.h / 2 + 0.4, 0.8, z.nombre || z.tipo);
      }
      for (const p of c.pines || []) {
        if (p.x == null || p.y == null) continue;
        circle(o, "PINES", p.x, p.y, 0.5);
        text(o, "TEXTO", p.x + 0.7, p.y + 0.7, 0.6, p.n);
      }
      text(o, "TEXTO", -L / 2, -W / 2 - 3, 1.5, `${c.id} v${c.version || 1} - origen al centro (mm)`);
    }
    o.push("0", "ENDSEC", "0", "EOF");
    return o.join("\r\n") + "\r\n";
  }
  window.MLDxf = { componenteADxf };
})();
