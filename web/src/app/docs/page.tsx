import type { Metadata } from "next";
import { PaginaDoc } from "@/components/docs/PaginaDoc";
import { canonicalDe, SITIO_PUBLICADO } from "@/lib/contenido";
import { paginaDe } from "@/lib/docs/paginas";

const pagina = paginaDe("")!;

export const metadata: Metadata = {
  title: "Documentación",
  description: pagina.resumen,
  openGraph: { title: "Documentación de Dolphin", description: pagina.resumen, ...(SITIO_PUBLICADO ? { url: "/docs" } : {}) },
  ...canonicalDe("/docs"),
};

export default function Docs() {
  return <PaginaDoc pagina={pagina} />;
}
