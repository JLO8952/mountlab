/* MountLab · vista 3D de la caja: paredes con los agujeros reales de cada elemento, repisas por nivel y cada componente
   con su modelo 3D de la biblioteca (el mismo de la pestaña Modelo 3D). Se reconstruye en vivo al editar en 2D.
   Coordenadas de la caja: x = largo, y = ancho (fondo hacia +Y), z = alto; origen en la esquina interior (−X, −Y) del fondo.
   three.js: X = x, Y = z, Z = −y. */
(function () {
  let V = null;   // un solo visor reutilizado (se mueve de contenedor cuando la pestaña se vuelve a dibujar)
  const PAL = ["#38bdf8", "#a78bfa", "#34d399", "#fbbf24", "#f472b6", "#fb923c"];
  async function visor() {
    if (V) return V;
    await MLModelo.cargarThree(); const T = THREE;
    const ren = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
    ren.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    const scene = new T.Scene(); scene.background = new T.Color("#0b1220");
    scene.add(new T.HemisphereLight(0xffffff, 0x8899aa, 0.8));
    const dl = new T.DirectionalLight(0xffffff, 0.7); dl.position.set(120, 220, 160); scene.add(dl);
    const dl2 = new T.DirectionalLight(0xffffff, 0.3); dl2.position.set(-160, 80, -120); scene.add(dl2);
    const cam = new T.PerspectiveCamera(35, 1, 0.5, 20000), ctl = new T.OrbitControls(cam, ren.domElement); ctl.enableDamping = true;
    const grupo = new T.Group(); scene.add(grupo);
    let raf = 0, cont = null;
    const loop = () => { raf = requestAnimationFrame(loop); if (!cont || !cont.isConnected) return; ctl.update(); ren.render(scene, cam); };
    loop();
    V = { T, ren, scene, cam, ctl, grupo, set cont(c) { cont = c; }, get cont() { return cont; }, clave: null, encuadrado: null };
    return V;
  }
  function limpiar(g) { g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); }); g.children.slice().forEach(o => g.remove(o)); }

  // agujeros de una cara (cortes en coordenadas de la cara) como THREE.Path
  function huecos(T, cortes, U0, U1, V0, V1) {
    const out = [], dentro = (x, y, m) => x - m > U0 && x + m < U1 && y - m > V0 && y + m < V1;
    for (const c of cortes) {
      if (c.t === "c" || c.t === "anillo") { if (!dentro(c.x, c.y, c.r)) continue; const p = new T.Path(); p.absarc(c.x, c.y, c.r, 0, Math.PI * 2, true); out.push(p); }
      else if (c.t === "r") { const r = Math.min(c.r || 0, c.w / 2 - 0.01, c.h / 2 - 0.01), x0 = c.x - c.w / 2, x1 = c.x + c.w / 2, y0 = c.y - c.h / 2, y1 = c.y + c.h / 2; if (!dentro(c.x, c.y, 0) || x0 <= U0 || x1 >= U1 || y0 <= V0 || y1 >= V1) continue;
        const p = new T.Path(); if (r > 0.05) { p.moveTo(x0 + r, y0); p.absarc(x0 + r, y0 + r, r, -Math.PI / 2, -Math.PI, true); p.lineTo(x0, y1 - r); p.absarc(x0 + r, y1 - r, r, Math.PI, Math.PI / 2, true); p.lineTo(x1 - r, y1); p.absarc(x1 - r, y1 - r, r, Math.PI / 2, 0, true); p.lineTo(x1, y0 + r); p.absarc(x1 - r, y0 + r, r, 0, -Math.PI / 2, true); p.lineTo(x0 + r, y0); }
        else { p.moveTo(x0, y0); p.lineTo(x0, y1); p.lineTo(x1, y1); p.lineTo(x1, y0); p.lineTo(x0, y0); } out.push(p); }
      else if (c.t === "p") { if (!c.pts.every(([x, y]) => dentro(x, y, 0.05))) continue; const p = new T.Path(), pts = c.pts.slice(); let a = 0; pts.forEach((q, i) => { const q2 = pts[(i + 1) % pts.length]; a += q[0] * q2[1] - q2[0] * q[1]; }); if (a > 0) pts.reverse(); p.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach(q => p.lineTo(q[0], q[1])); p.lineTo(pts[0][0], pts[0][1]); out.push(p); }
    }
    return out;
  }
  function panel(T, U0, U1, V0, V1, esp, cortes, mat) {
    const s = new T.Shape(); s.moveTo(U0, V0); s.lineTo(U1, V0); s.lineTo(U1, V1); s.lineTo(U0, V1); s.lineTo(U0, V0);
    huecos(T, cortes, U0, U1, V0, V1).forEach(h => s.holes.push(h));
    return new T.Mesh(new T.ExtrudeGeometry(s, { depth: esp, bevelEnabled: false, curveSegments: 24 }), mat);
  }

  /** Dibuja la caja R en el contenedor. opt: { comp(id), tapa: "ver"|"transparente"|"ocultar", paredes: "solidas"|"transparentes", sel, titulo } */
  async function mostrar(cont, R, opt) {
    opt = opt || {}; const v = await visor(), T = v.T;
    cont.innerHTML = ""; cont.appendChild(v.ren.domElement); v.cont = cont;
    const w = cont.clientWidth || 600, h = cont.clientHeight || 380; v.ren.setSize(w, h); v.cam.aspect = w / h; v.cam.updateProjectionMatrix();
    limpiar(v.grupo); if (!R) return;
    const { L, W, H } = R.interior, e = R.p.espesor, g = v.grupo;
    const transp = opt.paredes === "transparentes", matPared = new T.MeshStandardMaterial({ color: "#94a3b8", roughness: 0.7, transparent: transp, opacity: transp ? 0.25 : 1, side: T.DoubleSide, depthWrite: !transp });
    const matTapa = new T.MeshStandardMaterial({ color: "#cbd5e1", roughness: 0.7, transparent: opt.tapa !== "ver", opacity: opt.tapa === "ver" ? 1 : 0.14, side: T.DoubleSide, depthWrite: opt.tapa === "ver" });
    const C = cara => (R.elementos || []).filter(el => el.cara === cara).flatMap(el => el.cortes || []);
    // fondo (z −e..0) y tapa (z H..H+e): figura en (x, y) → rotateX(−90°)
    const fondo = panel(T, -e, L + e, -e, W + e, e, C("fondo"), matPared); fondo.geometry.rotateX(-Math.PI / 2); fondo.position.y = -e; g.add(fondo);
    if (opt.tapa !== "ocultar") { const tapa = panel(T, -e, L + e, -e, W + e, e, C("tapa"), matTapa); tapa.geometry.rotateX(-Math.PI / 2); tapa.position.y = H; g.add(tapa); }
    // paredes ±Y: figura en (x, z), extruida a lo largo de −y
    const pY0 = panel(T, -e, L + e, 0, H, e, C("-Y"), matPared); g.add(pY0);                         // y ∈ [−e, 0] → Z ∈ [0, e]
    const pY1 = panel(T, -e, L + e, 0, H, e, C("+Y"), matPared); pY1.position.z = -W - e; g.add(pY1); // y ∈ [W, W+e]
    // paredes ±X: figura en (y, z) → rotateY(+90°): X = profundidad, Z = −y
    const pX0 = panel(T, 0, W, 0, H, e, C("-X"), matPared); pX0.geometry.rotateY(Math.PI / 2); pX0.position.x = -e; g.add(pX0);
    const pX1 = panel(T, 0, W, 0, H, e, C("+X"), matPared); pX1.geometry.rotateY(Math.PI / 2); pX1.position.x = L; g.add(pX1);
    // aristas para leer mejor la forma
    const aristas = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(L + 2 * e, H + 2 * e, W + 2 * e)), new T.LineBasicMaterial({ color: "#64748b" }));
    aristas.position.set(L / 2, H / 2, -W / 2); g.add(aristas);
    // repisas
    R.niveles.slice(1).forEach(nv => { const m = new T.Mesh(new T.BoxGeometry(L - 1, R.p.repisa, W - 1), new T.MeshStandardMaterial({ color: "#475569", roughness: 0.8, transparent: true, opacity: 0.55 })); m.position.set(L / 2, nv.z - R.p.repisa / 2, -W / 2); g.add(m); });
    // cuerpos internos de los elementos (conectores, ventiladores…)
    for (const el of R.elementos || []) {
      if (!(el.prof > 0)) continue;
      const mat = new T.MeshStandardMaterial({ color: /vent_/.test(el.tipo) ? "#1f2937" : "#334155", roughness: 0.6 });
      const cw = Math.min(el.w, 0.9 * el.w + 2), ch = el.h; let m;
      if (el.cara === "-Y" || el.cara === "+Y") { m = new T.Mesh(new T.BoxGeometry(cw, ch, el.prof), mat); m.position.set(el.u, el.v, el.cara === "-Y" ? -el.prof / 2 : -(W - el.prof / 2)); }
      else if (el.cara === "-X" || el.cara === "+X") { m = new T.Mesh(new T.BoxGeometry(el.prof, ch, cw), mat); m.position.set(el.cara === "-X" ? el.prof / 2 : L - el.prof / 2, el.v, -el.u); }
      else { m = new T.Mesh(new T.BoxGeometry(el.w, el.prof, el.h), mat); m.position.set(el.u, el.cara === "tapa" ? H - el.prof / 2 : el.prof / 2, -el.v); }
      g.add(m);
    }
    // componentes: su modelo 3D de la biblioteca, o una placa + volumen si no tiene
    const subs = [...new Set(R.piezas.filter(q => q.elemento == null).map(q => q.sub || ""))];
    for (const q of R.piezas) {
      if (q.elemento != null) continue;
      const col = PAL[subs.indexOf(q.sub || "") % PAL.length], c = q.id && opt.comp ? opt.comp(q.id) : null, cx = q.x + q.L / 2, cy = q.y + q.W / 2, z0 = q.z0 || 0;
      const sel = opt.sel === q.ref;
      if (c && c.modelo && c.modelo.base) {
        const mg = new T.Group(); MLModelo.construir(T, c, { grupo: mg });
        mg.rotation.y = (q.rot || 0) * Math.PI / 180; mg.position.set(cx, z0 + (q.bajo || 0), -cy);
        if (sel) mg.traverse(o => { if (o.material) o.material.emissive = new T.Color("#0369a1"); });
        g.add(mg);
      } else if (q.Hc != null) {
        const m = new T.Mesh(new T.BoxGeometry(q.L, q.Hc, q.W), new T.MeshStandardMaterial({ color: col, roughness: 0.5, emissive: sel ? "#0369a1" : "#000000" })); m.position.set(cx, z0 + q.Hc / 2, -cy); g.add(m);
      } else {
        const pcb = new T.Mesh(new T.BoxGeometry(q.L, q.esp || 1.6, q.W), new T.MeshStandardMaterial({ color: "#166534", roughness: 0.8, emissive: sel ? "#0369a1" : "#000000" }));
        pcb.position.set(cx, z0 + (q.bajo || 0) + (q.esp || 1.6) / 2, -cy); g.add(pcb);
        const arr = Math.max(0.5, (q.Ht || 0) - (q.bajo || 0) - (q.esp || 1.6));
        const vol = new T.Mesh(new T.BoxGeometry(q.L - 1, arr, q.W - 1), new T.MeshStandardMaterial({ color: col, roughness: 0.6, transparent: true, opacity: 0.35, depthWrite: false }));
        vol.position.set(cx, z0 + (q.bajo || 0) + (q.esp || 1.6) + arr / 2, -cy); g.add(vol);
        if (q.bajo) [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(([a, b]) => { const s = new T.Mesh(new T.CylinderGeometry(1.5, 1.5, q.bajo, 10), new T.MeshStandardMaterial({ color: "#cbd5e1", metalness: 0.4 })); s.position.set(cx + a * (q.L / 2 - 3), z0 + q.bajo / 2, -(cy + b * (q.W / 2 - 3))); g.add(s); });
      }
    }
    // cámara: se encuadra solo cuando cambia el tamaño de la caja (al editar se conserva tu punto de vista)
    const k = `${L}x${W}x${H}`, Rr = Math.max(L, W, H) * 1.05 + 25;
    if (v.encuadrado !== k || opt.vista) {
      v.encuadrado = k; v.ctl.target.set(L / 2, H / 2, -W / 2);
      const vista = opt.vista || "iso";
      if (vista === "arriba") v.cam.position.set(L / 2, H / 2 + Rr * 1.2, -W / 2 + 0.01);
      else if (vista === "frente") v.cam.position.set(L / 2, H / 2, Rr * 1.1);
      else if (vista === "lado") v.cam.position.set(L / 2 + Rr * 1.1, H / 2, -W / 2);
      else v.cam.position.set(L / 2 + Rr * 0.55, H / 2 + Rr * 0.95, Rr * 0.6);
      v.cam.lookAt(L / 2, H / 2, -W / 2); v.ctl.update();
    }
  }
  function captura() { return V ? (V.ren.render(V.scene, V.cam), V.ren.domElement.toDataURL("image/png")) : null; }
  window.MLCaja3D = { mostrar, captura };
})();
