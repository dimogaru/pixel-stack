---
name: Persistencia del ranking
description: Decisión de almacenamiento permanente y concurrencia para el Top 20 de Pixel Stack.
---

El ranking global usa PostgreSQL administrado por Replit como única fuente de verdad. SQLite no debe volver a utilizarse para puntuaciones publicadas.

**Why:** El filesystem de una aplicación publicada se restablece al republicar, por lo que ninguna ruta SQLite garantiza persistencia. Además, la inserción y poda simultáneas deben serializarse para no dejar más de 20 filas.

**How to apply:** Declarar el esquema en la fuente Drizzle, dejar que Publish sincronice producción y mantener inserción+poda en una transacción protegida por bloqueo advisory. La primera publicación de esta migración debe conservar los datos ya sembrados en desarrollo.