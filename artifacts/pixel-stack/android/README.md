# Iconos nativos de Pixel Stack

Los recursos de `app/src/main/res/mipmap-*` se exportan desde
`../public/icon-512.svg`. Incluyen iconos estáticos normales/redondos y
foreground transparente para iconos adaptativos. Android 13+ también utiliza
ese foreground como capa monocroma para iconos temáticos.

Esta carpeta contiene la estructura nativa completa, basada en la plantilla
Android de Capacitor 8.5.3, conservando `com.pixelstack.app`, el identificador
que ya utiliza el build. Se persiste la plataforma para no necesitar regenerar
la plantilla ni modificar el workflow para conservar los iconos.

`capacitor sync android` genera los ajustes de plugins/Gradle y copia la web;
los iconos y el manifest se mantienen como fuentes del proyecto Android.
No se ha añadido un capacitor.config al repositorio: la inicialización existente
del build sigue creándolo con sus valores actuales.

Para volver a exportar el logo, desde `artifacts/pixel-stack`:

```sh
python3 scripts/generate-android-icons.py
```

ImageMagick solo se necesita al regenerar las imágenes, no en la app web ni
para compilar los PNG ya guardados. No se modificaron archivos de
`.github/workflows/`.
