import { useCallback, useEffect, useState } from 'react'
import type { PreferenciasDeIsla } from '../../../../../shared/dolphin-isla-types'
import { ARMADO_DE_FABRICA, sanearArmado, type ArmadoDeIsla } from './secciones-isla'

/** «ilegibles»: el archivo existe y no se pudo leer; la nota queda en solo lectura para no pisarla. */
export type EstadoDePreferencias = 'cargando' | 'listas' | 'ilegibles'

type Preferencias = {
  estado: EstadoDePreferencias
  armado: ArmadoDeIsla
  notas: string
  /** Si la isla avisa cuando un agente termina o te necesita. De fábrica, sí. */
  avisos: boolean
}

/**
 * Cómo armó cada uno su isla, su nota y si quiere avisos. Las guarda main en un archivo: la ventana
 * de la isla usa una sesión en memoria y su localStorage se borraba con cada reinicio. Hasta que
 * llegan, la isla se ve de fábrica y la nota no se puede editar (si no, lo que se escribiera en ese
 * rato se pisaría).
 */
export function usePreferenciasDeIsla(): Preferencias & {
  cambiarArmado: (armado: ArmadoDeIsla) => void
  cambiarNotas: (notas: string) => void
  cambiarAvisos: (avisos: boolean) => void
} {
  const [preferencias, setPreferencias] = useState<Preferencias>({
    estado: 'cargando',
    armado: ARMADO_DE_FABRICA,
    notas: '',
    avisos: true
  })

  useEffect(() => {
    let vigente = true
    void Promise.resolve<PreferenciasDeIsla | null>(window.api.dolphin.preferenciasDeIsla?.() ?? {})
      .catch((): null => null)
      .then((guardadas) => {
        if (!vigente) {
          return
        }
        setPreferencias((previas) =>
          guardadas === null
            ? { ...previas, estado: 'ilegibles' }
            : {
                estado: 'listas',
                armado: sanearArmado(guardadas.armado),
                notas: typeof guardadas.notas === 'string' ? guardadas.notas : '',
                avisos: guardadas.avisos !== false
              }
        )
      })
    return () => {
      vigente = false
    }
  }, [])

  const cambiarArmado = useCallback((armado: ArmadoDeIsla): void => {
    setPreferencias((previas) => ({ ...previas, armado }))
    void window.api.dolphin.guardarPreferenciasDeIsla?.({ armado })
  }, [])
  const cambiarNotas = useCallback((notas: string): void => {
    setPreferencias((previas) => ({ ...previas, notas }))
    void window.api.dolphin.guardarPreferenciasDeIsla?.({ notas })
  }, [])
  const cambiarAvisos = useCallback((avisos: boolean): void => {
    setPreferencias((previas) => ({ ...previas, avisos }))
    void window.api.dolphin.guardarPreferenciasDeIsla?.({ avisos })
  }, [])

  return { ...preferencias, cambiarArmado, cambiarNotas, cambiarAvisos }
}
