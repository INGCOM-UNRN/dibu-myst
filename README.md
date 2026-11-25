# dibu-myst

Plugin de [MyST](https://mystmd.org) (`mystmd`) que dibuja los diagramas de
[dibu](https://github.com/INGCOM-UNRN/dibu) al construir el sitio o las exportaciones a PDF.
El motor de dibu va embebido como WebAssembly en un único archivo `.mjs`: no hace falta instalar
dibu ni versionar SVG pregenerados.

## Uso

En el `myst.yml` del proyecto:

```yaml
project:
  plugins:
    - https://github.com/INGCOM-UNRN/dibu-myst/releases/latest/download/dibu-myst.mjs
```

mystmd descarga el plugin y lo guarda en su caché. Para fijar una versión, usar
`releases/download/vX.Y.Z/dibu-myst.mjs`. También se puede descargar el archivo y poner la ruta
local.

### Bloques de código

Los bloques ```` ```estructura ````, ```` ```statics ```` y ```` ```dibu ```` se dibujan solos. Es
la misma sintaxis de `dibu sync-md` y de los bancos de alucarD, así que los apuntes existentes
funcionan sin cambios:

````markdown
```estructura
type: stack
values: [3, 7, 1]
capacity: 5
```
````

### Directiva `{dibu}`

La directiva (alias `{estructura}`) agrega opciones y figuras numeradas:

````markdown
```{dibu}
:caption: Pila en un arreglo, con sus direcciones.
:label: fig-pila
:width: 60%
:theme: color
type: stack
values: [3, 7, 9]
showAddresses: true
```

Como se ve en la {numref}`fig-pila`…

```{dibu} diagramas/karnaugh.yaml
:theme: dark
```
````

| Opción | |
|---|---|
| argumento | Un archivo YAML/JSON con los bloques, relativo a la página (en vez del cuerpo). |
| `:theme:` | `ink`, `color`, `high-contrast`, `dark` o JSON `{"extends": "color", "colors": {…}}`. |
| `:width:` | Ancho de la imagen (`80%`, `400px`). |
| `:align:` | `left`, `center` (por omisión) o `right`. |
| `:alt:` | Texto alternativo; por omisión, el tipo y el título de cada bloque. |
| `:caption:` | Epígrafe (Markdown); convierte el diagrama en una figura numerada. |
| `:label:` | Etiqueta para referenciar la figura. |
| `:class:` | Clases CSS de la imagen. |

El cuerpo puede tener varios bloques (una lista YAML): se apilan verticalmente, como en
`dibu sync-md`. Los campos de cada tipo están en el [manual de dibu](https://ingcom-unrn.github.io/dibu/).

### Errores

Un bloque inválido se muestra en la página como un recuadro de error, con el bloque, y se
informa como error del build: `myst build --strict` falla.

### Configuración

Por variables de entorno, porque mystmd no pasa opciones a los plugins:

| Variable | |
|---|---|
| `DIBU_THEME` | Theme por omisión de todos los diagramas: un nombre o JSON. |
| `DIBU_MYST_SALIDA` | `embebido` (por omisión): cada SVG va en la página como data URI y mystmd lo copia a `public/`, sin escribir archivos en las fuentes. `diagramas`: escribe `diagramas/estructura-<hash>.svg` al lado de cada página, con el mismo nombre y contenido que `dibu sync-md`, para versionarlos. |

```bash
DIBU_THEME=high-contrast myst build --html
```

## Desarrollo

Requiere Node ≥ 18, Rust con el target `wasm32-unknown-unknown` y el repositorio `dibu` al
lado (`../dibu`): el motor es su crate `dibu-wasm`.

```bash
npm run build       # compila el motor y genera dist/dibu-myst.mjs (con wasm-opt si está)
npm test            # pruebas del plugin con árboles mdast (node:test)
npm run test:sitio  # construye ejemplo/ con mystmd y verifica los diagramas (--pdf: también el PDF)
```

- `src/dibu-myst.mjs`: el plugin. Sin el motor embebido, carga `../dibu/target/…/dibu_wasm.wasm`
  (o `DIBU_WASM`).
- `scripts/construir.mjs`: genera `dist/dibu-myst.mjs` con el motor embebido en base64.
- `pruebas/plugin.test.mjs`: bloques, errores, themes, la directiva y la paridad con
  `dibu sync-md` sobre el kitchen sink de dibu.
- `ejemplo/`: un sitio MyST con bloques, figuras, referencias y un archivo externo.

## Integración continua y publicación

- `ci.yml`: en cada push y PR, y a mano eligiendo la rama o el tag de dibu. Clona
  `INGCOM-UNRN/dibu` al lado, construye el plugin, corre las pruebas y construye el sitio de
  ejemplo y su PDF con mystmd y Typst. Deja `dist/` como artefacto.
- `release.yml`: al empujar un tag `vX.Y.Z` igual a la versión de `package.json` (y de
  `VERSION` en `src/dibu-myst.mjs`), publica `dibu-myst.mjs` y su `SHA256SUMS`.
- `mantenimiento.yml`: los lunes compila y prueba contra `dibu` `main` y la última versión de
  mystmd.

## Licencia

GPL-3.0-or-later, como dibu.
