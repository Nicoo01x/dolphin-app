import { Cloud, Moon, Plus } from 'lucide-react'
import { useTranslate, type Translate } from '@/i18n/use-translate'
import { FeatureTipSettingsLine } from '@/components/feature-tips/FeatureTipDialogFrame'
import type { AvisoDeMemoriaBaja } from '../../../../../shared/modo-poca-ram'
import type { AccionesDelAviso, Aviso } from '../avisos/cola-de-avisos'
import { BotonDeAviso, CuerpoDelAviso } from '../avisos/PiezasDelAviso'
import {
  avisarDespues,
  conectarConUnAgente,
  dormirAca,
  ejecutarAccionDelCartel,
  noAvisarMas
} from './acciones-del-cartel'
import type { AccionDelCartel } from './servidor-para-correr'
import { useAccionDelCartel } from './use-accion-del-cartel'
import { VisualDeMemoria } from './VisualDeMemoria'

export const ID_MEMORIA_BAJA = 'memoria-baja'

/** Un nombre en medio de una frase se corta: el entero está en la leyenda del visual. */
const LARGO_EN_LA_FRASE = 32

export function recortarNombre(texto: string, maximo = LARGO_EN_LA_FRASE): string {
  return texto.length > maximo ? `${texto.slice(0, maximo - 1).trimEnd()}…` : texto
}

function tituloDe(aviso: AvisoDeMemoriaBaja, t: Translate): string {
  return aviso.motivo === 'siempre'
    ? t('memoriaBaja.cartel.tituloSiempre', 'Low RAM mode is on')
    : t('memoriaBaja.cartel.titulo', 'You’re running low on RAM')
}

function Explicacion({
  aviso,
  accion,
  responder
}: {
  readonly aviso: AvisoDeMemoriaBaja
  readonly accion: AccionDelCartel
  readonly responder: AccionesDelAviso['responder']
}): React.JSX.Element {
  const t = useTranslate()
  if (accion.tipo === 'conectar') {
    return (
      <>
        <span className="block">
          {t(
            'memoriaBaja.cartel.sinServidor',
            'Connect a server and run the heaviest work there, on its memory instead of this computer’s.'
          )}
        </span>
        <span className="mt-2 block">
          <FeatureTipSettingsLine
            text={t('memoriaBaja.cartel.conAgente', 'Or <link>let an agent connect it</link>.')}
            onClick={() => responder(conectarConUnAgente)}
          />
        </span>
      </>
    )
  }
  if (aviso.masPesado.tipo === 'espacio') {
    return (
      <>
        {t(
          'memoriaBaja.cartel.conEspacio',
          '“{{nombre}}” uses the most. Open a workspace like it on {{servidor}} and put this one to sleep: anything you haven’t pushed to git stays on this computer.',
          {
            nombre: recortarNombre(aviso.masPesado.nombre),
            servidor: recortarNombre(accion.servidor.nombre)
          }
        )}
      </>
    )
  }
  return (
    <>
      {t(
        'memoriaBaja.cartel.sinEspacio',
        'Open your next workspace on {{servidor}}: it runs on the server’s memory, not this computer’s.',
        { servidor: recortarNombre(accion.servidor.nombre) }
      )}
    </>
  )
}

function ContenidoDeMemoriaBaja({
  aviso,
  acciones
}: {
  readonly aviso: AvisoDeMemoriaBaja
  readonly acciones: AccionesDelAviso
}): React.JSX.Element {
  const t = useTranslate()
  const accion = useAccionDelCartel(aviso.masPesado)
  const espacio = aviso.masPesado.tipo === 'espacio' ? aviso.masPesado : null
  const principal =
    accion.tipo === 'conectar'
      ? t('memoriaBaja.cartel.conectar', 'Connect a server')
      : t('memoriaBaja.cartel.correrEn', 'Run on {{servidor}}', {
          servidor: accion.servidor.nombre
        })
  return (
    <CuerpoDelAviso
      visual={<VisualDeMemoria aviso={aviso} />}
      titulo={tituloDe(aviso, t)}
      onAhoraNo={acciones.descartar}
      botones={
        <>
          <BotonDeAviso
            className="mr-auto bg-transparent px-2 text-muted-foreground hover:bg-foreground/[0.07] hover:text-foreground"
            onClick={() => acciones.responder(noAvisarMas)}
          >
            {t('memoriaBaja.cartel.noAvisarMas', 'Don’t warn me again')}
          </BotonDeAviso>
          {espacio ? (
            <BotonDeAviso onClick={() => acciones.responder(() => dormirAca(espacio.worktreeId))}>
              <Moon className="size-3.5" aria-hidden="true" />
              {t('memoriaBaja.cartel.dormirAca', 'Sleep it here')}
            </BotonDeAviso>
          ) : null}
          <BotonDeAviso
            principal
            title={principal}
            className="max-w-[14rem]"
            onClick={() => acciones.responder(() => ejecutarAccionDelCartel(accion))}
          >
            {accion.tipo === 'conectar' ? (
              <Plus className="size-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <Cloud className="size-3.5 shrink-0" aria-hidden="true" />
            )}
            <span className="truncate">{principal}</span>
          </BotonDeAviso>
        </>
      }
    >
      <Explicacion aviso={aviso} accion={accion} responder={acciones.responder} />
    </CuerpoDelAviso>
  )
}

/**
 * El cartel de poca RAM. Es el aviso más urgente de la cola: pasa adelante de cualquier novedad,
 * porque lo que avisa es que algo se puede caer. Cerrarlo sin elegir (la ×, Escape, arrastrarlo)
 * es «después»: main se calla una hora y, si sigue faltando memoria, vuelve.
 */
export function avisoDeMemoriaBaja(aviso: AvisoDeMemoriaBaja): Aviso {
  return {
    id: ID_MEMORIA_BAJA,
    importancia: 'urgente',
    titulo: (t) => tituloDe(aviso, t),
    alDescartar: avisarDespues,
    contenido: (acciones) => <ContenidoDeMemoriaBaja aviso={aviso} acciones={acciones} />
  }
}
