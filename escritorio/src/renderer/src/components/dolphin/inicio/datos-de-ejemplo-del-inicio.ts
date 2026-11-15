import type { WorktreeStatus } from '../../../../../shared/worktree-status-rollup'
import type { TarjetaDelTablero } from '../../../../../shared/dolphin-tablero-types'
import type { TuiAgent } from '../../../../../shared/agent-launch/catalog/tui-agent'
import type { Repo } from '../../../../../shared/repo-types'
import type { EspacioConEstado, EspacioDelInicio } from './estado-del-inicio'
import type { DatosDelInicio } from './use-inicio'

/** Datos inventados para las capturas del inicio (VistaDelInicio.fixture.tsx). Nada de esto es real. */

export const AHORA = Date.parse('2026-11-11T15:00:00')
const HORA = 3_600_000
const DIA = 24 * HORA

export const AGENTES: TuiAgent[] = ['dolphin', 'claude', 'codex', 'gemini', 'opencode', 'qoder']

const espacio = (
  id: string,
  nombre: string,
  proyecto: string,
  rama: string | null,
  haceHoras: number
): EspacioDelInicio => ({
  id,
  repoId: proyecto,
  nombre,
  proyecto,
  rama,
  ultimaActividad: AHORA - haceHoras * HORA,
  creado: AHORA - (haceHoras + 30) * HORA
})

const ESPACIOS: EspacioDelInicio[] = [
  espacio('w1', 'buscador-ajustes', 'tienda-web', 'dolphin/buscador-ajustes', 0.2),
  espacio('w2', 'exportar-csv', 'tienda-web', 'dolphin/exportar-csv', 0.6),
  espacio('w3', 'login-con-google', 'tienda-web', 'dolphin/login-google', 1.5),
  espacio('w4', 'arreglar-pdf', 'dolphin-app', 'dolphin/arreglar-pdf', 2),
  espacio('w5', 'migrar-prisma-7', 'dolphin-app', 'dolphin/prisma-7', 30)
]

const ESTADOS = new Map<string, WorktreeStatus>([
  ['w1', 'working'],
  ['w2', 'working'],
  ['w3', 'permission'],
  ['w4', 'done'],
  ['w5', 'inactive']
])

/** Unas cuantas semanas de trabajo, más denso en las últimas. */
const CUANDO_TRABAJASTE: number[] = Array.from({ length: 140 }, (_, i) => {
  const dias = Math.floor((i * 37) % 160) * (i % 3 === 0 ? 0.4 : 1)
  return AHORA - dias * DIA - (i % 7) * HORA
})

const PROYECTOS = [
  { worktreeId: 'w1', repoId: 'tienda-web', nombre: 'tienda-web' },
  { worktreeId: 'w4', repoId: 'dolphin-app', nombre: 'dolphin-app' }
]

const REPOS = [
  { id: 'tienda-web', displayName: 'tienda-web' },
  { id: 'dolphin-app', displayName: 'dolphin-app' },
  { id: 'api-pagos', displayName: 'api-pagos' }
]

/**
 * Los mismos proyectos, como los tiene el store: el compositor los lee de ahí. Sin esto, la captura
 * con tarjetas mostraba el compositor de un perfil sin proyectos.
 */
export const REPOS_DEL_STORE: Repo[] = REPOS.map((repo) => ({
  ...repo,
  path: `C:/proyectos/${repo.id}`,
  // Carpetas y no repos de git: el compositor no sale a buscar issues de GitHub en la captura.
  kind: 'folder' as const,
  badgeColor: '#888888',
  addedAt: AHORA - 90 * DIA
}))

const conEstado = (id: string): EspacioConEstado => ({
  espacio: ESPACIOS.find((e) => e.id === id)!,
  estado: ESTADOS.get(id) ?? 'inactive'
})

const tarjeta = (
  id: string,
  titulo: string,
  columna: TarjetaDelTablero['columna'],
  extra: Partial<TarjetaDelTablero> = {}
): TarjetaDelTablero => ({
  id,
  titulo,
  columna,
  tipo: 'tarea',
  movida: `2026-11-${String(10 - (Number(id.replace(/\D/g, '')) % 9)).padStart(2, '0')}T10:00:00Z`,
  ...extra
})

const LARGO =
  'Que el resumen mensual de facturación muestre las notas de crédito separadas de las facturas, con su total y el neto del período, sin romper la exportación a Excel que usan los contadores'

const CUARENTA_IDEAS = Array.from({ length: 40 }, (_, i) =>
  tarjeta(
    `i${i}`,
    i === 0
      ? LARGO
      : `Idea ${i + 1}: ${['revisar el onboarding', 'atajos de teclado', 'modo compacto', 'exportar a PDF'][i % 4]}`,
    'ideas',
    { tipo: 'idea' }
  )
)

const TARJETAS: TarjetaDelTablero[] = [
  ...CUARENTA_IDEAS,
  tarjeta('h1', 'Sumar un buscador a Ajustes', 'para-hacer'),
  tarjeta('h2', 'Paginar la lista de facturas cuando pasan de 500', 'para-hacer'),
  tarjeta('d1', 'Buscador en Ajustes', 'haciendo', {
    quien: 'agentes',
    rama: 'dolphin/buscador-ajustes',
    porton: [
      { fase: 'tipos', estado: 'paso' },
      { fase: 'lint', estado: 'paso' },
      { fase: 'test', estado: 'sin-correr' },
      { fase: 'build', estado: 'sin-correr' }
    ]
  }),
  tarjeta('d2', 'Exportar a CSV con el formato de ARCA', 'haciendo', {
    quien: 'agentes',
    rama: 'dolphin/exportar-csv'
  }),
  tarjeta('r1', 'Arreglar el PDF que corta el CUIT largo', 'para-revisar', {
    quien: 'agentes',
    rama: 'dolphin/arreglar-pdf',
    porton: [
      { fase: 'tipos', estado: 'paso' },
      { fase: 'lint', estado: 'paso' },
      { fase: 'test', estado: 'paso' },
      { fase: 'build', estado: 'paso' },
      { fase: 'memoria', estado: 'paso' }
    ]
  }),
  tarjeta('r2', 'Login con Google', 'para-revisar', {
    quien: 'Nico',
    rama: 'dolphin/login-google',
    porton: [
      { fase: 'tipos', estado: 'paso' },
      { fase: 'lint', estado: 'paso' },
      { fase: 'test', estado: 'fallo' },
      { fase: 'build', estado: 'sin-correr' }
    ]
  }),
  tarjeta('x1', 'Migrar a Prisma 7', 'hecho', {
    rama: 'dolphin/prisma-7',
    porton: [
      { fase: 'tipos', estado: 'paso' },
      { fase: 'lint', estado: 'salteada' },
      { fase: 'test', estado: 'paso' }
    ]
  }),
  tarjeta('x2', 'Quitar el polyfill de fetch', 'hecho')
]

const VACIO: DatosDelInicio = {
  repos: [],
  listo: true,
  espacios: [],
  estados: new Map(),
  teNecesita: [],
  hoy: [],
  cuandoTrabajaste: [],
  proyectos: [],
  tablero: null,
  ahora: AHORA
}

export const PERFIL_NUEVO: DatosDelInicio = VACIO

export const CARGANDO: DatosDelInicio = { ...VACIO, listo: false, tablero: undefined }

/** Con proyectos y sin tarjetas: nada corre, lo último fue hace unas horas. */
export const CON_PROYECTOS: DatosDelInicio = {
  ...VACIO,
  repos: REPOS,
  espacios: ESPACIOS.map((e) => ({ ...e, ultimaActividad: e.ultimaActividad - 3 * HORA })),
  cuandoTrabajaste: CUANDO_TRABAJASTE,
  proyectos: PROYECTOS
}

export const CON_TARJETAS: DatosDelInicio = {
  ...CON_PROYECTOS,
  espacios: ESPACIOS,
  estados: ESTADOS,
  teNecesita: [conEstado('w3'), conEstado('w4')],
  hoy: [conEstado('w1'), conEstado('w2')],
  tablero: { worktreeId: 'w1', tarjetas: TARJETAS }
}

export const CON_ERROR: DatosDelInicio = { ...CON_PROYECTOS, tablero: 'error' }
