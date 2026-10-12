---
name: Puente AdMob en Capacitor
description: Diferencia no obvia entre el plugin oficial actual y los globals heredados de WebView.
---

El plugin oficial actual de AdMob para Capacitor expone un proxy registrado con `registerPlugin`; detectar un contenedor nativo no garantiza que `window.Capacitor.Plugins.AdMob` exista. El ID de aplicación de AdMob exigido por Android no es el ID del bloque intersticial.

**Why:** El proyecto identificaba Android pero intentaba usar exclusivamente el global legado y por ello podía omitir silenciosamente la publicidad nativa; el build debe registrar el plugin y declarar el ID de aplicación, además de usar el ID del anuncio al precargar.

**How to apply:** En cambios futuros de publicidad Android, comprobar que el código usa el plugin instalado, que `cap sync android` lo registra, y que la carga del módulo nativo está condicionada para no ejecutarse en el navegador. Mantener la verificación de eventos de cierre antes de liberar el bloqueo de anuncios.
