import { ChevronRight, Copy, MessageSquarePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslate } from '@/i18n/use-translate'
import type { LineasDelControl } from '../../../../shared/winforms/winforms-controls'
import { tipoCorto } from '../../../../shared/winforms/winforms-controls'
import type { WinFormsControl } from '../../../../shared/winforms/winforms-preview-types'

/**
 * El control marcado, al pie del formulario: qué es, dónde está declarado y la acción principal,
 * mandarlo al chat. Va acoplado y no flotante porque se lee junto al formulario, no encima de él.
 */
export function WinFormsPreviewInspector({
  control,
  camino,
  lineas,
  designer,
  onElegir,
  onAbrirDesigner,
  onEnviar,
  onCopiar
}: {
  control: WinFormsControl
  /** Del formulario al control, para subir a un contenedor con un clic. */
  camino: { id: number; nombre: string }[]
  lineas: LineasDelControl | null
  /** El .Designer.cs como se muestra (relativo al worktree); null si el formulario no tiene. */
  designer: string | null
  onElegir: (id: number) => void
  onAbrirDesigner: (linea: number) => void
  onEnviar: (origen: HTMLElement) => void
  onCopiar: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const linea = lineas?.declaracion ?? lineas?.configuracion ?? null
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 border-t border-border bg-background px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <nav className="flex min-w-0 items-center gap-0.5 text-xs text-muted-foreground">
          {camino.map((paso, indice) => (
            <span key={paso.id} className="flex min-w-0 items-center gap-0.5">
              {indice > 0 ? <ChevronRight className="size-3 shrink-0 opacity-60" /> : null}
              {paso.id === control.id ? (
                <span className="truncate text-[13px] font-medium text-foreground">
                  {paso.nombre}
                </span>
              ) : (
                <button
                  type="button"
                  className="truncate rounded px-0.5 hover:bg-muted hover:text-foreground"
                  onClick={() => onElegir(paso.id)}
                >
                  {paso.nombre}
                </button>
              )}
            </span>
          ))}
        </nav>
        <div className="mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-3 text-xs text-muted-foreground">
          <span className="truncate" title={control.tipo}>
            {tipoCorto(control.tipo)}
          </span>
          <span className="tabular-nums">
            {control.w}×{control.h} px · x {control.x}, y {control.y}
          </span>
          {control.texto && control.texto !== control.nombre ? (
            <span className="max-w-[240px] truncate">«{control.texto}»</span>
          ) : null}
          {designer && linea ? (
            <button
              type="button"
              title={`${designer}:${linea}`}
              className="truncate font-mono text-2xs text-foreground/80 underline-offset-2 hover:underline"
              onClick={() => onAbrirDesigner(linea)}
            >
              {designer.split(/[\\/]/).pop()}:{linea}
            </button>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5"
          onClick={onCopiar}
          aria-label={t('winformsPreview.copyReference', 'Copy reference')}
        >
          <Copy className="size-3.5" />
        </Button>
        <Button size="sm" className="h-7 gap-1.5" onClick={(e) => onEnviar(e.currentTarget)}>
          <MessageSquarePlus className="size-3.5" />
          {t('winformsPreview.addToChat', 'Add to chat')}
        </Button>
      </div>
    </div>
  )
}
