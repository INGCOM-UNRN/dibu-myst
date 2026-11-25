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
`releases/download/vX.Y.Z/dibu-myst.mjs`.

También se puede guardar una copia en el sitio, en `plugins/dibu-myst.mjs`, y cargarla con
`- plugins/dibu-myst.mjs`: el build no depende de la red y el plugin cambia sólo cuando se
actualiza la copia ([Actualizar el plugin en los sitios](#actualizar-el-plugin-en-los-sitios)).
Así lo usan los apuntes de C y de Java.

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

Para mostrar la sintaxis sin dibujar el diagrama, usá `{code}`: los bloques
```` ```{code} estructura ```` y ```` ```{code-block} estructura ```` quedan como código.

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

## Actualizar el plugin en los sitios

Para los sitios que guardan una copia en `plugins/dibu-myst.mjs`:

```bash
# compilando el plugin desde este repositorio, con el dibu de ../dibu:
scripts/actualizar-sitio.sh --commit ../../c/contenido/apunte ../../java/contenido/apunte
# o con un release publicado (verifica su SHA256SUMS):
scripts/actualizar-sitio.sh --release v0.2.0 --commit SITIO...
```

Para cada sitio, el script:

1. comprueba que el `myst.yml` cargue `plugins/dibu-myst.mjs`;
2. no hace nada si la copia ya es idéntica;
3. copia el plugin nuevo y construye el sitio con `myst build --site`. Si el build falla, el
   plugin no carga o informa errores, restaura la copia anterior y muestra el log;
4. con `--commit`, hace el commit sólo de `plugins/dibu-myst.mjs`
   (`build(myst): actualizar dibu-myst a X.Y.Z (dibu <commit>)`). Nunca hace push.

Cada copia lleva la versión del plugin y el commit de dibu de su motor (`MOTOR`, que también
aparece en el log de myst: `🔌 dibu 0.1.0 (motor 4e62d0a)`). Cuando cambia dibu (diagramas
nuevos, correcciones), el procedimiento es:

1. en `dibu`: commit y push (el CI tiene que pasar);
2. en `dibu-myst`: `npm test` y `npm run test:sitio` con el dibu nuevo;
3. `scripts/actualizar-sitio.sh --commit SITIO...` y, después de revisar, push de cada sitio.

Si un sitio tiene errores de dibu en su contenido (un bloque inválido), el build de prueba falla
también con el plugin actual: hay que corregir el bloque antes de actualizar. `--sin-probar`
saltea el build.

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
