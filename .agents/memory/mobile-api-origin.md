---
name: API y ranking en WebView
description: Criterio de conexión para Android empaquetado y significado de la caché offline del ranking.
---

En producción, el cliente debe usar una base HTTPS explícita y configurable para la API. En desarrollo debe seguir conectado al backend del preview, no consultar ni escribir puntuaciones en producción.

**Why:** El origen de una WebView empaquetada puede ser local o no HTTP, aunque el servidor público esté funcionando. Volver a depender exclusivamente de rutas relativas puede enviar las peticiones al contenedor en lugar de a la API.

**How to apply:** Mantener la distinción entre preview y producción al modificar las llamadas, también en el cliente API generado. Una TWA alojada y una WebView con recursos empaquetados no tienen necesariamente el mismo origen.

La caché offline del ranking es únicamente una vista de la última respuesta válida: se debe indicar que puede estar desactualizada y aislarla por servidor. Los envíos de puntuaciones no se reintentan automáticamente.

**Why:** Datos guardados no confirman el estado actual del servidor; repetir un POST tras un timeout puede duplicar una puntuación que sí se guardó.

**How to apply:** Conservar reintentos de lectura y recuperación visible de conexión, sin usar la caché como fuente de verdad para validar una puntuación ni como cola silenciosa de envíos.
