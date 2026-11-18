import type { Metadata } from "next";
import { Escena } from "@/components/Escena";
import { Preguntas } from "@/components/Preguntas";
import { DatosEstructurados } from "@/components/DatosEstructurados";
import { canonicalDe, SITIO_PUBLICADO } from "@/lib/contenido";
import { PREGUNTAS, respuestaEnTexto } from "@/lib/preguntas";

const DESCRIPCION =
  "Cuánto cuesta, cómo se instala, cómo se reparte el trabajo entre agentes, cómo se corre en tu VPS, qué datos manda y más: las preguntas frecuentes de Dolphin.";

export const metadata: Metadata = {
  title: "Preguntas frecuentes",
  description: DESCRIPCION,
  openGraph: { title: "Preguntas frecuentes de Dolphin", description: DESCRIPCION, ...(SITIO_PUBLICADO ? { url: "/preguntas" } : {}) },
  ...canonicalDe("/preguntas"),
};

export default function PaginaPreguntas() {
  return (
    <Escena>
      <DatosEstructurados
        datos={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: PREGUNTAS.map((q) => ({
            "@type": "Question",
            name: q.p,
            acceptedAnswer: { "@type": "Answer", text: respuestaEnTexto(q) },
          })),
        }}
      />
      <Preguntas todas />
    </Escena>
  );
}
