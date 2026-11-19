/* MountLab · almacenamiento.
   - Lee data/db.json (lo arma la GitHub Action a partir de data/componentes, data/proyectos…).
   - Con token de GitHub: cada "Guardar" es un commit del JSON del elemento (queda el historial en git).
   - Sin token: modo local (los cambios quedan en este navegador y se suben luego con "Subir cambios locales"). */
(function () {
  const KCFG = "ml_cfg", KOV = "ml_overlay";
  const KINDS = { componentes: "data/componentes", proyectos: "data/proyectos", pendientes: "data/pendientes", plantillas: "data/plantillas", accesos: "data/accesos" };
  const ls = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn("localStorage", e); } },
  };
  function b64(str) { const by = new TextEncoder().encode(str); let s = ""; for (let i = 0; i < by.length; i += 0x8000) s += String.fromCharCode.apply(null, by.subarray(i, i + 0x8000)); return btoa(s); }
  function b64bytes(u8) { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }

  const Store = {
    cfg: Object.assign({ owner: "JLO8952", repo: "mountlab", branch: "main", token: "", aiProv: "gemini", aiKey: "", aiModel: "claude-sonnet-5-5", gemKey: "", gemModel: "gemini-2.5-flash", gemPro: "", oaUrl: "https://api.openai.com/v1", oaKey: "", oaModel: "", drive: "" }, ls.get(KCFG, {})),
    db: { componentes: [], proyectos: [], pendientes: [], plantillas: [], accesos: [], tablas: {}, generado: null },
    mode: "local", error: null,

    SECRETOS: ["token", "aiKey", "gemKey", "oaKey"],
    /** Guarda la configuración. Las claves (token, API keys) nunca quedan en claro: van a la bóveda cifrada (auth.js). */
    saveCfg(c) {
      Object.assign(this.cfg, c);
      const claro = Object.assign({}, this.cfg); this.SECRETOS.forEach(k => delete claro[k]); ls.set(KCFG, claro);
      if (window.Auth && Auth.abierta()) Auth.guardarSecretos(Object.fromEntries(this.SECRETOS.map(k => [k, this.cfg[k] || ""])));
    },
    soloLectura() { return !!(window.Auth && Auth.rol() === "lectura"); },
    hasGit() { return !!(this.cfg.token && this.cfg.owner && this.cfg.repo); },
    api(path) { return `https://api.github.com/repos/${this.cfg.owner}/${this.cfg.repo}` + (path ? `/${path}` : ""); },
    headers(extra) { return Object.assign({ Authorization: `Bearer ${this.cfg.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }, extra || {}); },

    async load() {
      let db = null; this.error = null;
      if (this.hasGit()) {
        try {
          const r = await fetch(this.api(`contents/data/db.json?ref=${this.cfg.branch}`), { headers: this.headers({ Accept: "application/vnd.github.raw+json" }), cache: "no-store" });
          if (!r.ok) throw new Error(`GitHub respondió ${r.status}`);
          db = await r.json(); this.mode = "github";
        } catch (e) { this.error = "No pude leer el repositorio: " + e.message; }
      }
      if (!db) {
        try {
          const r = await fetch("data/db.json", { cache: "no-store" });
          if (!r.ok) throw new Error(r.status);
          db = await r.json(); this.mode = this.hasGit() ? "github-lectura" : "publico";
        } catch (e) {
          // Abierto con doble clic (file://): el navegador no deja leer el JSON, se usa data/db.js
          db = await new Promise(res => { const s = document.createElement("script"); s.src = "data/db.js"; s.onload = () => res(window.ML_DB || null); s.onerror = () => res(null); document.head.appendChild(s); });
          if (!db) { db = { componentes: [], proyectos: [], pendientes: [], tablas: {} }; this.error = this.error || "No se encontró data/db.json"; }
          this.mode = "local";
        }
      }
      this.db = { componentes: db.componentes || [], proyectos: db.proyectos || [], pendientes: db.pendientes || [], plantillas: db.plantillas || [], accesos: db.accesos || [], tablas: db.tablas || {}, generado: db.generado || null };
      this.applyOverlay();
      return this.db;
    },

    // Cambios guardados aún no reflejados en db.json (o hechos sin conexión)
    overlay() { return Object.assign({ componentes: {}, proyectos: {}, pendientes: {}, plantillas: {}, accesos: {} }, ls.get(KOV, {})); },
    applyOverlay() {
      const ov = this.overlay(), gen = this.db.generado ? Date.parse(this.db.generado) : 0;
      let cambio = false;
      for (const k of Object.keys(KINDS)) {
        for (const [id, ent] of Object.entries(ov[k] || {})) {
          if (!ent.local && ent.t && gen > ent.t + 5000) { delete ov[k][id]; cambio = true; continue; } // ya está en db.json
          const arr = this.db[k], i = arr.findIndex(x => x.id === id);
          if (ent.obj === null) { if (i >= 0) arr.splice(i, 1); }
          else if (i >= 0) arr[i] = ent.obj; else arr.push(ent.obj);
        }
      }
      if (cambio) ls.set(KOV, ov);
    },
    setOverlay(kind, id, obj, local) {
      const ov = this.overlay(); ov[kind] = ov[kind] || {};
      ov[kind][id] = { obj: obj === null ? null : JSON.parse(JSON.stringify(obj)), t: Date.now(), local: !!local };
      ls.set(KOV, ov);
    },
    localPendientes() { const ov = this.overlay(); let n = 0; for (const k of Object.keys(KINDS)) for (const e of Object.values(ov[k] || {})) if (e.local) n++; return n; },

    async getSha(path) {
      const r = await fetch(this.api(`contents/${path}?ref=${this.cfg.branch}`), { headers: this.headers(), cache: "no-store" });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`GitHub ${r.status}`);
      return (await r.json()).sha;
    },
    async putFile(path, base64, message) {
      const sha = await this.getSha(path);
      const body = { message, content: base64, branch: this.cfg.branch }; if (sha) body.sha = sha;
      const r = await fetch(this.api(`contents/${path}`), { method: "PUT", headers: this.headers({ "Content-Type": "application/json" }), body: JSON.stringify(body) });
      if (!r.ok) { const t = await r.text(); throw new Error(`GitHub ${r.status}: ${t.slice(0, 160)}`); }
      return r.json();
    },
    async deleteFile(path, message) {
      const sha = await this.getSha(path); if (!sha) return;
      const r = await fetch(this.api(`contents/${path}`), { method: "DELETE", headers: this.headers({ "Content-Type": "application/json" }), body: JSON.stringify({ message, sha, branch: this.cfg.branch }) });
      if (!r.ok) throw new Error(`GitHub ${r.status}`);
    },

    /** Guarda un elemento. Devuelve "github" o "local". */
    async save(kind, obj, message) {
      if (this.soloLectura()) throw new Error("Tu acceso es de solo lectura");
      const arr = this.db[kind], i = arr.findIndex(x => x.id === obj.id);
      if (i >= 0) arr[i] = obj; else arr.push(obj);
      if (this.mode === "github") {
        try {
          await this.putFile(`${KINDS[kind]}/${obj.id}.json`, b64(JSON.stringify(obj, null, 1) + "\n"), message);
          this.setOverlay(kind, obj.id, obj, false); return "github";
        } catch (e) { this.setOverlay(kind, obj.id, obj, true); throw e; }
      }
      this.setOverlay(kind, obj.id, obj, true); return "local";
    },
    async remove(kind, id, message) {
      if (this.soloLectura()) throw new Error("Tu acceso es de solo lectura");
      const arr = this.db[kind], i = arr.findIndex(x => x.id === id); if (i >= 0) arr.splice(i, 1);
      if (this.mode === "github") { await this.deleteFile(`${KINDS[kind]}/${id}.json`, message); this.setOverlay(kind, id, null, false); return "github"; }
      this.setOverlay(kind, id, null, true); return "local";
    },
    async syncLocal(onProgress) {
      if (this.mode !== "github") throw new Error("Configura el token de GitHub primero");
      const ov = this.overlay(); let n = 0;
      for (const k of Object.keys(KINDS)) for (const [id, e] of Object.entries(ov[k] || {})) {
        if (!e.local) continue;
        if (e.obj === null) await this.deleteFile(`${KINDS[k]}/${id}.json`, `Eliminar ${id} (cambio local)`);
        else {
          if (e.obj.imagen && String(e.obj.imagen.src).startsWith("data:")) {
            const src = await this.uploadImage(id, e.obj.imagen.src); e.obj.imagen.src = src;
          }
          await this.putFile(`${KINDS[k]}/${id}.json`, b64(JSON.stringify(e.obj, null, 1) + "\n"), `${id}: cambios hechos sin conexión`);
        }
        e.local = false; e.t = Date.now(); n++; onProgress && onProgress(n);
      }
      ls.set(KOV, ov); return n;
    },

    /** Sube una imagen (dataURL jpeg/png) a img/<id>.jpg y devuelve la ruta relativa. */
    async uploadImage(id, dataUrl) {
      const ext = dataUrl.startsWith("data:image/png") ? "png" : "jpg";
      const path = `img/${id}.${ext}`;
      if (this.mode !== "github") return dataUrl;
      const bin = atob(dataUrl.split(",")[1]); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      await this.putFile(path, b64bytes(u8), `Imagen de ${id}`);
      return path + "?v=" + Date.now();
    },
    imgUrl(src) {
      if (!src) return null;
      if (/^(data:|https?:)/.test(src)) return src;
      // repo privado: GitHub Pages no sirve la imagen si no hay Pages; usar raw por la API no es posible en <img>, así que se sirve desde Pages
      return src;
    },
    async dispatch(workflow, inputs) {
      const r = await fetch(this.api(`actions/workflows/${workflow}/dispatches`), { method: "POST", headers: this.headers({ "Content-Type": "application/json" }), body: JSON.stringify({ ref: this.cfg.branch, inputs: inputs || {} }) });
      if (!r.ok) throw new Error(`GitHub ${r.status}: ${(await r.text()).slice(0, 160)}`);
    },
    async runs(n) {
      const r = await fetch(this.api(`actions/runs?per_page=${n || 5}`), { headers: this.headers(), cache: "no-store" });
      if (!r.ok) throw new Error(`GitHub ${r.status}`); return (await r.json()).workflow_runs || [];
    },
    async test() {
      const r = await fetch(this.api(""), { headers: this.headers() });
      if (r.status === 401) throw new Error("Token inválido o vencido (GitHub 401). Genera uno nuevo.");
      if (!r.ok) throw new Error(r.status === 404 ? "Repositorio no encontrado o el token no tiene acceso a él (revisa Repository access → mountlab)" : `GitHub ${r.status}`);
      const j = await r.json(); if (j.permissions && j.permissions.push === false && !this.soloLectura()) throw new Error("El token no tiene permiso de escritura (Contents: Read and write)");
      this.permisos = j.permissions || null; this.privado = !!j.private;
      return j;
    },
  };
  window.Store = Store;
})();
