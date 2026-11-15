/**
 * La tarjeta en una frase, para el lector de pantalla: qué es, en qué estado está, cómo se llama y
 * lo que las barras dicen sin palabras (tamaño del cambio, checks, revisión, conflictos).
 */
import type { useTranslate } from '@/i18n/use-translate'
import type { GitHubIssueOrPRLink } from '../../../../../shared/github/links'
import type { GitHubWorkItem } from '../../../../../shared/github/work-item-types'
import type { DolphinExtraDeTarjeta } from '../../../../../shared/dolphin-tarjeta-github'
import { textoDeArchivos, textoDeChecks } from './barras-tarjeta'
import { textoDeRevision } from './cuerpos-tarjeta'
import { estadoDeRevision, estadoDeTarjeta, revisoresDe } from './modelo-tarjeta'
import { textoDeEstado } from './piezas-tarjeta'
import { uiNumberFormat } from '@/i18n/ui-intl-formatters'

// Constante de módulo: los formateadores de la UI se cachean por identidad de las opciones.
const ENTERO: Intl.NumberFormatOptions = { maximumFractionDigits: 0 }

export function resumenParaLector(
  t: ReturnType<typeof useTranslate>,
  link: GitHubIssueOrPRLink,
  item: GitHubWorkItem,
  extra: DolphinExtraDeTarjeta
): string {
  const partes = [
    t(
      'components.dolphin.tarjetaGithub.lector.resumen',
      '{{kind}} #{{number}} in {{repo}}, {{state}}: {{title}}.',
      {
        kind:
          item.type === 'pr'
            ? t('components.dolphin.tarjetaGithub.lector.pr', 'Pull request')
            : t('components.dolphin.tarjetaGithub.lector.issue', 'Issue'),
        number: item.number,
        repo: `${link.slug.owner}/${link.slug.repo}`,
        state: textoDeEstado(t, estadoDeTarjeta(item, extra).clave),
        title: item.title
      }
    )
  ]
  if (item.type === 'pr') {
    const numero = uiNumberFormat(ENTERO)
    if (item.additions !== undefined && item.deletions !== undefined) {
      partes.push(
        t(
          'components.dolphin.tarjetaGithub.cambios.lector',
          '{{added}} lines added, {{removed}} removed',
          {
            added: numero.format(item.additions),
            removed: numero.format(item.deletions)
          }
        ) + (item.changedFiles !== undefined ? `, ${textoDeArchivos(t, item.changedFiles)}.` : '.')
      )
    }
    if (extra.checks) {
      partes.push(
        `${t('components.dolphin.tarjetaGithub.checks.titulo', 'Checks')}: ${textoDeChecks(t, extra.checks)}.`
      )
    }
    const revision = estadoDeRevision(item, extra, revisoresDe(item, extra))
    if (revision) {
      partes.push(`${textoDeRevision(t, revision)}.`)
    }
    if ((item.state === 'open' || item.state === 'draft') && item.mergeable === 'CONFLICTING') {
      partes.push(
        `${t('components.dolphin.tarjetaGithub.conflictosSinBase', 'Has merge conflicts')}.`
      )
    }
  }
  return partes.join(' ')
}
