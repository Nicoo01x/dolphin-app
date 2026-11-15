import { defineFixture } from '../../../component-fixtures/component-fixture'
import { LandingStartComposer } from '../../landing/LandingStartComposer'
import { AGENTES, REPOS_DEL_STORE } from './datos-de-ejemplo-del-inicio'
import { RanuraDelCompositor } from './RanuraDelCompositor'

/**
 * El hueco que se guarda mientras el inicio carga, al lado del compositor de verdad: los dos bordes
 * de abajo tienen que quedar a la misma altura, o la franja del mundo salta al terminar de cargar.
 *
 *   pnpm fixtures:shot "dolphin/inicio/RanuraDelCompositor:*" --theme dark
 */
const ladoALado = (ancho: number) =>
  defineFixture({
    width: ancho * 2 + 48,
    store: {
      detectedAgentIds: AGENTES,
      ensureDetectedAgents: async () => AGENTES,
      repos: REPOS_DEL_STORE
    },
    render: () => (
      <div className="flex items-end gap-0 bg-background">
        {[false, true].map((listo) => (
          <div key={String(listo)} className="flex flex-col" style={{ width: ancho }}>
            <RanuraDelCompositor
              listo={listo}
              perfilNuevo={false}
              compositor={<LandingStartComposer />}
            />
          </div>
        ))}
      </div>
    )
  })

export const huecoYCompositor = ladoALado(720)
/** Angosto: el texto de ejemplo ocupa más renglones y el hueco tiene que crecer igual. */
export const huecoYCompositorAngosto = ladoALado(420)
