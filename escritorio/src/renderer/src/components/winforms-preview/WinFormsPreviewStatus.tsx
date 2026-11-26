import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslate, type Translate } from '@/i18n/use-translate'
import type { WinFormsCodigoDeError } from '../../../../shared/winforms/winforms-preview-types'
import type { EstadoDeSesion } from './winforms-session-state'
import { rutaCorta } from './WinFormsPreviewToolbar'

function tituloDelError(codigo: WinFormsCodigoDeError, t: Translate): string {
  switch (codigo) {
    case 'sin-build':
      return t('winformsPreview.error.noBuild', 'There is no build of this form')
    case 'sin-proyecto':
      return t('winformsPreview.error.noProject', 'Could not find the project')
    case 'no-es-net':
      return t('winformsPreview.error.notDotNet', 'That file is not a .NET assembly')
    case 'arquitectura':
      return t('winformsPreview.error.architecture', 'Incompatible architecture')
    case 'dependencia':
      return t('winformsPreview.error.dependency', 'The build is missing a dependency')
    case 'tipo-no-encontrado':
      return t('winformsPreview.error.classMissing', 'The build does not have this class')
    case 'no-es-formulario':
      return t('winformsPreview.error.notAForm', 'Not a form')
    case 'sin-constructor':
      return t('winformsPreview.error.noConstructor', 'The form needs parameters to be created')
    case 'constructor':
      return t('winformsPreview.error.constructor', 'The form failed while being created')
    case 'no-es-windows':
      return t('winformsPreview.error.windowsOnly', 'Windows only')
    default:
      return t('winformsPreview.error.generic', 'Could not open the form')
  }
}

function pista(codigo: WinFormsCodigoDeError, t: Translate): string | null {
  switch (codigo) {
    case 'constructor':
      return t(
        'winformsPreview.hint.constructor',
        'This usually happens when the constructor opens a database connection or reads settings the app loads at startup.'
      )
    case 'tipo-no-encontrado':
      return t(
        'winformsPreview.hint.classMissing',
        'The build is older than the form, or the form lives in another assembly. Build the project or choose another assembly.'
      )
    case 'dependencia':
      return t(
        'winformsPreview.hint.dependency',
        'The folder of the build must contain every DLL the app uses. Choose a build from a folder where the app runs.'
      )
    default:
      return null
  }
}

function textoDeFase(estado: EstadoDeSesion, t: Translate): string {
  switch (estado.fase) {
    case 'compilando-host':
      return t('winformsPreview.phase.host', 'Preparing the viewer (first time only)…')
    case 'cargando-ensamblado':
      return t('winformsPreview.phase.assembly', 'Loading {{name}}…', {
        name: estado.build ? rutaCorta(estado.build.build.ruta, 1) : ''
      })
    case 'creando-formulario':
      return t('winformsPreview.phase.creating', 'Creating the form…')
    case 'mostrando':
      return t('winformsPreview.phase.showing', 'Showing the form…')
    default:
      return t('winformsPreview.phase.searching', 'Looking for the build…')
  }
}

/** Mientras no hay cuadro: qué está haciendo, o por qué no se pudo, con qué hacer. */
export function WinFormsPreviewStatus({
  estado,
  onReintentar,
  onElegirEnsamblado
}: {
  estado: EstadoDeSesion
  onReintentar: () => void
  onElegirEnsamblado: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const [segundos, setSegundos] = useState(0)
  const cargando = estado.fase !== 'error' && estado.fase !== 'cerrado'
  useEffect(() => {
    setSegundos(0)
    if (!cargando) {
      return
    }
    const reloj = setInterval(() => setSegundos((s) => s + 1), 1000)
    return () => clearInterval(reloj)
  }, [cargando, estado.fase])

  if (cargando) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-muted/40 p-8 text-[13px] text-muted-foreground">
        <span className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          {textoDeFase(estado, t)}
        </span>
        {(estado.fase === 'creando-formulario' || estado.fase === 'mostrando') && segundos >= 8 ? (
          <span className="max-w-[420px] text-center text-xs">
            {t(
              'winformsPreview.phase.slow',
              'Still creating it ({{seconds}} s). If the constructor waits for a connection it can take a while.',
              { seconds: segundos }
            )}
          </span>
        ) : null}
      </div>
    )
  }

  const error = estado.error
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-muted/40 p-8">
      <div className="flex w-full max-w-[520px] flex-col gap-3">
        <h2 className="text-[15px] font-medium text-foreground">
          {error ? tituloDelError(error.codigo, t) : t('winformsPreview.closed', 'The form closed')}
        </h2>
        {error?.mensaje ? (
          <p className="text-[13px] break-words text-foreground/80">{error.mensaje}</p>
        ) : null}
        {error && pista(error.codigo, t) ? (
          <p className="text-xs text-muted-foreground">{pista(error.codigo, t)}</p>
        ) : null}
        {estado.descartados.length > 0 ? (
          <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
            <li className="text-foreground/80">
              {t('winformsPreview.discarded', 'Builds tried before this one')}
            </li>
            {estado.descartados.map((d) => (
              <li key={d.build.ruta} className="min-w-0">
                <span className="font-mono text-2xs text-foreground/70">
                  {rutaCorta(d.build.ruta, 4)}
                </span>
                <span className="block truncate" title={d.motivo}>
                  {d.motivo}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {error?.detalle ? (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none">
              {t('winformsPreview.details', 'Technical details')}
            </summary>
            <pre className="mt-2 max-h-56 overflow-auto scrollbar-sleek rounded-md bg-background p-3 font-mono text-2xs leading-relaxed whitespace-pre-wrap">
              {error.detalle}
            </pre>
          </details>
        ) : null}
        <div className="flex gap-2 pt-1">
          <Button size="sm" className="h-7" onClick={onReintentar}>
            {t('winformsPreview.retry', 'Try again')}
          </Button>
          <Button size="sm" variant="ghost" className="h-7" onClick={onElegirEnsamblado}>
            {t('winformsPreview.pickAssembly', 'Choose assembly…')}
          </Button>
        </div>
      </div>
    </div>
  )
}
