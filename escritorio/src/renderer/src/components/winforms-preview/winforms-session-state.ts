import type {
  WinFormsBuild,
  WinFormsCodigoDeError,
  WinFormsControl,
  WinFormsEventoDeSesion,
  WinFormsFase,
  WinFormsPlan
} from '../../../../shared/winforms/winforms-preview-types'

/** Lo que la pestaña sabe de su sesión, armado evento por evento. */
export type EstadoDeSesion = {
  fase: 'buscando' | 'compilando-host' | WinFormsFase | 'listo' | 'error' | 'cerrado'
  plan: WinFormsPlan | null
  build: {
    build: WinFormsBuild
    arquitectura: 'x86' | 'x64'
    desactualizado: { fuente: string; modificado: number } | null
  } | null
  descartados: { build: WinFormsBuild; motivo: string }[]
  titulo: string
  cuadro: { src: string; ancho: number; alto: number } | null
  controles: WinFormsControl[]
  dialogo: { titulo: string; texto: string } | null
  aviso: string | null
  error: { codigo: WinFormsCodigoDeError; mensaje: string; detalle: string } | null
}

export const ESTADO_INICIAL: EstadoDeSesion = {
  fase: 'buscando',
  plan: null,
  build: null,
  descartados: [],
  titulo: '',
  cuadro: null,
  controles: [],
  dialogo: null,
  aviso: null,
  error: null
}

export function reducirSesion(
  estado: EstadoDeSesion,
  evento: WinFormsEventoDeSesion
): EstadoDeSesion {
  switch (evento.evento) {
    case 'plan':
      return { ...estado, plan: evento.plan }
    case 'build':
      return {
        ...estado,
        fase: 'cargando-ensamblado',
        build: {
          build: evento.build,
          arquitectura: evento.arquitectura,
          desactualizado: evento.desactualizado
        },
        error: null
      }
    case 'descartado':
      return {
        ...estado,
        descartados: [...estado.descartados, { build: evento.build, motivo: evento.motivo }]
      }
    case 'compilando-host':
      return { ...estado, fase: 'compilando-host' }
    case 'fase':
      return estado.fase === 'listo' ? estado : { ...estado, fase: evento.fase }
    case 'listo':
      return { ...estado, fase: 'listo', titulo: evento.titulo, error: null }
    case 'cuadro':
      return {
        ...estado,
        titulo: evento.titulo || estado.titulo,
        cuadro: {
          src: `data:image/png;base64,${evento.png}`,
          ancho: evento.ancho,
          alto: evento.alto
        }
      }
    case 'controles':
      return { ...estado, controles: evento.controles }
    case 'dialogo':
      return { ...estado, dialogo: { titulo: evento.titulo, texto: evento.texto } }
    case 'aviso':
      return { ...estado, aviso: evento.mensaje }
    case 'error':
      return {
        ...estado,
        fase: 'error',
        error: { codigo: evento.codigo, mensaje: evento.mensaje, detalle: evento.detalle ?? '' }
      }
    case 'cerrado':
      return estado.fase === 'error' ? estado : { ...estado, fase: 'cerrado' }
  }
}
