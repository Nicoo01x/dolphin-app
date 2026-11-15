import type { NextConfig } from "next";

// La web es estática: se publica como archivos (out/), sin servidor.
const config: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  reactStrictMode: true,
  // Hay otros lockfiles más arriba (el núcleo): la raíz de la web es esta carpeta.
  turbopack: { root: __dirname },
};

export default config;
