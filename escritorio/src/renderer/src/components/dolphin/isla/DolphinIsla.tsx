import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { translate } from '@/i18n/i18n'
import type { DashboardSnapshot } from '../../../../../shared/dashboard-snapshot'
import type { PedidoDeRespuesta } from './IslaAgentes'
import { IslaAviso } from './IslaAviso'
import { CabeceraIsla } from './isla-cabecera'
import { PanelDeIsla } from './isla-panel'
import { detalleDeAviso, irAlAgente, tituloDeAviso } from './isla-piezas'
import { ordenarParaIsla, resumirIsla } from './resumen-isla'
import { seccionesVisibles, type SeccionDeIsla } from './secciones-isla'
import {
  MARGEN_ISLA,
  useCruceDeContenido,
  useFormaDeIsla,
  type FormaDeIsla
} from './use-forma-isla'
import { useAvisosDeIsla, useChoquesDeIsla } from './use-avisos-isla'
import { usePreferenciasDeIsla } from './use-preferencias-isla'
import { useArrastreDeIsla } from './use-arrastre-isla'

/**
 * La isla de Dolphin, como la Dynamic Island: una pastilla negra arriba de la pantalla, siempre a la
 * vista, con lo que más importa ahora y cuántos agentes hay en cada estado. Cuando uno termina o te
 * necesita, se estira en un aviso («Abrir», «Responder») y vuelve sola. Al tocarla se abre en
 * secciones —los agentes, a los que se les puede responder desde acá, la bandeja de Dolphin y una
 * nota— que cada uno arma a gusto. Esc o salir de la isla la vuelven a cerrar.
 *
 * Las tres formas son capas dentro de la misma forma negra, y `useFormaDeIsla` las cruza con un
 * resorte. La ventana es transparente: lo que se ve es la forma. La forma recorta con
 * `overflow: clip` y no con hidden: hidden se deja correr desde el código, y un foco que llegaba
 * antes de que la forma creciera corría el aviso para arriba y lo dejaba cortado.
 */
export function DolphinIsla({
  snapshot
}: {
  snapshot: DashboardSnapshot | null
}): React.JSX.Element {
  const [abierta, setAbierta] = useState(false)
  const [vez, setVez] = useState(0)
  const [armando, setArmando] = useState(false)
  const preferencias = usePreferenciasDeIsla()
  const choques = useChoquesDeIsla()
  const [elegida, setElegida] = useState<SeccionDeIsla>('agentes')
  const [encima, setEncima] = useState(false)
  const [responderA, setResponderA] = useState<PedidoDeRespuesta | null>(null)
  const cards = useMemo(() => snapshot?.cards ?? [], [snapshot])
  const resumen = useMemo(() => resumirIsla(cards), [cards])
  const lista = useMemo(() => ordenarParaIsla(cards), [cards])
  const visibles = useMemo(() => seccionesVisibles(preferencias.armado), [preferencias.armado])
  const actual = visibles.includes(elegida) ? elegida : visibles[0]
  const caparazon = useRef<HTMLElement>(null)
  const capaCompacta = useRef<HTMLDivElement>(null)
  const capaAviso = useRef<HTMLDivElement>(null)
  const capaAbierta = useRef<HTMLDivElement>(null)

  const { aviso, enCapa, enEspera, descartar, vaciar } = useAvisosDeIsla({
    snapshot,
    choques,
    activos: preferencias.avisos,
    abierta,
    encima
  })
  const forma: FormaDeIsla = abierta ? 'abierta' : aviso ? 'aviso' : 'compacta'
  useFormaDeIsla({
    forma,
    caparazon,
    capas: { compacta: capaCompacta, aviso: capaAviso, abierta: capaAbierta }
  })
  useCruceDeContenido(capaAviso, aviso?.id ?? null)

  // El foco sigue a la forma: si quedó en una capa que se fue (o en ningún lado), pasa al primer
  // control de la que está. Si ya está adentro (la respuesta que abrió «Responder»), no se toca.
  // Al nacer no: un anillo de foco en la isla recién mostrada no lo pidió nadie.
  const formaConFoco = useRef<FormaDeIsla | null>(null)
  useLayoutEffect(() => {
    const previa = formaConFoco.current
    formaConFoco.current = forma
    const capa = { compacta: capaCompacta, aviso: capaAviso, abierta: capaAbierta }[forma].current
    if (previa === null || previa === forma || !capa || capa.contains(document.activeElement)) {
      return
    }
    // Sin scroll: mientras la forma crece, el botón todavía queda afuera y el navegador correría
    // lo de adentro para mostrarlo.
    capa.querySelector<HTMLElement>('button, input')?.focus({ preventScroll: true })
  }, [forma])

  // Cada apertura arranca de cero (la lista de agentes también, ver PanelDeIsla); «Responder»
  // abre además la respuesta a ese agente.
  const abrir = useCallback(
    (pedido: PedidoDeRespuesta | null = null): void => {
      vaciar()
      setArmando(false)
      setResponderA(pedido)
      setVez((previa) => previa + 1)
      setAbierta(true)
    },
    [vaciar]
  )
  const soltarPedido = useCallback((): void => setResponderA(null), [])
  const cerrar = useCallback((): void => {
    setAbierta(false)
    setArmando(false)
  }, [])
  const arrastre = useArrastreDeIsla()
  useEffect(() => {
    // La página entera es transparente: la ventana no tiene marco ni fondo.
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    window.addEventListener('blur', cerrar)
    return () => window.removeEventListener('blur', cerrar)
  }, [cerrar])

  // Esc cierra la isla abierta, o descarta el aviso que está a la vista.
  useEffect(() => {
    const conTecla = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') {
        return
      }
      if (abierta) {
        cerrar()
      } else if (aviso) {
        descartar()
      }
    }
    window.addEventListener('keydown', conTecla)
    return () => window.removeEventListener('keydown', conTecla)
  }, [abierta, aviso, cerrar, descartar])

  return (
    <div
      className="flex h-screen w-screen justify-center overflow-clip font-sans select-none"
      style={{ paddingTop: MARGEN_ISLA.arriba }}
    >
      {/* El lector de pantalla se entera de cada aviso por acá: una región que existe desde el
          principio (la capa del aviso nace o se prende con el texto adentro, y ahí no se anuncia). */}
      <p role="status" aria-live="polite" className="sr-only">
        {aviso ? `${tituloDeAviso(aviso)}. ${detalleDeAviso(aviso)}` : ''}
      </p>
      <section
        ref={caparazon}
        aria-label={translate('auto.components.dolphin.isla.label', 'Dolphin island')}
        onPointerEnter={() => {
          setEncima(true)
          void window.api.dolphin.ratonEnIsla?.(true)
        }}
        onPointerLeave={() => {
          setEncima(false)
          void window.api.dolphin.ratonEnIsla?.(false)
        }}
        className="relative shrink-0 overflow-clip rounded-[22px] bg-[#0b0b0b] text-white shadow-[0_1px_2px_rgba(0,0,0,0.5),0_8px_24px_-6px_rgba(0,0,0,0.55)] ring-1 ring-white/10"
      >
        <div
          ref={capaCompacta}
          inert={forma !== 'compacta'}
          className="absolute top-0 left-1/2 w-max max-w-[380px] min-w-[240px]"
        >
          <CabeceraIsla
            resumen={resumen}
            abierta={false}
            onAlternar={() => abrir()}
            {...arrastre}
          />
        </div>
        <div
          ref={capaAviso}
          inert={forma !== 'aviso'}
          className="absolute top-0 left-1/2 w-[380px]"
        >
          {enCapa ? (
            <IslaAviso
              aviso={enCapa}
              cuantosMas={enEspera}
              puedeResponder={visibles.includes('agentes') && enCapa?.tipo !== 'choque'}
              onAbrir={() => {
                if (enCapa.tipo === 'choque') {
                  void window.api.dolphin.orquestacionAbrir()
                } else {
                  irAlAgente(enCapa.card)
                }
                descartar()
              }}
              onResponder={() => {
                if (enCapa.tipo === 'choque') {
                  return
                }
                setElegida('agentes')
                abrir({ paneKey: enCapa.card.paneKey, vez: Date.now() })
              }}
              onDescartar={descartar}
            />
          ) : null}
        </div>
        <div
          ref={capaAbierta}
          inert={forma !== 'abierta'}
          className="absolute top-0 left-1/2 w-[404px]"
        >
          <CabeceraIsla resumen={resumen} abierta onAlternar={cerrar} {...arrastre} />
          <PanelDeIsla
            visibles={visibles}
            actual={actual}
            onElegir={(seccion) => {
              setElegida(seccion)
              setArmando(false)
            }}
            armando={armando}
            onArmando={setArmando}
            armado={preferencias.armado}
            onCambiarArmado={preferencias.cambiarArmado}
            avisos={preferencias.avisos}
            onCambiarAvisos={preferencias.cambiarAvisos}
            onVolverArriba={() => void window.api.dolphin.volverArribaIsla()}
            lista={lista}
            onIr={cerrar}
            responderA={responderA}
            onPedidoAtendido={soltarPedido}
            notas={preferencias.notas}
            estadoDeNotas={preferencias.estado}
            onCambiarNotas={preferencias.cambiarNotas}
            vez={vez}
            tablero={snapshot?.generatedAt ?? 0}
          />
        </div>
      </section>
    </div>
  )
}
