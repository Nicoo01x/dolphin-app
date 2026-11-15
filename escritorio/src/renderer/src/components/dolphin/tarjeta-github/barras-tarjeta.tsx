import { uiNumberFormat } from '@/i18n/ui-intl-formatters'
import { useIntlLocale, useTranslate } from '@/i18n/use-translate'
import type { DolphinChecksDeTarjeta } from '../../../../../shared/dolphin-tarjeta-github'
import { TiraDeSegmentos } from '../tira/TiraDeSegmentos'
import {
  ORDEN_DE_CHECKS,
  repartoDeCambios,
  segmentosDeChecks,
  TONO_DE_CHECK
} from './modelo-tarjeta'

// Constante de módulo: los formateadores de la UI se cachean por identidad de las opciones.
const ENTERO: Intl.NumberFormatOptions = { maximumFractionDigits: 0 }

type T = ReturnType<typeof useTranslate>

function Rotulo({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] leading-4 text-muted-foreground">{children}</span>
}

export function textoDeArchivos(t: T, cantidad: number): string {
  return cantidad === 1
    ? t('components.dolphin.tarjetaGithub.cambios.unArchivo', '1 file')
    : t('components.dolphin.tarjetaGithub.cambios.archivos', '{{count}} files', { count: cantidad })
}

/** El tamaño del cambio como barra: verde lo agregado, rojo lo quitado, en proporción. */
export function BloqueDeCambios({
  agregadas,
  quitadas,
  archivos
}: {
  agregadas: number | undefined
  quitadas: number | undefined
  archivos: number | undefined
}): React.JSX.Element | null {
  const t = useTranslate()
  const numero = uiNumberFormat(ENTERO, useIntlLocale())
  const reparto = repartoDeCambios(agregadas, quitadas)
  if (!reparto && archivos === undefined) {
    return null
  }
  return (
    <div className="dolphin-tg-box flex min-w-0 flex-col gap-1.5 px-2.5 py-2">
      <Rotulo>{t('components.dolphin.tarjetaGithub.cambios.titulo', 'Changes')}</Rotulo>
      {reparto ? (
        <div
          aria-hidden
          className="dolphin-tg-crece flex h-1.5 gap-0.5 overflow-hidden rounded-full"
        >
          {reparto.agregadas + reparto.quitadas === 0 ? (
            <span className="dolphin-tg-hueso h-full flex-1 rounded-full" />
          ) : (
            <>
              {reparto.agregadas > 0 ? (
                <span
                  data-tono="verde"
                  className="h-full rounded-full bg-(--tono)"
                  style={{ flexGrow: reparto.agregadas }}
                />
              ) : null}
              {reparto.quitadas > 0 ? (
                <span
                  data-tono="rojo"
                  className="h-full rounded-full bg-(--tono)"
                  style={{ flexGrow: reparto.quitadas }}
                />
              ) : null}
            </>
          )}
        </div>
      ) : null}
      <div className="flex min-w-0 items-baseline gap-1.5 text-xs leading-4 tabular-nums">
        {agregadas !== undefined ? (
          <span className="text-foreground">+{numero.format(agregadas)}</span>
        ) : null}
        {quitadas !== undefined ? (
          <span className="text-foreground">−{numero.format(quitadas)}</span>
        ) : null}
        {archivos !== undefined ? (
          <span className="ml-auto truncate text-[11px] text-muted-foreground">
            {textoDeArchivos(t, archivos)}
          </span>
        ) : null}
      </div>
      {agregadas !== undefined || quitadas !== undefined ? (
        <span className="sr-only">
          {t(
            'components.dolphin.tarjetaGithub.cambios.lector',
            '{{added}} lines added, {{removed}} removed',
            {
              added: numero.format(agregadas ?? 0),
              removed: numero.format(quitadas ?? 0)
            }
          )}
        </span>
      ) : null}
    </div>
  )
}

/** La frase corta de los checks: lo que más importa primero (lo que falló). */
export function textoDeChecks(t: T, checks: DolphinChecksDeTarjeta): string {
  const partes: string[] = []
  if (checks.fallaron > 0) {
    partes.push(
      checks.fallaron === 1
        ? t('components.dolphin.tarjetaGithub.checks.unoFallo', '1 failed')
        : t('components.dolphin.tarjetaGithub.checks.fallaron', '{{count}} failed', {
            count: checks.fallaron
          })
    )
  }
  if (checks.corriendo > 0) {
    partes.push(
      t('components.dolphin.tarjetaGithub.checks.corriendo', '{{count}} running', {
        count: checks.corriendo
      })
    )
  }
  if (checks.pendientes > 0) {
    partes.push(
      checks.pendientes === 1
        ? t('components.dolphin.tarjetaGithub.checks.unoPendiente', '1 pending')
        : t('components.dolphin.tarjetaGithub.checks.pendientes', '{{count}} pending', {
            count: checks.pendientes
          })
    )
  }
  const contables = checks.total - checks.omitidos
  if (partes.length === 0) {
    return t('components.dolphin.tarjetaGithub.checks.todosPasaron', 'All {{count}} passed', {
      count: contables
    })
  }
  return [
    t('components.dolphin.tarjetaGithub.checks.pasaronDe', '{{passed}} of {{total}} passed', {
      passed: checks.pasaron,
      total: contables
    }),
    ...partes
  ].join(' · ')
}

/** Los checks como tira: una celda por check (o por clase, si son muchos) y su recuento. */
export function BloqueDeChecks({ checks }: { checks: DolphinChecksDeTarjeta }) {
  const t = useTranslate()
  const segmentos = segmentosDeChecks(checks)
  if (segmentos.length === 0) {
    return null
  }
  return (
    <div className="dolphin-tg-box flex min-w-0 flex-col gap-1.5 px-2.5 py-2">
      <Rotulo>{t('components.dolphin.tarjetaGithub.checks.titulo', 'Checks')}</Rotulo>
      <TiraDeSegmentos
        segmentos={segmentos.map((segmento) => ({
          tono: TONO_DE_CHECK[segmento.clase],
          peso: segmento.peso,
          atenuado: segmento.clase === 'pendientes' || segmento.clase === 'omitidos'
        }))}
      />
      {/* El recuento va como punto + número por clase (entra en media tarjeta); la frase entera
          queda para el lector y para el puntero. */}
      <span
        className="flex min-w-0 items-center gap-2.5 text-xs leading-4 tabular-nums text-foreground"
        title={textoDeChecks(t, checks)}
      >
        {ORDEN_DE_CHECKS.filter((clase) => clase !== 'omitidos' && checks[clase] > 0).map(
          (clase) => (
            <span key={clase} aria-hidden className="inline-flex items-center gap-1">
              <span data-tono={TONO_DE_CHECK[clase]} className="dolphin-tg-punto" />
              {checks[clase]}
            </span>
          )
        )}
        <span className="sr-only">{textoDeChecks(t, checks)}</span>
      </span>
    </div>
  )
}
