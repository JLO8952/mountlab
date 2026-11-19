# MountLab

Biblioteca de componentes, catálogo y proyectos de John Fredy Correa. Une **MountLab Catalog** (antes *Controladores*) y **MountLab Library** en una sola app web que se abre desde PC, tablet o celular.

| Parte | Dónde vive |
|---|---|
| App web (HTML/JS, sin servidor) | `index.html`, `app/` → publicada en GitHub Pages |
| Fichas de componentes (1 JSON por componente) | `data/componentes/` |
| Proyectos con su BOM | `data/proyectos/` |
| Datos descargados por aprobar | `data/pendientes/` |
| Registro de invitaciones (sin secretos) | `data/accesos/` |
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
   - genera `<id>_v<N>_huella.dxf`, `<id>_v<N>_montaje.step` y `<id>_v<N>_plano.dxf` (versión nueva, no borra las anteriores),
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

## Modelo 3D (pestaña de cada componente)
Se dibuja en 2D (vista superior) con formas simples y plantillas; la vista 3D (three.js, en `app/vendor/`) se actualiza en vivo.
- Placa (rectangular, esquinas redondeadas, redonda), espesor y agujeros; **cara A / cara B**; elevación y altura en Z.
- Librería paramétrica (`app/plantillas.js`): conectores, chips, pasivos, interfaz, potencia, accesorios y formas libres; **Mis plantillas** en `data/plantillas/`.
- Al editar se sincronizan solos: `montaje` (placa y alturas), `zonas` automáticas (`auto: true`), `pines` automáticos (`pieza`), y `modelo.cuerpos`, que `cad/regenerar.py` convierte en un STEP con cada pieza y su color (y capas PIEZAS_A/B en el DXF).

- **Fase 3:** en celular y tablet hay botones ☑ Multi (selección múltiple), ⬚ Área y ⊕ Colocar varias; se acerca pellizcando. Con varias piezas: alinear (izq., centro, der., arriba, abajo) y distribuir en X/Y. Las plantillas propias se renombran (✎).
- **Fase 4 · tipos de base:** placa, prisma/caja, cilindro, **motor DC** (130, N20, 370, TT) y **servo** (SG90, MG90S, MG996R) con sus medidas típicas editables, agujeros de las orejas y zonas automáticas (cable del servo, terminales del motor). La altura de la base reemplaza al espesor; las piezas de la cara A van encima y las de la B debajo. El STEP une las primitivas de la base y corta los agujeros.

## Plano de taller (`<id>_v<N>_plano.dxf`)
Vista superior, frontal y lateral izquierda (ISO-E, primer diedro) a escala 1:1 en mm, con cotas generales (largo, ancho, alto total, espesor de placa, distancia entre agujeros extremos), llamadas de agujeros (`4x Ø3 pasante`), ejes y cajetín (nombre, id, versión, fecha, escala, origen, envolvente). Capas: CONTORNO, PIEZAS, OCULTAS, CENTRO, COTAS, TEXTO, MARCO.

## Interfaz
- Tema oscuro, barra lateral (barra inferior en el celular), **Inicio** con indicadores, sugerencias y salud de la biblioteca.
- **Ctrl+K** (o `/`): buscador global de componentes, proyectos, acciones y botones de la pantalla; también entiende órdenes.
- **Ctrl+J** o ✦: el asistente está en todas las ventanas, en un panel lateral.

## Asistente
- **Agente de la interfaz** (`app/agent.js`): conoce las acciones de la app y todos los botones visibles; aprende tus hábitos (qué pulsas en cada pantalla y qué haces después, en `localStorage`) y **predice** lo siguiente (chips en el panel y burbuja junto a ✦). Entiende órdenes sin internet: “abre el bme280”, “pasa a la cara B”, “coloca un header de 4 pines”, “exporta el BOM”, “busca I2C”. La IA de la nube también puede pedir acciones con bloques `mountlab-accion` (lo que modifica datos pide confirmación).
- **Archivos en el chat** (`app/archivos.js`): 📎 adjuntar, 📷 cámara del celular, arrastrar o pegar una **foto** o un **datasheet PDF**. El PDF se lee en el navegador (pdf.js en `app/vendor/pdfjs`). Sin internet, el lector local saca referencia, fabricante, voltaje, corriente, interfaz, dirección I2C, temperatura, encapsulado, medidas (también de tablas A/B/C Mín/Típ/Máx) y pines. Con Claude o Gemini, la IA lee el PDF o la foto completos y busca en la web lo que falte. En ambos casos sale una **propuesta**; al aprobarla se crea el componente con su ficha, la foto, la copia del PDF (`archivos/<id>/<id>_datasheet.pdf`) y un **modelo 3D** (placa o prisma con las medidas), y GitHub genera DXF de huella, STEP y plano. Si el componente ya existe, solo completa lo que le falta.
- **⚡ Cerebro local** (`app/local.js`, sin internet ni clave): búsqueda TF-IDF tolerante a errores, red neuronal pequeña (trigramas de letras) entrenada en el navegador con la biblioteca, respuestas por plantilla (voltaje, pines, medidas, precios…), comandos `aprende: alias = componente` / `olvida: alias` / `revisa proyecto X`, y un **sistema experto** que revisa cada proyecto (direcciones I2C, niveles 3.3/5 V, consumo, servos, baterías sin protección, GSM, ADC2).
- **☁ Nube** (Claude, Gemini u OpenAI): investiga en internet y propone fichas para aprobar. En modo **Automático** responde local y solo usa la nube cuando no sabe o le pides investigar.

## Acceso restringido (`app/auth.js`)
- Contraseña de dueño por dispositivo. El token de GitHub y las claves de IA se guardan **cifrados** (PBKDF2-SHA256 250 000 iteraciones → AES-GCM 256); en claro no queda ninguna clave.
- Bloqueo manual (🔒) y automático por inactividad (5 min a 4 h, o nunca). Cambiar contraseña en Ajustes. Si se olvida, se borra la bóveda de ese dispositivo y se vuelven a pegar las claves (los datos están en GitHub).
- **Invitaciones:** Ajustes → Acceso → *Invitar*. Se genera un enlace (`#/invitacion/<código>`) y un PIN de 8 caracteres que se envían por canales distintos. El código lleva cifrados el repositorio, el rol (solo lectura / edición), el vencimiento y, opcionalmente, un token de GitHub para esa persona. El registro sin secretos queda en `data/accesos/<id>.json`; revocarlo o dejarlo vencer le quita el acceso la próxima vez que abra la app (revoca también su token en GitHub).
- **Límite:** con el repositorio público los JSON siguen siendo legibles en GitHub. Para ocultarlos: repositorio privado (Pages privado requiere GitHub Pro) o publicar la base cifrada.

## Comandos locales
```bash
python tools/build_db.py                 # reconstruye data/db.json
pip install cadquery ezdxf
python cad/regenerar.py esp32_38p        # regenera un componente
python cad/regenerar.py --todos
python -m http.server 8000               # ver la app en http://localhost:8000
```
