import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslate } from '@/i18n/use-translate'
import { launchVpsSetupAgent } from '@/lib/agent-session/launch/vps-setup-agent-launch'
import type {
  Delfin,
  ResultadoDeLlevar,
  RevisionDelServidor,
  ServidorParaDelfines
} from '../../../../../shared/delfines-types'
import { PanelDeLlevar, type EstadoDeLlevar } from './PanelDeLlevar'
import { useServidoresParaDelfines } from './use-manada'
import { VentanaDeDelfin } from './VentanaDeDelfin'

/**
 * «Correr en tu servidor»: revisa el servidor conectado, dice lo que falta (con el comando para
 * hacerlo) y, si está todo, lleva el bot y lo deja como servicio. La ventana se queda abierta
 * mientras se lleva: se ve cada etapa, y un fallo dice en cuál fue.
 */
export function LlevarAlServidor({
  delfin,
  nace,
  onCerrar,
  onLlevado,
  onConectar
}: {
  delfin: Delfin
  nace: DOMRect | null
  onCerrar: () => void
  onLlevado: () => void
  /** «Conectar una máquina»: lo monta la página, porque esta ventana se cierra para dejarle lugar. */
  onConectar: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const servidores = useServidoresParaDelfines()
  const [servidor, setServidor] = useState<ServidorParaDelfines | null>(servidores[0] ?? null)
  const [estado, setEstado] = useState<EstadoDeLlevar>(
    servidores[0] ? { tipo: 'revisando' } : { tipo: 'sin-servidor' }
  )
  const ultimaRevision = useRef<RevisionDelServidor | null>(null)

  // Un VPS que se conecta con la ventana abierta pasa de «conectar» a revisarlo.
  useEffect(() => {
    if (!servidor && servidores[0]) {
      setServidor(servidores[0])
    }
  }, [servidor, servidores])

  const revisar = useCallback(
    async (cual: ServidorParaDelfines) => {
      setEstado({ tipo: 'revisando' })
      const resultado = await window.api?.delfines
        ?.revisar({ id: delfin.id, hostId: cual.hostId })
        .catch(() => null)
      if (!resultado?.ok) {
        setEstado({
          tipo: 'fallo',
          etapa: 'revisar',
          detail:
            resultado?.code === 'sin-conexion'
              ? t(
                  'delfines.servidor.desconectado',
                  '{{servidor}} disconnected. Reconnect it and try again.',
                  { servidor: cual.nombre }
                )
              : (resultado?.detail ??
                t('delfines.servidor.sinRespuesta', 'The server did not answer.'))
        })
        return
      }
      ultimaRevision.current = resultado.revision
      setEstado({
        tipo: 'revision',
        revision: resultado.revision,
        carpeta: resultado.revision.carpetaSugerida
      })
    },
    [delfin.id, t]
  )

  useEffect(() => {
    if (servidor) {
      void revisar(servidor)
    }
  }, [servidor, revisar])

  useEffect(
    () =>
      window.api?.delfines?.alAvanzar((avance) => {
        if (avance.id === delfin.id) {
          setEstado({ tipo: 'llevando', etapa: avance.etapa })
        }
      }),
    [delfin.id]
  )

  const llevar = async (): Promise<void> => {
    if (estado.tipo !== 'revision' || !servidor) {
      return
    }
    setEstado({ tipo: 'llevando', etapa: 'revisar' })
    const resultado = await window.api?.delfines
      ?.llevar({ id: delfin.id, hostId: servidor.hostId, carpeta: estado.carpeta })
      .catch((causa: unknown): ResultadoDeLlevar => ({
        ok: false,
        etapa: 'revisar',
        detail: causa instanceof Error ? causa.message : String(causa)
      }))
    if (!resultado) {
      return
    }
    if (resultado.ok) {
      const linger = ultimaRevision.current?.pasos.find((paso) => paso.paso === 'linger')
      setEstado({
        tipo: 'listo',
        linger: resultado.linger,
        ...(linger && 'comando' in linger && linger.comando
          ? { comandoLinger: linger.comando }
          : {})
      })
      onLlevado()
      return
    }
    if (resultado.revision) {
      ultimaRevision.current = resultado.revision
      setEstado({ tipo: 'revision', revision: resultado.revision, carpeta: estado.carpeta })
      return
    }
    setEstado({ tipo: 'fallo', etapa: resultado.etapa, detail: resultado.detail })
    if (resultado.etapa === 'apartar') {
      onLlevado()
    }
  }

  return (
    <VentanaDeDelfin
      titulo={t('delfines.servidor.titulo', 'Run {{nombre}} on your server', {
        nombre: delfin.nombre
      })}
      nace={nace}
      onCerrar={onCerrar}
    >
      {(descartar) => (
        <PanelDeLlevar
          estado={estado}
          motor={delfin.motor}
          servidores={servidores}
          acciones={{
            onConectar: () => {
              descartar()
              onConectar()
            },
            onAgente: () =>
              void launchVpsSetupAgent({
                botId: delfin.id,
                ...(servidor
                  ? { targetId: servidor.hostId.slice('ssh:'.length), label: servidor.nombre }
                  : {}),
                ...(estado.tipo === 'fallo' ? { error: estado.detail } : {})
              }),
            onElegirServidor: setServidor,
            onCarpeta: (carpeta) =>
              setEstado((antes) => (antes.tipo === 'revision' ? { ...antes, carpeta } : antes)),
            onLlevar: () => void llevar(),
            onRevisar: () => {
              if (servidor) {
                void revisar(servidor)
              }
            },
            onCerrar: descartar
          }}
        />
      )}
    </VentanaDeDelfin>
  )
}
