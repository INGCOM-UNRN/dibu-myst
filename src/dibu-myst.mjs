// dibu-myst: plugin de MyST (mystmd) que dibuja los diagramas de dibu al construir el sitio o
// las exportaciones, con el motor de dibu compilado a WebAssembly (sin binarios externos).
//
//   # myst.yml
//   project:
//     plugins:
//       - https://github.com/INGCOM-UNRN/dibu-myst/releases/latest/download/dibu-myst.mjs
//
// Dibuja:
//   - los bloques de código ```estructura, ```statics y ```dibu (la sintaxis de dibu sync-md);
//     los de ```{code} estructura se dejan como código, para mostrar la sintaxis;
//   - la directiva {dibu} (alias {estructura}), con :theme:, :width:, :align:, :alt:,
//     :caption: y :label:, y opcionalmente un archivo YAML/JSON como argumento.
//
// Variables de entorno:
//   DIBU_THEME        theme por omisión: un nombre (ink, color, high-contrast, dark) o JSON.
//   DIBU_MYST_SALIDA  "embebido" (por omisión): cada SVG va en la página como data URI, sin
//                     escribir archivos. "diagramas": escribe diagramas/estructura-<hash>.svg al
//                     lado de cada página, con el mismo nombre que dibu sync-md.
//   DIBU_WASM         ruta a un dibu_wasm.wasm (sólo en desarrollo, sin el motor embebido).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const VERSION = "0.1.0";
// El build (scripts/construir.mjs) reemplaza estas líneas por el commit de dibu y el motor en base64.
export const MOTOR = null;
const MOTOR_BASE64 = null;

export const LENGUAJES = ["estructura", "statics", "dibu"];

// ── Motor ────────────────────────────────────────────────────────────────────────────────
let motor = null;
const enc = new TextEncoder();
const dec = new TextDecoder();

function cargarMotor() {
  if (motor) return motor;
  let bytes;
  if (MOTOR_BASE64) bytes = Buffer.from(MOTOR_BASE64, "base64");
  else {
    const ruta =
      process.env.DIBU_WASM ||
      fileURLToPath(new URL("../../dibu/target/wasm32-unknown-unknown/wasm/dibu_wasm.wasm", import.meta.url));
    bytes = fs.readFileSync(ruta);
  }
  motor = new WebAssembly.Instance(new WebAssembly.Module(bytes), {}).exports;
  return motor;
}

function llamar(op, texto) {
  const ex = cargarMotor();
  let n;
  if (texto === undefined) n = ex[op]();
  else {
    const b = enc.encode(texto);
    const p = ex.dibu_alloc(b.length);
    new Uint8Array(ex.memory.buffer, p, b.length).set(b);
    n = ex[op](p, b.length);
  }
  return JSON.parse(dec.decode(new Uint8Array(ex.memory.buffer, ex.dibu_out_ptr(), n)));
}

/** Los tipos de diagrama registrados. */
export const tipos = () => llamar("dibu_types");
/** Los themes predefinidos. */
export const themes = () => llamar("dibu_themes");

/** Lee un theme escrito como texto: vacío → null, JSON → objeto, otro texto → nombre. */
export function leerTema(texto) {
  if (texto === undefined || texto === null) return null;
  if (typeof texto !== "string") return texto;
  const t = texto.trim();
  if (!t) return null;
  if (t.startsWith("{") || t.startsWith('"')) return JSON.parse(t);
  return t;
}

/**
 * Dibuja el cuerpo de un bloque (uno o varios diagramas, apilados como en dibu sync-md).
 * Devuelve `{name, types, titles, svg}` o `{name, types, titles, error}`.
 */
export function renderizar(cuerpo, theme = null) {
  return llamar("dibu_render_md_theme", JSON.stringify({ text: cuerpo, theme }));
}

// ── Nodos ────────────────────────────────────────────────────────────────────────────────
function salida() {
  const s = (process.env.DIBU_MYST_SALIDA || "embebido").trim();
  if (s !== "embebido" && s !== "diagramas") {
    throw new Error(`dibu-myst: DIBU_MYST_SALIDA debe ser "embebido" o "diagramas", no "${s}"`);
  }
  return s;
}

function temaPorOmision() {
  try {
    return leerTema(process.env.DIBU_THEME);
  } catch {
    throw new Error("dibu-myst: DIBU_THEME no es un nombre de theme ni JSON válido");
  }
}

function textoAlternativo(r) {
  const partes = (r.types || []).map((t, i) => (r.titles?.[i] ? `${t}: ${r.titles[i]}` : t));
  return partes.length ? `Diagrama ${partes.join(", ")}` : "Diagrama";
}

function nombreArchivo(nombre, theme) {
  if (theme === null) return nombre; // el mismo nombre que dibu sync-md
  const sufijo = typeof theme === "string" ? theme : "theme";
  return nombre.replace(/\.svg$/, `-${sufijo.replace(/[^a-z0-9-]/gi, "")}.svg`);
}

/** Escribe el SVG sólo si cambió, para no disparar recompilaciones con `myst start`. */
function escribirSiCambio(ruta, svg) {
  if (fs.existsSync(ruta) && fs.readFileSync(ruta, "utf8") === svg) return;
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  fs.writeFileSync(ruta, svg);
}

/** La URL de la imagen: data URI, o un archivo en diagramas/ al lado de la página. */
function urlDe(r, theme, vfile) {
  if (salida() === "embebido" || !vfile?.path) {
    return `data:image/svg+xml;base64,${Buffer.from(r.svg).toString("base64")}`;
  }
  const nombre = nombreArchivo(r.name, theme);
  escribirSiCambio(path.join(path.dirname(vfile.path), "diagramas", nombre), r.svg);
  return `diagramas/${nombre}`;
}

function reportar(vfile, mensaje, nodo) {
  if (!vfile?.message) return;
  const m = vfile.message(mensaje, nodo?.position, "dibu-myst:render");
  m.fatal = true;
  m.url = "https://ingcom-unrn.github.io/dibu/";
}

/** Un nodo que muestra el error en la página, en vez del diagrama. */
function nodoError(cuerpo, mensaje) {
  return {
    type: "admonition",
    kind: "danger",
    children: [
      { type: "admonitionTitle", children: [{ type: "text", value: "Error de dibu" }] },
      { type: "paragraph", children: [{ type: "text", value: mensaje }] },
      { type: "code", lang: "yaml", value: cuerpo },
    ],
  };
}

/**
 * Dibuja `cuerpo` y devuelve el nodo imagen (o un nodo de error, además de reportarlo).
 * `opciones`: theme, width, align, alt.
 */
export function nodoDiagrama(cuerpo, opciones = {}, vfile, posicion) {
  const theme = opciones.theme !== undefined && opciones.theme !== null ? opciones.theme : temaPorOmision();
  const r = renderizar(cuerpo, theme);
  if (r.error || !r.svg) {
    const mensaje = `dibu: ${r.error || "el bloque no produjo ningún diagrama"}`;
    reportar(vfile, mensaje, { position: posicion });
    return nodoError(cuerpo, mensaje);
  }
  const nodo = { type: "image", url: urlDe(r, theme, vfile), alt: opciones.alt || textoAlternativo(r) };
  if (opciones.width) nodo.width = opciones.width;
  nodo.align = opciones.align || "center";
  if (posicion) nodo.position = posicion;
  return nodo;
}

// ── Transformación de los bloques de código ──────────────────────────────────────────────
const DIRECTIVA_DE_CODIGO = /\{(code|code-block|code-cell|sourcecode|literalinclude)\}/;

/**
 * Si un bloque ```estructura/statics/dibu es para dibujar. Los de {code} / {code-block} no:
 * muestran la sintaxis. mystmd no deja marca de la directiva en el nodo, pero sus salidas no
 * tienen posición, y si la tienen, la línea de la fuente lo dice.
 */
export function esParaDibujar(nodo, lineas) {
  const n = nodo.position?.start?.line;
  if (!n) return false;
  const linea = lineas?.[n - 1];
  return linea === undefined || !DIRECTIVA_DE_CODIGO.test(linea);
}

function lineasDe(vfile) {
  try {
    return vfile?.path ? fs.readFileSync(vfile.path, "utf8").split(/\r?\n/) : null;
  } catch {
    return null;
  }
}

/** Reemplaza, en el árbol, los bloques ```estructura/statics/dibu por sus diagramas. */
export function transformarArbol(arbol, vfile) {
  let cuenta = 0;
  let lineas;
  (function recorrer(nodo) {
    const hijos = nodo.children;
    if (!Array.isArray(hijos)) return;
    for (let i = 0; i < hijos.length; i++) {
      const h = hijos[i];
      if (h.type === "code" && LENGUAJES.includes(h.lang)) {
        if (lineas === undefined) lineas = lineasDe(vfile);
        if (!esParaDibujar(h, lineas)) continue;
        hijos[i] = nodoDiagrama(h.value ?? "", {}, vfile, h.position);
        cuenta++;
      } else recorrer(h);
    }
  })(arbol);
  return cuenta;
}

const transformacion = {
  name: "dibu-bloques",
  doc: "Dibuja los bloques de código estructura, statics y dibu con el motor de dibu.",
  stage: "document",
  plugin: () => (arbol, vfile) => {
    transformarArbol(arbol, vfile);
  },
};

// ── Directiva {dibu} ─────────────────────────────────────────────────────────────────────
const directiva = {
  name: "dibu",
  alias: ["estructura"],
  doc: "Un diagrama de dibu: el cuerpo (o el archivo del argumento) es YAML/JSON con uno o varios bloques.",
  arg: { type: String, doc: "Archivo YAML/JSON con los bloques, relativo a la página (opcional)." },
  options: {
    theme: { type: String, doc: "Theme: ink, color, high-contrast, dark, o JSON {extends, colors, typography}." },
    width: { type: String, doc: "Ancho de la imagen (por ejemplo 80% o 400px)." },
    align: { type: String, doc: "Alineación: left, center o right." },
    alt: { type: String, doc: "Texto alternativo; por omisión, el tipo y el título de cada bloque." },
    caption: { type: String, doc: "Epígrafe; convierte el diagrama en una figura numerada." },
    label: { type: String, doc: "Etiqueta para referenciar la figura." },
    class: { type: String, doc: "Clases CSS de la imagen." },
  },
  body: { type: String, doc: "Los bloques, en YAML o JSON." },
  run(data, vfile, ctx) {
    const o = data.options || {};
    let cuerpo = data.body || "";
    if (data.arg) {
      const base = vfile?.path ? path.dirname(vfile.path) : process.cwd();
      try {
        cuerpo = fs.readFileSync(path.resolve(base, String(data.arg).trim()), "utf8");
      } catch (e) {
        const mensaje = `dibu: no se pudo leer ${data.arg}: ${e.message}`;
        reportar(vfile, mensaje, data.node);
        return [nodoError("", mensaje)];
      }
    }
    let theme;
    try {
      theme = o.theme === undefined ? undefined : leerTema(o.theme);
    } catch {
      const mensaje = `dibu: :theme: no es un nombre ni JSON válido: ${o.theme}`;
      reportar(vfile, mensaje, data.node);
      return [nodoError(cuerpo, mensaje)];
    }
    const imagen = nodoDiagrama(cuerpo, { theme, width: o.width, align: o.align, alt: o.alt }, vfile, data.node?.position);
    if (o.class && imagen.type === "image") imagen.class = o.class;
    if (!o.caption && !o.label) return [imagen];
    const figura = { type: "container", kind: "figure", children: [imagen] };
    if (o.label) {
      figura.label = o.label;
      figura.identifier = o.label.trim().toLowerCase().replace(/\s+/g, "-");
    }
    if (o.caption) {
      const contenido = ctx?.parseMyst ? ctx.parseMyst(o.caption).children : [{ type: "paragraph", children: [{ type: "text", value: o.caption }] }];
      figura.children.push({ type: "caption", children: contenido });
    }
    return [figura];
  },
};

const plugin = {
  name: `dibu ${VERSION}${MOTOR ? ` (motor ${MOTOR})` : ""}`,
  directives: [directiva],
  transforms: [transformacion],
};

export default plugin;
