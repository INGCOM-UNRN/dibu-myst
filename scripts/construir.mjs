#!/usr/bin/env node
// Construye dist/dibu-myst.mjs: el plugin con el motor de dibu embebido (un único archivo,
// sin dependencias, que mystmd puede cargar desde una ruta o desde una URL).
//
// Uso: node scripts/construir.mjs [--sin-cargo]
//   DIBU_DIR   ruta al repositorio dibu (por omisión ../dibu)
//   DIBU_WASM  usar este dibu_wasm.wasm en vez de compilarlo
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dibu = resolve(process.env.DIBU_DIR || join(raiz, "..", "dibu"));
const dist = join(raiz, "dist");
const destino = join(dibu, "target");
let wasmRuta = process.env.DIBU_WASM || join(destino, "wasm32-unknown-unknown", "wasm", "dibu_wasm.wasm");

if (!process.env.DIBU_WASM && !process.argv.includes("--sin-cargo")) {
  console.log("· compilando el motor de dibu → WebAssembly");
  execFileSync(
    "cargo",
    ["build", "--profile", "wasm", "-p", "dibu-wasm", "--target", "wasm32-unknown-unknown",
     "--manifest-path", join(dibu, "Cargo.toml"), "--target-dir", destino],
    { stdio: "inherit" },
  );
}
if (!existsSync(wasmRuta)) {
  console.error(`No existe ${wasmRuta}. ¿Está instalado el target wasm32-unknown-unknown?`);
  process.exit(1);
}
mkdirSync(dist, { recursive: true });
let wasm = readFileSync(wasmRuta);
try {
  const tmp = join(dist, "dibu.opt.wasm");
  execFileSync("wasm-opt", ["-Os", "--enable-bulk-memory", "--enable-nontrapping-float-to-int", "--enable-sign-ext",
    "--enable-mutable-globals", "--enable-multivalue", "--enable-reference-types", wasmRuta, "-o", tmp], { stdio: "ignore" });
  wasm = readFileSync(tmp);
  rmSync(tmp);
  console.log("· wasm-opt aplicado");
} catch {
  /* wasm-opt es opcional */
}

const fuente = readFileSync(join(raiz, "src", "dibu-myst.mjs"), "utf8");
const marca = "const MOTOR_BASE64 = null;";
if (!fuente.includes(marca)) throw new Error(`falta la marca ${marca} en src/dibu-myst.mjs`);
const salida = join(dist, "dibu-myst.mjs");
writeFileSync(salida, fuente.replace(marca, `const MOTOR_BASE64 = ${JSON.stringify(wasm.toString("base64"))};`));
writeFileSync(join(dist, "dibu.wasm"), wasm);
const kb = (n) => `${Math.round(n / 1024)} KiB`;
console.log(`✓ ${salida} (${kb(readFileSync(salida).length)}, motor ${kb(wasm.length)})`);
