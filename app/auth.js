/* MountLab · acceso restringido.
   - Bóveda local: las claves (token de GitHub y claves de IA) se guardan cifradas con tu contraseña
     (PBKDF2-SHA256 → AES-GCM 256). Sin la contraseña no se pueden leer, ni siquiera desde este navegador.
   - Sesión: al desbloquear, la llave queda solo en esta pestaña (sessionStorage) y se borra al bloquear
     o tras el tiempo de inactividad.
   - Invitaciones: un enlace con los datos de acceso cifrados con un código (PIN) que se comparte aparte.
     El registro (sin secretos) vive en data/accesos/<id>.json para poder revocarlo o dejarlo vencer.
   Límite honesto: el repositorio público sigue siendo legible en GitHub; la contraseña protege la app,
   la edición y las claves. */
(function () {
  const KV = "ml_vault", KS = "ml_ses", ITER = 250000, ITER_INV = 150000;
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = u8 => { let s = ""; u8.forEach(b => s += String.fromCharCode(b)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const b64url = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const unb64url = s => decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4))));
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = s => document.querySelector(s);
  const hayCripto = !!(window.crypto && crypto.subtle);

  async function derivar(pass, salt, iter) {
    const base = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  }
  async function cifrar(key, obj) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(obj)))); return { iv: b64(iv), ct: b64(ct) }; }
  async function descifrar(key, iv, ct) { return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, key, unb64(ct)))); }
  const exportar = async k => b64(new Uint8Array(await crypto.subtle.exportKey("raw", k)));
  const importar = s => crypto.subtle.importKey("raw", unb64(s), "AES-GCM", true, ["encrypt", "decrypt"]);
  const vault = () => { try { return JSON.parse(localStorage.getItem(KV)); } catch (e) { return null; } };

  let KEY = null, DATA = null, resolver = null, timer = null;
  const ses = { get() { try { return JSON.parse(sessionStorage.getItem(KS)); } catch (e) { return null; } }, set(v) { try { sessionStorage.setItem(KS, JSON.stringify(v)); } catch (e) { } }, del() { try { sessionStorage.removeItem(KS); } catch (e) { } } };

  function aplicar() {
    const s = DATA.secretos || {}, p = DATA.perfil || {};
    if (p.repo) Object.assign(Store.cfg, p.repo);
    for (const k of Store.SECRETOS) Store.cfg[k] = s[k] || "";
    document.body.classList.toggle("rol-lectura", p.rol === "lectura");
  }
  async function persistir() { const V = vault(); const { iv, ct } = await cifrar(KEY, DATA); localStorage.setItem(KV, JSON.stringify(Object.assign(V, { iv, ct }))); }
  async function abrirCon(key, data) {
    KEY = key; DATA = data; ses.set({ k: await exportar(key), t: Date.now() });
    aplicar(); ocultar(); vigilar();
    if (resolver) { resolver(); resolver = null; }
  }
  function legado() { // claves que una versión anterior dejó en claro en ml_cfg
    let c = {}; try { c = JSON.parse(localStorage.getItem("ml_cfg")) || {}; } catch (e) { }
    const s = {}; for (const k of Store.SECRETOS) if (c[k]) s[k] = c[k]; return s;
  }
  function limpiarLegado() { try { const c = JSON.parse(localStorage.getItem("ml_cfg")) || {}; Store.SECRETOS.forEach(k => delete c[k]); localStorage.setItem("ml_cfg", JSON.stringify(c)); } catch (e) { } }

  async function crear(pass, perfil, secretos) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), key = await derivar(pass, salt, ITER);
    const data = { perfil: Object.assign({ creado: new Date().toISOString() }, perfil), secretos: secretos || {} };
    const { iv, ct } = await cifrar(key, data);
    localStorage.setItem(KV, JSON.stringify({ v: 1, salt: b64(salt), iter: ITER, iv, ct }));
    limpiarLegado(); await abrirCon(key, data);
  }
  async function desbloquear(pass) {
    const V = vault(); const key = await derivar(pass, unb64(V.salt), V.iter || ITER);
    let data; try { data = await descifrar(key, V.iv, V.ct); } catch (e) { throw new Error("Contraseña incorrecta"); }
    await abrirCon(key, data);
  }

  // -------------------- inactividad
  function vigilar() {
    clearInterval(timer);
    const toque = () => { const s = ses.get(); if (s && Date.now() - s.t > 15000) { s.t = Date.now(); ses.set(s); } };
    ["pointerdown", "keydown", "wheel"].forEach(ev => window.addEventListener(ev, toque, { passive: true }));
    timer = setInterval(() => { const s = ses.get(), min = +((DATA && DATA.perfil && DATA.perfil.bloqueo) || 30); if (!s || (min > 0 && Date.now() - s.t > min * 60000)) Auth.bloquear(true); }, 20000);
  }

  // -------------------- pantalla de bloqueo
  const logo = `<div class="logo"><svg viewBox="0 0 32 32" width="30" height="30"><rect x="6" y="8" width="20" height="16" rx="2.5" fill="none" stroke="#05121e" stroke-width="2.4"/><circle cx="10.5" cy="12.5" r="1.8" fill="#05121e"/><circle cx="21.5" cy="19.5" r="1.8" fill="#05121e"/></svg></div>`;
  function mostrar(html, montar) {
    const L = $("#lock"); L.innerHTML = `<div class="lock-box">${logo}${html}</div>`; L.classList.remove("hide"); document.body.style.overflow = "hidden";
    montar && montar(L); const f = L.querySelector("input"); f && setTimeout(() => f.focus(), 60);
  }
  function ocultar() { const L = $("#lock"); if (L) { L.classList.add("hide"); L.innerHTML = ""; } document.body.style.overflow = ""; }
  const err = (L, m) => { const e = L.querySelector(".lk-err"); e.textContent = m; e.classList.toggle("hide", !m); };
  const ocupado = (b, t) => { b.disabled = !!t; if (t) { b.dataset.t = b.textContent; b.textContent = t; } else if (b.dataset.t) b.textContent = b.dataset.t; };

  function pantallaCrear() {
    const leg = legado();
    mostrar(`<h2>Bienvenido a <span class="grad-t">MountLab</span></h2>
      <p class="muted" style="margin:0">Crea la contraseña de dueño para este dispositivo. Protege la app y guarda <b>cifradas</b> tus claves (token de GitHub y claves de IA).</p>
      ${Object.keys(leg).length ? `<div class="msg info small">Encontré ${Object.keys(leg).length} clave(s) guardadas antes en este navegador: quedarán dentro de la bóveda cifrada.</div>` : ""}
      <div><label>Contraseña (mínimo 8 caracteres)</label><input type="password" id="lkP" autocomplete="new-password"></div>
      <div><label>Repítela</label><input type="password" id="lkP2" autocomplete="new-password"></div>
      <div class="msg warn small lk-err hide"></div>
      <button class="pri" id="lkOk" style="justify-content:center">Crear y entrar</button>
      <div class="small muted">Si la olvidas no se puede recuperar: solo tendrías que volver a pegar tus claves. <a href="#" id="lkInv">Tengo un código de invitación</a></div>`, L => {
      const go = async () => {
        const p = L.querySelector("#lkP").value, p2 = L.querySelector("#lkP2").value;
        if (p.length < 8) return err(L, "Usa al menos 8 caracteres."); if (p !== p2) return err(L, "Las contraseñas no coinciden.");
        const b = L.querySelector("#lkOk"); ocupado(b, "Cifrando…");
        try { await crear(p, { modo: "dueño", rol: "dueño", nombre: "John", bloqueo: 30 }, leg); } catch (e) { ocupado(b); err(L, e.message); }
      };
      L.querySelector("#lkOk").onclick = go; L.querySelector("#lkP2").onkeydown = e => { if (e.key === "Enter") go(); };
      L.querySelector("#lkInv").onclick = e => { e.preventDefault(); pantallaCodigo(); };
    });
  }
  function pantallaDesbloquear(motivo) {
    mostrar(`<h2><span class="grad-t">MountLab</span> está bloqueado</h2>
      ${motivo ? `<div class="msg info small">${esc(motivo)}</div>` : ""}
      <div><label>Contraseña</label><input type="password" id="lkP" autocomplete="current-password"></div>
      <div class="msg warn small lk-err hide"></div>
      <button class="pri" id="lkOk" style="justify-content:center">Desbloquear</button>
      <div class="small muted row" style="justify-content:space-between"><a href="#" id="lkOlv">¿Olvidaste la contraseña?</a><a href="#" id="lkInv">Usar un código de invitación</a></div>`, L => {
      const go = async () => { const b = L.querySelector("#lkOk"); ocupado(b, "Verificando…"); try { await desbloquear(L.querySelector("#lkP").value); } catch (e) { ocupado(b); err(L, e.message); L.querySelector("#lkP").select(); } };
      L.querySelector("#lkOk").onclick = go; L.querySelector("#lkP").onkeydown = e => { if (e.key === "Enter") go(); };
      L.querySelector("#lkOlv").onclick = e => { e.preventDefault(); pantallaReset(); };
      L.querySelector("#lkInv").onclick = e => { e.preventDefault(); pantallaCodigo(); };
    });
  }
  function pantallaReset() {
    mostrar(`<h2>Restablecer</h2><p class="muted" style="margin:0">Se borra la bóveda de <b>este dispositivo</b> (tus claves guardadas aquí). Tus componentes y proyectos no se tocan: están en GitHub. Luego creas una contraseña nueva y vuelves a pegar el token y las claves de IA en Ajustes.</p>
      <div><label>Escribe BORRAR para confirmar</label><input id="lkC"></div><div class="msg warn small lk-err hide"></div>
      <div class="row"><button id="lkNo">Volver</button><button class="danger" id="lkOk">Borrar bóveda</button></div>`, L => {
      L.querySelector("#lkNo").onclick = () => pantallaDesbloquear();
      L.querySelector("#lkOk").onclick = () => { if (L.querySelector("#lkC").value.trim().toUpperCase() !== "BORRAR") return err(L, "Escribe BORRAR"); localStorage.removeItem(KV); ses.del(); pantallaCrear(); };
    });
  }

  // -------------------- invitaciones
  const ALFA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const pinNuevo = () => { const r = crypto.getRandomValues(new Uint8Array(8)); let s = ""; r.forEach((b, i) => { s += ALFA[b % ALFA.length]; if (i === 3) s += "-"; }); return s; };
  const pinNorm = p => String(p || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  async function codificarInv(datos, pin) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), key = await derivar(pinNorm(pin), salt, ITER_INV), { iv, ct } = await cifrar(key, datos);
    return b64url(JSON.stringify({ v: 1, s: b64(salt), i: iv, c: ct }));
  }
  async function decodificarInv(codigo, pin) {
    let o; try { o = JSON.parse(unb64url(String(codigo).trim())); } catch (e) { throw new Error("El código de invitación no es válido o está incompleto"); }
    const key = await derivar(pinNorm(pin), unb64(o.s), ITER_INV);
    try { return await descifrar(key, o.i, o.c); } catch (e) { throw new Error("PIN incorrecto"); }
  }
  function pantallaCodigo(codigo) {
    mostrar(`<h2>Invitación a <span class="grad-t">MountLab</span></h2>
      <p class="muted" style="margin:0">Pega el enlace o el código que te enviaron y el PIN (llega por un canal aparte).</p>
      ${codigo ? "" : '<div><label>Enlace o código</label><textarea id="lkCod" style="min-height:70px"></textarea></div>'}
      <div><label>PIN (8 caracteres)</label><input id="lkPin" placeholder="XXXX-XXXX" autocomplete="one-time-code"></div>
      <div class="msg warn small lk-err hide"></div>
      <button class="pri" id="lkOk" style="justify-content:center">Verificar invitación</button>
      ${vault() ? '<div class="small muted"><a href="#" id="lkVol">Volver al desbloqueo</a></div>' : '<div class="small muted"><a href="#" id="lkVol">Soy el dueño: crear contraseña</a></div>'}`, L => {
      const go = async () => {
        let cod = codigo || L.querySelector("#lkCod").value.trim(); const m = cod.match(/invitacion\/([A-Za-z0-9_-]+)/); if (m) cod = m[1];
        const b = L.querySelector("#lkOk"); ocupado(b, "Verificando…");
        try {
          const inv = await decodificarInv(cod, L.querySelector("#lkPin").value);
          if (inv.exp && Date.parse(inv.exp) < Date.now()) throw new Error("Esta invitación venció el " + inv.exp.slice(0, 10));
          const reg = await registro(inv);
          if (reg === null) throw new Error("La invitación no está registrada (pudo ser eliminada por el dueño)");
          if (reg === undefined) throw new Error("No pude comprobar la invitación: revisa tu conexión a internet");
          if (reg.estado === "revocado") throw new Error("El dueño revocó esta invitación");
          pantallaInvitado(inv);
        } catch (e) { ocupado(b); err(L, e.message); }
      };
      L.querySelector("#lkOk").onclick = go; L.querySelector("#lkPin").onkeydown = e => { if (e.key === "Enter") go(); };
      L.querySelector("#lkVol").onclick = e => { e.preventDefault(); history.replaceState(null, "", "#/"); vault() ? pantallaDesbloquear() : pantallaCrear(); };
    });
  }
  async function registro(inv) { // data/accesos/<id>.json en el repositorio (público): solo metadatos
    const r = inv.repo || {}, url = `https://raw.githubusercontent.com/${r.owner || Store.cfg.owner}/${r.repo || Store.cfg.repo}/${r.branch || "main"}/data/accesos/${inv.id}.json`;
    let visto404 = false;
    try { const x = await fetch(url, { cache: "no-store" }); if (x.ok) return await x.json(); if (x.status === 404) visto404 = true; } catch (e) { }
    try { const x = await fetch(`data/accesos/${inv.id}.json`, { cache: "no-store" }); if (x.ok) return await x.json(); } catch (e) { }
    return visto404 ? null : undefined;   // undefined = no se pudo comprobar (sin conexión)
  }
  function pantallaInvitado(inv) {
    mostrar(`<h2>Hola, ${esc(inv.nombre || "invitado")} 👋</h2>
      <p class="muted" style="margin:0">Acceso de <b>${inv.rol === "edicion" ? "edición" : "solo lectura"}</b>${inv.exp ? ` hasta el <b>${esc(inv.exp.slice(0, 10))}</b>` : ""}. Crea una contraseña para este dispositivo; los datos de acceso quedan cifrados con ella.</p>
      ${vault() ? '<div class="msg warn small">Este navegador ya tiene una bóveda de MountLab: se reemplazará por tu acceso de invitado.</div>' : ""}
      <div><label>Contraseña (mínimo 8 caracteres)</label><input type="password" id="lkP" autocomplete="new-password"></div>
      <div><label>Repítela</label><input type="password" id="lkP2" autocomplete="new-password"></div>
      <div class="msg warn small lk-err hide"></div>
      <button class="pri" id="lkOk" style="justify-content:center">Entrar</button>`, L => {
      const go = async () => {
        const p = L.querySelector("#lkP").value; if (p.length < 8) return err(L, "Usa al menos 8 caracteres."); if (p !== L.querySelector("#lkP2").value) return err(L, "Las contraseñas no coinciden.");
        const b = L.querySelector("#lkOk"); ocupado(b, "Cifrando…");
        try { history.replaceState(null, "", "#/"); await crear(p, { modo: "invitado", rol: inv.rol === "edicion" ? "edicion" : "lectura", nombre: inv.nombre || "Invitado", invId: inv.id, exp: inv.exp || null, repo: inv.repo || null, bloqueo: 30 }, { token: inv.token || "" }); }
        catch (e) { ocupado(b); err(L, e.message); }
      };
      L.querySelector("#lkOk").onclick = go; L.querySelector("#lkP2").onkeydown = e => { if (e.key === "Enter") go(); };
    });
  }

  // -------------------- API pública
  const Auth = {
    disponible: hayCripto,
    abierta: () => !!(KEY && DATA),
    perfil: () => (DATA && DATA.perfil) || {},
    rol: () => (DATA && DATA.perfil && DATA.perfil.rol) || null,
    esDueño: () => !!(DATA && DATA.perfil && DATA.perfil.rol === "dueño"),
    /** Resuelve cuando la app está desbloqueada (dueño o invitado). */
    iniciar() {
      return new Promise(async res => {
        if (!hayCripto) { console.warn("Sin WebCrypto (¿http sin https?): bloqueo desactivado"); return res(); }
        resolver = res;
        const m = location.hash.match(/^#\/invitacion\/([A-Za-z0-9_-]+)/);
        if (m) return pantallaCodigo(m[1]);
        const V = vault(), s = ses.get();
        if (V && s && s.k) {
          try { const key = await importar(s.k); const data = await descifrar(key, V.iv, V.ct); const min = +((data.perfil || {}).bloqueo || 30);
            if (min <= 0 || Date.now() - s.t < min * 60000) return abrirCon(key, data); } catch (e) { }
          ses.del();
        }
        let mot = ""; try { mot = sessionStorage.getItem("ml_motivo") || ""; sessionStorage.removeItem("ml_motivo"); } catch (e) { }
        if (V) pantallaDesbloquear(mot); else pantallaCrear();
      });
    },
    async guardarSecretos(sec) { if (!this.abierta()) return; DATA.secretos = Object.assign({}, DATA.secretos, sec); await persistir(); },
    async guardarPerfil(p) { if (!this.abierta()) return; DATA.perfil = Object.assign({}, DATA.perfil, p); await persistir(); },
    bloquear(auto) { ses.del(); KEY = null; DATA = null; for (const k of Store.SECRETOS) Store.cfg[k] = ""; sessionStorage.setItem("ml_motivo", auto ? "Se bloqueó por inactividad." : ""); location.reload(); },
    motivo() { const m = sessionStorage.getItem("ml_motivo"); sessionStorage.removeItem("ml_motivo"); return m; },
    async cambiarPassword(actual, nueva) {
      const V = vault(); const k0 = await derivar(actual, unb64(V.salt), V.iter || ITER);
      try { await descifrar(k0, V.iv, V.ct); } catch (e) { throw new Error("La contraseña actual no es correcta"); }
      if (String(nueva).length < 8) throw new Error("La nueva contraseña necesita al menos 8 caracteres");
      const salt = crypto.getRandomValues(new Uint8Array(16)), key = await derivar(nueva, salt, ITER), { iv, ct } = await cifrar(key, DATA);
      localStorage.setItem(KV, JSON.stringify({ v: 1, salt: b64(salt), iter: ITER, iv, ct })); KEY = key; ses.set({ k: await exportar(key), t: Date.now() });
    },
    /** Crea una invitación: devuelve { codigo, pin, url, registro }. El registro (sin secretos) se guarda en data/accesos. */
    async crearInvitacion({ nombre, rol, dias, token }) {
      const id = "inv_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const exp = dias > 0 ? new Date(Date.now() + dias * 86400000).toISOString() : null;
      const repo = { owner: Store.cfg.owner, repo: Store.cfg.repo, branch: Store.cfg.branch };
      const pin = pinNuevo(), codigo = await codificarInv({ v: 1, id, nombre, rol, exp, repo, token: token || "" }, pin);
      const base = location.href.split("#")[0];
      return { codigo, pin, url: `${base}#/invitacion/${codigo}`, registro: { id, nombre, rol, creado: new Date().toISOString().slice(0, 10), vence: exp ? exp.slice(0, 10) : null, estado: "activo", con_token: !!token } };
    },
    /** Tras cargar la base: un invitado revocado o vencido pierde el acceso en este dispositivo. */
    async verificarAcceso(db) {
      const p = this.perfil(); if (p.modo !== "invitado") return true;
      let r = (db.accesos || []).find(a => a.id === p.invId);
      if (!r) r = await registro({ id: p.invId, repo: p.repo });   // recién creada: aún no está en db.json
      if (r === undefined) return true;                              // sin conexión: no se puede comprobar
      const vencido = (p.exp && Date.parse(p.exp) < Date.now()) || (r && r.vence && Date.parse(r.vence + "T23:59:59") < Date.now());
      if (!r || r.estado === "revocado" || vencido) {
        localStorage.removeItem(KV); ses.del();
        mostrar(`<h2>Acceso terminado</h2><p class="muted" style="margin:0">${vencido ? "Tu invitación venció." : "El dueño revocó o eliminó tu invitación."} Pide un enlace nuevo si lo necesitas.</p><button class="pri" onclick="location.hash='#/';location.reload()">Entendido</button>`);
        return false;
      }
      return true;
    },
  };
  window.Auth = Auth;
})();
