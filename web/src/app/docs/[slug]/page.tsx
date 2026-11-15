import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PaginaDoc } from "@/components/docs/PaginaDoc";
import { canonicalDe, SITIO_PUBLICADO } from "@/lib/contenido";
import { PAGINAS, paginaDe, rutaDe } from "@/lib/docs/paginas";

// Solo existen las páginas que están en los datos: el export estático no inventa rutas.
export const dynamicParams = false;

export function generateStaticParams() {
  return PAGINAS.filter((p) => p.slug !== "").map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const pagina = paginaDe(slug);
  if (!pagina) return {};
  return {
    title: pagina.titulo,
    description: pagina.resumen,
    openGraph: { title: `${pagina.titulo} · Dolphin`, description: pagina.resumen, type: "article", ...(SITIO_PUBLICADO ? { url: rutaDe(slug) } : {}) },
    ...canonicalDe(rutaDe(slug)),
  };
}

export default async function PaginaDeLaDoc({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pagina = paginaDe(slug);
  if (!pagina) notFound();
  return <PaginaDoc pagina={pagina} />;
}
