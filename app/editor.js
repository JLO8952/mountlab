/* MountLab · editor visual de Montaje / Zonas / Pines.
   Coordenadas en mm con el ORIGEN EN EL CENTRO de la placa; X a la derecha, Y hacia arriba (vista superior). */
(function () {
  const ZT = {
    usb: { c: "#38bdf8", n: "USB" }, conector: { c: "#a78bfa", n: "Conector" }, antena: { c: "#f472b6", n: "Antena (sin metal)" },
    boton: { c: "#fbbf24", n: "Botón" }, pines: { c: "#94a3b8", n: "Pines / header" }, calor: { c: "#f87171", n: "Zona de calor" },
    sensor: { c: "#34d399", n: "Sensor (flujo de aire)" }, ajuste: { c: "#fb923c", n: "Ajuste (trimmer)" }, led: { c: "#facc15", n: "LED / indicador" },
    soldadura: { c: "#e2e8f0", n: "Pads de soldadura" }, prohibida: { c: "#ef4444", n: "Zona prohibida" }, otra: { c: "#cbd5e1", n: "Otra" },
  };
  const SALIDAS = { "+Z": "Arriba (+Z)", "-Z": "Abajo (−Z)", "-X": "Izquierda (−X)", "+X": "Derecha (+X)", "-Y": "Frente (−Y)", "+Y": "Atrás (+Y)" };
  const r2 = v => Math.round(v * 100) / 100;
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function pinColor(p) {
    const s = (p.n + " " + (p.func || "")).toUpperCase();
    if (/\bGND\b|TIERRA|\bG\b|NEGATIVO|\bB-|\bP-/.test(s)) return "#64748b";
    if (/VCC|VIN|3V3|5V|\bV\+|\bVDD|ALIMENTACI|\bB\+|\bP\+|BAT/.test(s)) return "#ef4444";
    return "#22d3ee";
  }

  function create(host, comp, opt) {
    opt = opt || {};
    const st = { mode: opt.mode || "montaje", tool: "sel", sel: null, k: 8, ox: 0, oy: 0, snap: 0.5, layers: { modelo: true, agujeros: true, zonas: true, pines: true, cotas: true }, drag: null, cursor: [0, 0], fitted: false };
    host.innerHTML = `<div class="canvas-wrap">
      <div class="ed-tools" id="edTools"></div>
      <div class="ed-layers">${["modelo", "agujeros", "zonas", "pines", "cotas"].map(l => `<label><input type="checkbox" data-l="${l}" checked>${l}</label>`).join("")}</div>
      <svg id="edSvg"></svg>
      <div class="ed-info" id="edInfo"></div></div>`;
    const svg = host.querySelector("#edSvg"), info = host.querySelector("#edInfo"), tools = host.querySelector("#edTools");
    host.querySelectorAll(".ed-layers input").forEach(i => i.onchange = () => { st.layers[i.dataset.l] = i.checked; draw(); });

    const m = () => comp.montaje;
    const size = () => { const b = svg.getBoundingClientRect(); return [b.width || 800, b.height || 500]; };
    const toS = (x, y) => { const [w, h] = size(); return [w / 2 + (x - st.ox) * st.k, h / 2 - (y - st.oy) * st.k]; };
    const toW = (sx, sy) => { const [w, h] = size(); return [(sx - w / 2) / st.k + st.ox, -(sy - h / 2) / st.k + st.oy]; };
    const snap = v => st.snap ? Math.round(v / st.snap) * st.snap : v;
    function fit() {
      const [w, h] = size(); const pcb = (m() && m().pcb) || [50, 30];
      let ext = [pcb[0] / 2, pcb[1] / 2];
      for (const z of comp.zonas || []) { ext[0] = Math.max(ext[0], Math.abs(z.cx) + z.w / 2); ext[1] = Math.max(ext[1], Math.abs(z.cy) + z.h / 2); }
      st.k = Math.min((w - 80) / (2 * ext[0] + 12), (h - 90) / (2 * ext[1] + 12)); st.ox = 0; st.oy = 0; st.fitted = true;
    }

    function toolbar() {
      const T = {
        montaje: [["sel", "↖ Seleccionar"], ["hole", "+ Agujero"], ["corners", "⌗ 4 esquinas"]],
        zonas: [["sel", "↖ Seleccionar"], ["zone", "▭ Dibujar zona"]],
        pines: [["sel", "↖ Seleccionar"], ["pin", "• Colocar pin"], ["row", "⋯ Fila de header"]],
      }[st.mode];
      tools.innerHTML = T.map(([t, n]) => `<button class="sm ${st.tool === t ? "on" : ""}" data-t="${t}">${n}</button>`).join("") +
        `<button class="sm" data-z="in">＋</button><button class="sm" data-z="out">－</button><button class="sm" data-z="fit">Ajustar</button>
         <select class="sm" id="edSnap" style="width:auto;padding:3px 6px;background:#1e293b;color:#e2e8f0;border-color:#334155">
         ${[[0, "Libre"], [0.1, "0.1 mm"], [0.5, "0.5 mm"], [1, "1 mm"], [1.27, "1.27 mm"], [2.54, "2.54 mm"]].map(([v, n]) => `<option value="${v}" ${st.snap == v ? "selected" : ""}>Rejilla ${n}</option>`).join("")}</select>`;
      tools.querySelectorAll("[data-t]").forEach(b => b.onclick = () => {
        const t = b.dataset.t;
        if (t === "corners") return opt.onAction && opt.onAction("corners");
        if (t === "row") return opt.onAction && opt.onAction("row");
        st.tool = t; toolbar();
      });
      tools.querySelectorAll("[data-z]").forEach(b => b.onclick = () => { const z = b.dataset.z; if (z === "fit") fit(); else st.k *= z === "in" ? 1.25 : 0.8; draw(); });
      tools.querySelector("#edSnap").onchange = e => { st.snap = +e.target.value; };
    }

    function grid(w, h) {
      let out = ""; const step = st.k > 6 ? 1 : st.k > 2 ? 5 : 10;
      const [x0, y1] = toW(0, 0), [x1, y0] = toW(w, h);
      for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) { const [sx] = toS(x, 0); const maj = Math.abs(Math.round(x) % 5) === 0 && Math.abs(x - Math.round(x)) < 1e-6; out += `<line x1="${sx}" y1="0" x2="${sx}" y2="${h}" stroke="${maj ? "#1e293b" : "#131c2e"}"/>`; }
      for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) { const [, sy] = toS(0, y); const maj = Math.abs(Math.round(y) % 5) === 0 && Math.abs(y - Math.round(y)) < 1e-6; out += `<line x1="0" y1="${sy}" x2="${w}" y2="${sy}" stroke="${maj ? "#1e293b" : "#131c2e"}"/>`; }
      const [ax, ay] = toS(0, 0);
      out += `<line x1="0" y1="${ay}" x2="${w}" y2="${ay}" stroke="#7f1d1d" stroke-width="1"/><line x1="${ax}" y1="0" x2="${ax}" y2="${h}" stroke="#14532d" stroke-width="1"/>`;
      out += `<text x="${w - 18}" y="${ay - 6}" fill="#f87171" font-size="12">X</text><text x="${ax + 6}" y="14" fill="#4ade80" font-size="12">Y</text>`;
      return out;
    }
    function holgura(z) {
      const g = +z.holgura || 0; if (!g || !/^[+-][XY]$/.test(z.salida)) return null;
      return { "-X": [z.cx - z.w / 2 - g / 2, z.cy, g, z.h], "+X": [z.cx + z.w / 2 + g / 2, z.cy, g, z.h], "-Y": [z.cx, z.cy - z.h / 2 - g / 2, z.w, g], "+Y": [z.cx, z.cy + z.h / 2 + g / 2, z.w, g] }[z.salida];
    }
    function rectS(cx, cy, w, h) { const [a, b] = toS(cx - w / 2, cy + h / 2); return [a, b, w * st.k, h * st.k]; }

    function draw() {
      const [w, h] = size(); if (!st.fitted) fit();
      let s = `<rect width="${w}" height="${h}" fill="#0b1220" data-bg="1"/>` + grid(w, h);
      const M = m();
      if (!M || !M.pcb) { s += `<text x="${w / 2}" y="${h / 2}" fill="#94a3b8" text-anchor="middle">Este elemento no tiene placa. Activa “Tiene montaje” en la pestaña Montaje.</text>`; svg.innerHTML = s; return; }
      const [L, W] = M.pcb; const [px, py, pw, ph] = rectS(0, 0, L, W);
      s += M.contorno && M.contorno.length > 2 && window.MLPlant ? `<path d="${MLPlant.trazoPerfil({ pts: M.contorno }, toS, st.k)}" fill="#14532d55" stroke="#22c55e" stroke-width="1.5"/>`
        : `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="#14532d55" stroke="#22c55e" stroke-width="1.5" rx="${Math.min(4, st.k * 0.6)}"/>`;
      // piezas del modelo 3D vistas desde arriba (las de la cara B, punteadas): así coincide con la pestaña Modelo 3D
      if (st.layers.modelo && comp.modelo && comp.modelo.base && window.MLPlant) {
        const b = comp.modelo.base, esp = b.espesor || 1.6, bi = MLPlant.baseInfo(b);
        const lista = bi.prim.map(c => Object.assign({ base: true }, c)).concat((comp.modelo.piezas || []).flatMap(pz => MLPlant.cuerposDe(pz, esp).map(c => Object.assign({ caraB: (pz.cara || "A") === "B" }, c))));
        lista.sort((a, c) => (a.caraB - c.caraB) || (a.z1 - c.z1));
        const bajo = lista.filter(c => c.caraB), arriba = lista.filter(c => !c.caraB);
        for (const c of [...bajo, ...arriba]) {
          const col = c.color || "#64748b", op = c.caraB ? 0.18 : 0.85, dash = c.caraB ? ' stroke-dasharray="3 2"' : "";
          if (c.f === "perfil" && c.eje === "z") s += `<path d="${MLPlant.trazoPerfil(c, toS, st.k)}" fill="${col}" fill-opacity="${op}" stroke="${col}" stroke-width=".8"${dash} pointer-events="none"/>`;
          else if (c.f === "cil") { const [a, b2] = toS(c.cx, c.cy); s += `<circle cx="${a}" cy="${b2}" r="${Math.max(0.5, c.d / 2 * st.k)}" fill="${col}" fill-opacity="${op}" stroke="${col}" stroke-width=".8"${dash} pointer-events="none"/>`; }
          else { const [a, b2, cw, ch] = rectS(c.cx, c.cy, c.w, c.h); s += `<rect x="${a}" y="${b2}" width="${cw}" height="${ch}" rx="${c.r ? Math.min(c.r * st.k, cw / 2, ch / 2) : 0}" fill="${col}" fill-opacity="${op}" stroke="${col}" stroke-width=".8"${dash} pointer-events="none"/>`; }
        }
      }
      // zonas
      if (st.layers.zonas) (comp.zonas || []).forEach((z, i) => {
        const col = (ZT[z.tipo] || ZT.otra).c, sel = st.mode === "zonas" && st.sel === i, dim = st.mode !== "zonas";
        const hg = holgura(z); if (hg) { const [a, b, c, d] = rectS(...hg); s += `<rect x="${a}" y="${b}" width="${c}" height="${d}" fill="none" stroke="${col}" stroke-dasharray="4 3" opacity="${dim ? .35 : .7}"/>`; }
        const [a, b, c, d] = rectS(z.cx, z.cy, z.w, z.h);
        s += `<rect data-k="z" data-i="${i}" x="${a}" y="${b}" width="${c}" height="${d}" fill="${col}" fill-opacity="${dim ? .12 : .28}" stroke="${col}" stroke-width="${sel ? 2.5 : 1.2}" style="cursor:${st.mode === "zonas" ? "move" : "inherit"}"/>`;
        if (st.k > 3) s += `<text x="${a + 3}" y="${b + 12}" fill="${col}" font-size="11" opacity="${dim ? .5 : 1}" pointer-events="none">${esc(z.nombre || z.tipo)}${z.salida === "-Z" ? " ↓" : z.salida === "+Z" ? " ↑" : ""}</text>`;
        if (sel) for (const [hx, hy, cr] of [[a, b, "nw"], [a + c, b, "ne"], [a, b + d, "sw"], [a + c, b + d, "se"]]) s += `<rect data-k="zh" data-i="${i}" data-c="${cr}" x="${hx - 5}" y="${hy - 5}" width="10" height="10" fill="#fff" stroke="${col}" style="cursor:${cr}-resize"/>`;
      });
      // agujeros
      if (st.layers.agujeros) (M.agujeros || []).forEach((o, i) => {
        const [a, b] = toS(o.x, o.y), sel = st.mode === "montaje" && st.sel === i, rr = Math.max(3, o.d / 2 * st.k);
        s += `<circle data-k="h" data-i="${i}" cx="${a}" cy="${b}" r="${rr}" fill="#0b1220" stroke="${sel ? "#fff" : "#fbbf24"}" stroke-width="${sel ? 2.5 : 1.5}" style="cursor:${st.mode === "montaje" ? "move" : "inherit"}"/>`;
        s += `<line x1="${a - rr * 1.4}" y1="${b}" x2="${a + rr * 1.4}" y2="${b}" stroke="#fbbf24" opacity=".5" pointer-events="none"/><line x1="${a}" y1="${b - rr * 1.4}" x2="${a}" y2="${b + rr * 1.4}" stroke="#fbbf24" opacity=".5" pointer-events="none"/>`;
        if (st.k > 4) s += `<text x="${a + rr + 3}" y="${b - rr}" fill="#fbbf24" font-size="11" pointer-events="none">Ø${o.d}</text>`;
      });
      // pines
      if (st.layers.pines) (comp.pines || []).forEach((p, i) => {
        if (p.x == null || p.y == null) return;
        const [a, b] = toS(p.x, p.y), sel = st.mode === "pines" && st.sel === i, col = pinColor(p);
        s += `<circle data-k="p" data-i="${i}" cx="${a}" cy="${b}" r="${Math.max(2.5, 0.55 * st.k)}" fill="${col}" stroke="${sel ? "#fff" : "#0b1220"}" stroke-width="${sel ? 2 : 1}" opacity="${st.mode === "pines" ? 1 : .55}" style="cursor:${st.mode === "pines" ? "move" : "inherit"}"/>`;
        if (st.k > 7 || sel) s += `<text x="${a}" y="${b - 0.8 * st.k - 3}" fill="#e2e8f0" font-size="${sel ? 12 : 10}" text-anchor="middle" pointer-events="none" opacity="${st.mode === "pines" ? 1 : .6}">${esc(p.n)}</text>`;
      });
      // cotas
      if (st.layers.cotas) {
        s += `<text x="${px + pw / 2}" y="${py + ph + 18}" fill="#94a3b8" font-size="12" text-anchor="middle">${L} mm</text>`;
        s += `<text x="${px - 10}" y="${py + ph / 2}" fill="#94a3b8" font-size="12" text-anchor="end" dominant-baseline="middle">${W} mm</text>`;
        const S = selected();
        if (S && S.x != null) {
          const [a, b] = toS(S.x, S.y), [ox, oy] = toS(0, 0);
          s += `<line x1="${ox}" y1="${b}" x2="${a}" y2="${b}" stroke="#e2e8f0" stroke-dasharray="3 3" opacity=".6"/><line x1="${a}" y1="${oy}" x2="${a}" y2="${b}" stroke="#e2e8f0" stroke-dasharray="3 3" opacity=".6"/>`;
          s += `<text x="${(ox + a) / 2}" y="${b - 5}" fill="#e2e8f0" font-size="11" text-anchor="middle">x ${r2(S.x)}</text><text x="${a + 5}" y="${(oy + b) / 2}" fill="#e2e8f0" font-size="11">y ${r2(S.y)}</text>`;
        }
      }
      // origen
      const [ox, oy] = toS(0, 0); s += `<circle cx="${ox}" cy="${oy}" r="4" fill="none" stroke="#fff"/><circle cx="${ox}" cy="${oy}" r="1.5" fill="#fff"/>`;
      if (st.drag && st.drag.rect) { const R = st.drag.rect; const [a, b] = toS(Math.min(R[0], R[2]), Math.max(R[1], R[3])); s += `<rect x="${a}" y="${b}" width="${Math.abs(R[2] - R[0]) * st.k}" height="${Math.abs(R[3] - R[1]) * st.k}" fill="#38bdf833" stroke="#38bdf8" stroke-dasharray="4 3"/>`; }
      svg.innerHTML = s;
      info.textContent = `x ${r2(st.cursor[0])}  y ${r2(st.cursor[1])} mm · ${r2(st.k)} px/mm · origen = centro de la placa`;
    }
    function selected() {
      if (st.sel == null) return null;
      if (st.mode === "montaje") return (m().agujeros || [])[st.sel];
      if (st.mode === "pines") return comp.pines[st.sel];
      if (st.mode === "zonas") { const z = comp.zonas[st.sel]; return z && { x: z.cx, y: z.cy }; }
    }
    function changed(what) { opt.onChange && opt.onChange(what); }
    function select(i) { st.sel = i; draw(); opt.onSelect && opt.onSelect(i); }

    // ---- interacción
    const pt = e => { const b = svg.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    svg.addEventListener("pointerdown", e => {
      const [sx, sy] = pt(e), [wx, wy] = toW(sx, sy), t = e.target, kind = t.dataset.k, i = +t.dataset.i;
      svg.setPointerCapture(e.pointerId);
      if (st.mode === "montaje" && st.tool === "hole" && m()) {
        m().agujeros = m().agujeros || []; const d = (m().agujeros.at(-1) || {}).d || 3;
        m().agujeros.push({ x: r2(snap(wx)), y: r2(snap(wy)), d }); changed("montaje"); select(m().agujeros.length - 1); st.tool = "sel"; toolbar(); return;
      }
      if (st.mode === "pines" && st.tool === "pin") {
        let i2 = st.sel != null ? st.sel : comp.pines.findIndex(p => p.x == null);
        if (i2 < 0 || i2 == null) { opt.toast && opt.toast("Selecciona un pin en la lista o agrega uno nuevo"); return; }
        comp.pines[i2].x = r2(snap(wx)); comp.pines[i2].y = r2(snap(wy)); changed("pines");
        const nxt = comp.pines.findIndex((p, j) => j > i2 && p.x == null); select(nxt >= 0 ? nxt : i2); return;
      }
      if (st.mode === "zonas" && st.tool === "zone") { st.drag = { rect: [snap(wx), snap(wy), snap(wx), snap(wy)] }; return; }
      if (kind === "zh" && st.mode === "zonas") { st.drag = { resize: t.dataset.c, i }; return; }
      if ((kind === "h" && st.mode === "montaje") || (kind === "p" && st.mode === "pines") || (kind === "z" && st.mode === "zonas")) {
        const o = kind === "h" ? m().agujeros[i] : kind === "p" ? comp.pines[i] : comp.zonas[i];
        const x0 = kind === "z" ? o.cx : o.x, y0 = kind === "z" ? o.cy : o.y;
        st.drag = { kind, i, dx: wx - x0, dy: wy - y0, moved: false }; select(i); return;
      }
      if (st.mode !== "zonas" || st.tool === "sel") { st.drag = { pan: [sx, sy, st.ox, st.oy] }; if (!kind) select(null); }
    });
    svg.addEventListener("pointermove", e => {
      const [sx, sy] = pt(e), [wx, wy] = toW(sx, sy); st.cursor = [wx, wy];
      const d = st.drag;
      if (!d) { info.textContent = `x ${r2(wx)}  y ${r2(wy)} mm · ${r2(st.k)} px/mm · origen = centro de la placa`; return; }
      if (d.pan) { st.ox = d.pan[2] - (sx - d.pan[0]) / st.k; st.oy = d.pan[3] + (sy - d.pan[1]) / st.k; }
      else if (d.rect) { d.rect[2] = snap(wx); d.rect[3] = snap(wy); }
      else if (d.resize) {
        const z = comp.zonas[d.i]; let x0 = z.cx - z.w / 2, x1 = z.cx + z.w / 2, y0 = z.cy - z.h / 2, y1 = z.cy + z.h / 2;
        if (d.resize.includes("w")) x0 = snap(wx); if (d.resize.includes("e")) x1 = snap(wx);
        if (d.resize.includes("n")) y1 = snap(wy); if (d.resize.includes("s")) y0 = snap(wy);
        z.cx = r2((x0 + x1) / 2); z.cy = r2((y0 + y1) / 2); z.w = r2(Math.abs(x1 - x0)); z.h = r2(Math.abs(y1 - y0)); d.moved = true;
      } else {
        const nx = r2(snap(wx - d.dx)), ny = r2(snap(wy - d.dy));
        if (d.kind === "z") { comp.zonas[d.i].cx = nx; comp.zonas[d.i].cy = ny; } else { const o = d.kind === "h" ? m().agujeros[d.i] : comp.pines[d.i]; o.x = nx; o.y = ny; }
        d.moved = true;
      }
      draw();
    });
    const end = () => {
      const d = st.drag; st.drag = null; if (!d) return;
      if (d.rect) {
        const [a, b, c, e] = d.rect, w = r2(Math.abs(c - a)), h = r2(Math.abs(e - b));
        if (w >= 0.5 && h >= 0.5) {
          const tipo = (opt.zoneType && opt.zoneType()) || "conector";
          comp.zonas = comp.zonas || []; comp.zonas.push({ tipo, nombre: (ZT[tipo] || ZT.otra).n, cx: r2((a + c) / 2), cy: r2((b + e) / 2), w, h, z: [1.6, 4], salida: "+Z", holgura: 5 });
          changed("zonas"); st.tool = "sel"; toolbar(); select(comp.zonas.length - 1); return;
        }
      }
      if (d.moved) { changed(st.mode); opt.onSelect && opt.onSelect(st.sel); }
      draw();
    };
    svg.addEventListener("pointerup", end); svg.addEventListener("pointercancel", end);
    svg.addEventListener("wheel", e => {
      e.preventDefault(); const [sx, sy] = pt(e), [wx, wy] = toW(sx, sy), f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      st.k *= f; const [nx, ny] = toW(sx, sy); st.ox += wx - nx; st.oy += wy - ny; draw();
    }, { passive: false });
    const ro = new ResizeObserver(() => draw()); ro.observe(svg);
    toolbar(); draw();
    return {
      setMode(md) { st.mode = md; st.tool = "sel"; st.sel = null; toolbar(); draw(); },
      select, redraw: draw, fit() { fit(); draw(); }, get sel() { return st.sel; },
      setTool(t) { st.tool = t; toolbar(); },
      destroy() { ro.disconnect(); },
    };
  }

  /** Vista superior en SVG (miniatura para fichas sin foto). */
  function thumb(comp, W, H) {
    W = W || 200; H = H || 130;
    const M = comp.montaje; if (!M || !M.pcb) return null;
    const [L, Wd] = M.pcb; let ex = L / 2, ey = Wd / 2;
    for (const z of comp.zonas || []) { ex = Math.max(ex, Math.abs(z.cx) + z.w / 2); ey = Math.max(ey, Math.abs(z.cy) + z.h / 2); }
    const k = Math.min((W - 16) / (2 * ex), (H - 16) / (2 * ey)), X = x => W / 2 + x * k, Y = y => H / 2 - y * k;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#0b1220" rx="6"/>`;
    s += `<rect x="${X(-L / 2)}" y="${Y(Wd / 2)}" width="${L * k}" height="${Wd * k}" fill="#166534" stroke="#22c55e" rx="2"/>`;
    for (const z of comp.zonas || []) { const c = (ZT[z.tipo] || ZT.otra).c; s += `<rect x="${X(z.cx - z.w / 2)}" y="${Y(z.cy + z.h / 2)}" width="${z.w * k}" height="${z.h * k}" fill="${c}" fill-opacity=".35" stroke="${c}"/>`; }
    for (const p of comp.pines || []) if (p.x != null) s += `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="${Math.max(1, 0.5 * k)}" fill="${pinColor(p)}"/>`;
    for (const o of M.agujeros || []) s += `<circle cx="${X(o.x)}" cy="${Y(o.y)}" r="${Math.max(1.5, o.d / 2 * k)}" fill="#0b1220" stroke="#fbbf24"/>`;
    return s + `</svg>`;
  }
  window.MLEditor = { create, thumb, ZT, SALIDAS, pinColor };
})();
