import { Suspense, useEffect, useState } from 'react'
import { lazyWithRetry as lazy } from '@/app-shell/startup/lazy-with-retry'
import type { AddRemoteHostMode } from '@/components/sidebar/host-admission/ssh/AddRemoteHostDialog'
import type { Delfin, PlantillaDeDelfin } from '../../../../../shared/delfines-types'
import { CrearDelfin } from './CrearDelfin'
import { DelfinesVista } from './DelfinesVista'
import { HablarConDelfin } from './HablarConDelfin'
import { LlevarAlServidor } from './LlevarAlServidor'
import { useManada } from './use-manada'

const AddRemoteHostDialog = lazy(() =>
  import('@/components/sidebar/host-admission/ssh/AddRemoteHostDialog').then((module) => ({
    default: module.AddRemoteHostDialog
  }))
)

type Ventana =
  | { tipo: 'crear'; nace: DOMRect; plantilla?: PlantillaDeDelfin }
  | { tipo: 'hablar'; nace: DOMRect; delfin: Delfin }
  | { tipo: 'llevar'; nace: DOMRect; delfin: Delfin }

/** «Ahora» para las horas relativas: se mueve cada medio minuto, no en cada render. */
function useAhora(): number {
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const reloj = setInterval(() => setAhora(Date.now()), 30_000)
    return () => clearInterval(reloj)
  }, [])
  return ahora
}

/**
 * La página «Delfines»: los bots de Dolphin con su estado, y desde acá se crean, se les habla y se
 * llevan a tu servidor. Los datos son del núcleo (`dolphin bots --json`) por main.
 */
export default function DelfinesPage(): React.JSX.Element {
  const { estado, recargar } = useManada()
  const ahora = useAhora()
  const [ventana, setVentana] = useState<Ventana | null>(null)
  const [conectar, setConectar] = useState<AddRemoteHostMode | null>(null)
  const [conectarMontado, setConectarMontado] = useState(false)
  const cerrar = (): void => setVentana(null)
  return (
    <>
      <DelfinesVista
        estado={estado}
        ahora={ahora}
        acciones={{
          onCrear: (nace, plantilla) =>
            setVentana({ tipo: 'crear', nace, ...(plantilla ? { plantilla } : {}) }),
          onHablar: (delfin, nace) => setVentana({ tipo: 'hablar', nace, delfin }),
          onLlevar: (delfin, nace) => setVentana({ tipo: 'llevar', nace, delfin }),
          onReintentar: () => void recargar()
        }}
      />
      {ventana?.tipo === 'crear' ? (
        <CrearDelfin
          nace={ventana.nace}
          {...(ventana.plantilla ? { inicial: ventana.plantilla } : {})}
          onCerrar={cerrar}
          onCreado={() => {
            cerrar()
            void recargar()
          }}
        />
      ) : null}
      {ventana?.tipo === 'hablar' ? (
        <HablarConDelfin delfin={ventana.delfin} nace={ventana.nace} onCerrar={cerrar} />
      ) : null}
      {ventana?.tipo === 'llevar' ? (
        <LlevarAlServidor
          delfin={ventana.delfin}
          nace={ventana.nace}
          onCerrar={cerrar}
          onLlevado={() => void recargar()}
          onConectar={() => {
            setConectarMontado(true)
            setConectar('server-ssh')
          }}
        />
      ) : null}
      {conectarMontado ? (
        // Una vez abierto queda montado: así su animación de cierre no se corta.
        <Suspense fallback={null}>
          <AddRemoteHostDialog mode={conectar} onOpenChange={setConectar} />
        </Suspense>
      ) : null}
    </>
  )
}
