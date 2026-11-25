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

## Anexo de pasivos (`#/pasivos`)
- **45 familias** generadas por `tools/pasivos.mjs` (`node tools/pasivos.mjs`; `--forzar` para regenerarlas): 25 de resistencias (carbón y película metálica 1/4–1/2 W, óxido metálico 1–3 W, cemento 5/10 W, aluminio 25 W, SMD 0402–2512, shunt de mΩ, red SIP-9, potenciómetro, trimmers, NTC, LDR, varistor, polyfuse) y 20 de capacitores (disco, multicapa THT, MLCC 0402–1210, electrolítico radial y SMD, polímero, tantalio THT/SMD, poliéster, X2, Y1, mica, trimmer, supercapacitores, CBB61).
- Cada familia trae ficha, especificaciones, **valores comerciales** (`valores`: serie E o lista, tolerancias, voltajes…), pines con posición, montaje y modelo 3D con medidas típicas (imagen = render del modelo). La Action genera su DXF, STEP y plano.
- La vista tiene: buscador de valores y códigos (`4k7`, `100n`, `104`, `473J`, `2A104J`, `01C`, `4702`) con bandas de color, códigos SMD/EIA-96, serie E y familias que lo tienen; lector de código de colores de 4/5/6 bandas; calculadoras (LED, divisor, RC); series E3–E96; tablas (tamaños SMD, electrolíticos, dieléctricos, tantalio, EIA-96) y una guía rápida.
- En el BOM, las familias llevan un campo **Valor** (se normaliza: “4k7” → 4.7 kΩ) y sale en el CSV. Tabla de referencia: `data/tablas/pasivos.json`.

## Diagrama de conexiones (pestaña "Diagrama" de cada proyecto, `app/circuito.js`)
- Lienzo 2D: bloques con los pines reales de cada ficha (los grupos como “21, 22” se separan en GPIO21/GPIO22 y cada pin se clasifica: alimentación, tierra, I2C, SPI, UART, analógico, PWM, GPIO, reservado). Fuentes virtuales (USB, LiPo, 18650, pack 2S, fuente de laboratorio, adaptador 12 V), tierra, LED y pulsador.
- Cables con clic pin → pin (o arrastrando), etiquetas de red con doble clic, colores por tipo de red, deshacer/rehacer, ordenar, zoom y pellizco. Lo que colocas entra solo al BOM (con su valor).
- Panel: redes, conexiones por componente, lista de cables con calibre sugerido, **energía** (voltaje de cada red, consumo típico y pico, reguladores LDO/buck/cargador con su pérdida, capacidad de cada fuente y autonomía de baterías), **verificación** (sobre/subvoltaje, cortos, dos fuentes en una red, SDA/SCL cruzados, TX–TX, direcciones I2C repetidas, niveles 5 V → 3.3 V, pines de flash/arranque/solo entrada/ADC2 del ESP32, LED sin resistencia, potencia de resistencias, servos alimentados del 3V3) y **sugerencias** (alimentación, tierra, I2C, UART cruzado, SPI, ADC1, PWM) que se aceptan una a una o todas.
- ✦ Diseñar con IA (Claude/Gemini): describe el objetivo y propone el circuito con tu biblioteca para aprobarlo. El agente entiende “agrega una batería 18650”, “conecta el BME280 al ESP32 por I2C”.
- **Informe PDF** (imprimir desde el navegador): resumen, diagrama vectorial, BOM con referencias, redes, conexiones por componente, cables, presupuesto de energía y verificación. Exportar SVG, PNG, CSV de conexiones y netlist de texto.
- Vista real: huella a escala de cada módulo con cables tipo dupont (los pines sin posición se reparten por los bordes).
- Es un cálculo DC estático con los consumos de las fichas, no una simulación.

## Interfaz
- Tema oscuro, barra lateral (barra inferior en el celular), **Inicio** con indicadores, sugerencias y salud de la biblioteca.
- **Ctrl+K** (o `/`): buscador global de componentes, proyectos, acciones y botones de la pantalla; también entiende órdenes.
- **Ctrl+J** o ✦: el asistente está en todas las ventanas, en un panel lateral.

## Inteligencia artificial: Google Gemini (proveedor principal)
- **Ajustes → Asistente IA → Google Gemini**: pega la clave de [aistudio.google.com/apikey](https://aistudio.google.com/apikey) y pulsa **⚡ Conectar y probar**. La app lista los modelos de tu clave, elige el mejor *Flash* (rápido) y el mejor *Pro* (potente) y hace una prueba.
- **Rápido** (Flash): chat, búsquedas web con `google_search` (fuentes citadas), acciones del agente. **Potente** (Pro): análisis de fotos/datasheets adjuntos y "Diseñar con IA" del diagrama. Si el Pro da límite (429/503/404) se reintenta y luego cae al Flash.
- La clave vive solo en el navegador (bóveda cifrada); nunca se sube al repositorio. Contador de uso diario en `localStorage` (`ml_uso_ia`).
- **Plan Google AI Pro ≠ API**: la suscripción no paga la API. La clave de AI Studio funciona en el *nivel gratuito* (con límites por minuto/día; Google puede usar esas consultas para mejorar sus modelos). Para quitar límites y ese uso de datos, activa facturación en el proyecto de la clave.
- **Llevar las claves al celular**: Ajustes → Acceso y seguridad → «📱 Llevar mis claves a otro dispositivo» muestra un QR/enlace (cifrado, vence en 30 min) y un PIN. En el celular se escanea, se escribe el PIN y una contraseña para ese dispositivo (`#/traer/<código>`, `Auth.crearTraspaso`).
- Claude (Anthropic) y OpenAI siguen disponibles como alternativas en el mismo selector.

## Generador: así se agregan componentes (desde nov 2026)
- **🧩 Agregar componente** (catálogo, inicio, o escribir «agrega …» en el chat) abre `#/nuevo`: nombre, versión/encapsulado, notas (lo copiado de la tienda), enlaces y **fotos/datasheet** (pegar con Ctrl+V o «Pegar» en el celular, arrastrar, elegir o cámara).
- **📄 Descargar PDF / 📤 Compartir PDF**: un solo PDF con las instrucciones + fotos + páginas del datasheet (pdf-lib, en el navegador) para subirlo a Gemini, ChatGPT o Claude con el **mensaje corto**. También **📋 Copiar prompt** para pegarlo directo.
- Paso 3: pegar la respuesta → propuesta con 🔎 revisión automática; la primera foto queda como imagen de la ficha y el PDF del datasheet como copia. El borrador se guarda en el dispositivo.
- **Biblioteca**: inicio por tipo y categoría con conteos y avance de fichas completas; **🩺 Revisión** (`#/revision`) muestra qué le falta a cada ficha con botón «🌐 Completar» (el generador pide solo lo faltante).
- **Pasivos**: las 45 familias (`anexo: "pasivos"`) ya no guardan STEP/DXF; en su pestaña Archivos CAD, «⚙ Generar STEP + DXF ahora» deja `data/solicitudes/<id>.json`, la Action los genera y `tools/solicitudes.py` los borra a los 7 días.

### Subproyectos y caja mínima (nov 2026)
- Cada proyecto tiene **subproyectos** (`P.subs = [{id, nombre, tipo, notas, circuito}]`: potencia, lógica, RF, comunicaciones, sensores, actuadores, energía…), cada uno con su diagrama. Los proyectos antiguos se migran solos (`circuito` → subproyecto «Circuito principal»). **Vista general**: tarjetas por subproyecto y «Conexiones entre subproyectos» (etiquetas de red con el mismo nombre en varias placas). El BOM se sincroniza con todos los diagramas.
- Pestaña **📦 Caja** (`app/caja.js`): con las medidas de cada componente (montaje, alturas, separadores, espacio para cables) y sus zonas (USB, jack, bornera… deben ir contra la pared; pantallas/cámaras piden ventana en la tapa) empaqueta los rectángulos en planta (MaxRects con giros) y da la **caja mínima**: interior, exterior (con espesor de pared) y volumen, con **tres vistas** (planta, frente, lateral) y descargas **SVG, DXF y CSV**. Alcance: todo el proyecto (incluye piezas del BOM sin diagrama) o un subproyecto.
- Se retiró la «vista real» del diagrama: el diseño físico va en la pestaña Caja y en el CAD.

### Caja por niveles, opciones y elementos · versiones soldado/jumper (nov 2026)
- **Opciones de caja**: la pestaña Caja propone varias cajas de área mínima (1, 2 o 3 niveles con repisas, y variantes más cuadradas) en tarjetas; se marca la de menor área y la de menor volumen.
- **✋ Acomodar a mano**: planta editable por nivel; arrastra las piezas, gíralas 90°, cámbialas de nivel o muévelas de a 1 mm. La caja se ajusta al contorno y avisa choques y conectores que no tocan su pared. «Descartar a mano» vuelve a las opciones.
- **Elementos de la caja**: salidas de cable (potencia/datos), USB-C, jack DC, GX16, RJ45, SMA, rejillas de ventilación, ventanas para pantallas, pulsadores, LED, interruptor, ventilador o agujero libre, en cualquier cara (paredes, tapa, fondo) con tamaño, posición y fondo interior. Los que entran hacia adentro reservan su espacio junto a la pared. Salen en las vistas y en el DXF (capas `AGUJEROS_*`, caras +Y y −X desplegadas).
- **Soldado / jumper**: cada componente con montaje tiene `montaje.conexiones` con dos versiones (alturas y cableado). Los proyectos usan **soldado** por defecto (cables directo a la placa, sin headers); en la tarjeta del componente del diagrama se cambia a jumper (o «Aplicar a todos»). La caja y el calibre del cable usan la versión elegida. Se editan en la ficha → Montaje → «Versiones de conexión». `node tools/conexiones.mjs` las calcula (la Action lo corre para componentes nuevos).
- Diagrama en el celular: la tarjeta del componente y la del cable salen **debajo** del lienzo para no tapar la edición.

### Diagrama: edición intuitiva (nov 2026)
- **Conectar**: toca un pin y luego otro (o arrastra de pin a pin). Mientras eliges, los pines que darían problema se marcan con un anillo punteado. Si la conexión es inválida (cortocircuito, voltajes distintos, 5 V a un pin de 3.3 V, TX–TX, SDA–SCL, LED sin resistencia, pin reservado…) sale una **alarma**: «Cancelar» o «Conectar de todos modos»; si se acepta, el cable queda punteado con «!» y aparece en Verificación.
- **Rutas**: los cables esquivan los componentes (grilla de visibilidad + A*, con caché) y evitan montarse entre sí. Al seleccionar un cable aparecen puntos **+** para doblarlo por donde quieras (doble clic en un punto lo quita), y la tarjeta del cable permite **Curva / Recta**, **Ruta automática**, color manual y borrar.
- **Código de colores** (🎨 Colores): + rojo (5 V) / naranja (3.3–4.2 V) / vino (>5.5 V), GND negro, I2C SDA azul y SCL amarillo, UART TX verde / RX blanco, SPI morado, analógico turquesa, PWM rosado, digital celeste.
- **Tarjeta del cable**: tipo de red, voltaje, corriente típica y pico, calibre sugerido y la alarma si la tiene.
- **Tarjeta del componente** (abajo del lienzo): descripción, tipos de conexión con cuántos están conectados, alimentación recibida y **sugerencias de un toque**: conectar automáticamente, interruptor de encendido, botón a un GPIO, LED de estado, resistencia para un LED, encender ventilador/motor con **MOSFET + diodo**, interruptor manual.
- Partes nuevas: interruptor ON/OFF (doble clic lo abre/cierra), diodo, MOSFET canal N, módulo relé, ventilador 5 V, motor DC. «⛶ Lienzo grande» oculta el panel lateral.

## Investigar con Gemini / ChatGPT (sin gastar API)
- Botón **🌐** del chat (o la acción «Investigar componente con Gemini/ChatGPT»): escribe el componente (y la versión/encapsulado), **Generar y copiar prompt**, pégalo en Gemini (o ChatGPT / Claude web) con búsqueda, copia su respuesta completa y pégala en **Importar y revisar** (o directamente en el chat).
- El prompt explica el formato JSON de MountLab, las reglas de geometría (origen al centro, pines en orden físico, módulo vs chip suelto) y la lista de piezas 3D disponibles; si estás en la ficha de un componente, pide solo lo que le falta.
- La respuesta se lee aunque traiga texto alrededor, comillas tipográficas o comas sobrantes; sale como propuesta con la 🔎 revisión automática y se aprueba igual que las de la IA integrada (no gasta créditos).

## Agregar componentes con la IA (protocolo y revisión)
- Botón **📋** del chat (o la acción «Plantilla para agregar un componente»): inserta el prompt estándar con los datos a llenar; la IA debe completar todos los campos del formulario, los pines en orden físico, el montaje, el modelo 3D y la verificación con dos fuentes.
- Cada propuesta muestra una **🔎 Revisión automática** antes de aprobar: ficha incompleta, dimensiones de la ficha vs montaje, agujeros fuera de la placa o pegados al borde, piezas fuera/encimadas, número de pines vs header, datasheet que no es PDF, campos de confianza baja.
- Los pines que propone la IA (sin coordenadas) se asignan en orden a los pines del header del modelo, así el DXF y el plano salen con VCC, GND, SCL… en su lugar.

## Consumo de IA
- Ajustes → **📊 Consumo de IA**: consultas, tokens, búsquedas y costo estimado (hoy, mes, total, por modelo, últimos días) con los precios oficiales; Gemini gratuito = US$0.
- Anota el saldo que muestra la Console de Claude y la app resta lo gastado («quedan ≈ US$…»); avisa cuando queda menos del 15 %. Chip 📊 en el asistente. Se cuenta por dispositivo (`localStorage: ml_uso_ia2`); el dato exacto está en Console → Usage.

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

### Ingeniería «nivel misión», fabricación y versiones (nov 2026)
- **🛡 Ingeniería** (`app/ingenieria.js`): tarjetas con semáforo y presupuestos del sistema: potencia típica y pico, corriente pico, energía y **autonomía**, **masa** (ficha, típica, estimada o medida a mano), **térmico** de primer orden (convección natural + rejillas + ventilador, contra el límite de la pieza más sensible), volumen y **costo** por subproyecto con frescura de precios.
  - **Derating** al estilo GSFC EEE-INST-002 adaptado a piezas comerciales: reguladores ≤ 75 % de corriente, LDO ≤ 50 % de disipación, fuentes ≤ 80 %, resistencias ≤ 50 % de potencia, capacitores (cerámico 60 %, electrolítico 80 %, tantalio 50 %), LED ≤ 75 %, cables ≤ 75 %.
  - **Revisión eléctrica** de todos los circuitos juntos y tabla de pines delicados del ESP32 (arranque, solo entrada, ADC2).
  - **Requisitos y matriz de verificación** (Análisis / Prueba / Inspección / Demostración): los numéricos se verifican solos con los presupuestos.
  - **FMEA** con S/O/D y RPN, borrador automático por reglas y «Mejorar con IA».
- **🔧 Fabricación**: hoja de **arnés para soldar** (W01…, origen/destino pin a pin, calibre con margen, color, largo medido sobre la caja, termoencogible, radio mínimo, compra de cable) con inspección basada en NASA-STD-8739.4 y hoja imprimible para el banco; **firmware base** (proyecto PlatformIO .zip o .ino) con pines, librerías y lectura de cada sensor; **caja a STEP** (la app deja `data/cajas/<id>.json` y la Action corre `cad/caja_step.py` con CadQuery: base con agujeros, tapa, repisas y componentes); **informe** completo imprimible a PDF.
- **🕓 Versiones**: congelar el proyecto (borrador, aprobado, construido, modificado, probado), ver diferencias entre versiones y restaurar.
- **📷 Escanear** (barra superior): foto de un módulo o su etiqueta → Generador; si hay IA conectada sugiere el nombre y avisa si ya existe.
- Biblioteca: medidas, pines, datasheets y precios completados en 23 componentes; `montaje.externo`, `montaje.dentro_de` y `montaje.accesorio` marcan piezas que no ocupan lugar propio en la caja.

### Modelo 3D coherente en toda la app, exportación CAD y caja en 3D (nov 2026)
- **Ficha**: la imagen principal es el render isométrico del modelo 3D (el mismo de la pestaña Modelo 3D); si hay foto, se alterna con los botones 🧊 / 📷.
- **Montaje, Zonas y Pines** dibujan en planta todas las piezas del modelo 3D (capa «modelo»; las de la cara B punteadas).
- **Archivos CAD → Exportar desde el modelo 3D** (`app/cadexport.js`, en el navegador): **STEP** AP214 con un sólido B-rep exacto por pieza (placa con agujeros, cajas redondeadas, cilindros, con color y nombre), **Parasolid** (.zip con el STEP + macro `.swb` de SolidWorks que guarda el `.x_t`) y **DXF de 6 vistas** (superior, inferior, frontal, posterior, laterales; tercer diedro, escala 1:1).
- **Caja en 3D** (`app/caja3d.js`): paredes con los agujeros reales, repisas, cuerpos internos de conectores y ventiladores, y cada componente con su modelo 3D de la biblioteca. Está en «Vistas» y al lado de la planta en «Acomodar a mano» (se actualiza al editar). Tapa puesta / transparente / sin tapa, paredes sólidas o transparentes, vistas iso/arriba/frente/lado y captura PNG.
- **Catálogo de elementos ampliado** (`app/cajaelementos.js`, 131 tipos en 10 grupos): rejillas de ranuras (horizontal/vertical), agujeros o panal, ventiladores 25–140 mm con sus tornillos, ventanas para OLED/e-paper/TFT/LCD/Nextion, LED y pilotos, pulsadores (6×6 a 22 mm, con LED, emergencia), balancines KCD, palancas, llave, potenciómetro y encoder, USB-C/A/B/micro/mini, jack DC, XT60/XT30, IEC, bananas, portafusible, RJ45/RJ11, D-sub 9/15/25, HDMI, SD, SMA/RP-SMA/BNC/N, GX12/16/20, M8/M12, prensaestopas PG y métricos, pasacables, fijación y otros. Cada uno con la forma exacta de su corte, que usan igual el SVG, el DXF, la vista 3D y el STEP de la caja.
- **Caja aprobada → ensamble CAD** (`app/cajaexport.js`): en la pestaña 📦 Caja, **✅ Aprobar caja** guarda la aprobación (fecha y huella de medidas, posiciones y elementos; si después cambia algo avisa y pide aprobar de nuevo). Con la caja aprobada se exporta al instante, también desde Fabricación → Caja a CAD:
  - **STEP ensamble** AP214: «Caja (base)» (fondo + 4 paredes con todos los cortes), «Tapa», cada repisa, **cada componente con su modelo 3D completo** de la biblioteca (o placa + volumen si no tiene) y **cada accesorio** (ventilador con marco y rotor, prensaestopas con tuerca y domo, LED/pilotos, pulsadores y paro de emergencia, balancines, palancas/llave/perillas, conectores de panel con brida/tuerca y cuerpo interior, portafusible). Cada pieza es un componente aparte con su nombre; colores: uno distinto por pieza o los colores reales del modelo.
  - **Parasolid**: .zip con el STEP del ensamble + macro `.swb` que lo guarda como `.x_t` con colores.
  - **DXF 6 vistas** (sin cortes): una **capa y un color ACI por pieza** (`CAJA_…`, `COMP_…`, `ACC_…`), perfiles de frente con arcos y siluetas de lado.
  - Si dos elementos se montan uno sobre otro, el segundo no se corta (el sólido quedaría inválido) y se avisa.

### Crear componentes desde un STEP (nov 2026)
- **Generador → «🧊 Tengo el STEP»** (o `#/importar-step`), y en la pestaña **Modelo 3D** de cualquier componente el botón **🧊 Desde STEP** para reemplazar su modelo.
- El STEP se lee **en el navegador** con OpenCascade en WebAssembly (`app/vendor/occt/`, occt-import-js 0.0.23, LGPL) en un Web Worker; **no se sube ni se guarda**: solo es materia prima. Al aprobar queda únicamente el modelo de MountLab.
- `app/stepimport.js` (MLStepImp) convierte:
  - **Placa**: la detecta por su gran cara plana y espesor de PCB (o por el nombre); la acuesta (normal → Z, lado largo → X, conserva el sentido del archivo, voltea para que la cara con más piezas quede arriba), origen al centro y cara inferior en z = 0.
  - **Contorno** sacado de los bordes de la cara superior: rectangular, esquinas redondeadas (radio calculado), redondo o **contorno real** (polígono, base `forma: "contorno"`). Un cuerpo grueso sin PCB queda como base «prisma».
  - **Agujeros de montaje** (círculos ajustados de Ø1.9–7 mm) → `montaje.agujeros`; los de pines pasantes se cuentan y se ignoran.
  - **Cada pieza** → plantilla `importada` con primitivas: caja, cilindro o **perfil extruido** en su mejor eje (z, x o y: `{f:"perfil", eje, pts|circ, a0, a1}`), y **escalonado** por secciones cuando la pieza cambia a lo largo del eje (bridas, tuercas, cuerpos de conectores).
  - **Tipo por nombre** (USB-C, micro USB, SMA/u.FL, JST, headers, LED, pulsadores, módulos GNSS/ESP…) → zona de acceso con su salida (el borde por el que sobresale o ±Z) y holgura.
  - Avisos: piezas que sobresalen del borde, módulo distinto al del nombre del archivo, recortes que no son de montaje.
- Pantalla de revisión: original y generado lado a lado con cámaras enlazadas (y el original en malla encima), medidas sacadas, tabla de piezas para desmarcar o renombrar.
- El perfil extruido se soporta en todo: planta 2D, Montaje, vista 3D, render de la ficha, STEP/DXF del navegador, caja 3D y ensamble de la caja, y `cad/regenerar.py` (CadQuery).

### Modelar con IA desde fotos, plano o medidas (nov 2026)
- `#/modelar-ia` (Generador → «🤖 Modelar con IA») y, en la pestaña Modelo 3D de cada componente, **🤖 Con IA** (`app/modelaria.js`, MLModelIA).
- Material: fotos (arriba, lado, frente), plano en PDF/imagen (profesional o a mano), medidas generales (se leen de la ficha) y notas. La foto de la ficha se puede usar con un clic.
- La app arma un **PDF / prompt** para Gemini, ChatGPT o Claude con: sistema de coordenadas, tipos de base, todas las plantillas con sus parámetros, formas libres (caja, cilindro, perfil extruido en x/y/z), montaje (agujeros, fijación), zonas con salida y holgura, pines, reglas de calidad (`supuestos` y `confianza`) y **dos ejemplos reales** de la biblioteca. Respuesta: un bloque ```json.
- Al pegar la respuesta: se **valida y normaliza** (formas, giros a 90°, plantillas inexistentes → forma libre, agujeros fuera de la base), se arma con `MLPlant.sincronizar`, se **revisa** (piezas fuera de la base, encimadas, sobre agujeros; envolvente contra las medidas y contra la que declaró la IA) y se muestra en 3D y **superpuesto sobre la foto** (vista arriba/frente/lado/iso, opacidad, escala, arrastrar, girar).
- **📤 Pedir corrección**: PDF con el render del modelo (iso, arriba, frente, lado), las fotos, los problemas encontrados, tu observación y el JSON actual, para que la IA lo corrija.
- **Aplicar** reemplaza modelo y montaje de un componente (conserva ficha, precios y pines con nombre) o **crea** uno nuevo; queda listo para Guardar.

### Elementos de la caja con modelo completo y volúmenes en los choques (nov 2026)
- `app/cajamodelos.js` (MLCajaEl.modelo / volumen / marco / enCaja): modelo 3D de cada elemento con medidas reales, en coordenadas de la cara (z = 0 cara exterior): ventilador (marco, buje, 7 aspas, tornillos y tuercas), módulos de pantalla (vidrio, PCB, separadores, header), LED y pilotos, pulsadores metálicos y de 22 mm con bloque de contactos, paro de emergencia con placa amarilla, balancines KCD, palancas, llave, potenciómetros y encoder, USB/HDMI de panel, jacks DC, XT60/XT30, IEC, bananas, portafusible, RJ45/RJ11, D-sub, SMA/BNC/N, GX12/16/20, M8/M12, audio, prensaestopas PG y métricos, pasacables, buzzer y cámara.
- Cada uno declara sus **espacios de uso**: aire del ventilador, curva del cable (radio ≥ 4 × Ø), espacio para soldar terminales, espacio para la llave de la tuerca, conector de la placa. **Cuerpo + espacios** definen lo que el elemento reserva por dentro (`caja.js`: rectángulo reservado contra la pared, profundidad de tapa/fondo) y entran en el cálculo de choques y del tamaño de la caja.
- Rango de **espesor de pared** admitido (p. ej. KCD a presión 0.8–2.5 mm): aviso si la caja no cumple.
- Se ven en la caja 3D (con «espacios de uso» translúcidos, que se pueden ocultar) y salen en el ensamble STEP/Parasolid y en el DXF de 6 vistas con su capa. Verificado: los 110 elementos con cuerpo generan sólidos válidos en OpenCascade.

### Piezas en caras laterales y protección contra sobrescribir (nov 2026)
- Las piezas pueden ir en la cara **A**, **B** o en un **costado de la base**: `"cara": "-X" | "+X" | "-Y" | "+Y"` (conectores SMA, D-Sub, jacks en el borde de un módulo encapsulado). `x, y` = punto de esa cara en planta, `z` = altura del centro sobre la base; la pieza crece hacia afuera. Al elegir un costado en el panel de la pieza, se pega sola a esa cara a media altura. Funciona en planta, 3D, STEP/DXF, caja y `regenerar.py`; las zonas salen por ese costado. Los prompts (Generador y Modelar con IA) lo explican para que la IA no ponga arriba un conector que va en un lado.
- **Protección**: antes de guardar una propuesta que actualiza un componente, si describe otro producto (nombre/referencia distintos) la app pregunta: crear componente nuevo (recomendado), reemplazar o cancelar. El «completar» del generador ahora se usa una sola vez.
