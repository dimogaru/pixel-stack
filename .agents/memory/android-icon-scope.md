---
name: Protección de workflows del proyecto
description: Instrucción permanente de no modificar ni crear commits para los workflows.
---

No modificar ningún archivo dentro de `.github/workflows/`, en particular `.github/workflows/android-build.yml`, ni crear commits para ese archivo. Mantener intacta toda la carpeta.

**Why:** El usuario lo pidió explícitamente para el proyecto, sin limitarlo a los iconos Android ni a esta tarea.

**How to apply:** En cualquier tarea futura, resolver el trabajo sin editar, crear, eliminar o incluir en commits archivos de esa carpeta. Si algo exige cambiarla, explicar el bloqueo en lugar de modificarla.
