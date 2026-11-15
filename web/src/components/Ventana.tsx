import { Logo } from "./Logo";

/**
 * El marco de una captura: un filete alrededor, la barra con el logo y dónde estás, y la captura
 * abajo. Es el mismo de «Así se ve navegar», para que todas las capturas del sitio se lean igual.
 *
 * Sin esquinas redondeadas y sin los tres puntitos de una ventana de Mac: lo que enmarca acá es el
 * filete, igual que en las láminas (`laminas/Mar.tsx`). La etiqueta es un rótulo, en mayúsculas con
 * tracking, no el título de una ventana de verdad.
 */
export function Ventana({ etiqueta, className = "", children }: { etiqueta: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`relative overflow-hidden bg-app-2 ring-1 ring-app-espuma/10 ${className}`}>
      {/* La barra es de la APP y la app es oscura: con los tokens del sitio quedaba una barra
          blanca pegada arriba de una captura negra, como si fueran dos cosas distintas. */}
      <div className="flex items-center gap-2.5 border-b border-app-espuma/10 px-4 py-2.5">
        <Logo className="h-3 w-auto flex-none text-app-tinta/55" />
        <span className="min-w-0 truncate font-codigo text-[13px] text-app-apagado">{etiqueta}</span>
      </div>
      {children}
    </div>
  );
}
