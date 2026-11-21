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


def figura_en_cara(e, d, L, W, H, esp):
    """Sólido para restar: agujero del elemento e en su cara."""
    w, h, u, v = float(e["w"]), float(e["h"]), float(e["u"]), float(e["v"])
    prof = esp * 3 + 2
    cara, forma = e["cara"], e.get("forma", "rect")
    def solido(plano, cx, cy, off):
        wp = cq.Workplane(plano).workplane(offset=off)
        if forma == "circ" and abs(w - h) < 0.01:
            return wp.center(cx, cy).circle(w / 2).extrude(prof)
        if forma == "rejilla":
            n = max(2, int((h if w >= h else w) // 3))
            ranuras = None
            for i in range(n):
                if w >= h:
                    s = wp.center(cx, cy - h / 2 + (i + 0.5) * h / n).rect(w - 2, h / n * 0.55).extrude(prof)
                else:
                    s = wp.center(cx - w / 2 + (i + 0.5) * w / n, cy).rect(w / n * 0.55, h - 2).extrude(prof)
                ranuras = s if ranuras is None else ranuras.union(s)
            return ranuras
        if forma == "circ":
            return wp.center(cx, cy).ellipse(w / 2, h / 2).extrude(prof)
        return wp.center(cx, cy).rect(w, h).extrude(prof)
    if cara == "-Y":   # plano XZ, normal −Y; centro en x=u, z=v
        return solido("XZ", u, v, -1)
    if cara == "+Y":
        return solido("XZ", u, v, -(W + esp + 1))
    if cara == "-X":
        return solido("YZ", u, v, -(esp + 1))
    if cara == "+X":
        return solido("YZ", u, v, L - 1)
    if cara == "tapa":
        return solido("XY", u, v, H - 1)
    if cara == "fondo":
        return solido("XY", u, v, -esp - 1)
    return None


def generar(ruta):
    with open(ruta, encoding="utf-8") as fh:
        d = json.load(fh)
    I, p = d["interior"], d["p"]
    L, W, H, e = float(I["L"]), float(I["W"]), float(I["H"]), float(p["espesor"])
    base = caja(-e, -e, -e, L + 2 * e, W + 2 * e, H + e).cut(caja(0, 0, 0, L, W, H + 1))
    tapa = caja(-e, -e, H, L + 2 * e, W + 2 * e, e)
    for el in d.get("elementos", []):
        try:
            s = figura_en_cara(el, d, L, W, H, e)
            if s is None:
                continue
            if el["cara"] == "tapa":
                tapa = tapa.cut(s)
            else:
                base = base.cut(s)
        except Exception as ex:   # un elemento raro no debe tumbar todo el ensamble
            print(f"  ✗ elemento {el.get('ref')}: {ex}")
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
