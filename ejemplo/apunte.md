---
title: Apunte de ejemplo
---

## Pilas

Después de `push(3)`, `push(7)`, `push(1)`, `pop()` y `push(9)` en un arreglo de 5 enteros, la
pila queda como en la {numref}`fig-pila`.

```{dibu}
:caption: Pila en un arreglo, con las direcciones de cada lugar.
:label: fig-pila
:width: 60%
type: stack
values: [3, 7, 9]
capacity: 5
showAddresses: true
```

## Mapas de Karnaugh

El diagrama también puede estar en un archivo aparte, y tener otro theme:

```{dibu} diagramas/karnaugh.yaml
:theme: color
:width: 50%
```

## Control

```{dibu}
:caption: Diagrama de Bode con asíntotas y márgenes de estabilidad.
:label: fig-bode
type: bode
system: {k: 200, poles: [-1, -10]}
margins: true
asymptotes: true
```

## Ejercicio

Complete la prueba de escritorio:

```estructura
type: trace_table
title: Prueba de escritorio
columns: [i, suma]
rows: [[0, 0], [1, null]]
rowCount: 5
```
