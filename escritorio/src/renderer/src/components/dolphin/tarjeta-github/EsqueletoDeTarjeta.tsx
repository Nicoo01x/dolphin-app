/**
 * Mientras GitHub contesta: la forma de la tarjeta que va a llegar, con sus mismas alturas (título
 * de dos líneas, las filas y, en un PR, los dos boxes), para que al llegar los datos no salte.
 */
function Hueso({ className }: { className: string }) {
  return <span className={`dolphin-tg-hueso block ${className}`} />
}

function TituloEnHueso() {
  return (
    <div className="flex flex-col gap-1 py-px">
      <Hueso className="h-3.5 w-11/12" />
      <Hueso className="h-3.5 w-3/5" />
    </div>
  )
}

function PieEnHueso() {
  return (
    <div className="flex items-center gap-1.5">
      <Hueso className="size-4 rounded-full" />
      <Hueso className="h-3 w-40" />
    </div>
  )
}

function BoxEnHueso() {
  return (
    // 66 px: el alto real del box (8 + rótulo 16 + 6 + barra 6 + 6 + recuento 16 + 8).
    <div className="dolphin-tg-box flex h-[66px] flex-col justify-center gap-2 px-2.5">
      <Hueso className="h-2.5 w-12" />
      <Hueso className="h-1.5 w-full rounded-full" />
      <Hueso className="h-3 w-20" />
    </div>
  )
}

export function EsqueletoDeTarjeta({ tipo }: { tipo: 'issue' | 'pr' }): React.JSX.Element {
  if (tipo === 'pr') {
    return (
      <div aria-hidden className="flex flex-col gap-2.5">
        <TituloEnHueso />
        <Hueso className="h-4 w-48" />
        <div className="grid grid-cols-2 gap-1.5">
          <BoxEnHueso />
          <BoxEnHueso />
        </div>
        <Hueso className="h-4 w-32" />
        <PieEnHueso />
      </div>
    )
  }
  return (
    <div aria-hidden className="flex flex-col gap-2.5">
      <TituloEnHueso />
      <div className="flex gap-1">
        <Hueso className="h-5 w-14 rounded-full" />
        <Hueso className="h-5 w-20 rounded-full" />
      </div>
      <PieEnHueso />
    </div>
  )
}
