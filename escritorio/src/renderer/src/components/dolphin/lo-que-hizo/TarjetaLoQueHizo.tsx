import { createPortal } from 'react-dom'
import { GitPullRequest, X } from 'lucide-react'
import type { AgentType } from '../../../../../shared/agent-status/contracts/agent-status-types'
import { formatAgentTypeLabel } from '../../../../../shared/agent-status/presentation/agent-type-label'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'
import { openExternalUrl } from '@/lib/external-url'
import { AgentIcon } from '../../agent/icons/AgentIcon'
import { isTuiAgent } from '../../../../../shared/agent-launch/catalog/tui-agent-config'
import { useArrastreParaDescartar } from '../../native-chat/use-arrastre-para-descartar'
import { DiffIncrustado } from './DiffIncrustado'
import { marcaDeTiempo, type LoQueHizo, type PasoDeLoQueHizo } from './pasos'
import { detalleDe, resultadoDe, resumenDeCabecera, tipoDe, verboDe } from './textos'
import './lo-que-hizo.css'

/**
 * «Lo que hizo <agente>»: un turno del agente para leer de un vistazo y pasarlo
 * (`docs/reforma/codigo-y-resumen-del-agente.md`, la referencia es la tarjeta «What Lantern did»).
 *
 * Cabecera con el motor, los archivos y cuánto tardó; una línea de tiempo con la marca en pastilla
 * monoespaciada, la frase y el tipo o el resultado; el diff incrustado debajo de cada edición; y el
 * PR al pie si el turno abrió uno.
 */

export type DatosDeLoQueHizo = {
  readonly agente: AgentType
  readonly resumen: LoQueHizo
  readonly pr: { readonly numero: number; readonly url: string } | null
}

function Paso({ paso }: { paso: PasoDeLoQueHizo }): React.JSX.Element {
  return (
    <li className="flex flex-col gap-3 px-5 py-3.5">
      <div className="flex items-start gap-3">
        <span className="lo-que-hizo-marca mt-px shrink-0 rounded-md px-1.5 font-mono text-xs leading-6 tabular-nums">
          {paso.segundo === null ? '–:––' : marcaDeTiempo(paso.segundo)}
        </span>
        <p className="min-w-0 flex-1 text-[15px] leading-6 text-foreground">
          {verboDe(paso.accion)}{' '}
          <code className="font-mono text-[13px] break-all">{paso.objeto}</code>
          {paso.detalle && paso.tipo !== 'edito' ? (
            <span className="text-muted-foreground">: {detalleDe(paso.detalle)}</span>
          ) : null}
        </p>
        <span
          className={cn(
            'shrink-0 text-sm leading-6',
            paso.resultado === 'fallo' && 'lo-que-hizo-fallo',
            paso.resultado === 'arreglo' && 'lo-que-hizo-arreglo',
            !paso.resultado && 'text-muted-foreground'
          )}
        >
          {paso.resultado ? resultadoDe(paso.resultado) : tipoDe(paso.tipo)}
        </span>
      </div>
      {paso.diff ? <DiffIncrustado archivo={paso.diff} /> : null}
    </li>
  )
}

/** La tarjeta sola, sin ventana: la usa la ventana y la usan las fixtures. */
export function TarjetaLoQueHizo({
  datos,
  onCerrar
}: {
  datos: DatosDeLoQueHizo
  onCerrar?: () => void
}): React.JSX.Element {
  const motor = formatAgentTypeLabel(datos.agente)
  const { pasos, archivos, segundos } = datos.resumen
  return (
    <div className="lo-que-hizo flex max-h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 px-5 py-4">
        {isTuiAgent(datos.agente) ? <AgentIcon agent={datos.agente} size={20} /> : null}
        <h2 className="min-w-0 flex-1 truncate font-display text-[17px] font-medium tracking-tight text-foreground">
          {translate('auto.components.dolphin.loQueHizo.titulo', 'What {{value0}} did', {
            value0: motor
          })}
        </h2>
        <span className="shrink-0 text-sm text-muted-foreground">
          {resumenDeCabecera(motor, archivos, segundos)}
        </span>
        {onCerrar ? (
          <button
            type="button"
            onClick={onCerrar}
            aria-label={translate('auto.components.dolphin.loQueHizo.cerrar', 'Close')}
            className="-mr-1.5 flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96]"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </header>
      <ol className="lo-que-hizo-pasos min-h-0 flex-1 overflow-y-auto scrollbar-sleek">
        {pasos.map((paso) => (
          <Paso key={paso.clave} paso={paso} />
        ))}
      </ol>
      <footer className="flex items-center gap-4 px-5 py-4">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">
          {translate(
            'auto.components.dolphin.loQueHizo.pie',
            'Kept with the session, for anyone on the team to read.'
          )}
        </p>
        {datos.pr ? (
          <button
            type="button"
            onClick={() => void openExternalUrl(datos.pr!.url)}
            className="flex h-9 shrink-0 items-center gap-2 rounded-full bg-foreground px-4 text-sm font-medium text-background transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98]"
          >
            <GitPullRequest className="size-4" aria-hidden="true" />
            {translate(
              'auto.components.dolphin.loQueHizo.abrirPr',
              'Open pull request #{{value0}}',
              {
                value0: datos.pr.numero
              }
            )}
          </button>
        ) : null}
      </footer>
    </div>
  )
}

/**
 * La tarjeta como ventana: nace del botón que la abrió y se cierra arrastrándola, con la física de
 * `/nico-mockup` (`use-arrastre-para-descartar`, la misma del cartel de funciones). Sale por un
 * portal al `body` porque Draggable mide contra su padre y un ancestro con `transform` le corre el
 * sistema de coordenadas.
 */
export function VentanaLoQueHizo({
  datos,
  nace,
  onCerrar
}: {
  datos: DatosDeLoQueHizo
  nace: DOMRect | null
  onCerrar: () => void
}): React.JSX.Element {
  const { fondoRef, ventanaRef, descartar } = useArrastreParaDescartar(onCerrar, nace)
  const motor = formatAgentTypeLabel(datos.agente)
  return createPortal(
    <div
      ref={fondoRef}
      className="fixed inset-0 z-50 grid place-items-center bg-black/11 p-4 backdrop-blur-[6px]"
      onPointerDown={(evento) => {
        if (evento.target === fondoRef.current) {
          descartar()
        }
      }}
    >
      <div
        ref={ventanaRef}
        role="dialog"
        aria-modal="true"
        aria-label={translate('auto.components.dolphin.loQueHizo.titulo', 'What {{value0}} did', {
          value0: motor
        })}
        tabIndex={-1}
        // Sin `transition` y con `will-change`: durante el arrastre todo lo escribe gsap.set.
        className="lo-que-hizo-ventana flex max-h-[85vh] w-[46rem] max-w-full cursor-grab flex-col overflow-hidden rounded-[20px] outline-none will-change-transform active:cursor-grabbing"
      >
        <TarjetaLoQueHizo datos={datos} onCerrar={descartar} />
      </div>
    </div>,
    document.body
  )
}
