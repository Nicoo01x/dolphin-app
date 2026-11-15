import { useState, type ReactNode } from 'react'
import { LandingStartComposer, type SiembraDelPrompt } from '../../landing/LandingStartComposer'
import {
  textoParaElPrompt,
  type PedidoDeMoverTarjeta,
  type TarjetaDelTablero,
  type TarjetaMovida
} from '../../../../../shared/dolphin-tablero-types'
import { useDatosDelInicio } from './use-inicio'
import { VistaDelInicio } from './VistaDelInicio'

/** Sin el puente (cliente web, preload viejo) las tarjetas no se arrastran: no hay quién las mueva. */
function moverConElPuente():
  | ((pedido: PedidoDeMoverTarjeta) => Promise<TarjetaMovida>)
  | undefined {
  const mover = window.api?.dolphin?.moverTarjeta
  return mover ? (pedido) => mover(pedido) : undefined
}

/**
 * La pantalla de inicio de Dolphin: lee los datos de verdad (los mismos que la barra lateral y el
 * tablero del repo) y se los pasa a la vista. La vista no sabe de dónde salen, así se la puede
 * mirar con datos de ejemplo (VistaDelInicio.fixture.tsx).
 *
 * Nico rechazó el 12/10 el estado vacío de un chat («se ve horrible», «tiene mucho IA slop») y el
 * 11/11 pidió que el inicio tenga carácter: docs/reforma/inicio-v2.md.
 */
export function InicioDolphin({
  aviso,
  pie
}: {
  /** Lo que falta en la máquina para trabajar (git, gh). */
  aviso?: ReactNode
  /** Lo que la base pone al pie del inicio (la estrella de GitHub). */
  pie?: ReactNode
}): React.JSX.Element {
  const { datos, releerTablero } = useDatosDelInicio()
  // Tocar una tarjeta sin empezar la siembra en el prompt. Objeto nuevo en cada toque, para que
  // volver a tocar la misma la recargue aunque la persona haya editado el texto en el medio.
  const [siembra, setSiembra] = useState<SiembraDelPrompt | null>(null)
  const sembrar = (repoId: string, tarjeta: TarjetaDelTablero): void =>
    setSiembra({ repoId, texto: textoParaElPrompt(tarjeta) })
  const [mover] = useState(moverConElPuente)

  return (
    <VistaDelInicio
      datos={datos}
      aviso={aviso}
      pie={pie}
      compositor={<LandingStartComposer siembra={siembra} />}
      onElegir={sembrar}
      mover={mover}
      onReleer={releerTablero}
    />
  )
}
