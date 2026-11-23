/* MountLab · lector de STEP en segundo plano (occt-import-js 0.0.23, OpenCascade en WebAssembly, LGPL). */
importScripts("occt-import-js.js");
let occtP = null;
onmessage = async function (ev) {
  try {
    postMessage({ avance: "Cargando OpenCascade…" });
    if (!occtP) occtP = occtimportjs({ locateFile: p => p });
    const occt = await occtP;
    postMessage({ avance: "Leyendo el STEP…" });
    const r = occt.ReadStepFile(new Uint8Array(ev.data.buffer), ev.data.params);
    postMessage(r);
  } catch (e) { postMessage({ error: String(e && e.message || e) }); }
};
