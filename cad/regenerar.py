# -*- coding: utf-8 -*-
"""MountLab · regenera los archivos CAD de montaje de los componentes.

Para cada componente genera una VERSIÓN NUEVA (no borra las anteriores):
  <id>_v<N>_huella.dxf   planta con origen al centro: PCB, AGUJEROS, ZONAS, ZONAS_HOLGURA, PINES, EJES, TEXTO
  <id>_v<N>_montaje.step placa con agujeros + volúmenes de zonas + volúmenes de holgura (para detectar choques en SolidWorks)

Uso:
  python cad/regenerar.py                 -> componentes con "cad_pendiente": true
  python cad/regenerar.py esp32_38p bme680
  python cad/regenerar.py --todos

Destino:
  - Si existe la variable DRIVE_REMOTE (p. ej. "gdrive:MountLab/biblioteca/archivos") sube con rclone a <remoto>/<id>/
    y guarda en el JSON el id y el enlace de Drive.
  - Si no, deja los archivos en el repositorio, en archivos/<id>/.
"""
import json, os, sys, glob, subprocess, datetime

import ezdxf
import cadquery as cq

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DCOMP = os.path.join(RAIZ, "data", "componentes")
SALIDA = os.path.join(RAIZ, "archivos")
REMOTO = os.environ.get("DRIVE_REMOTE", "").strip()

COLOR = {"usb": "#38bdf8", "conector": "#a78bfa", "antena": "#f472b6", "boton": "#fbbf24", "pines": "#94a3b8",
         "calor": "#f87171", "sensor": "#34d399", "ajuste": "#fb923c", "led": "#facc15", "soldadura": "#e2e8f0",
         "prohibida": "#ef4444", "otra": "#cbd5e1"}
ACI = {"PCB": 3, "AGUJEROS": 1, "ZONAS": 4, "ZONAS_HOLGURA": 8, "PINES": 2, "EJES": 3, "TEXTO": 7, "PIEZAS_A": 5, "PIEZAS_B": 6}


def hex_rgb(h, a=1.0):
    h = h.lstrip("#")
    return cq.Color(int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255, a)


def ascii(s):
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFD", str(s)) if unicodedata.category(c) != "Mn").encode("ascii", "replace").decode()


def holgura_box(z):
    """Volumen libre hacia donde sale el cable/conector: (cx, cy, z0, w, h, alto)."""
    g = float(z.get("holgura") or 0)
    if g <= 0:
        return None
    z0, z1 = (z.get("z") or [0, 1])[:2]
    cx, cy, w, h = z["cx"], z["cy"], z["w"], z["h"]
    s = z.get("salida", "+Z")
    if s == "-X": return (cx - w / 2 - g / 2, cy, z0, g, h, z1 - z0)
    if s == "+X": return (cx + w / 2 + g / 2, cy, z0, g, h, z1 - z0)
    if s == "-Y": return (cx, cy - h / 2 - g / 2, z0, w, g, z1 - z0)
    if s == "+Y": return (cx, cy + h / 2 + g / 2, z0, w, g, z1 - z0)
    if s == "+Z": return (cx, cy, z1, w, h, g)
    if s == "-Z": return (cx, cy, z0 - g, w, h, g)
    return None


def dxf(c, ruta):
    doc = ezdxf.new("R2010", setup=True)
    doc.units = ezdxf.units.MM
    for n, col in ACI.items():
        doc.layers.add(n, color=col, linetype="DASHED" if n == "ZONAS_HOLGURA" else "Continuous")
    msp = doc.modelspace()
    m = c["montaje"]
    L, W = m["pcb"][0], m["pcb"][1]

    def rect(cx, cy, w, h, layer):
        msp.add_lwpolyline([(cx - w / 2, cy - h / 2), (cx + w / 2, cy - h / 2), (cx + w / 2, cy + h / 2), (cx - w / 2, cy + h / 2)],
                           close=True, dxfattribs={"layer": layer})

    if m.get("forma") == "redonda":
        msp.add_circle((0, 0), L / 2, dxfattribs={"layer": "PCB"})
    else:
        rect(0, 0, L, W, "PCB")
    e = max(L, W) * 0.08
    msp.add_line((-e, 0), (e, 0), dxfattribs={"layer": "EJES"})
    msp.add_line((0, -e), (0, e), dxfattribs={"layer": "EJES"})
    for h in m.get("agujeros", []):
        msp.add_circle((h["x"], h["y"]), h["d"] / 2, dxfattribs={"layer": "AGUJEROS"})
    for z in c.get("zonas", []):
        rect(z["cx"], z["cy"], z["w"], z["h"], "ZONAS")
        hb = holgura_box(z)
        if hb and z.get("salida") in ("-X", "+X", "-Y", "+Y"):
            rect(hb[0], hb[1], hb[3], hb[4], "ZONAS_HOLGURA")
        msp.add_text(ascii(z.get("nombre") or z["tipo"]), height=0.8, dxfattribs={"layer": "TEXTO"}).set_placement((z["cx"] - z["w"] / 2, z["cy"] + z["h"] / 2 + 0.4))
    for q in (c.get("modelo") or {}).get("cuerpos", []):
        capa = "PIEZAS_A" if q["z0"] >= m["pcb"][2] - 1e-6 else "PIEZAS_B"
        if q["f"] == "cil":
            msp.add_circle((q["cx"], q["cy"]), q["d"] / 2, dxfattribs={"layer": capa})
        else:
            rect(q["cx"], q["cy"], q["w"], q["h"], capa)
    for p in c.get("pines", []):
        if p.get("x") is None or p.get("y") is None:
            continue
        msp.add_circle((p["x"], p["y"]), 0.5, dxfattribs={"layer": "PINES"})
        msp.add_text(ascii(p["n"]), height=0.6, dxfattribs={"layer": "TEXTO"}).set_placement((p["x"] + 0.7, p["y"] + 0.7))
    msp.add_text(ascii(f"{c['id']} v{c.get('version', 1)} - origen al centro (mm)"), height=1.5,
                 dxfattribs={"layer": "TEXTO"}).set_placement((-L / 2, -W / 2 - 3))
    doc.saveas(ruta)


def placa_solida(m):
    L, W, T = m["pcb"][0], m["pcb"][1], (m["pcb"][2] if len(m["pcb"]) > 2 else 1.6)
    forma = m.get("forma", "rect")
    if forma == "redonda":
        return cq.Workplane("XY").circle(L / 2).extrude(T)
    pcb = cq.Workplane("XY").box(L, W, T, centered=(True, True, False))
    r = float(m.get("radio") or 0)
    if forma == "redondeada" and r > 0.05:
        pcb = pcb.edges("|Z").fillet(min(r, L / 2 - 0.05, W / 2 - 0.05))
    return pcb


def cuerpo_solido(q):
    alto = max(q["z1"] - q["z0"], 0.05)
    if q["f"] == "cil":
        s = cq.Workplane("XY").circle(q["d"] / 2).extrude(alto)
    else:
        s = cq.Workplane("XY").box(max(q["w"], 0.05), max(q["h"], 0.05), alto, centered=(True, True, False))
        r = float(q.get("r") or 0)
        if r > 0.05:
            try:
                s = s.edges("|Z").fillet(min(r, q["w"] / 2 - 0.02, q["h"] / 2 - 0.02))
            except Exception:
                pass
    return s.translate((q["cx"], q["cy"], q["z0"]))


def step(c, ruta):
    m = c["montaje"]
    L, W, T = m["pcb"][0], m["pcb"][1], (m["pcb"][2] if len(m["pcb"]) > 2 else 1.6)
    pcb = placa_solida(m)
    for h in m.get("agujeros", []):
        pcb = pcb.cut(cq.Workplane("XY").center(h["x"], h["y"]).circle(h["d"] / 2).extrude(T))
    a = cq.Assembly(name=c["id"])
    mod = c.get("modelo") or {}
    col_placa = (mod.get("base") or {}).get("color") or "#14662f"
    a.add(pcb, name="PCB", color=hex_rgb(col_placa))
    # piezas del Modelo 3D (cada una con su color), agrupadas por pieza
    nombres = {p.get("id"): p.get("nombre") or p.get("plantilla") for p in mod.get("piezas", [])}
    cont = {}
    for q in mod.get("cuerpos", []):
        pid = q.get("pieza", "pieza")
        cont[pid] = cont.get(pid, 0) + 1
        nom = ascii(f"{'A' if q['z0'] >= T - 1e-6 else 'B'}_{nombres.get(pid, pid)}_{cont[pid]}").replace(" ", "_")[:60]
        try:
            a.add(cuerpo_solido(q), name=nom, color=hex_rgb(q.get("color") or "#64748b"))
        except Exception as e:
            print(f"  (pieza {nom} omitida: {e})")
    for i, z in enumerate(c.get("zonas", [])):
        z0, z1 = (z.get("z") or [T, T + 1])[:2]
        alto = max(z1 - z0, 0.2)
        col = COLOR.get(z.get("tipo"), COLOR["otra"])
        b = cq.Workplane("XY").box(max(z["w"], 0.1), max(z["h"], 0.1), alto, centered=(True, True, False)).translate((z["cx"], z["cy"], z0))
        nombre = ascii(f"Z{i + 1:02d}_{z.get('tipo', 'zona')}_{z.get('nombre', '')}").replace(" ", "_")[:60]
        a.add(b, name=nombre, color=hex_rgb(col, 0.45))
        hb = holgura_box(z)
        if hb:
            cx, cy, zz, w, h, al = hb
            hv = cq.Workplane("XY").box(max(w, 0.1), max(h, 0.1), max(al, 0.1), centered=(True, True, False)).translate((cx, cy, zz))
            a.add(hv, name=f"H{i + 1:02d}_holgura_{z.get('salida', '')}".replace("+", "p").replace("-", "m"), color=hex_rgb(col, 0.15))
    a.export(ruta)


def rclone(*args):
    return subprocess.run(["rclone", *args], check=True, capture_output=True, text=True).stdout


def procesar(ruta_json):
    with open(ruta_json, encoding="utf-8") as f:
        c = json.load(f)
    m = c.get("montaje")
    if not m or not m.get("pcb"):
        print(f"- {c['id']}: sin montaje, se omite")
        c.pop("cad_pendiente", None)
        return c, ruta_json
    v = c.get("version", 1)
    carpeta = os.path.join(SALIDA, c["id"])
    os.makedirs(carpeta, exist_ok=True)
    n_dxf, n_step = f"{c['id']}_v{v}_huella.dxf", f"{c['id']}_v{v}_montaje.step"
    dxf(c, os.path.join(carpeta, n_dxf))
    step(c, os.path.join(carpeta, n_step))
    arch = c.setdefault("archivos", {})
    fecha = datetime.date.today().isoformat()
    if REMOTO:
        destino = f"{REMOTO}/{c['id']}"
        rclone("copy", carpeta, destino, "--include", f"*_v{v}_*")
        ids = {x["Name"]: x.get("ID") for x in json.loads(rclone("lsjson", destino))}
        for k, n in (("dxf_huella", n_dxf), ("step_montaje", n_step)):
            arch[k] = {"nombre": n, "version": v, "fecha": fecha, "drive_id": ids.get(n),
                       "url": f"https://drive.google.com/file/d/{ids.get(n)}/view" if ids.get(n) else None,
                       "carpeta": f"MountLab/biblioteca/archivos/{c['id']}"}
        for n in (n_dxf, n_step):  # en Drive: no se guardan en git
            os.remove(os.path.join(carpeta, n))
    else:
        repo = os.environ.get("GITHUB_REPOSITORY", "")
        for k, n in (("dxf_huella", n_dxf), ("step_montaje", n_step)):
            arch[k] = {"nombre": n, "version": v, "fecha": fecha, "carpeta": f"archivos/{c['id']} (repositorio)",
                       "url": f"https://github.com/{repo}/raw/main/archivos/{c['id']}/{n}" if repo else f"archivos/{c['id']}/{n}"}
    c.pop("cad_pendiente", None)
    print(f"✓ {c['id']} v{v}: {n_dxf}, {n_step}" + (f" → {REMOTO}" if REMOTO else " → archivos/"))
    return c, ruta_json


def main(args):
    todos = sorted(glob.glob(os.path.join(DCOMP, "*.json")))
    if "--todos" in args:
        sel = todos
    elif args:
        sel = [os.path.join(DCOMP, f"{a}.json") for a in args if a]
    else:
        sel = []
        for f in todos:
            with open(f, encoding="utf-8") as fh:
                if json.load(fh).get("cad_pendiente"):
                    sel.append(f)
    if not sel:
        print("Nada que regenerar.")
        return 0
    errores = 0
    for f in sel:
        try:
            c, ruta = procesar(f)
            with open(ruta, "w", encoding="utf-8") as fh:
                json.dump(c, fh, ensure_ascii=False, indent=1)
                fh.write("\n")
        except Exception as e:  # sigue con los demás
            errores += 1
            print(f"✗ {os.path.basename(f)}: {e}")
    return 1 if errores else 0


if __name__ == "__main__":
    sys.exit(main([a for a in sys.argv[1:] if a.strip()]))
