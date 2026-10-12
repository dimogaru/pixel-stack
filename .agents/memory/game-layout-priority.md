---
name: Prioridad de dimensiones del tablero
description: El tablero de Pixel Stack no debe encogerse para acomodar controles.
---

Al corregir superposiciones en Pixel Stack, mantener la altura y anchura originales del tablero y del lienzo. Los botones inferiores deben quedar en flujo vertical justo debajo; si falta altura en la pantalla, permitir que la página crezca o se desplace en lugar de comprimir el área de juego.

**Why:** El usuario rechazó expresamente una corrección con altura fija de viewport y filas de grid porque encogía la zona de juego y se veía mal.

**How to apply:** Resolver nuevas superposiciones con límites del tablero, orden de capas y contenedores independientes para controles; no fijar la altura principal al viewport ni reducir el área de Phaser para hacer sitio a los botones.
