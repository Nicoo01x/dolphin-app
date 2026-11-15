import type { ReactNode } from 'react'
import { Composition, Sequence } from 'remotion'
import { Delegacion } from './Delegacion'
import { Permisos } from './Permisos'
import { Porton } from './Porton'

/**
 * Un cartel, dos clips: el ancho y el del panel. Los ids son los que usan `scripts/clips.mjs` y el
 * catálogo de carteles de la app (escritorio/src/shared/carteles-de-funcion.ts): si cambian acá,
 * cambian allá.
 */

/** Donde empieza lo que hay que ver: el líder ya partió la tarea y van saliendo los compañeros. */
const DESDE_LA_ACCION = 55

export function RemotionRoot(): ReactNode {
  return (
    <>
      {/*
       * 1280×720: el cartel del compositor es una tarjeta de 640 px de ancho, así que el clip se
       * mira a la mitad de su tamaño. Más alto deja una tarjeta que no entra en una ventana chica;
       * más ancho, letra que a la mitad no se lee. Es también el que publica la web.
       */}
      <Composition
        id="delegacion"
        component={Delegacion}
        durationInFrames={260}
        fps={30}
        width={1280}
        height={720}
      />
      {/*
       * El panel del aviso de función es casi cuadrado (29,4rem × 23rem ≈ 1,28), no 16:9. Con el
       * clip ancho quedaba una banda arriba y medio panel muerto abajo, y estirarlo a `cover`
       * recortaba las terminales de los costados, que son lo que hay que ver.
       *
       * Y arranca en la acción: el panel se mira chico y en bucle, así que los primeros dos
       * segundos —la tarea escribiéndose letra por letra— se leían como una imagen quieta.
       * `Sequence from` en negativo corre la escena hacia atrás sin tocar sus tiempos, así que hay
       * una sola línea de tiempo para mantener.
       */}
      <Composition
        id="delegacion-panel"
        component={PanelDeLaDelegacion}
        durationInFrames={260 - DESDE_LA_ACCION}
        fps={30}
        width={1000}
        height={780}
      />
      {/* Los permisos: la misma tarea de los dos modos, a la par. */}
      <Composition
        id="permisos"
        component={Permisos}
        durationInFrames={248}
        fps={30}
        width={1280}
        height={720}
      />
      {/*
       * El panel arranca cuando las dos terminales ya están abiertas: mirado chico y en bucle, lo
       * que cuenta es que una se frena y la otra no, no la tarea escribiéndose.
       */}
      <Composition
        id="permisos-panel"
        component={PanelDeLosPermisos}
        durationInFrames={248 - PERMISOS_DESDE_LA_ACCION}
        fps={30}
        width={1000}
        height={780}
      />
      {/* El portón: las dos ramas dicen «listo» y sólo una lo está. Dura más que los otros dos
          porque el portón corre después de que las dos terminales terminaron, y esa espera es
          justo lo que hay que ver: parece que ya está, y todavía no. */}
      <Composition
        id="porton"
        component={Porton}
        durationInFrames={300}
        fps={30}
        width={1280}
        height={720}
      />
      {/* El panel arranca con las dos terminales ya corriendo: mirado chico y en bucle, lo que
          cuenta es el portón, no la tarea escribiéndose. */}
      <Composition
        id="porton-panel"
        component={PanelDelPorton}
        durationInFrames={300 - PORTON_DESDE_LA_ACCION}
        fps={30}
        width={1000}
        height={780}
      />
    </>
  )
}

/** Donde empieza lo que hay que ver en el portón: las dos terminales ya trabajando. */
const PORTON_DESDE_LA_ACCION = 62

function PanelDelPorton(): ReactNode {
  return (
    <Sequence from={-PORTON_DESDE_LA_ACCION}>
      <Porton />
    </Sequence>
  )
}

/** Donde empieza lo que hay que ver en los permisos: las dos terminales ya corriendo. */
const PERMISOS_DESDE_LA_ACCION = 70

function PanelDeLosPermisos(): ReactNode {
  return (
    <Sequence from={-PERMISOS_DESDE_LA_ACCION}>
      <Permisos />
    </Sequence>
  )
}

function PanelDeLaDelegacion(): ReactNode {
  return (
    <Sequence from={-DESDE_LA_ACCION}>
      <Delegacion />
    </Sequence>
  )
}
