---
name: Integridad de puntuaciones
description: Regla de seguridad para rankings de juegos cuyo cliente se ejecuta en un navegador no confiable.
---

Una prueba firmada solo demuestra que el servidor emitió una partida; no demuestra que los eventos o la puntuación enviados por el navegador sean reales. El servidor debe reconstruir la partida desde una semilla propia y acciones mínimas, y derivar por sí mismo tablero, niveles, líneas, peligros temporales, final de partida y puntuación.

**Why:** Un resumen de eventos firmado indirectamente seguía permitiendo inventar limpiezas de filas y niveles altos mientras se respetaban límites superficiales de tiempo.

**How to apply:** Ante cualquier cambio de reglas, tiempo o puntuación, mantener cliente y replay en sincronía, exigir un estado terminal válido y conservar pruebas adversariales de secuencias imposibles, totales alterados y pruebas reutilizadas.