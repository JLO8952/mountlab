# -*- coding: utf-8 -*-
"""Reúne todos los JSON de data/ en data/db.json (lo que carga la app web).
Uso: python tools/build_db.py   (lo ejecuta también la GitHub Action en cada cambio)."""
import json, os, glob, datetime

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(RAIZ, "data")


def leer(carpeta):
    out = []
    for f in sorted(glob.glob(os.path.join(D, carpeta, "*.json"))):
        with open(f, encoding="utf-8") as fh:
            out.append(json.load(fh))
    return out


def main():
    tablas = {}
    for f in sorted(glob.glob(os.path.join(D, "tablas", "*.json"))):
        with open(f, encoding="utf-8") as fh:
            tablas[os.path.splitext(os.path.basename(f))[0]] = json.load(fh)
    db = {
        "formato": "mountlab-db",
        "version": 2,
        "generado": datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "componentes": leer("componentes"),
        "proyectos": leer("proyectos"),
        "pendientes": leer("pendientes"),
        "tablas": tablas,
    }
    with open(os.path.join(D, "db.json"), "w", encoding="utf-8") as fh:
        json.dump(db, fh, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(D, "db.js"), "w", encoding="utf-8") as fh:  # para abrir index.html con doble clic
        fh.write("window.ML_DB=" + json.dumps(db, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print(f"db.json: {len(db['componentes'])} componentes, {len(db['proyectos'])} proyectos, "
          f"{len(db['pendientes'])} pendientes")


if __name__ == "__main__":
    main()
