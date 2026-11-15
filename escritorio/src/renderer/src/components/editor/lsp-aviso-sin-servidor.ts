import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { camposDe } from '../../../../shared/lsp/a-monaco'

/**
 * El aviso de que un archivo se quedó sin servidor de lenguaje, cuando hay uno conocido para su
 * lenguaje y no está instalado o no arrancó.
 *
 * Why avisar: sin servidor el editor sigue andando con el worker de Monaco, que contesta bien lo
 * de un archivo suelto y mal lo del proyecto (tipos de otro paquete, ir a una definición de afuera).
 * Sin aviso, eso parece un editor flojo y no una herramienta que falta.
 *
 * Why una vez por servidor y motivo: abrir veinte archivos .ts sin servidor no son veinte
 * problemas, es uno. Lo que no tiene arreglo —un lenguaje sin servidor conocido, un archivo fuera
 * de todo proyecto— no se avisa: no hay nada que la persona pueda hacer.
 */

export type AvisoSinServidor = {
  /** Lo que identifica al aviso para no repetirlo. */
  readonly clave: string
  readonly titulo: string
  readonly detalle: string
}

/**
 * typescript-language-server sin un `tsserver.js` que usar. Pasa con TypeScript 7, el compilador
 * nativo, que ya no lo trae: `npm i -g typescript` instala hoy una versión con la que este
 * servidor no puede arrancar, y su mensaje no lo dice.
 */
function faltaTsserver(detalle: string): boolean {
  return /tsserver|valid TypeScript installation/i.test(detalle)
}

/** El aviso para lo que contestó `lsp:abrir`, o null si no hay nada que avisar. */
export function avisoSinServidor(respuesta: unknown): AvisoSinServidor | null {
  const campos = camposDe(respuesta)
  if (campos.sinServidor !== true || typeof campos.comando !== 'string') {
    return null
  }
  const comando = campos.comando
  const comoSeInstala = typeof campos.comoSeInstala === 'string' ? campos.comoSeInstala : ''
  if (campos.motivo === 'no-instalado') {
    return {
      clave: `${comando}:no-instalado`,
      titulo: translate(
        'auto.components.editor.lsp.notInstalled.title',
        '{{value0}} is not installed',
        { value0: comando }
      ),
      detalle: translate(
        'auto.components.editor.lsp.notInstalled.detail',
        'The editor works without it, but only knows this file. To install it: {{value0}}',
        { value0: comoSeInstala }
      )
    }
  }
  if (campos.motivo !== 'no-arranco') {
    return null
  }
  const motivo = typeof campos.detalle === 'string' ? campos.detalle.trim() : ''
  return {
    clave: `${comando}:no-arranco`,
    titulo: translate('auto.components.editor.lsp.didNotStart.title', '{{value0}} did not start', {
      value0: comando
    }),
    detalle: faltaTsserver(motivo)
      ? translate(
          'auto.components.editor.lsp.didNotStart.noTsserver',
          'It found no tsserver.js to use. TypeScript 7 (the native compiler) no longer ships one: install TypeScript 6 in the project (npm i -D typescript@6) or globally (npm i -g typescript@6).'
        )
      : motivo ||
        translate(
          'auto.components.editor.lsp.didNotStart.noReason',
          'It exited without saying why.'
        )
  }
}

const yaAvisados = new Set<string>()

/** Lo muestra, una sola vez por servidor y motivo mientras la app esté abierta. */
export function avisarSinServidor(respuesta: unknown): void {
  const aviso = avisoSinServidor(respuesta)
  if (!aviso || yaAvisados.has(aviso.clave)) {
    return
  }
  yaAvisados.add(aviso.clave)
  toast.info(aviso.titulo, { description: aviso.detalle })
}

export function __olvidarAvisosSinServidorParaTests(): void {
  yaAvisados.clear()
}
