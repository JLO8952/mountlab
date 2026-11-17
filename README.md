# MountLab

Biblioteca de componentes, catálogo y proyectos de John Fredy Correa. Une **MountLab Catalog** (antes *Controladores*) y **MountLab Library** en una sola app web que se abre desde PC, tablet o celular.

| Parte | Dónde vive |
|---|---|
| App web (HTML/JS, sin servidor) | `index.html`, `app/` → publicada en GitHub Pages |
| Fichas de componentes (1 JSON por componente) | `data/componentes/` |
| Proyectos con su BOM | `data/proyectos/` |
| Datos descargados por aprobar | `data/pendientes/` |
| Tablas (tornillos, insertos, materiales, cables) | `data/tablas/` |
| Todo junto para la app (lo genera la Action) | `data/db.json` y `data/db.js` (para abrir `index.html` con doble clic) |
| Fotos e imágenes pequeñas | `img/` |
| Archivos pesados (STEP, DXF) | Google Drive → `MountLab/biblioteca/archivos/<id>/` |
| Generador CAD (CadQuery + ezdxf) | `cad/regenerar.py` |

## Convenciones de montaje
- Unidades en **mm**. **Origen (0,0) en el centro de la placa**; X a lo largo, Y a lo ancho, Z hacia arriba desde la cara inferior del PCB.
- `montaje.pcb = [largo, ancho, espesor]`, `montaje.agujeros = [{x, y, d}]`.
- `zonas = [{tipo, nombre, cx, cy, w, h, z:[desde, hasta], salida, holgura, regla}]`; `salida` ∈ `+Z, -Z, +X, -X, +Y, -Y`.
- `pines = [{n, func, x, y, conector}]` (x/y = null si aún no está ubicado).
- Cada cambio de geometría sube `version` y deja una entrada en `historial`; además queda el commit en git.

## Cómo fluye un cambio
1. En la web editas agujeros/zonas/pines y pulsas **Guardar** → la app hace un commit del JSON (con tu token).
2. La GitHub Action **“Datos, CAD y publicación”**:
   - genera `<id>_v<N>_huella.dxf` y `<id>_v<N>_montaje.step` (versión nueva, no borra las anteriores),
   - los sube a Drive con rclone (si existe el secreto `RCLONE_CONFIG`; si no, quedan en `archivos/` del repo),
   - actualiza `data/db.json` y vuelve a publicar la web.
3. Drive para escritorio los baja a `D:\Mi unidad\MountLab\biblioteca\archivos\<id>\` y los abres en SolidWorks.

## Puesta en marcha
1. Crear el repositorio `mountlab` y subir esta carpeta.
2. **Settings → Pages → Source: GitHub Actions** (gratis si el repo es público; en privado requiere GitHub Pro).
3. Crear un token *fine-grained* solo para este repo con **Contents: Read and write** y **Actions: Read and write**, y pegarlo en la app (Ajustes). Se guarda solo en ese dispositivo.
4. Archivos CAD en el PC (Drive): ejecutar una vez `tools/windows/instalar_sincronizador.ps1` (clic derecho → *Ejecutar con PowerShell*).
   Crea la tarea programada **"MountLab - sincronizar archivos CAD"**, que cada 10 minutos baja de `archivos/` los DXF/STEP nuevos a
   `D:\Mi unidad\MountLab\biblioteca\archivos\`; Drive para escritorio los sube a la nube. Registro: `%LOCALAPPDATA%\MountLab\sincronizar.log`.
   (Alternativa: secreto `RCLONE_CONFIG` para que la Action suba directo a Drive; requiere un client_id propio de Google.)
5. (Opcional) Asistente IA: clave de console.anthropic.com en Ajustes.

## Comandos locales
```bash
python tools/build_db.py                 # reconstruye data/db.json
pip install cadquery ezdxf
python cad/regenerar.py esp32_38p        # regenera un componente
python cad/regenerar.py --todos
python -m http.server 8000               # ver la app en http://localhost:8000
```
