---
name: Política de puntuaciones
description: Decisión explícita sobre la validación del ranking global de Pixel Stack.
---

El ranking acepta directamente `{ name, score }` cuando el nombre es válido y la puntuación es un entero positivo. No exigir pruebas firmadas, tokens, acciones, duración ni reconstrucción de la partida.

**Why:** El usuario pidió eliminar explícitamente el bloqueo de verificación y priorizar un guardado sencillo y fiable, aceptando que clientes externos puedan enviar puntuaciones inventadas.

**How to apply:** Mantener validación básica de nombre y `score > 0`, conservar todos los registros y aplicar `ORDER BY score DESC LIMIT 20` solo al leer. No reintroducir anti-cheat sin una nueva petición explícita.