#!/usr/bin/env bash
# Construye el sitio de ejemplo con mystmd y verifica que el plugin haya dibujado todo:
# ningún bloque estructura/statics/dibu ni directiva sin dibujar, cada imagen en public/ y
# ninguna advertencia de dibu. Con --pdf también exporta el apunte a PDF con Typst.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f dist/dibu-myst.mjs ] || node scripts/construir.mjs
mkdir -p salida && cd ejemplo
rm -rf _build/site _build/cache _build/exports
myst build --site --strict 2>&1 | tee ../salida/myst.log
python3 - <<'PY'
import glob, json, os, sys
paginas = glob.glob("_build/site/content/*.json")
assert paginas, "no se generó el contenido del sitio"
imagenes, errores = 0, []
def recorrer(n, pagina):
    global imagenes
    t = n.get("type")
    if t == "code" and n.get("lang") in ("estructura", "statics", "dibu"):
        errores.append(f"{pagina}: bloque {n.get('lang')} sin dibujar")
    if t == "mystDirective" or (t == "admonition" and n.get("kind") == "danger"):
        errores.append(f"{pagina}: {t} sin procesar o con error")
    if t == "image":
        imagenes += 1
        url = n.get("url", "")
        if not os.path.exists("_build/site/public" + url):
            errores.append(f"{pagina}: falta la imagen {url}")
    for c in n.get("children", []):
        recorrer(c, pagina)
for p in paginas:
    recorrer(json.load(open(p))["mdast"], os.path.basename(p))
print(f"páginas: {len(paginas)}, diagramas: {imagenes}")
if imagenes < 5:
    errores.append(f"se esperaban al menos 5 diagramas, hay {imagenes}")
if errores:
    print("\n".join(errores)); sys.exit(1)
PY
if grep -v "🔌" ../salida/myst.log | grep -q "dibu"; then echo "✗ advertencias de dibu en el build"; exit 1; fi
echo "✓ sitio de ejemplo"
if [ "${1:-}" = "--pdf" ]; then
  myst build --pdf --strict
  test -s _build/exports/apunte.pdf
  echo "✓ PDF con Typst ($(du -h _build/exports/apunte.pdf | cut -f1))"
fi
