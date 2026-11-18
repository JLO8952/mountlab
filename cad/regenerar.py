# -*- coding: utf-8 -*-
"""MountLab · regenera los archivos CAD de montaje de los componentes.

Para cada componente genera una VERSIÓN NUEVA (no borra las anteriores):
  <id>_v<N>_huella.dxf   planta con origen al centro: PCB, AGUJEROS, ZONAS, ZONAS_HOLGURA, PINES, EJES, TEXTO
  <id>_v<N>_montaje.step placa con agujeros + volúmenes de zonas + volúmenes de holgura (para detectar choques en SolidWorks)
  <id>_v<N>_plano.dxf    plano de taller: vistas superior, frontal y lateral (ISO-E), cotas generales, agujeros y cajetín

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
        capa = "PCB" if q.get("base") else "PIEZAS_A" if q["z0"] >= m["pcb"][2] - 1e-6 else "PIEZAS_B"
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


# ---------------------------------------------------------------- plano de taller
def _cajas(c):
    """Cuerpos para el plano: la base y las piezas, como (x0, x1, y0, y1, z0, z1, es_cil, cx, cy, d)."""
    m = c["montaje"]
    L, W, T = m["pcb"][0], m["pcb"][1], (m["pcb"][2] if len(m["pcb"]) > 2 else 1.6)
    out = []
    cuerpos = (c.get("modelo") or {}).get("cuerpos", [])
    if not (m.get("base_tipo") in ("motor", "servo") and base_cuerpos(c)):
        red = m.get("forma") == "redonda"
        out.append({"x0": -L / 2, "x1": L / 2, "y0": -W / 2, "y1": W / 2, "z0": 0.0, "z1": T, "cil": red, "cx": 0, "cy": 0, "d": L, "base": True, "r": m.get("radio") or 0})
    if not cuerpos:   # sin Modelo 3D: las zonas dan el volumen de lo que va montado sobre/bajo la placa
        for z in c.get("zonas", []):
            z0, z1 = (z.get("z") or [T, T + 1])[:2]
            if z1 - z0 > 0.05 and z.get("w") and z.get("h"):
                out.append({"x0": z["cx"] - z["w"] / 2, "x1": z["cx"] + z["w"] / 2, "y0": z["cy"] - z["h"] / 2, "y1": z["cy"] + z["h"] / 2, "z0": z0, "z1": z1, "cil": False, "cx": z["cx"], "cy": z["cy"], "base": False})
    for q in cuerpos:
        if q["f"] == "cil":
            r = q["d"] / 2
            out.append({"x0": q["cx"] - r, "x1": q["cx"] + r, "y0": q["cy"] - r, "y1": q["cy"] + r, "z0": q["z0"], "z1": q["z1"], "cil": True, "cx": q["cx"], "cy": q["cy"], "d": q["d"], "base": bool(q.get("base"))})
        else:
            out.append({"x0": q["cx"] - q["w"] / 2, "x1": q["cx"] + q["w"] / 2, "y0": q["cy"] - q["h"] / 2, "y1": q["cy"] + q["h"] / 2, "z0": q["z0"], "z1": q["z1"], "cil": False, "cx": q["cx"], "cy": q["cy"], "base": bool(q.get("base")), "r": q.get("r") or 0, "orejas": bool(q.get("orejas"))})
    return out


def _z_agujero(c, h, cajas):
    for q in cajas:
        if q.get("orejas") and q["x0"] <= h["x"] <= q["x1"] and q["y0"] <= h["y"] <= q["y1"]:
            return q["z0"], q["z1"]
    T = c["montaje"]["pcb"][2] if len(c["montaje"]["pcb"]) > 2 else 1.6
    return 0.0, T


def plano(c, ruta):
    """Vistas superior, frontal y lateral (ISO-E, primer diedro) con cotas generales, agujeros y cajetín. 1:1 en mm."""
    doc = ezdxf.new("R2010", setup=True)
    doc.units = ezdxf.units.MM
    capas = {"CONTORNO": (7, "Continuous"), "PIEZAS": (5, "Continuous"), "OCULTAS": (8, "DASHED"), "CENTRO": (1, "CENTER"),
             "COTAS": (2, "Continuous"), "TEXTO": (7, "Continuous"), "MARCO": (7, "Continuous")}
    for n, (col, lt) in capas.items():
        doc.layers.add(n, color=col, linetype=lt)
    msp = doc.modelspace()
    m = c["montaje"]
    cajas = _cajas(c)
    hs = m.get("agujeros", [])
    X0, X1 = min(q["x0"] for q in cajas), max(q["x1"] for q in cajas)
    Y0, Y1 = min(q["y0"] for q in cajas), max(q["y1"] for q in cajas)
    Z0, Z1 = min(q["z0"] for q in cajas), max(q["z1"] for q in cajas)
    tam = max(X1 - X0, Y1 - Y0, Z1 - Z0, 10)
    th = round(max(1.2, min(5.0, tam / 40)), 1)       # alto de texto y flechas
    g = max(12.0, tam * 0.35) + 4 * th                 # separación entre vistas (deja sitio a las cotas)
    ov = {"dimtxt": th, "dimasz": th * 0.9, "dimexe": th * 0.6, "dimexo": th * 0.5, "dimgap": th * 0.35, "dimdec": 2, "dimzin": 8, "dimdsep": 46, "dimlunit": 2, "dimlfac": 1, "dimpost": ""}
    lt_scale = max(0.3, th / 2.5)

    def poly(pts, layer, close=True):
        msp.add_lwpolyline(pts, close=close, dxfattribs={"layer": layer, "ltscale": lt_scale})

    def rect(x0, y0, x1, y1, layer):
        poly([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], layer)

    def line(a, b, layer):
        msp.add_line(a, b, dxfattribs={"layer": layer, "ltscale": lt_scale})

    def texto(t, x, y, h=None, align=None, layer="TEXTO"):
        e = msp.add_text(ascii(t), height=h or th, dxfattribs={"layer": layer})
        if align:
            e.set_placement((x, y), align=align)
        else:
            e.set_placement((x, y))
        return e

    def cota(p1, p2, base, angle=0):
        try:
            d = msp.add_linear_dim(base=base, p1=p1, p2=p2, angle=angle, dimstyle="EZDXF", override=ov, dxfattribs={"layer": "COTAS"})
            d.render()
        except Exception as e:  # una cota que no se pueda dibujar no detiene el plano
            print(f"  (cota omitida: {e})")

    from ezdxf.enums import TextEntityAlignment as TA

    # ---- VISTA FRONTAL (X-Z): origen del dibujo = origen de la pieza
    oyF = 0.0
    for q in cajas:
        rect(q["x0"], q["z0"] + oyF, q["x1"], q["z1"] + oyF, "CONTORNO" if q["base"] else "PIEZAS")
    for h in hs:
        za, zb = _z_agujero(c, h, cajas)
        for xx in (h["x"] - h["d"] / 2, h["x"] + h["d"] / 2):
            line((xx, za + oyF), (xx, zb + oyF), "OCULTAS")
        line((h["x"], za - th + oyF), (h["x"], zb + th + oyF), "CENTRO")
    cota((X0, Z0), (X1, Z0), (0, Z0 - 2.5 * th))                         # largo total
    cota((X1, Z0), (X1, Z1), (X1 + 3 * th, 0), angle=90)                  # alto total
    T = m["pcb"][2] if len(m["pcb"]) > 2 else 1.6
    if m.get("base_tipo") not in ("motor", "servo") and abs((Z1 - Z0) - T) > 0.05:
        cota((X0, 0), (X0, T), (X0 - 3 * th, 0), angle=90)                 # espesor de la placa
    texto("VISTA FRONTAL", (X0 + X1) / 2, Z1 + 1.6 * th, th * 1.1, TA.BOTTOM_CENTER)

    # ---- VISTA SUPERIOR (X-Y), debajo de la frontal (primer diedro)
    oyT = Z0 - g - Y1
    for q in sorted(cajas, key=lambda q: q["z1"]):
        lay = "CONTORNO" if q["base"] else "PIEZAS"
        if q["cil"]:
            msp.add_circle((q["cx"], q["cy"] + oyT), q["d"] / 2, dxfattribs={"layer": lay})
        else:
            rect(q["x0"], q["y0"] + oyT, q["x1"], q["y1"] + oyT, lay)
    e = th * 1.5
    line((X0 - e, oyT), (X1 + e, oyT), "CENTRO")
    line((0, Y0 - e + oyT), (0, Y1 + e + oyT), "CENTRO")
    for h in hs:
        msp.add_circle((h["x"], h["y"] + oyT), h["d"] / 2, dxfattribs={"layer": "CONTORNO"})
        r = h["d"] / 2 + th * 0.6
        line((h["x"] - r, h["y"] + oyT), (h["x"] + r, h["y"] + oyT), "CENTRO")
        line((h["x"], h["y"] - r + oyT), (h["x"], h["y"] + r + oyT), "CENTRO")
    cota((X0, Y0 + oyT), (X1, Y0 + oyT), (0, Y0 + oyT - 2.5 * th))
    cota((X0, Y0 + oyT), (X0, Y1 + oyT), (X0 - 3 * th, 0), angle=90)
    if hs:
        xs, ys = sorted({round(h["x"], 3) for h in hs}), sorted({round(h["y"], 3) for h in hs})
        if len(xs) > 1:   # distancia entre agujeros extremos (y de cada agujero al origen)
            cota((xs[0], Y1 + oyT), (xs[-1], Y1 + oyT), (0, Y1 + oyT + 2.5 * th))
        if len(ys) > 1:
            cota((X1, ys[0] + oyT), (X1, ys[-1] + oyT), (X1 + 3 * th, 0), angle=90)
        grupos = {}
        for h in hs:
            grupos.setdefault(round(h["d"], 2), []).append(h)
        yy = Y0 + oyT - 6 * th
        for d, lst in sorted(grupos.items()):
            h0 = lst[0]
            line((h0["x"] + d / 2 * 0.7, h0["y"] + oyT - d / 2 * 0.7), (X0, yy + th * 0.4), "COTAS")
            texto(f"{len(lst)}x  %%c{d:g} pasante" + (f"  ({len(lst)} agujeros)" if len(lst) > 1 else ""), X0, yy, th)
            yy -= th * 1.8
    texto("VISTA SUPERIOR (origen en el centro)", (X0 + X1) / 2, Y1 + oyT + (5.5 if hs else 1.6) * th, th * 1.1, TA.BOTTOM_CENTER)

    # ---- VISTA LATERAL IZQUIERDA (Y-Z), a la derecha de la frontal: u = -y
    oxS = X1 + g + Y1
    for q in cajas:
        rect(oxS - q["y1"], q["z0"], oxS - q["y0"], q["z1"], "CONTORNO" if q["base"] else "PIEZAS")
    for h in hs:
        za, zb = _z_agujero(c, h, cajas)
        for yy2 in (h["y"] - h["d"] / 2, h["y"] + h["d"] / 2):
            line((oxS - yy2, za), (oxS - yy2, zb), "OCULTAS")
    cota((oxS - Y1, Z0), (oxS - Y0, Z0), (oxS, Z0 - 2.5 * th))
    cota((oxS - Y0, Z0), (oxS - Y0, Z1), (oxS - Y0 + 3 * th, 0), angle=90)
    texto("VISTA LATERAL IZQ.", oxS - (Y0 + Y1) / 2, Z1 + 1.6 * th, th * 1.1, TA.BOTTOM_CENTER)

    # ---- cajetín y marco
    bw, bh = max(90.0, 30 * th), 9 * th
    bx1 = max(oxS - Y0 + 6 * th, X0 + bw)
    by0 = oyT + Y0 - 6 * th - (len({round(h['d'], 2) for h in hs}) * 1.8 * th) - bh - 2 * th
    bx0 = bx1 - bw
    rect(bx0, by0, bx1, by0 + bh, "MARCO")
    filas = [f"MountLab  -  {c.get('nombre', c['id'])}", f"ID: {c['id']}    Version: v{c.get('version', 1)}    Fecha: {datetime.date.today().isoformat()}",
             f"Escala 1:1    Unidades: mm    Origen: centro de la {'base' if m.get('base_tipo') in ('motor', 'servo') else 'placa'}",
             f"Envolvente: {X1 - X0:.2f} x {Y1 - Y0:.2f} x {Z1 - Z0:.2f} mm    Proyeccion ISO-E (primer diedro)"]
    for i, f in enumerate(filas):
        texto(f, bx0 + th, by0 + bh - (i + 1) * 2.1 * th, th * (1.15 if i == 0 else 0.9))
    fx0, fy0 = min(X0 - 9 * th, bx0) - 4 * th, by0 - 4 * th
    fx1, fy1 = bx1 + 4 * th, Z1 + 6 * th
    rect(fx0, fy0, fx1, fy1, "MARCO")
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


def base_cuerpos(c):
    return [q for q in (c.get("modelo") or {}).get("cuerpos", []) if q.get("base")]


def base_solida(c):
    """Placa (rect/redondeada/redonda) o, para motores y servos, la unión de sus primitivas; con los agujeros cortados."""
    m = c["montaje"]
    T = m["pcb"][2] if len(m["pcb"]) > 2 else 1.6
    bq = base_cuerpos(c)
    if m.get("base_tipo") in ("motor", "servo") and bq:
        sol = None
        for q in bq:
            sq = cuerpo_solido(q)
            sol = sq if sol is None else sol.union(sq)
        z0, z1 = min(q["z0"] for q in bq) - 1, max(q["z1"] for q in bq) + 1
    else:
        sol, z0, z1 = placa_solida(m), -1, T + 1
    for h in m.get("agujeros", []):
        sol = sol.cut(cq.Workplane("XY").workplane(offset=z0).center(h["x"], h["y"]).circle(h["d"] / 2).extrude(z1 - z0))
    return sol


def step(c, ruta):
    m = c["montaje"]
    L, W, T = m["pcb"][0], m["pcb"][1], (m["pcb"][2] if len(m["pcb"]) > 2 else 1.6)
    pcb = base_solida(c)
    a = cq.Assembly(name=c["id"])
    mod = c.get("modelo") or {}
    col_placa = (mod.get("base") or {}).get("color") or "#14662f"
    a.add(pcb, name="BASE" if m.get("base_tipo") in ("motor", "servo") else "PCB", color=hex_rgb(col_placa))
    # piezas del Modelo 3D (cada una con su color), agrupadas por pieza
    nombres = {p.get("id"): p.get("nombre") or p.get("plantilla") for p in mod.get("piezas", [])}
    cont = {}
    for q in mod.get("cuerpos", []):
        if q.get("base"):
            continue
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
    n_dxf, n_step, n_plano = f"{c['id']}_v{v}_huella.dxf", f"{c['id']}_v{v}_montaje.step", f"{c['id']}_v{v}_plano.dxf"
    dxf(c, os.path.join(carpeta, n_dxf))
    step(c, os.path.join(carpeta, n_step))
    try:
        plano(c, os.path.join(carpeta, n_plano))
    except Exception as e:
        print(f"  (plano omitido: {e})")
        n_plano = None
    pares = [("dxf_huella", n_dxf), ("step_montaje", n_step)] + ([("dxf_plano", n_plano)] if n_plano else [])
    arch = c.setdefault("archivos", {})
    fecha = datetime.date.today().isoformat()
    if REMOTO:
        destino = f"{REMOTO}/{c['id']}"
        rclone("copy", carpeta, destino, "--include", f"*_v{v}_*")
        ids = {x["Name"]: x.get("ID") for x in json.loads(rclone("lsjson", destino))}
        for k, n in pares:
            arch[k] = {"nombre": n, "version": v, "fecha": fecha, "drive_id": ids.get(n),
                       "url": f"https://drive.google.com/file/d/{ids.get(n)}/view" if ids.get(n) else None,
                       "carpeta": f"MountLab/biblioteca/archivos/{c['id']}"}
        for _, n in pares:  # en Drive: no se guardan en git
            os.remove(os.path.join(carpeta, n))
    else:
        repo = os.environ.get("GITHUB_REPOSITORY", "")
        for k, n in pares:
            arch[k] = {"nombre": n, "version": v, "fecha": fecha, "carpeta": f"archivos/{c['id']} (repositorio)",
                       "url": f"https://github.com/{repo}/raw/main/archivos/{c['id']}/{n}" if repo else f"archivos/{c['id']}/{n}"}
    c.pop("cad_pendiente", None)
    print(f"✓ {c['id']} v{v}: {n_dxf}, {n_step}" + (f", {n_plano}" if n_plano else "") + (f" → {REMOTO}" if REMOTO else " → archivos/"))
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
