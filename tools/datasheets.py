# -*- coding: utf-8 -*-
"""MountLab · guarda una copia en PDF del datasheet de cada componente.

Para cada componente con ficha.datasheet (URL) que todavía no tenga copia de ESA URL,
descarga el archivo a archivos/<id>/<id>_datasheet.pdf y lo registra en archivos.datasheet.
El sincronizador del PC lo baja a D:\\Mi unidad\\MountLab\\biblioteca\\archivos\\<id>\\.
Si la página no entrega un PDF (bloqueo, página HTML, etc.) lo anota y sigue con los demás.
"""
import json, os, glob, datetime, urllib.request, urllib.error

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DCOMP = os.path.join(RAIZ, "data", "componentes")
SALIDA = os.path.join(RAIZ, "archivos")
MAX = 30 * 1024 * 1024
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"


def bajar(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/pdf,*/*"})
    with urllib.request.urlopen(req, timeout=60) as r:
        datos = r.read(MAX + 1)
    if len(datos) > MAX:
        raise ValueError("más de 30 MB")
    if not datos.startswith(b"%PDF"):
        raise ValueError("la dirección no entrega un PDF directo (es una página web)")
    return datos


def main():
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    hechos = errores = 0
    for f in sorted(glob.glob(os.path.join(DCOMP, "*.json"))):
        with open(f, encoding="utf-8") as fh:
            c = json.load(fh)
        url = ((c.get("ficha") or {}).get("datasheet") or "").strip()
        if not url.startswith("http"):
            continue
        ya = (c.get("archivos") or {}).get("datasheet") or {}
        if ya.get("subido"):
            continue  # John subió el PDF desde el chat: esa copia manda
        if ya.get("fuente") == url:
            continue  # ya hay copia de esta misma URL (o ya se intentó)
        nombre = f"{c['id']}_datasheet.pdf"
        try:
            datos = bajar(url)
            os.makedirs(os.path.join(SALIDA, c["id"]), exist_ok=True)
            with open(os.path.join(SALIDA, c["id"], nombre), "wb") as out:
                out.write(datos)
            c.setdefault("archivos", {})["datasheet"] = {
                "nombre": nombre, "fuente": url, "fecha": datetime.date.today().isoformat(),
                "carpeta": f"archivos/{c['id']} (repositorio)",
                "url": f"https://github.com/{repo}/raw/main/archivos/{c['id']}/{nombre}" if repo else f"archivos/{c['id']}/{nombre}",
                "kb": round(len(datos) / 1024)}
            hechos += 1
            print(f"✓ {c['id']}: {round(len(datos) / 1024)} KB")
        except Exception as e:  # se registra para no reintentar en cada ejecución
            c.setdefault("archivos", {})["datasheet"] = {"fuente": url, "error": str(e)[:160], "fecha": datetime.date.today().isoformat()}
            errores += 1
            print(f"✗ {c['id']}: {e}")
        with open(f, "w", encoding="utf-8") as fh:
            json.dump(c, fh, ensure_ascii=False, indent=1)
            fh.write("\n")
    print(f"Datasheets: {hechos} copiados, {errores} sin copia")


if __name__ == "__main__":
    main()
