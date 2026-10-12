---
name: Alcance de cambios de iconos Android
description: Restricción del usuario sobre workflows al integrar los iconos nativos.
---

Al generar e integrar los recursos del icono Android, el usuario indicó: «IMPORTANTE: No modifiques ningún archivo dentro de .github/workflows/.»

**Why:** El usuario pidió explícitamente que esta corrección se limitara a la integración nativa sin cambios en los workflows.

**How to apply:** En trabajos de iconos Android, conservar esos archivos byte por byte. Si una solución requiere modificar la automatización, explicar el bloqueo y pedir autorización antes de hacerlo.
