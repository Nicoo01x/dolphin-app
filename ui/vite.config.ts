import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// La consola de dolphin: en dev, Vite proxea /api y /en-vivo al servidor
// de dolphin (npm run ui en la raíz); en producción el build queda en
// dist/ y lo sirve ese mismo servidor, sin ningún proceso extra.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:4811",
      "/en-vivo": "http://127.0.0.1:4811",
    },
  },
  build: { chunkSizeWarningLimit: 900 },
});
