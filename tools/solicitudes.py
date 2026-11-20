"""MountLab · STEP/DXF bajo demanda para las familias del anexo de pasivos.

La app deja una solicitud en data/solicitudes/<id>.json; aquí se marca el componente con
"cad_pendiente" para que cad/regenerar.py genere sus archivos, y se le pone fecha de vencimiento.
Los archivos de las familias del anexo se borran solos a los DIAS días para no ocupar espacio.
"""
import datetime, glob, json, os, shutil

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIAS = 7
hoy = datetime.date.today()


def cargar(ruta):
    with open(ruta, encoding="utf-8") as fh:
        return json.load(fh)


def guardar(ruta, c):
    with open(ruta, "w", encoding="utf-8") as fh:
        json.dump(c, fh, ensure_ascii=False, indent=1)
        fh.write("\n")


# 1) solicitudes nuevas
for sol in sorted(glob.glob(os.path.join(RAIZ, "data/solicitudes/*.json"))):
    try:
        s = cargar(sol)
        cid = s.get("id") or os.path.basename(sol)[:-5]
        ruta = os.path.join(RAIZ, "data/componentes", f"{cid}.json")
        if os.path.exists(ruta):
            c = cargar(ruta)
            c["cad_pendiente"] = True
            if c.get("anexo"):
                c["bajo_demanda_vence"] = (hoy + datetime.timedelta(days=DIAS)).isoformat()
            guardar(ruta, c)
            print(f"→ {cid}: STEP/DXF solicitado")
        else:
            print(f"✗ solicitud para {cid}: no existe el componente")
    except Exception as e:
        print(f"✗ {sol}: {e}")
    os.remove(sol)

# 2) limpieza de archivos vencidos (solo familias del anexo)
for ruta in sorted(glob.glob(os.path.join(RAIZ, "data/componentes/*.json"))):
    c = cargar(ruta)
    v = c.get("bajo_demanda_vence")
    if not (c.get("anexo") and v and v < hoy.isoformat() and not c.get("cad_pendiente")):
        continue
    carpeta = os.path.join(RAIZ, "archivos", c["id"])
    if os.path.isdir(carpeta):
        shutil.rmtree(carpeta)
    c["archivos"] = {k: x for k, x in (c.get("archivos") or {}).items() if k == "datasheet"}
    c.pop("bajo_demanda_vence", None)
    guardar(ruta, c)
    print(f"🧹 {c['id']}: archivos bajo demanda vencidos, borrados")
