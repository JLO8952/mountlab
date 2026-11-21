# -*- coding: utf-8 -*-
"""MountLab · STEP de la caja de un proyecto.

La app (Fabricación → Caja a CAD) deja data/cajas/<proyecto>.json con la caja elegida ("pendiente": true).
Este script arma un ensamble STEP con:
  - base hueca (fondo + paredes) con los agujeros de los elementos de pared y del fondo,
  - tapa con sus ventanas / agujeros,
  - una repisa por cada nivel superior,
  - cada componente como placa (PCB) + volumen de componentes encima, con su referencia como nombre.
Origen: esquina interior (−X, −Y) del fondo. Unidades: mm.

Uso:  python cad/caja_step.py            -> todas las cajas pendientes
      python cad/caja_step.py termo-01   -> una en particular
"""
import datetime, glob, json, os, sys

import cadquery as cq

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(RAIZ, "data", "cajas")


def caja(x0, y0, z0, a, b, c):
    return cq.Workplane("XY").box(a, b, c, centered=False).translate((x0, y0, z0))


PLANOS = {   # cara → (plano de CadQuery, desplazamiento del plano) ; en el plano: x = u de la cara, y = v
    "-Y": ("XZ", lambda L, W, H, e: -1),
    "+Y": ("XZ", lambda L, W, H, e: -(W + e + 1)),
    "-X": ("YZ", lambda L, W, H, e: -(e + 1)),
    "+X": ("YZ", lambda L, W, H, e: L - 1),
    "tapa": ("XY", lambda L, W, H, e: H - 1),
    "fondo": ("XY", lambda L, W, H, e: -e - 1),
}


def cortador(c, plano, off, prof):
    """Sólido para restar a partir de un corte {t: c|anillo|r|p} (mismas formas que dibuja la app)."""
    wp = lambda: cq.Workplane(plano).workplane(offset=off)
    t = c["t"]
    if t == "c":
        return wp().center(c["x"], c["y"]).circle(c["r"]).extrude(prof)
    if t == "anillo":
        r, a = c["r"], c["ancho"]
        return wp().center(c["x"], c["y"]).circle(r).circle(max(0.1, r - a)).extrude(prof)
    if t == "r":
        w, h, r = c["w"], c["h"], min(c.get("r") or 0, c["w"] / 2 - 0.01, c["h"] / 2 - 0.01)
        if r > 0.05:
            return wp().center(c["x"], c["y"]).sketch().rect(w, h).vertices().fillet(r).finalize().extrude(prof)
        return wp().center(c["x"], c["y"]).rect(w, h).extrude(prof)
    if t == "p":
        return wp().polyline([tuple(q) for q in c["pts"]]).close().extrude(prof)
    return None


def generar(ruta):
    with open(ruta, encoding="utf-8") as fh:
        d = json.load(fh)
    I, p = d["interior"], d["p"]
    L, W, H, e = float(I["L"]), float(I["W"]), float(I["H"]), float(p["espesor"])
    base = caja(-e, -e, -e, L + 2 * e, W + 2 * e, H + e).cut(caja(0, 0, 0, L, W, H + 1))
    tapa = caja(-e, -e, H, L + 2 * e, W + 2 * e, e)
    for el in d.get("elementos", []):
        plano, f_off = PLANOS.get(el["cara"], (None, None))
        if not plano:
            continue
        for c in el.get("cortes", []):
            try:
                s = cortador(c, plano, f_off(L, W, H, e), e * 3 + 2)
                if s is None:
                    continue
                if el["cara"] == "tapa":
                    tapa = tapa.cut(s)
                else:
                    base = base.cut(s)
            except Exception as ex:   # un corte raro no debe tumbar todo el ensamble
                print(f"  ✗ {el.get('ref')} {c.get('t')}: {ex}")
    asm = cq.Assembly(name=f"caja_{d['id']}")
    asm.add(base, name="base", color=cq.Color(0.55, 0.6, 0.68, 1))
    asm.add(tapa, name="tapa", color=cq.Color(0.7, 0.75, 0.82, 1))
    rep = float(p.get("repisa", 2))
    for k, nv in enumerate(d.get("niveles", [])[1:], start=2):
        asm.add(caja(0.5, 0.5, float(nv["z"]) - rep, L - 1, W - 1, rep), name=f"repisa_nivel_{k}", color=cq.Color(0.45, 0.5, 0.58, 1))
    for q in d.get("piezas", []):
        if q.get("elemento") is not None:
            continue
        x, y, z0, a, b = float(q["x"]), float(q["y"]), float(q.get("z0") or 0), float(q["L"]), float(q["W"])
        nombre = "".join(ch if ch.isalnum() else "_" for ch in f"{q['ref']}_{q.get('n', '')}")[:60]
        if q.get("Hc") is not None:
            asm.add(caja(x, y, z0, a, b, float(q["Hc"])), name=nombre, color=cq.Color(0.2, 0.55, 0.85, 1))
            continue
        bajo, esp = float(q.get("bajo") or 0), float(q.get("esp") or 1.6)
        asm.add(caja(x, y, z0 + bajo, a, b, esp), name=nombre + "_pcb", color=cq.Color(0.1, 0.45, 0.25, 1))
        arriba = max(0.5, float(q.get("Ht") or 0) - bajo - esp)
        asm.add(caja(x + 0.5, y + 0.5, z0 + bajo + esp, a - 1, b - 1, arriba), name=nombre + "_volumen", color=cq.Color(0.3, 0.7, 0.45, 0.35))
    salida = ruta[:-5] + ".step"
    asm.save(salida)
    d["pendiente"] = False
    d["generado"] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    with open(ruta, "w", encoding="utf-8") as fh:
        json.dump(d, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    print(f"→ {os.path.relpath(salida, RAIZ)} ({os.path.getsize(salida) // 1024} kB)")


if __name__ == "__main__":
    ids = sys.argv[1:]
    rutas = [os.path.join(DIR, f"{i}.json") for i in ids] if ids else sorted(glob.glob(os.path.join(DIR, "*.json")))
    for r in rutas:
        try:
            with open(r, encoding="utf-8") as fh:
                pend = json.load(fh).get("pendiente")
            if ids or pend:
                generar(r)
        except Exception as ex:
            print(f"✗ {r}: {ex}")
