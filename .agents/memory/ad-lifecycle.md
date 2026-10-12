---
name: Integridad de anuncios al terminar partida
description: Requisito del producto y criterio de cancelación para proveedores que no permiten abortar una presentación.
---

Pixel Stack debe tener una única oportunidad de anuncio por fin de partida, sin superposición al perder o reiniciar rápidamente. Al reiniciar o cambiar de pantalla, los anuncios pendientes no deben mostrarse después ni modificar el audio de la nueva partida.

**Why:** El usuario informó de anuncios nativos casi simultáneos al perder o reiniciar y pidió bloqueo, cooldown y limpieza de eventos.

**How to apply:** Mantener este requisito al añadir o sustituir proveedores. No interpretar que una promesa de presentación resuelta significa que el anuncio ya se cerró.

Si el SDK no permite abortar físicamente una operación ya entregada, invalidar sus efectos sobre el juego, pero conservar la exclusión hasta la confirmación terminal del proveedor. Es preferible omitir futuros anuncios a permitir dos anuncios simultáneos por un desbloqueo prematuro.

**Why:** AdSense no expone cancelación para una llamada adBreak ya entregada; los SDK nativos pueden resolver la llamada de mostrar antes de emitir el cierre. Cancelar solo el estado local no detiene esos proveedores.

**How to apply:** No liberar el bloqueo por reinicio, navegación o un timeout mientras el proveedor pueda seguir activo. Distinguir la prueba con puentes simulados de una comprobación en Android real.
