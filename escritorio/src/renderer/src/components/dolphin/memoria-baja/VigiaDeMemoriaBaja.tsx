import { Suspense, useEffect, useState } from 'react'
import { lazyWithRetry as lazy } from '@/app-shell/startup/lazy-with-retry'
import { encolarAviso } from '../avisos/avisos-store'
import { cambiarConexionDesdeElCartel, useConexionDesdeElCartel } from './acciones-del-cartel'
import { avisoDeMemoriaBaja } from './aviso-de-memoria-baja'

// Fuera del arranque: casi nadie lo abre desde acá, y la ventana de inicio no tiene por qué cargarlo.
const AddRemoteHostDialog = lazy(() =>
  import('@/components/sidebar/host-admission/ssh/AddRemoteHostDialog').then((module) => ({
    default: module.AddRemoteHostDialog
  }))
)

/**
 * Escucha al vigía de main y pone el cartel en la cola cuando toca. Cuándo toca lo decide main
 * (umbral, histéresis, una vez por episodio); acá no se cuenta nada.
 *
 * También monta «Conectar una máquina» para el botón del cartel sin servidor: el cartel ya se fue
 * cuando el diálogo abre, así que tiene que vivir afuera de él. Una vez abierto queda montado, para
 * que su animación de cierre no se corte.
 */
export function VigiaDeMemoriaBaja(): React.JSX.Element | null {
  const modo = useConexionDesdeElCartel((estado) => estado.modo)
  const [montado, setMontado] = useState(false)
  if (modo !== null && !montado) {
    setMontado(true)
  }

  useEffect(() => {
    const api = window.api?.memoriaBaja
    if (!api) {
      return
    }
    return api.alAvisar((aviso) => encolarAviso(avisoDeMemoriaBaja(aviso)))
  }, [])

  if (!montado) {
    return null
  }
  return (
    <Suspense fallback={null}>
      <AddRemoteHostDialog mode={modo} onOpenChange={cambiarConexionDesdeElCartel} />
    </Suspense>
  )
}
