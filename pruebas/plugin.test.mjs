// Pruebas del plugin sin mystmd: árboles mdast armados a mano, como los que recibe del parser.
// Usan src/dibu-myst.mjs (motor de ../dibu/target) y, si existe, el archivo dist/dibu-myst.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dibu = path.resolve(process.env.DIBU_DIR || path.join(raiz, "..", "dibu"));
const dibuMyst = await import(path.join(raiz, "src", "dibu-myst.mjs"));
const { default: plugin, transformarArbol, renderizar, leerTema, tipos } = dibuMyst;
const directiva = plugin.directives[0];

function vfileFalso(ruta = "/no/existe/pagina.md") {
  const mensajes = [];
  return {
    path: ruta,
    mensajes,
    message(razon, lugar, origen) {
      const m = { reason: razon, place: lugar, source: origen };
      mensajes.push(m);
      return m;
    },
  };
}
const codigo = (lang, value) => ({ type: "code", lang, value });
const raizMdast = (...hijos) => ({ type: "root", children: [{ type: "block", children: hijos }] });

test("el plugin declara la directiva y la transformación", () => {
  assert.equal(directiva.name, "dibu");
  assert.deepEqual(directiva.alias, ["estructura"]);
  assert.equal(plugin.transforms[0].stage, "document");
  assert.ok(tipos().length >= 70);
});

test("los bloques estructura, statics y dibu se dibujan; el resto queda igual", () => {
  const arbol = raizMdast(
    codigo("estructura", "type: stack\ntitle: Pila\nvalues: [1, 2]"),
    { type: "blockquote", children: [codigo("statics", "type: queue\nvalues: [3]")] },
    codigo("dibu", "type: array\nvalues: [4]"),
    codigo("python", "print(1)"),
  );
  const vf = vfileFalso();
  assert.equal(transformarArbol(arbol, vf), 3);
  const [a, cita, c, py] = arbol.children[0].children;
  assert.equal(a.type, "image");
  assert.match(a.url, /^data:image\/svg\+xml;base64,/);
  assert.ok(Buffer.from(a.url.split(",")[1], "base64").toString().startsWith("<svg"));
  assert.equal(a.alt, "Diagrama stack: Pila");
  assert.equal(a.align, "center");
  assert.equal(cita.children[0].type, "image");
  assert.equal(c.type, "image");
  assert.deepEqual(py, codigo("python", "print(1)"));
  assert.equal(vf.mensajes.length, 0);
});

test("un bloque inválido se reporta como error y se muestra en la página", () => {
  const arbol = raizMdast(codigo("estructura", "type: no_existe"));
  const vf = vfileFalso();
  transformarArbol(arbol, vf);
  const n = arbol.children[0].children[0];
  assert.equal(n.type, "admonition");
  assert.equal(vf.mensajes.length, 1);
  assert.equal(vf.mensajes[0].fatal, true);
  assert.match(vf.mensajes[0].reason, /^dibu: /);
});

test("themes: por nombre, JSON, por variable de entorno y por bloque", () => {
  assert.equal(leerTema(" dark "), "dark");
  assert.deepEqual(leerTema('{"extends": "color"}'), { extends: "color" });
  assert.equal(leerTema(""), null);
  const oscuro = renderizar("type: array\nvalues: [1]", "dark").svg;
  assert.ok(oscuro.includes('fill="#0f172a"'));
  process.env.DIBU_THEME = "dark";
  try {
    const arbol = raizMdast(codigo("estructura", "type: array\nvalues: [1]"));
    transformarArbol(arbol, vfileFalso());
    const svg = Buffer.from(arbol.children[0].children[0].url.split(",")[1], "base64").toString();
    assert.equal(svg, oscuro);
  } finally {
    delete process.env.DIBU_THEME;
  }
  assert.ok(renderizar("type: array\nvalues: [1]", "no-existe").error);
});

test("la directiva: cuerpo, opciones, figura con epígrafe y archivo como argumento", () => {
  const vf = vfileFalso();
  const [img] = directiva.run({ body: "type: stack\nvalues: [1]", options: { width: "50%", theme: "color", alt: "Una pila" } }, vf);
  assert.equal(img.type, "image");
  assert.equal(img.width, "50%");
  assert.equal(img.alt, "Una pila");

  const ctx = { parseMyst: (t) => ({ type: "root", children: [{ type: "paragraph", children: [{ type: "text", value: t }] }] }) };
  const [fig] = directiva.run({ body: "type: stack\nvalues: [1]", options: { caption: "Una *pila*", label: "fig-pila" } }, vf, ctx);
  assert.equal(fig.type, "container");
  assert.equal(fig.kind, "figure");
  assert.equal(fig.identifier, "fig-pila");
  assert.equal(fig.children[0].type, "image");
  assert.equal(fig.children[1].type, "caption");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dibu-myst-"));
  fs.writeFileSync(path.join(dir, "pila.yaml"), "type: stack\nvalues: [9]\n");
  const [deArchivo] = directiva.run({ arg: "pila.yaml", options: {} }, vfileFalso(path.join(dir, "p.md")));
  assert.equal(deArchivo.type, "image");
  const [falta] = directiva.run({ arg: "no-esta.yaml", options: {} }, vfileFalso(path.join(dir, "p.md")));
  assert.equal(falta.type, "admonition");
  const [temaMalo] = directiva.run({ body: "type: stack", options: { theme: "{roto" } }, vfileFalso());
  assert.equal(temaMalo.type, "admonition");
  assert.equal(vf.mensajes.length, 0);
});

test("salida diagramas: mismos nombres y SVG que dibu sync-md (kitchen sink)", (t) => {
  const md = path.join(dibu, "fixtures", "kitchen_sink", "kitchen_sink.md");
  if (!fs.existsSync(md)) return t.skip(`no está ${md}`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dibu-myst-"));
  const vf = vfileFalso(path.join(dir, "kitchen_sink.md"));
  const lineas = fs.readFileSync(md, "utf8").split("\n");
  const hijos = [];
  for (let i = 0; i < lineas.length; i++) {
    const m = /^(`{3,}|~{3,})[ \t]*(estructura|statics)[ \t]*$/.exec(lineas[i]);
    if (!m) continue;
    let j = i + 1;
    while (j < lineas.length && lineas[j].trimEnd() !== m[1]) j++;
    hijos.push(codigo(m[2], lineas.slice(i + 1, j).join("\n")));
    i = j;
  }
  process.env.DIBU_MYST_SALIDA = "diagramas";
  try {
    transformarArbol(raizMdast(...hijos), vf);
  } finally {
    delete process.env.DIBU_MYST_SALIDA;
  }
  assert.equal(vf.mensajes.length, 0, vf.mensajes.map((m) => m.reason).join("\n"));
  // WASM y glibc pueden diferir en ±0,1 por redondeo de libm.
  const num = /-?\d+(?:\.\d+)?/g;
  const casiIgual = (a, b) => {
    if (a.replace(num, "#") !== b.replace(num, "#")) return false;
    const x = a.match(num) || [], y = b.match(num) || [];
    return x.length === y.length && x.every((v, k) => Math.abs(Number(v) - Number(y[k])) <= 0.1 + 1e-9);
  };
  const generados = fs.readdirSync(path.join(dir, "diagramas"));
  assert.equal(generados.length, new Set(hijos.map((h) => h.value.trim())).size);
  for (const nombre of generados) {
    const ref = path.join(path.dirname(md), "diagramas", nombre);
    assert.ok(fs.existsSync(ref), `sync-md no generó ${nombre}`);
    const a = fs.readFileSync(path.join(dir, "diagramas", nombre), "utf8");
    assert.ok(casiIgual(a, fs.readFileSync(ref, "utf8")), `${nombre} difiere de sync-md`);
  }
});

test("dist/dibu-myst.mjs funciona solo, sin el repositorio dibu", async (t) => {
  const dist = path.join(raiz, "dist", "dibu-myst.mjs");
  if (!fs.existsSync(dist)) return t.skip("falta npm run build");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dibu-myst-dist-"));
  fs.copyFileSync(dist, path.join(dir, "dibu-myst.mjs"));
  const m = await import(path.join(dir, "dibu-myst.mjs"));
  assert.ok(m.tipos().length >= 70);
  assert.ok(m.renderizar("type: stack\nvalues: [1]").svg.startsWith("<svg"));
});
