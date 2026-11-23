/* MountLab · Modelar un componente con una IA externa (Gemini, ChatGPT, Claude) a partir de fotos, un plano o medidas.
   La app arma un PDF/prompt con el formato estándar de MountLab (base, piezas, montaje, zonas, pines) y ejemplos reales;
   tú pegas la respuesta y la app la valida, la corrige, la revisa (choques, agujeros, envolvente) y la superpone sobre tu foto.
   Con «Pedir corrección» se arma un segundo PDF con el render del modelo al lado de la foto para que la IA lo ajuste. */
(function () {
  let X = null;   // contexto que pasa app.js: { esc, toast, comp, slug, hoy, clone, categorias, TIPOS, S, cargarPdfLib, pdfTexto, guardarNuevo, aplicarDestino }
  const r2 = v => (Math.round(v * 100) / 100) || 0;
  const num = (v, d) => { const n = parseFloat(String(v ?? "").replace(",", ".")); return isFinite(n) ? n : d; };
  const ZT = ["usb", "conector", "antena", "pines", "boton", "led", "calor", "ajuste", "sensor", "soldadura", "otra"];
  const MSJ = "Lee el PDF adjunto y sigue sus instrucciones al pie de la letra. Responde SOLO con el bloque ```json que se pide.";

  // ------------------------------------------------------------------ ejemplos reales (de la biblioteca)
  function aLibre(c) {   // modelo de la app → formato del prompt (plantilla "libre" en lugar de "importada")
    const M = c.modelo, b = Object.assign({}, M.base); delete b.d;
    const piezas = (M.piezas || []).map(p => { const o = { id: p.id, nombre: p.nombre, cara: p.cara || "A", x: p.x, y: p.y, rot: p.rot || 0, z: p.z || 0 };
      if (p.plantilla === "importada") { o.plantilla = "libre"; o.prim = p.params.prim; if (p.params.zona) o.zona = p.params.zona; } else { o.plantilla = p.plantilla; o.params = p.params || {}; } return o; });
    const m = c.montaje || {};
    return { componente: c.id, modelo: { base: b, piezas }, montaje: { agujeros: m.agujeros || [], fijacion: m.fijacion || "tornillo", nota: m.nota || "" }, pines: (c.pines || []).filter(p => !p.pieza && p.x != null).slice(0, 6).map(p => ({ n: p.n, x: p.x, y: p.y, cara: p.cara || "A" })),
      envolvente: [m.pcb ? m.pcb[0] : b.L, m.pcb ? m.pcb[1] : b.W, r2((m.pcb ? m.pcb[2] : b.espesor) + (m.altura_superior || 0) + (m.altura_inferior || 0))], supuestos: [], confianza: { base: "medida" } };
  }
  function ejemplos(excluir) {
    const out = [], pick = ids => ids.map(X.comp).find(c => c && c.modelo && c.id !== excluir);
    const dc = pick(["adaptador_de_plug_dc_macho_a_bornera", "jack_dc_21", "switch_balancin_kcd11_2p"]), mod = pick(["mpu6050_gy521", "bme280", "tp4056"]);
    if (dc) out.push([`${dc.nombre} (cuerpo sin PCB, piezas acostadas)`, aLibre(dc)]);
    if (mod && mod.modelo) out.push([`${mod.nombre} (PCB con plantillas y agujeros de montaje)`, aLibre(mod)]);
    return out;
  }
  function plantillasTxt() {
    return MLPlant.todas().filter(t => !t.propia).map(t => `- ${t.id} (${t.n}${t.g ? ", " + t.g : ""}): ${(t.params || []).map(p => `${p.k}=${Array.isArray(p.opts) ? p.opts.join("|") : p.def}`).join(", ") || "sin parámetros"}`).join("\n");
  }

  // ------------------------------------------------------------------ prompt
  function prompt(st, corr) {
    const md = st.medidas || {}, med = md.L || md.W || md.H ? `${md.L || "?"} × ${md.W || "?"} × ${md.H || "?"} mm (largo × ancho × alto total)` : "no las tengo: estímalas con el material";
    const fotos = st.archivos.filter(a => a.kind === "imagen").length, pdfs = st.archivos.filter(a => a.kind === "pdf").length;
    const ej = ejemplos(st.k).map(([t, j]) => `EJEMPLO: ${t}\n\`\`\`json\n${JSON.stringify(j)}\n\`\`\``).join("\n\n");
    let s = `MOUNTLAB · MODELO 3D ESTÁNDAR DE UN COMPONENTE
Componente: ${st.nombre || "(sin nombre)"}${st.variante ? " · " + st.variante : ""}
Medidas generales: ${med}
Material: ${fotos} foto(s)${pdfs ? `, ${pdfs} plano(s)/datasheet(s) en PDF` : ""}${st.notas ? `\nNotas de John: ${st.notas}` : ""}

TAREA: construir el modelo 3D SIMPLIFICADO y el MONTAJE del componente en el formato JSON de MountLab. Se usa para diseñar la caja, los soportes y los tornillos: importan las medidas externas, los agujeros de montaje, los conectores y todo lo que sobresale. No hace falta detalle fino (pines de chips, letras, resistencias pequeñas).

1. COORDENADAS (obligatorio)
- Milímetros. Origen en el CENTRO de la base vista desde arriba. X = lado más largo de la base, Y = ancho, Z hacia arriba.
- La base ocupa de z = 0 (cara inferior) a z = espesor. Cara "A" = la de arriba (donde están los componentes principales); cara "B" = la de abajo.
- Cada pieza tiene x, y = su centro en planta (mm desde el centro de la base), "rot" = 0, 90, 180 o 270 (antihorario, en planta) y "z" = elevación extra sobre su cara (normalmente 0).
- Dentro de una pieza, las formas van en coordenadas LOCALES: x, y desde el centro de la pieza; z desde la superficie de su cara hacia afuera (en la cara B también hacia afuera, o sea hacia abajo: la app la voltea sola). Se permite z negativo para lo que atraviesa la placa.

2. BASE ("modelo.base") — elige una:
- {"tipo":"placa", "forma":"rect", "L", "W", "espesor":1.6, "color"} — PCB. Otras formas: "redondeada" (+ "radio"), "redonda" ("d"), "contorno" ("contorno": [[x,y],…] antihorario, centrado; "L","W" = su caja).
- {"tipo":"prisma", …mismas formas…, "espesor" = alto del cuerpo} — cuerpo sólido: chip, carcasa, adaptador, batería, sensor encapsulado.
- {"tipo":"cilindro", "forma":"redonda", "d", "espesor"} · {"tipo":"motor","modelo":"130|N20|370|TT"} · {"tipo":"servo","modelo":"SG90|MG90S|MG996R"}.

3. PIEZAS ("modelo.piezas") — cada una: {"id","nombre","cara":"A"|"B","x","y","rot","z","plantilla", …}
3a. Si una PLANTILLA la describe, úsala con sus parámetros ("params"). Plantillas (id: parámetros=valor por defecto):
${plantillasTxt()}
3b. Si no hay plantilla, usa "plantilla":"libre" con "prim": [formas] (y opcional "zona"). Formas:
- {"f":"caja","cx","cy","w","h","z0","z1","r"?,"color"} — caja (w en x, h en y, de z0 a z1), "r" = radio de esquinas en planta.
- {"f":"cil","cx","cy","d","z0","z1","color"} — cilindro vertical.
- {"f":"perfil","eje":"z","pts":[[x,y],…],"a0","a1","color"} — polígono cualquiera extruido en z de a0 a a1.
- {"f":"perfil","eje":"x","circ":[y,z,r] o "pts":[[y,z],…],"a0","a1","color"} — extruido a lo largo de X (cilindros acostados, plugs, conectores horizontales). Con "eje":"y": pts/circ en [x,z] y a0..a1 en y.

4. MONTAJE ("montaje"): {"agujeros":[{"x","y","d"}], "fijacion":"tornillo|adhesivo|abrazadera|riel|ninguna", "nota"}. Agujeros con su posición real en coordenadas de la base.

5. ZONAS (espacio libre / salida por la caja): en la pieza, "zona": {"tipo": ${ZT.join("|")}, "cx","cy","w","h","z0","z1" (locales de la pieza), "salida":"+X|-X|+Y|-Y|+Z", "holgura": mm}. Las plantillas de conectores ya traen la suya. Todo conector que se enchufa desde afuera DEBE tener zona con su salida.

6. PINES (opcional): "pines": [{"n":"VCC","x","y","cara":"A"}] cuando se lean en el material.

7. CALIDAD
- Usa las medidas generales como escala. Con fotos, estima por proporciones a partir de una medida conocida y dilo en "supuestos".
- No inventes datos: lo que no se ve o no se puede medir va en "supuestos" (lista de frases cortas).
- "confianza": para la base, los agujeros y cada pieza importante, "medida" (plano/datasheet), "estimada" (foto) o "supuesta".
- Colores aproximados reales (#rrggbb).
- Antes de responder revisa: que la envolvente total coincida con las medidas generales; que ninguna pieza tape un agujero; que lo que sale del borde (conectores) tenga su zona con salida; que todo quede sobre la base salvo lo que realmente sobresale.

RESPUESTA: ÚNICAMENTE un bloque \`\`\`json con:
{"componente":"<id corto>","modelo":{"base":{…},"piezas":[…]},"montaje":{…},"pines":[…],"envolvente":[L,W,H],"supuestos":["…"],"confianza":{"base":"medida|estimada|supuesta", "<id pieza>":"…"}}

${ej}`;
    if (corr) s += `

CORRECCIÓN (segunda pasada)
Este es el modelo actual que generaste. Compáralo con las fotos/plano: en las páginas siguientes está el render del modelo (arriba, frente, lado e isométrico) al lado del material original. Problemas que encontró la app:
${corr.problemas.length ? corr.problemas.map(p => "- " + p).join("\n") : "- (ninguno automático: revisa proporciones, posiciones y lo que falte)"}
${corr.nota ? "Observación de John: " + corr.nota + "\n" : ""}Devuelve el JSON COMPLETO corregido en el mismo formato.
\`\`\`json
${JSON.stringify(corr.json)}
\`\`\``;
    return s;
  }

  // ------------------------------------------------------------------ lectura y validación de la respuesta
  function extraer(txt) {
    const bl = [...String(txt || "").matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map(m => m[1]);
    const cands = bl.length ? bl : [String(txt || "").slice(String(txt || "").indexOf("{"), String(txt || "").lastIndexOf("}") + 1)];
    for (const c of cands.reverse()) { try { const j = JSON.parse(c.replace(/,\s*([}\]])/g, "$1")); if (j && (j.modelo || j.base)) return j; } catch (e) { } }
    throw new Error("No encontré un bloque JSON válido con «modelo» en la respuesta. Copia la respuesta completa.");
  }
  const color = (c, d) => /^#[0-9a-f]{3,8}$/i.test(String(c || "")) ? c : d;
  function primOk(q, av, nom) {
    if (!q || typeof q !== "object") return null;
    const f = q.f === "cilindro" ? "cil" : q.f === "box" ? "caja" : q.f;
    let z0 = num(q.z0, 0), z1 = num(q.z1, 1); if (z1 < z0) [z0, z1] = [z1, z0]; if (z1 - z0 < 0.05) z1 = z0 + 0.05;
    if (f === "caja") { const w = num(q.w, 0), h = num(q.h, 0); if (!(w > 0 && h > 0)) { av.push(`${nom}: caja sin medidas, se omitió`); return null; } return Object.assign({ f, cx: num(q.cx, 0), cy: num(q.cy, 0), w, h, z0, z1, color: color(q.color, "#64748b") }, num(q.r, 0) > 0 ? { r: num(q.r, 0) } : {}); }
    if (f === "cil") { const d = num(q.d, 0); if (!(d > 0)) { av.push(`${nom}: cilindro sin diámetro, se omitió`); return null; } return { f, cx: num(q.cx, 0), cy: num(q.cy, 0), d, z0, z1, color: color(q.color, "#64748b") }; }
    if (f === "perfil") {
      const eje = ["x", "y", "z"].includes(q.eje) ? q.eje : "z"; let a0 = num(q.a0, 0), a1 = num(q.a1, 1); if (a1 < a0) [a0, a1] = [a1, a0]; if (a1 - a0 < 0.05) a1 = a0 + 0.05;
      const o = { f, eje, a0, a1, color: color(q.color, "#64748b") };
      if (Array.isArray(q.circ) && q.circ.length >= 3 && num(q.circ[2], 0) > 0) o.circ = q.circ.slice(0, 3).map(v => num(v, 0));
      else if (Array.isArray(q.pts) && q.pts.length >= 3) { o.pts = q.pts.filter(p => Array.isArray(p) && p.length >= 2).map(p => [num(p[0], 0), num(p[1], 0)]); if (o.pts.length < 3) { av.push(`${nom}: perfil con menos de 3 puntos, se omitió`); return null; } }
      else { av.push(`${nom}: perfil sin puntos, se omitió`); return null; }
      return o;
    }
    av.push(`${nom}: forma «${q.f}» desconocida, se omitió`); return null;
  }
  function zonaOk(z) {
    if (!z || typeof z !== "object") return null; const tipo = ZT.includes(z.tipo) ? z.tipo : "otra";
    let z0 = num(z.z0, 0), z1 = num(z.z1, 2); if (z1 < z0) [z0, z1] = [z1, z0];
    return { tipo, cx: num(z.cx, 0), cy: num(z.cy, 0), w: Math.max(0.5, num(z.w, 5)), h: Math.max(0.5, num(z.h, 5)), z0, z1, salida: ["+X", "-X", "+Y", "-Y", "+Z", "-Z"].includes(z.salida) ? z.salida : "+Z", holgura: Math.max(0, num(z.holgura, 10)) };
  }
  /** Valida y normaliza la respuesta. Devuelve { c (modelo, montaje, zonas, pines), avisos, supuestos, confianza, envolvente, json }. */
  function interpretar(txt, st) {
    const j = extraer(txt), av = [], M = j.modelo || j, b0 = M.base || {};
    // base
    const tipo = ["placa", "prisma", "cilindro", "motor", "servo"].includes(b0.tipo) ? b0.tipo : "placa";
    const base = { tipo, forma: ["rect", "redondeada", "redonda", "contorno"].includes(b0.forma) ? b0.forma : (tipo === "cilindro" ? "redonda" : "rect"), L: num(b0.L, num(b0.d, 30)), W: num(b0.W, num(b0.d, 20)), d: num(b0.d, num(b0.L, 30)), espesor: num(b0.espesor, tipo === "placa" ? 1.6 : 10), radio: num(b0.radio, 0), color: color(b0.color, tipo === "placa" ? "#166534" : "#475569") };
    if (tipo === "motor" || tipo === "servo") base.modelo = b0.modelo;
    if (base.forma === "redonda") { base.L = base.W = base.d; }
    if (base.forma === "contorno") { const C = (b0.contorno || []).filter(p => Array.isArray(p)).map(p => [num(p[0], 0), num(p[1], 0)]); if (C.length >= 3) { base.contorno = C; const xs = C.map(p => p[0]), ys = C.map(p => p[1]); base.L = r2(Math.max(...xs) - Math.min(...xs)); base.W = r2(Math.max(...ys) - Math.min(...ys)); } else { base.forma = "rect"; av.push("El contorno de la base tenía menos de 3 puntos: quedó rectangular."); } }
    if (base.L < base.W && base.forma !== "redonda" && base.forma !== "contorno") av.push("La base tiene el lado largo en Y; la convención es X = lado largo (no es un error, pero revisa).");
    // piezas
    const piezas = [], ids = new Set();
    (Array.isArray(M.piezas) ? M.piezas : []).forEach((p, i) => {
      if (!p || typeof p !== "object") return; let id = String(p.id || "p" + (i + 1)).replace(/[^\w-]/g, "_").slice(0, 20); while (ids.has(id)) id += "_"; ids.add(id);
      const nom = p.nombre || id, rot = ((Math.round(num(p.rot, 0) / 90) * 90) % 360 + 360) % 360; if (num(p.rot, 0) % 90) av.push(`${nom}: giro ${p.rot}° redondeado a ${rot}°`);
      const o = { id, nombre: String(nom).slice(0, 70), cara: p.cara === "B" ? "B" : "A", x: num(p.x, 0), y: num(p.y, 0), rot, z: num(p.z, 0), origen: "ia" };
      const t = p.plantilla && p.plantilla !== "libre" ? MLPlant.plantilla(p.plantilla) : null;
      if (t && !t.oculta) { const par = {}; (t.params || []).forEach(q => { const v = (p.params || {})[q.k]; if (v != null) par[q.k] = Array.isArray(q.opts) || q.opts === "color" ? v : num(v, q.def); }); o.plantilla = t.id; o.params = par; }
      else {
        if (p.plantilla && p.plantilla !== "libre") av.push(`${nom}: la plantilla «${p.plantilla}» no existe; se usó su forma libre`);
        const prim = (Array.isArray(p.prim) ? p.prim : []).map(q => primOk(q, av, nom)).filter(Boolean);
        if (!prim.length) { const w = num(p.w || (p.params || {}).w, 0), h = num(p.h || (p.params || {}).h, 0), a = num(p.alto || (p.params || {}).alto, 0); if (w > 0 && h > 0 && a > 0) prim.push({ f: "caja", cx: 0, cy: 0, w, h, z0: 0, z1: a, color: "#64748b" }); }
        if (!prim.length) { av.push(`${nom}: sin formas, se omitió`); return; }
        o.plantilla = "importada"; o.params = { prim, zona: zonaOk(p.zona) };
      }
      if (p.zona && o.plantilla !== "importada") o.zonaExtra = zonaOk(p.zona);
      if (p.sobresale || (o.params && o.params.zona && /^[+-][XY]$/.test(o.params.zona.salida))) o.sobresale = true;
      piezas.push(o);
    });
    const mt = j.montaje || {}, Lb = base.forma === "redonda" ? base.d : base.L, Wb = base.forma === "redonda" ? base.d : base.W;
    const agujeros = (Array.isArray(mt.agujeros) ? mt.agujeros : []).map(a => ({ x: r2(num(a.x, 0)), y: r2(num(a.y, 0)), d: r2(num(a.d, 3.2)) })).filter(a => a.d > 0.5);
    agujeros.forEach(a => { if (Math.abs(a.x) > Lb / 2 || Math.abs(a.y) > Wb / 2) av.push(`Agujero (${a.x}, ${a.y}) fuera de la base`); });
    const c = { modelo: { version: 1, base, piezas, nota: "Modelado con IA a partir de " + [st.archivos.some(a => a.kind === "imagen") ? "fotos" : "", st.archivos.some(a => a.kind === "pdf") ? "plano/datasheet" : "", st.medidas && st.medidas.L ? "medidas" : ""].filter(Boolean).join(", ") },
      montaje: { origen: "centro", fijacion: ["tornillo", "adhesivo", "abrazadera", "riel", "ninguna"].includes(mt.fijacion) ? mt.fijacion : (agujeros.length ? "tornillo" : "adhesivo"), agujeros, altura_superior: 0, altura_inferior: 0, holgura_inferior_cableado: 0, nota: String(mt.nota || "").slice(0, 300) } };
    try { MLPlant.sincronizar(c); } catch (e) { throw new Error("El modelo no se pudo armar: " + e.message); }
    // zonas extra de piezas con plantilla
    piezas.filter(p => p.zonaExtra).forEach(p => { const z = p.zonaExtra; c.zonas.push({ tipo: z.tipo, nombre: p.nombre, cx: r2(p.x + z.cx), cy: r2(p.y + z.cy), w: z.w, h: z.h, z: p.cara === "B" ? [-z.z1, -z.z0] : [r2(base.espesor + z.z0), r2(base.espesor + z.z1)], salida: z.salida, holgura: z.holgura, auto: false }); delete p.zonaExtra; });
    // pines
    const pines = (Array.isArray(j.pines) ? j.pines : []).filter(p => p && p.n != null).map(p => ({ n: String(p.n).slice(0, 20), func: "", x: p.x != null ? r2(num(p.x, 0)) : null, y: p.y != null ? r2(num(p.y, 0)) : null, cara: p.cara === "B" ? "B" : "A" }));
    c.pines = (c.pines || []).concat(pines);
    // revisión de la app
    (MLPlant.revisar(c) || []).forEach(r => av.push(r.msg));
    const env = envolvente(c), md = st.medidas || {};
    [["largo", md.L, env.L], ["ancho", md.W, env.W], ["alto total", md.H, env.H]].forEach(([n, q, v]) => { if (+q > 0 && Math.abs(v - q) > Math.max(1, q * 0.08)) av.push(`La envolvente ${n} da ${v} mm y la medida conocida es ${q} mm`); });
    if (Array.isArray(j.envolvente) && j.envolvente.length === 3) [["largo", 0, env.L], ["ancho", 1, env.W], ["alto", 2, env.H]].forEach(([n, i, v]) => { const q = num(j.envolvente[i], 0); if (q > 0 && Math.abs(v - q) > Math.max(1, q * 0.08)) av.push(`La IA declaró ${n} ${q} mm pero sus piezas dan ${v} mm`); });
    const conf = j.confianza && typeof j.confianza === "object" ? j.confianza : {};
    return { c, avisos: [...new Set(av)], supuestos: (Array.isArray(j.supuestos) ? j.supuestos : []).map(String).slice(0, 30), confianza: conf, envolvente: env, json: j };
  }
  /** Envolvente real del modelo (todas las primitivas). */
  function envolvente(c) {
    const b = MLPlant.baseInfo(c.modelo.base); let x0 = -b.L / 2, x1 = b.L / 2, y0 = -b.W / 2, y1 = b.W / 2, z0 = 0, z1 = b.top;
    for (const q of c.modelo.cuerpos || []) { const w = q.f === "cil" ? q.d : q.w, h = q.f === "cil" ? q.d : q.h; x0 = Math.min(x0, q.cx - w / 2); x1 = Math.max(x1, q.cx + w / 2); y0 = Math.min(y0, q.cy - h / 2); y1 = Math.max(y1, q.cy + h / 2); z0 = Math.min(z0, q.z0); z1 = Math.max(z1, q.z1); }
    return { L: r2(x1 - x0), W: r2(y1 - y0), H: r2(z1 - z0), x0, x1, y0, y1, z0, z1 };
  }

  // ------------------------------------------------------------------ renders ortográficos (para superponer y para la corrección)
  let ren = null;
  async function render(c, vista, ancho, fondo) {
    await MLModelo.cargarThree(); const T = THREE;
    if (!ren) { ren = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); }
    const e = envolvente(c), sc = new T.Scene(); sc.add(new T.HemisphereLight(0xffffff, 0x8899aa, 0.75)); const dl = new T.DirectionalLight(0xffffff, 0.7); dl.position.set(60, 120, 80); sc.add(dl); const d2 = new T.DirectionalLight(0xffffff, 0.3); d2.position.set(-80, -40, -60); sc.add(d2);
    const g = new T.Group(); MLModelo.construir(T, c, { grupo: g }); sc.add(g);
    const cx = (e.x0 + e.x1) / 2, cy = (e.y0 + e.y1) / 2, cz = (e.z0 + e.z1) / 2;
    // tamaño del cuadro en mm según la vista (a: horizontal, b: vertical)
    const [a, bb] = vista === "arriba" ? [e.L, e.W] : vista === "frente" ? [e.L, e.H] : vista === "lado" ? [e.W, e.H] : [Math.max(e.L, e.W) * 1.3, Math.max(e.L, e.W) * 1.0];
    const alto = Math.round(ancho * bb / a), cam = new T.OrthographicCamera(-a / 2, a / 2, bb / 2, -bb / 2, -2000, 2000);
    const tgt = new T.Vector3(cx, cz, -cy);
    if (vista === "arriba") { cam.position.set(cx, cz + 500, -cy); cam.up.set(0, 0, -1); }
    else if (vista === "frente") cam.position.set(cx, cz, -cy + 500);
    else if (vista === "lado") cam.position.set(cx + 500, cz, -cy);
    else { cam.position.set(cx + 300, cz + 300, -cy + 360); }
    cam.lookAt(tgt);
    ren.setSize(ancho, Math.max(10, alto), false); ren.setClearColor(fondo || 0x000000, fondo ? 1 : 0); ren.render(sc, cam);
    const src = ren.domElement.toDataURL("image/png");
    g.traverse(o => { o.geometry && o.geometry.dispose(); o.material && o.material.dispose(); });
    return { src, mmX: a, mmY: bb, w: ancho, h: alto };
  }

  // ------------------------------------------------------------------ PDF
  async function pdf(st, corr) {
    const { PDFDocument, StandardFonts, rgb } = await X.cargarPdfLib(), T2 = X.pdfTexto;
    const doc = await PDFDocument.create(), fR = await doc.embedFont(StandardFonts.Helvetica), fB = await doc.embedFont(StandardFonts.HelveticaBold), fM = await doc.embedFont(StandardFonts.Courier);
    const A4 = [595.28, 841.89], M = 42; let pg, y;
    const nueva = () => { pg = doc.addPage(A4); y = A4[1] - M; pg.drawText(T2("MountLab · modelo 3D estándar de un componente"), { x: M, y: 20, size: 7.5, font: fR, color: rgb(.45, .5, .58) }); };
    const linea = (t, { f = fR, size = 9, color = rgb(.1, .12, .16), gap = 2.4 } = {}) => {
      const anchoMax = A4[0] - 2 * M; for (const par of T2(t).split("\n")) { let w = ""; if (!par.trim()) { y -= size * 0.6; continue; }
        const salir = () => { if (y < M + size) nueva(); pg.drawText(w, { x: M, y, size, font: f, color }); y -= size + gap; w = ""; };
        for (const p of par.split(/(\s+)/)) { if (f.widthOfTextAtSize(w + p, size) > anchoMax && w.trim()) { salir(); w = p.trimStart(); }
          else if (f.widthOfTextAtSize(p, size) > anchoMax) { for (const ch of p) { if (f.widthOfTextAtSize(w + ch, size) > anchoMax) salir(); w += ch; } } else w += p; }
        if (w.trim()) salir(); } };
    const b64 = s => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
    const imagen = async (dataUrl, titulo) => { let im; try { const by = b64(dataUrl.split(",")[1]); im = /png/.test(dataUrl.slice(0, 30)) ? await doc.embedPng(by) : await doc.embedJpg(by); } catch (e) { return; }
      nueva(); linea(titulo, { f: fB, size: 11, gap: 8 }); const mw = A4[0] - 2 * M, mh = y - M - 10, k = Math.min(mw / im.width, mh / im.height, 2); pg.drawImage(im, { x: M, y: y - im.height * k, width: im.width * k, height: im.height * k }); };
    nueva();
    linea(corr ? "MountLab · Corregir el modelo 3D" : "MountLab · Modelar un componente en 3D", { f: fB, size: 16, gap: 8, color: rgb(.05, .3, .6) });
    linea(`Componente: ${st.nombre}`, { f: fB, size: 11.5, gap: 4 });
    linea(`Generado: ${new Date().toLocaleString("es-CO")}`, { size: 8.5, color: rgb(.4, .45, .5), gap: 10 });
    linea("Instrucciones para la IA (Gemini, ChatGPT, Claude…): lee TODO este documento y responde ÚNICAMENTE con el bloque ```json descrito.", { f: fB, size: 10, gap: 10, color: rgb(.6, .2, .1) });
    linea(prompt(st, corr), { f: fR, size: 8.6, gap: 2.2 });
    if (corr) for (const r of corr.renders) await imagen(r.src, `Modelo actual · vista ${r.vista}`);
    const fotos = st.archivos.filter(a => a.kind === "imagen");
    for (const [i, a] of fotos.entries()) await imagen(a.dataUrl, `Foto ${i + 1} de ${fotos.length}: ${a.nombre || ""}`);
    for (const a of st.archivos.filter(x => x.kind === "pdf")) {
      try { const src = await PDFDocument.load(b64(a.b64), { ignoreEncryption: true }), n = src.getPageCount(), lim = Math.min(n, 40); nueva(); linea(`Plano / datasheet adjunto: ${a.nombre} (${n} páginas${n > lim ? `, se incluyen ${lim}` : ""})`, { f: fB, size: 11 });
        (await doc.copyPages(src, [...Array(lim).keys()])).forEach(p => doc.addPage(p)); } catch (e) { nueva(); linea(`(No pude incluir ${a.nombre}: ${e.message})`); }
    }
    const bytes = await doc.save(); return new File([bytes], `MountLab_modelo_${X.slug(st.nombre || "componente")}${corr ? "_correccion" : ""}.pdf`, { type: "application/pdf" });
  }

  // ------------------------------------------------------------------ vista
  function estado(destino) {
    const S = X.S, k = destino ? destino.id : "__nuevo";
    if (!S.mia || S.mia.k !== k) S.mia = { k, nombre: destino ? destino.nombre : "", variante: "", notas: "", medidas: {}, archivos: [], respuesta: "", res: null, sup: { vista: "arriba", foto: 0, op: 0.55, esc: 1, dx: 0, dy: 0, rot: 0 }, obs: "" };
    if (destino && !S.mia.medidasLeidas) { S.mia.medidasLeidas = true; const m = (destino.ficha || {}).dimensiones || "", n = String(m).match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)(?:\s*[x×]\s*(\d+(?:[.,]\d+)?))?/i); if (n) S.mia.medidas = { L: num(n[1]), W: num(n[2]), H: n[3] ? num(n[3]) : "" }; }
    return S.mia;
  }
  function vista(app, idDestino) {
    const { esc, toast } = X, destino = idDestino ? (X.comp(idDestino) || (X.S.nuevo && X.S.nuevo.id === idDestino ? X.S.nuevo : null)) : null, st = estado(destino);
    const chip = (a, i) => a.kind === "imagen" ? `<div class="gen-im"><img src="${a.dataUrl}" alt=""><button class="sm danger" data-mx="${i}" title="Quitar">✕</button></div>` : `<div class="gen-doc">📄 <span>${esc(a.nombre)}</span>${a.paginas ? `<small>${a.paginas} pág.</small>` : ""}<button class="sm danger" data-mx="${i}">✕</button></div>`;
    const R = st.res, fotos = st.archivos.filter(a => a.kind === "imagen");
    app.innerHTML = `<div class="hero"><div><div class="small">${destino ? `<a href="#/c/${encodeURIComponent(destino.id)}">← ${esc(destino.nombre)}</a>` : `<a href="#/nuevo">← Agregar componente</a>`}</div>
        <h1>🤖 Modelar con <span>IA</span>${destino ? ` · ${esc(destino.nombre)}` : ""}</h1>
        <div class="muted">Fotos, un plano (profesional o a mano) o medidas → la IA que prefieras arma el modelo 3D y el montaje en el formato estándar de MountLab. No gasta créditos.</div></div></div>
      <div class="gen-grid">
        <div class="panel"><h3><span class="gen-n">1</span> Material</h3>
          ${destino ? "" : `<div class="grid2"><div><label>Nombre *</label><input id="mN" value="${esc(st.nombre)}" placeholder="p. ej. Adaptador plug DC a bornera"></div><div><label>Versión / referencia</label><input id="mV" value="${esc(st.variante)}"></div></div>`}
          <div class="grid3" style="margin-top:8px"><div><label>Largo (mm)</label><input id="mL" type="number" step="0.1" value="${esc(st.medidas.L ?? "")}"></div><div><label>Ancho (mm)</label><input id="mW" type="number" step="0.1" value="${esc(st.medidas.W ?? "")}"></div><div><label>Alto total (mm)</label><input id="mH" type="number" step="0.1" value="${esc(st.medidas.H ?? "")}"></div></div>
          <div style="margin-top:8px"><label>Notas (lo que sabes: agujeros, conectores, cómo se monta)</label><textarea id="mO" rows="3" placeholder="Agujeros M3 a 2.5 mm del borde, USB-C en el lado corto…">${esc(st.notas)}</textarea></div>
          <div style="margin-top:8px"><label>Fotos y plano</label>
            <div id="mDrop" class="gen-drop" tabindex="0"><b>📋 Pega</b>, <b>arrastra</b> o <a href="#" id="mPick">elige</a> fotos (arriba, lado, frente) o el plano en PDF/imagen · <a href="#" id="mCam">📷 cámara</a>${destino && destino.imagen && destino.imagen.src ? ` · <a href="#" id="mFicha">usar la foto de la ficha</a>` : ""}</div>
            <input type="file" id="mFile" accept="image/*,application/pdf,.pdf" multiple hidden><input type="file" id="mFoto" accept="image/*" capture="environment" hidden>
            <div class="gen-adj">${st.archivos.map(chip).join("")}</div></div></div>
        <div class="panel"><h3><span class="gen-n">2</span> Llévalo a tu IA</h3>
          <div class="small muted" style="margin-bottom:8px">El PDF lleva las instrucciones con el formato de MountLab, las plantillas, dos ejemplos reales de la biblioteca y tu material.</div>
          <div class="gen-btns"><button class="pri" id="mPdf">📄 Descargar PDF</button>${navigator.canShare ? '<button class="pri" id="mSh">📤 Compartir PDF</button>' : ""}<button id="mCp">📋 Copiar prompt</button><button id="mCm">💬 Mensaje corto</button></div>
          <div class="row" style="margin-top:8px"><a class="btn sm" href="https://gemini.google.com/app" target="_blank" rel="noopener">Gemini ↗</a><a class="btn sm" href="https://chatgpt.com/" target="_blank" rel="noopener">ChatGPT ↗</a><a class="btn sm" href="https://claude.ai/new" target="_blank" rel="noopener">Claude ↗</a></div>
          <details style="margin-top:8px"><summary class="small">Ver el prompt</summary><pre id="mPre" class="small" style="white-space:pre-wrap;max-height:260px;overflow:auto;background:var(--bg2);padding:8px;border-radius:8px"></pre></details></div>
        <div class="panel gen-full"><h3><span class="gen-n">3</span> Pega la respuesta</h3>
          <textarea id="mR" rows="6" placeholder='Pega TODA la respuesta (trae un bloque ${"```"}json {"modelo": …} ${"```"})'>${esc(st.respuesta)}</textarea>
          <div class="msg warn small hide" id="mErr" style="margin-top:6px"></div>
          <div class="row" style="justify-content:space-between;margin-top:8px"><button class="sm ghost" id="mClr">🗑 Empezar de nuevo</button><button class="pri" id="mI">🔎 Revisar el modelo</button></div></div>
        ${R ? `<div class="panel gen-full"><h3><span class="gen-n">4</span> Revisión</h3>
          <div class="mia-grid">
            <div><div class="mia-3d" id="m3d"></div><div class="small muted" style="margin-top:4px">Envolvente ${R.envolvente.L} × ${R.envolvente.W} × ${R.envolvente.H} mm · ${R.c.modelo.piezas.length} piezas · ${R.c.montaje.agujeros.length} agujeros · ${R.c.zonas.length} zonas</div></div>
            <div>${fotos.length ? `<div class="row" style="gap:4px;flex-wrap:wrap;margin-bottom:6px"><select id="sFo" class="sm" style="width:auto">${fotos.map((f, i) => `<option value="${i}" ${st.sup.foto === i ? "selected" : ""}>Foto ${i + 1}</option>`).join("")}</select>
                ${["arriba", "frente", "lado", "iso"].map(v => `<button class="sm ${st.sup.vista === v ? "on" : ""}" data-sv="${v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join("")}<button class="sm" id="sRot" title="Girar 90°">⟳</button><button class="sm" id="sRes">Reiniciar</button></div>
              <div class="mia-sup" id="sBox"><img id="sFoto" src="${fotos[Math.min(st.sup.foto, fotos.length - 1)].dataUrl}" alt=""><img id="sMod" alt="" draggable="false"></div>
              <div class="row" style="gap:10px;margin-top:6px;flex-wrap:wrap"><label class="small">Opacidad <input type="range" id="sOp" min="0" max="1" step="0.05" value="${st.sup.op}" style="width:110px"></label><label class="small">Escala <input type="range" id="sEs" min="0.2" max="3" step="0.01" value="${st.sup.esc}" style="width:130px"></label><span class="small muted">Arrastra el modelo para alinearlo con la foto.</span></div>`
              : `<div class="msg info small">Agrega una foto para ver el modelo superpuesto.</div>`}</div>
          </div>
          ${R.avisos.length ? `<div class="msg warn small" style="margin-top:10px"><b>Revisión de la app (${R.avisos.length})</b><ul style="margin:4px 0 0 16px;padding:0">${R.avisos.map(a => `<li>${esc(a)}</li>`).join("")}</ul></div>` : `<div class="msg ok small" style="margin-top:10px">✓ Sin problemas: envolvente, agujeros, encimes y salidas en orden.</div>`}
          ${R.supuestos.length ? `<div class="msg info small" style="margin-top:8px"><b>Supuestos de la IA</b><ul style="margin:4px 0 0 16px;padding:0">${R.supuestos.map(a => `<li>${esc(a)}</li>`).join("")}</ul></div>` : ""}
          <div class="tblwrap" style="margin-top:8px"><table class="tbl"><thead><tr><th>Pieza</th><th>Cara</th><th>Posición</th><th>Forma</th><th>Confianza</th></tr></thead><tbody>
            <tr><td><b>Base</b></td><td>—</td><td>—</td><td class="small">${esc(R.c.modelo.base.tipo)} ${esc(R.c.modelo.base.forma)} ${R.c.modelo.base.L} × ${R.c.modelo.base.W} × ${R.c.modelo.base.espesor}</td><td>${conf(R.confianza.base)}</td></tr>
            ${R.c.modelo.piezas.map(p => `<tr><td>${esc(p.nombre)}</td><td>${p.cara}</td><td class="small">${p.x}, ${p.y}${p.rot ? ` · ${p.rot}°` : ""}</td><td class="small">${p.plantilla === "importada" ? `${p.params.prim.length} forma(s)` : esc((MLPlant.plantilla(p.plantilla) || {}).n || p.plantilla)}</td><td>${conf(R.confianza[p.id])}</td></tr>`).join("")}</tbody></table></div>
          <div style="margin-top:10px"><label>Observación para la corrección (opcional)</label><input id="mObs" value="${esc(st.obs)}" placeholder="p. ej. el plug es más largo, la bornera tiene 3 polos…"></div>
          <div class="row" style="justify-content:space-between;margin-top:10px;flex-wrap:wrap;gap:6px"><button id="mCorr">📤 Pedir corrección (PDF con render + foto)</button>
            <div class="row" style="gap:6px">${destino ? "" : `<input id="mId" placeholder="identificador" value="${esc(X.slug(st.nombre || "componente"))}" style="max-width:220px">`}<button class="pri" id="mOk">✅ ${destino ? "Aplicar al componente" : "Crear componente"}</button></div></div></div>` : ""}
      </div>`;
    function conf(v) { const t = String(v || "").toLowerCase(); return t ? `<span class="tag ${/medida/.test(t) ? "ok" : /estimada/.test(t) ? "" : "warn"}">${esc(v)}</span>` : `<span class="muted small">—</span>`; }
    const $ = s => app.querySelector(s), $$ = s => [...app.querySelectorAll(s)];
    const sync = () => { if ($("#mN")) st.nombre = $("#mN").value.trim(); if ($("#mV")) st.variante = $("#mV").value.trim(); st.notas = $("#mO").value; st.medidas = { L: num($("#mL").value, ""), W: num($("#mW").value, ""), H: num($("#mH").value, "") }; st.respuesta = $("#mR").value; if ($("#mObs")) st.obs = $("#mObs").value; const pre = $("#mPre"); if (pre && pre.parentElement.open) pre.textContent = prompt(st); };
    ["#mN", "#mV", "#mO", "#mL", "#mW", "#mH", "#mR", "#mObs"].forEach(s => { const e = $(s); if (e) e.addEventListener("input", sync); });
    $("#mPre").parentElement.addEventListener("toggle", () => { sync(); $("#mPre").textContent = prompt(st); });
    $$("[data-mx]").forEach(b => b.onclick = () => { st.archivos.splice(+b.dataset.mx, 1); vista(app, idDestino); });
    const agregar = async files => { for (const f of [...files]) { if (!/^image\//.test(f.type) && !/pdf/i.test(f.type + f.name)) continue; if (f.size > 40e6) { toast("Máximo 40 MB por archivo"); continue; } try { const a = await MLArchivos.leer(f); if (!a.nombre || /^image\.(png|jpe?g)$/i.test(a.nombre)) a.nombre = "foto_" + (st.archivos.length + 1); st.archivos.push(a); } catch (e) { toast("No pude leer " + f.name + ": " + e.message); } } sync(); vista(app, idDestino); };
    const dz = $("#mDrop"); dz.ondragover = e => { e.preventDefault(); dz.classList.add("on"); }; dz.ondragleave = () => dz.classList.remove("on"); dz.ondrop = e => { e.preventDefault(); dz.classList.remove("on"); agregar(e.dataTransfer.files); };
    $("#mPick").onclick = e => { e.preventDefault(); $("#mFile").click(); }; $("#mCam").onclick = e => { e.preventDefault(); $("#mFoto").click(); };
    $("#mFile").onchange = e => agregar(e.target.files); $("#mFoto").onchange = e => agregar(e.target.files);
    const pegar = e => { if (!location.hash.startsWith("#/modelar-ia")) return; const it = [...((e.clipboardData || {}).items || [])].filter(x => x.kind === "file"); if (!it.length) return; e.preventDefault(); agregar(it.map(x => x.getAsFile()).filter(Boolean)); };
    document.removeEventListener("paste", X.S.miaPaste || (() => { })); X.S.miaPaste = pegar; document.addEventListener("paste", pegar);
    const fi = $("#mFicha"); if (fi) fi.onclick = async e => { e.preventDefault(); try { const bl = await (await fetch(destino.imagen.src)).blob(); await agregar([new File([bl], "foto_ficha.jpg", { type: bl.type || "image/jpeg" })]); } catch (er) { toast("No pude traer la foto de la ficha: " + er.message); } };
    const listo = () => { sync(); if (!st.nombre) { toast("Escribe el nombre"); $("#mN") && $("#mN").focus(); return false; } if (!st.archivos.length && !(st.medidas.L && st.medidas.W)) { toast("Agrega al menos una foto, un plano o las medidas"); return false; } return true; };
    const copiar = async (t, m) => { try { await navigator.clipboard.writeText(t); toast(m, 5000); } catch (e) { window.prompt("Copia el texto:", t); } };
    $("#mCp").onclick = () => listo() && copiar(prompt(st), "Prompt copiado: pégalo en tu IA (adjunta las fotos allá)");
    $("#mCm").onclick = () => copiar(MSJ, "Mensaje copiado: envíalo con el PDF");
    const bajar = f => { const u = URL.createObjectURL(f), a = document.createElement("a"); a.href = u; a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000); toast(`PDF listo (${(f.size / 1048576).toFixed(1)} MB): súbelo a tu IA con el mensaje corto`, 6000); };
    const conBoton = async (b, fn) => { const t = b.textContent; b.disabled = true; b.textContent = "Generando…"; try { return await fn(); } catch (e) { console.error(e); toast("No pude generar el PDF: " + e.message, 6000); } finally { b.disabled = false; b.textContent = t; } };
    $("#mPdf").onclick = async e => { if (!listo()) return; const f = await conBoton(e.currentTarget, () => pdf(st)); if (f) bajar(f); };
    const sh = $("#mSh"); if (sh) sh.onclick = async e => { if (!listo()) return; const f = await conBoton(e.currentTarget, () => pdf(st)); if (!f) return; try { if (navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: "MountLab · " + st.nombre, text: MSJ }); return; } } catch (er) { if (er.name === "AbortError") return; } bajar(f); };
    $("#mClr").onclick = async () => { if (!(await X.confirmar("¿Borrar el material y la respuesta?", "Borrar"))) return; X.S.mia = null; vista(app, idDestino); };
    $("#mI").onclick = () => { sync(); try { st.res = interpretar(st.respuesta, st); $("#mErr").classList.add("hide"); vista(app, idDestino); setTimeout(() => { const e = app.querySelector("#m3d"); e && e.scrollIntoView({ behavior: "smooth", block: "start" }); }, 60); } catch (e) { const er = $("#mErr"); er.textContent = e.message; er.classList.remove("hide"); } };
    if (!R) return;
    // 3D
    pinta3d(app.querySelector("#m3d"), R.c);
    // superposición
    const sb = $("#sBox");
    if (sb) {
      const mod = $("#sMod"), ap = () => { mod.style.opacity = st.sup.op; mod.style.transform = `translate(-50%, -50%) translate(${st.sup.dx}px, ${st.sup.dy}px) rotate(${st.sup.rot}deg) scale(${st.sup.esc})`; };
      const cargar = async () => { const r = await render(R.c, st.sup.vista, 700); mod.src = r.src; mod.style.width = "70%"; ap(); };
      cargar(); ap();
      $("#sFo").onchange = e => { st.sup.foto = +e.target.value; $("#sFoto").src = fotos[st.sup.foto].dataUrl; };
      $$("[data-sv]").forEach(b => b.onclick = () => { st.sup.vista = b.dataset.sv; $$("[data-sv]").forEach(x => x.classList.toggle("on", x === b)); cargar(); });
      $("#sRot").onclick = () => { st.sup.rot = (st.sup.rot + 90) % 360; ap(); };
      $("#sRes").onclick = () => { Object.assign(st.sup, { op: 0.55, esc: 1, dx: 0, dy: 0, rot: 0 }); $("#sOp").value = 0.55; $("#sEs").value = 1; ap(); };
      $("#sOp").oninput = e => { st.sup.op = +e.target.value; ap(); }; $("#sEs").oninput = e => { st.sup.esc = +e.target.value; ap(); };
      let drag = null; mod.onpointerdown = e => { drag = { x: e.clientX - st.sup.dx, y: e.clientY - st.sup.dy }; mod.setPointerCapture(e.pointerId); };
      mod.onpointermove = e => { if (!drag) return; st.sup.dx = e.clientX - drag.x; st.sup.dy = e.clientY - drag.y; ap(); }; mod.onpointerup = () => { drag = null; };
      sb.onwheel = e => { e.preventDefault(); st.sup.esc = Math.max(0.2, Math.min(3, st.sup.esc * (e.deltaY < 0 ? 1.05 : 0.95))); $("#sEs").value = st.sup.esc; ap(); };
    }
    // corrección
    $("#mCorr").onclick = async e => { sync(); const f = await conBoton(e.currentTarget, async () => { const renders = []; for (const v of ["iso", "arriba", "frente", "lado"]) { const r = await render(R.c, v, 900, 0xffffff); renders.push({ vista: v, src: r.src }); }
      return pdf(st, { problemas: R.avisos, nota: st.obs, json: R.json, renders }); }); if (f) bajar(f); };
    $("#mOk").onclick = () => { sync(); const c = R.c; const nota = `Modelo 3D hecho con IA desde ${c.modelo.nota.replace(/^Modelado con IA a partir de /, "")}`;
      if (destino) X.aplicarDestino(destino, c, nota); else { const id = X.slug(($("#mId").value || st.nombre).trim()); if (!st.nombre) return toast("Escribe el nombre"); if (X.comp(id)) return toast(`Ya existe «${id}»: cambia el identificador`); X.guardarNuevo({ id, nombre: st.nombre, referencia: st.variante, c, nota, imagen: fotos[0] ? fotos[0].dataUrl : null }); }
      X.S.mia = null; };
  }
  // vista 3D de la revisión
  let v3 = null;
  async function pinta3d(host, c) {
    if (!host) return; await MLModelo.cargarThree(); const T = THREE;
    if (v3) { try { v3.ren.dispose(); v3.ren.forceContextLoss && v3.ren.forceContextLoss(); } catch (e) { } v3 = null; }
    const ren = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); ren.setPixelRatio(Math.min(2, devicePixelRatio)); host.appendChild(ren.domElement);
    const sc = new T.Scene(); sc.background = new T.Color("#0b1220"); sc.add(new T.HemisphereLight(0xffffff, 0x8899aa, 0.7)); const dl = new T.DirectionalLight(0xffffff, 0.7); dl.position.set(60, 120, 80); sc.add(dl); const d2 = new T.DirectionalLight(0xffffff, 0.3); d2.position.set(-80, -60, -40); sc.add(d2);
    const g = new T.Group(); MLModelo.construir(T, c, { grupo: g }); sc.add(g);
    const grid = new T.GridHelper(200, 40, 0x334155, 0x1e293b); grid.position.y = -0.01; sc.add(grid);
    const e = envolvente(c), Rr = Math.max(e.L, e.W, e.H) * 1.6 + 10, zc = (e.z0 + e.z1) / 2, cam = new T.PerspectiveCamera(35, 1, 0.1, 5000); cam.position.set(Rr * 0.7, zc + Rr * 0.7, Rr * 0.9);
    const ctl = new T.OrbitControls(cam, ren.domElement); ctl.target.set((e.x0 + e.x1) / 2, zc, -(e.y0 + e.y1) / 2); ctl.update();
    const draw = () => { const w = host.clientWidth || 400, h = host.clientHeight || 320; ren.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); ren.render(sc, cam); };
    ctl.addEventListener("change", draw); new ResizeObserver(draw).observe(host); draw(); v3 = { ren };
  }

  window.MLModelIA = { init: ctx => { X = ctx; }, vista, prompt, interpretar, envolvente, aLibre };
})();
