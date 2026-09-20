import path from "path";
import express from "express"; // Asegúrate de tener importado express si no estaba arriba

// ... (tu código actual de validación del PORT) ...

// 1. Resolver la ruta estática a la carpeta dist de pixel-stack
const clientDistPath = path.resolve(process.cwd(), "artifacts/pixel-stack/dist");

// 2. Servir los archivos estáticos de Vite/Phaser (js, css, imágenes)
app.use(express.static(clientDistPath));

// 3. Captura global para SPA (Single Page Application)
// Redirige cualquier petición que no sea de la API hacia el index.html del frontend
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) {
    return next();
  }
  res.sendFile(path.join(clientDistPath, "index.html"));
});

// Tu app.listen actual
app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
