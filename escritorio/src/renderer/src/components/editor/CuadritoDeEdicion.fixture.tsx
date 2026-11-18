import { useEffect, useRef } from 'react'
import { defineFixture } from '../../component-fixtures/component-fixture'
import { enCastellano } from '../../component-fixtures/en-castellano'
import { FixtureCodeBackdrop } from '../../component-fixtures/FixtureCodeBackdrop'
import { crearCuadrito, type DocumentoDelCuadrito } from './edicion-en-el-lugar-cuadrito'
import { lineasDelCambio } from './edicion-en-el-lugar'
import type { EstadoEdicion } from './edicion-en-el-lugar-estado'

/**
 * El cuadrito de Cmd+K en sus estados, sobre un editor de mentira.
 * `pnpm fixtures:shot "editor/CuadritoDeEdicion:*" --theme both`.
 */

const ARCHIVO = [
  'export function encabezado(token: string): Headers {',
  '  const esquema = "Bearer"',
  '  return new Headers({ Authorization: esquema + " " + token })',
  '}'
].join('\n')

// Como en el editor: la selección arranca después de la sangría.
const SELECCION = { desde: ARCHIVO.indexOf('return'), hasta: ARCHIVO.lastIndexOf('\n') }

const DOCUMENTO: DocumentoDelCuadrito = {
  ruta: '/home/ana/tienda/src/api/encabezado.ts',
  vistaPrevia: (tramo, codigo) => lineasDelCambio(ARCHIVO, tramo, codigo)
}

const CLAUDE = { id: 'claude', nombre: 'Claude' }

const RESPUESTA = [
  'Arma el encabezado `Authorization` que espera la API: el **esquema** seguido del token.',
  '',
  '- `esquema` = `"Bearer"`, el tipo de credencial que pide el servidor.',
  '- `token` = el valor que vino del login; si está vacío el servidor contesta **401**.',
  '',
  'Si lo querés más legible, con una plantilla queda así:',
  '',
  '```ts',
  'return new Headers({ Authorization: `${esquema} ${token}` })',
  '```',
  '',
  'Como es una pregunta, no cambié nada de la selección.'
].join('\n')

const REEMPLAZO = [
  'const valor = token.trim()',
  'if (!valor) throw new Error("Falta el token")',
  'return new Headers({ Authorization: `${esquema} ${valor}` })'
].join('\n')

function Escena({ estado }: { estado: EstadoEdicion }): React.JSX.Element {
  const lugar = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const nada = (): void => undefined
    const cuadrito = crearCuadrito(
      { enviar: nada, aceptar: nada, descartar: nada, reintentar: nada },
      DOCUMENTO
    )
    cuadrito.dibujar(estado)
    lugar.current?.appendChild(cuadrito.nodo)
    return () => {
      cuadrito.nodo.remove()
      cuadrito.desmontar()
    }
  }, [estado])
  return (
    <div className="relative bg-editor-surface">
      <FixtureCodeBackdrop rows={3} />
      <div ref={lugar} className="absolute top-6 left-10" />
    </div>
  )
}

const BASE = { tramo: SELECCION, revision: 1 }

const fixture = (estado: EstadoEdicion) =>
  defineFixture(enCastellano({ width: 760, render: () => <Escena estado={estado} /> }))

/** «¿Para qué sirve esta línea?»: se lee, con markdown y código, y no hay nada que aceptar. */
export const pregunta = fixture({
  ...BASE,
  fase: 'respuesta',
  instruccion: 'para que sirve esta linea',
  texto: RESPUESTA,
  agente: CLAUDE
})

/** Un cambio: el diff con los números del archivo, Descartar y Aceptar con su tecla. */
export const cambio = fixture({
  ...BASE,
  fase: 'propuesta',
  instruccion: 'validá que el token no venga vacío',
  codigo: REEMPLAZO,
  agente: CLAUDE
})

export const esperando = fixture({ ...BASE, fase: 'esperando', instruccion: 'hacelo async' })

export const fallo = fixture({
  ...BASE,
  fase: 'fallo',
  instruccion: 'hacelo async',
  motivo:
    'No hay un agente configurado para generar texto. Elegí uno en Ajustes → Git → Mensajes con IA y probá de nuevo.'
})

/** Un pedido eterno y una respuesta larga: el pedido se corta, la respuesta scrollea adentro. */
export const largo = fixture({
  ...BASE,
  fase: 'respuesta',
  instruccion:
    'explicame paso a paso qué hace esta función, qué pasa si el token viene vacío o con espacios y cómo lo testearía',
  texto: Array.from({ length: 4 }, () => RESPUESTA).join('\n\n'),
  agente: { id: 'codex', nombre: 'Codex' }
})
