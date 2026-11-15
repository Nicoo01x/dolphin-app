/**
 * Lo propio de Dolphin sobre la base (MIT).
 *
 * Why: los pedidos de estrella de Dolphin le dan estrella al repo de la base con la cuenta de
 * GitHub de quien toca el botón (`gh api -X PUT user/starred/...`). Desde Dolphin eso está
 * mal: es otra app. El repo de Dolphin todavía no está publicado; mientras sea null, ni el
 * botón del inicio ni los avisos se muestran, y el proceso principal se niega a dar la
 * estrella aunque alguien lo pida.
 */
export const DOLPHIN_GITHUB_URL: string | null = null

/**
 * De dónde baja Dolphin sus propias actualizaciones: las releases de este repo.
 *
 * Why acá y también en electron-builder.config.cjs: esta constante prende el buscador de
 * actualizaciones de la app (el menú, Ajustes y el canal), y la de electron-builder es la que
 * escribe `app-update.yml` adentro del paquete. Si una dice un repo y la otra otro, la app
 * ofrece una versión que no puede bajar: se cambian juntas.
 *
 * Para que una versión nueva llegue sola hace falta que el repo sea público, que la release NO
 * quede en borrador y que lleve `latest.yml` junto al instalador. Lo arma el workflow
 * `.github/workflows/instaladores.yml` al empujar un tag `vX.Y.Z` (ver RELEASE.md): sube todo a un
 * borrador y lo publica recién cuando están los archivos de las tres plataformas.
 */
export const DOLPHIN_UPDATE_FEED: { owner: string; repo: string } | null = {
  owner: 'Nicoo01x',
  repo: 'dolphin-app'
}

/**
 * Si la app de macOS se reemplaza sola al actualizar.
 *
 * Squirrel.Mac sólo acepta una versión firmada con un Developer ID y notarizada, y Dolphin
 * todavía sale sin firmar: con esto en `false` el aviso de actualización sale igual, pero el botón
 * abre la release para bajar el .dmg a mano. Pasa a `true` en el MISMO build que se firme de
 * verdad (`DOLPHIN_MAC_RELEASE=1` con el certificado), nunca antes: quien decide es la versión ya
 * instalada, como con el `publisherName` de Windows.
 */
export const DOLPHIN_MAC_ACTUALIZA_SOLO: boolean = false

/**
 * El catálogo oficial de plugins (el de la base) prendido: Dolphin conserva el
 * contrato público de la base para que los plugins de su ecosistema funcionen (decisión del dueño,
 * 11/11). Con él se siembra también el de la comunidad, como en la base.
 */
export const DOLPHIN_OFFICIAL_MARKETPLACE_ENABLED = true

/** Endpoint opcional de novedades de Dolphin. */
export const DOLPHIN_WHATS_NEW_URL: string | null = null

export function getDolphinUpdateRepository(): string | null {
  return DOLPHIN_UPDATE_FEED ? `${DOLPHIN_UPDATE_FEED.owner}/${DOLPHIN_UPDATE_FEED.repo}` : null
}

/**
 * Adónde van el feedback y los reportes de crash de Dolphin.
 *
 * Why: los de la base van a su servidor y de ahí a su Slack: mandarle desde Dolphin el
 * texto de alguien, su cuenta de GitHub y los registros de diagnóstico es darle datos a otra app.
 * Mientras sea null no sale nada: el formulario no se ofrece y un reporte de crash queda para
 * copiarlo a mano.
 */
export const DOLPHIN_FEEDBACK_URL: string | null = null

/**
 * La comunidad de Dolphin. Mientras sean null, los botones no salen.
 *
 * Por qué están acá y no escritas en la pantalla: el diálogo de comentarios tenía puestos a mano el
 * invite de Discord y la cuenta de X heredados de la base. Eran dos botones de nuestra app mandando
 * a nuestra gente a la comunidad de otro producto. El menú de ayuda ya los había sacado —lo vigila
 * un test—, pero este diálogo no.
 */
export const DOLPHIN_DISCORD_URL: string | null = null
export const DOLPHIN_X_URL: string | null = null

/**
 * La aplicación de Discord con la que Dolphin publica su presencia («Jugando a …» con el proyecto
 * y el lenguaje debajo).
 *
 * Mientras sea null la presencia no se prende: el nombre y el ícono que ve la gente los da esta
 * aplicación, y sin una propia Dolphin aparecería con el nombre de otra. Se saca en un minuto de
 * discord.com/developers/applications (New Application → el id de «Application ID») y se pone acá
 * o en la variable de entorno `DOLPHIN_DISCORD_APP_ID`, que gana sobre esto para poder probar sin
 * recompilar.
 */
export const DOLPHIN_DISCORD_APP_ID: string | null = null

/** El id que vale: la variable de entorno pisa la constante. Null = la presencia queda apagada. */
export function getDolphinDiscordAppId(
  entorno: Record<string, string | undefined> = process.env
): string | null {
  const puesto = entorno.DOLPHIN_DISCORD_APP_ID?.trim()
  return puesto && /^\d{15,25}$/.test(puesto) ? puesto : DOLPHIN_DISCORD_APP_ID
}

/** El motivo de un envío que no salió porque no hay DOLPHIN_FEEDBACK_URL; el renderer lo traduce. */
export const FEEDBACK_NOT_AVAILABLE = 'dolphin-feedback-not-available'

/**
 * Los servicios propios de la base que Dolphin no ofrece: su app de celular (la que se empareja
 * con la de escritorio) y su cuenta (su nube, que existe para esa app y los links públicos).
 *
 * Why: son otro producto. Mostrarlos con la marca Dolphin promete una app de celular y una cuenta
 * que no existen; el código queda intacto para seguir trayendo los cambios de DOLPHIN.
 */
export const DOLPHIN_USA_LA_NUBE_DE_DOLPHIN = false

/**
 * Abrir un agente es ver un chat, no una terminal: el agente corre como CLI de verdad (toda su
 * potencia: hooks, skills, MCP, modos) y la interfaz de chat va encima, leyendo su sesión y
 * escribiéndole como si tipearas. Nada de `-p` ni SDK, que tienen menos potencia (Nico, 23/10).
 */
export const DOLPHIN_CHAT_SOBRE_EL_CLI = true

/**
 * La isla (Nico, 23/10: «una isla tipo Dynamic Island arriba de la pantalla»): una ventana sin
 * marco y siempre arriba que dice cuántos agentes te esperan, trabajan o terminaron, y se expande
 * para ir a cualquiera. Es el pop-out del dashboard de la base en modo isla; la bandera habilita
 * su puente, que solo publica mientras la ventana está abierta. Se alterna con Ctrl+Alt+D.
 */
export const DOLPHIN_ISLA = true

/**
 * En un perfil nuevo la base agrega sola la carpeta personal como proyecto («~», con un espacio a
 * nombre del usuario). En Dolphin el punto de partida es el inicio con «Agregar proyecto»: ese
 * proyecto fantasma sobra y confunde. Apagada, un perfil nuevo arranca sin proyectos (la base ya sabe
 * mostrar ese caso: el inicio, el compositor con «sin proyectos» y el alta del onboarding).
 *
 * Why una bandera y no borrar la siembra: sólo decide los perfiles nuevos (la siembra corre cuando
 * no hay documento de perfil). Los que ya tienen «~» no se tocan, y el inicio la sigue ignorando
 * por el canal `dolphin:carpeta-personal`.
 */
export const DOLPHIN_SIEMBRA_CARPETA_PERSONAL = false

/**
 * El muro de novedades de la base («Explore Dolphin» en el menú Ayuda), apagado.
 *
 * Why: sus fichas animadas (`resources/onboarding/feature-wall/tile-*`) son grabaciones de la base:
 * se ve su nombre, su repo, el usuario y la máquina de quien grabó y su web. El repo es público y
 * en lo visible no se nombra a la base, así que esas grabaciones salieron del árbol. Con esto en
 * `false` el menú no ofrece el ítem y el renderer ignora el pedido de abrirlo, así que nunca queda
 * una pantalla vacía. La «Guía de inicio» es otro modal y sigue igual. Para prenderlo hay que
 * grabar fichas propias de Dolphin y volver a sumar la carpeta a `extraResources`.
 */
export const DOLPHIN_MURO_DE_NOVEDADES = false
