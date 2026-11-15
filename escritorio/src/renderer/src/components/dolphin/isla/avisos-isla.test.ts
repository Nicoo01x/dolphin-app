import { describe, expect, it } from 'vitest'
import type { DashboardCard } from '../../../../../shared/dashboard-snapshot'
import type { DolphinChoque } from '../../../../../shared/dolphin-choques'
import {
  ENFRIAMIENTO_MS,
  avisosVigentes,
  detectarAvisos,
  detectarAvisosDeChoques,
  encolarAvisos,
  pasarEnfriamiento,
  type Aviso,
  type AvisoDeAgente,
  type TipoDeAviso
} from './avisos-isla'

const tarjeta = (paneKey: string, bucket: DashboardCard['bucket'], unseen = true): DashboardCard =>
  ({ paneKey, bucket, unseen, worktreeName: paneKey }) as DashboardCard

describe('los avisos de la isla', () => {
  const choque: DolphinChoque = { a: 'worktree-a', b: 'worktree-b', archivos: ['shared.txt'] }

  it('avisa una sola vez por cada choque nuevo', () => {
    const primera = detectarAvisosDeChoques(null, [], 0)
    expect(primera.avisos).toEqual([])
    const segunda = detectarAvisosDeChoques(primera.memoria, [choque], 1_000)
    expect(segunda.avisos).toHaveLength(1)
    const tercera = detectarAvisosDeChoques(segunda.memoria, [choque], 2_000)
    expect(tercera.avisos).toEqual([])
  })

  it('la primera mirada solo anota: lo que ya pasaba no se avisa de golpe', () => {
    const { avisos } = detectarAvisos(null, [tarjeta('a', 'attention'), tarjeta('b', 'done')], 0)
    expect(avisos).toEqual([])
  })

  it('avisa cuando uno pasa a necesitarte y cuando uno que trabajaba termina', () => {
    const { memoria } = detectarAvisos(null, [tarjeta('a', 'working'), tarjeta('b', 'working')], 0)
    const { avisos } = detectarAvisos(
      memoria,
      [tarjeta('a', 'attention'), tarjeta('b', 'done'), tarjeta('c', 'attention')],
      1_000
    )
    expect(avisos.map((aviso) => `${aviso.card.paneKey}:${aviso.tipo}`)).toEqual([
      'a:te-necesita',
      'b:termino',
      'c:te-necesita'
    ])
  })

  it('lo que ya viste no se avisa, ni lo que sigue igual', () => {
    const { memoria } = detectarAvisos(
      null,
      [tarjeta('a', 'working'), tarjeta('b', 'attention')],
      0
    )
    const { avisos } = detectarAvisos(
      memoria,
      [tarjeta('a', 'done', false), tarjeta('b', 'attention')],
      1_000
    )
    expect(avisos).toEqual([])
  })

  it('detecta cada vez que pasa: el enfriamiento se aplica al mostrar, no al detectar', () => {
    let { memoria } = detectarAvisos(null, [tarjeta('a', 'working')], 0)
    let avisos
    ;({ avisos, memoria } = detectarAvisos(memoria, [tarjeta('a', 'attention')], 1_000))
    expect(avisos).toHaveLength(1)
    ;({ memoria } = detectarAvisos(memoria, [tarjeta('a', 'working')], 2_000))
    ;({ avisos } = detectarAvisos(memoria, [tarjeta('a', 'attention')], 3_000))
    expect(avisos).toHaveLength(1)
  })
})

const aviso = (
  paneKey: string,
  tipo: TipoDeAviso,
  card = tarjeta(paneKey, tipo === 'termino' ? 'done' : 'attention')
): AvisoDeAgente => ({
  id: `${paneKey}:${tipo}`,
  tipo,
  card,
  detectadoEn: 0
})

const paneKeyDelAviso = (cada: Aviso): string | null =>
  'card' in cada ? cada.card.paneKey : null

describe('la cola de avisos se pone al día con el tablero', () => {
  it('se va el de un agente que ya viste, que contestaste, que volvió a trabajar o que ya no está', () => {
    const cola = [
      aviso('a', 'termino'),
      aviso('b', 'te-necesita'),
      aviso('c', 'termino'),
      aviso('d', 'termino')
    ]
    const vigentes = avisosVigentes(cola, [
      tarjeta('a', 'idle', false),
      tarjeta('b', 'working'),
      tarjeta('c', 'done')
    ])
    expect(vigentes.map((cada) => cada.id)).toEqual(['c:termino'])
  })

  it('el que sigue valiendo se queda con la tarjeta nueva (la pregunta puede llegar después)', () => {
    const nueva = { ...tarjeta('b', 'attention'), askSummary: '¿té o café?' }
    const [vigente] = avisosVigentes([aviso('b', 'te-necesita')], [nueva])
    expect(paneKeyDelAviso(vigente)).toBe(nueva.paneKey)
  })

  it('si nada cambió devuelve la misma lista', () => {
    const card = tarjeta('a', 'done')
    const cola = [aviso('a', 'termino', card)]
    expect(avisosVigentes(cola, [card])).toBe(cola)
  })
})

describe('encolar avisos', () => {
  it('el que está a la vista no se descarta: se van los más viejos de los que esperan', () => {
    const cola = ['a', 'b', 'c', 'd'].map((paneKey) => aviso(paneKey, 'termino'))
    const nuevos = ['e', 'f'].map((paneKey) => aviso(paneKey, 'termino'))
    expect(encolarAvisos(cola, nuevos, 4).map(paneKeyDelAviso)).toEqual([
      'a',
      'd',
      'e',
      'f'
    ])
  })

  it('sin pasarse del máximo, se suman al final', () => {
    expect(encolarAvisos([aviso('a', 'termino')], [aviso('b', 'termino')], 4)).toHaveLength(2)
  })
})

describe('el enfriamiento', () => {
  it('lo mismo del mismo agente no se muestra dos veces antes de ENFRIAMIENTO_MS', () => {
    let { pasan, mostrados } = pasarEnfriamiento([aviso('a', 'te-necesita')], new Map(), 1_000)
    expect(pasan).toHaveLength(1)
    ;({ pasan, mostrados } = pasarEnfriamiento([aviso('a', 'te-necesita')], mostrados, 5_000))
    expect(pasan).toEqual([])
    // Otra cosa del mismo agente, u otro agente, sí.
    ;({ pasan, mostrados } = pasarEnfriamiento(
      [aviso('a', 'termino'), aviso('b', 'te-necesita')],
      mostrados,
      6_000
    ))
    expect(pasan).toHaveLength(2)
    ;({ pasan } = pasarEnfriamiento(
      [aviso('a', 'te-necesita')],
      mostrados,
      1_000 + ENFRIAMIENTO_MS
    ))
    expect(pasan).toHaveLength(1)
  })

  it('dos iguales en la misma tanda salen una vez', () => {
    const { pasan } = pasarEnfriamiento(
      [aviso('a', 'termino'), aviso('a', 'termino')],
      new Map(),
      0
    )
    expect(pasan).toHaveLength(1)
  })
})
