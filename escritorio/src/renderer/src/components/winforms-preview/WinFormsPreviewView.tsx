import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslate } from '@/i18n/use-translate'
import {
  caminoDelControl,
  tipoCorto,
  type LineasDelControl
} from '../../../../shared/winforms/winforms-controls'
import type { WinFormsControl } from '../../../../shared/winforms/winforms-preview-types'
import type { EstadoDeSesion } from './winforms-session-state'
import { WinFormsPreviewInspector } from './WinFormsPreviewInspector'
import { WinFormsPreviewStage } from './WinFormsPreviewStage'
import { WinFormsPreviewStatus } from './WinFormsPreviewStatus'
import { fechaDeBuild, WinFormsPreviewToolbar } from './WinFormsPreviewToolbar'

export type AccionesDeVistaPrevia = {
  onRecargar: () => void
  onUsarBuild: (ruta: string) => void
  onElegirEnsamblado: () => void
  onCerrarDialogo: () => void
  onAbrirDesigner: (linea: number) => void
  onEnviar: (control: WinFormsControl, camino: string[], origen: HTMLElement) => void
  onCopiar: (control: WinFormsControl, camino: string[]) => void
  ubicar: (nombre: string) => Promise<LineasDelControl | null>
}

/** La pestaña entera, sin IPC: el contenedor le da el estado de la sesión y las acciones. */
export function WinFormsPreviewView({
  estado,
  clase,
  designerVisible,
  acciones
}: {
  estado: EstadoDeSesion
  /** Lo que se sabe antes de que hable el host (Namespace.Clase o el nombre del archivo). */
  clase: string
  designerVisible: string | null
  acciones: AccionesDeVistaPrevia
}): React.JSX.Element {
  const t = useTranslate()
  const [seleccionId, setSeleccionId] = useState<number | null>(null)
  const [lineas, setLineas] = useState<LineasDelControl | null>(null)
  const { controles, cuadro } = estado
  // El host vuelve a numerar en cada mapa: se sigue la selección por nombre y tipo, no por id.
  const [clave, setClave] = useState<string | null>(null)
  const seleccionado = useMemo(() => {
    if (clave === null) {
      return null
    }
    return (
      controles.find((c) => c.id === seleccionId && `${c.nombre}|${c.tipo}` === clave) ??
      controles.find((c) => `${c.nombre}|${c.tipo}` === clave && c.nombre) ??
      null
    )
  }, [controles, seleccionId, clave])

  const nombreSeleccionado = seleccionado?.nombre ?? ''
  const { ubicar } = acciones
  useEffect(() => {
    setLineas(null)
    if (!nombreSeleccionado) {
      return
    }
    let vigente = true
    void ubicar(nombreSeleccionado).then((resultado) => {
      if (vigente) {
        setLineas(resultado)
      }
    })
    return () => {
      vigente = false
    }
  }, [nombreSeleccionado, ubicar])

  const elegir = (control: WinFormsControl | null): void => {
    setSeleccionId(control?.id ?? null)
    setClave(control ? `${control.nombre}|${control.tipo}` : null)
  }
  const nombres = seleccionado ? caminoDelControl(controles, seleccionado.id) : []
  const porId = new Map(controles.map((c) => [c.id, c]))
  const camino: { id: number; nombre: string }[] = []
  for (
    let actual: WinFormsControl | undefined = seleccionado ?? undefined;
    actual && camino.length < 64;
    actual = porId.get(actual.padre)
  ) {
    camino.unshift({ id: actual.id, nombre: actual.nombre || tipoCorto(actual.tipo) })
  }
  const desactualizado = estado.build?.desactualizado ?? null

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-background"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          elegir(null)
        }
      }}
    >
      <WinFormsPreviewToolbar
        clase={estado.plan?.nombreCompleto ?? clase}
        titulo={estado.titulo}
        build={estado.build?.build ?? null}
        arquitectura={estado.build?.arquitectura ?? null}
        builds={estado.plan?.builds ?? []}
        onRecargar={acciones.onRecargar}
        onUsarBuild={acciones.onUsarBuild}
        onElegirEnsamblado={acciones.onElegirEnsamblado}
      />
      {desactualizado && estado.build ? (
        <Aviso>
          {t(
            'winformsPreview.stale',
            'This build is from {{build}} and {{file}} changed on {{changed}}: the preview may not include your latest changes.',
            {
              build: fechaDeBuild(estado.build.build.modificado),
              file: desactualizado.fuente.split(/[\\/]/).pop() ?? '',
              changed: fechaDeBuild(desactualizado.modificado)
            }
          )}
        </Aviso>
      ) : null}
      {estado.dialogo ? (
        <Aviso
          onCerrar={acciones.onCerrarDialogo}
          etiquetaCerrar={t('winformsPreview.closeDialog', 'Close that window in the form')}
        >
          {t('winformsPreview.dialog', 'The form opened «{{title}}»: {{text}}', {
            title: estado.dialogo.titulo,
            text: estado.dialogo.texto
          })}
        </Aviso>
      ) : null}
      {estado.aviso && estado.fase === 'listo' ? <Aviso>{estado.aviso}</Aviso> : null}
      {cuadro && (estado.fase === 'listo' || estado.fase === 'cerrado') ? (
        <WinFormsPreviewStage
          cuadro={cuadro}
          controles={controles}
          seleccionado={seleccionado}
          onSeleccionar={elegir}
        />
      ) : (
        <WinFormsPreviewStatus
          estado={estado}
          onReintentar={acciones.onRecargar}
          onElegirEnsamblado={acciones.onElegirEnsamblado}
        />
      )}
      {seleccionado ? (
        <WinFormsPreviewInspector
          control={seleccionado}
          camino={camino}
          lineas={lineas}
          designer={designerVisible}
          onElegir={(id) => elegir(porId.get(id) ?? null)}
          onAbrirDesigner={acciones.onAbrirDesigner}
          onEnviar={(origen) => acciones.onEnviar(seleccionado, nombres, origen)}
          onCopiar={() => acciones.onCopiar(seleccionado, nombres)}
        />
      ) : null}
    </div>
  )
}

function Aviso({
  children,
  onCerrar,
  etiquetaCerrar
}: {
  children: React.ReactNode
  onCerrar?: () => void
  etiquetaCerrar?: string
}): React.JSX.Element {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-background px-3 py-1.5 text-xs text-muted-foreground">
      <span className="min-w-0 flex-1">{children}</span>
      {onCerrar ? (
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          aria-label={etiquetaCerrar}
          title={etiquetaCerrar}
          onClick={onCerrar}
        >
          <X className="size-3.5" />
        </Button>
      ) : null}
    </div>
  )
}
