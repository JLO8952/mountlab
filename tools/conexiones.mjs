// Calcula y guarda en cada componente las dos versiones de conexión (soldado / jumper) en montaje.conexiones.
// Uso: node tools/conexiones.mjs [--forzar]   (sin --forzar respeta las versiones ya guardadas o editadas a mano)
import fs from "fs"; import vm from "vm"; import path from "path";
const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ctx = { window: {} }; vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(raiz, "app/caja.js"), "utf8"), ctx);
const M = ctx.window.MLCaja, forzar = process.argv.includes("--forzar"), dir = path.join(raiz, "data/componentes");
let n = 0;
for (const f of fs.readdirSync(dir).filter(x => x.endsWith(".json"))) {
  const p = path.join(dir, f), c = JSON.parse(fs.readFileSync(p, "utf8"));
  if (c.anexo || !c.montaje || !c.montaje.pcb) continue;
  if (c.montaje.conexiones && !forzar) continue;
  if (forzar) delete c.montaje.conexiones;
  const cx = M.conexiones(c); if (!cx) continue;
  c.montaje.conexiones = JSON.parse(JSON.stringify(cx));
  fs.writeFileSync(p, JSON.stringify(c, null, 1) + "\n"); n++;
  console.log(c.id.padEnd(40), cx.header.padEnd(9), "soldado ↑", cx.soldado.altura_superior + cx.soldado.holgura_superior_cableado, "↓", cx.soldado.altura_inferior + cx.soldado.holgura_inferior_cableado, "| jumper ↑", cx.jumper.altura_superior + cx.jumper.holgura_superior_cableado, "↓", cx.jumper.altura_inferior + cx.jumper.holgura_inferior_cableado);
}
console.log(n, "componentes actualizados");
