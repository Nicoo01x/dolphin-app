import { dolphindPosixNodeRuntimeGlobs } from '../managed-server/install/dolphind-node-runtime-globs'
import { quotePosixShell } from '../../shared/shell/launch/shell-argument-quoting'
import type {
  EstadoDePaso,
  MotorDeDelfin,
  RevisionDelServidor,
  ServidorParaDelfines
} from '../../shared/delfines-types'

/**
 * Qué tiene el servidor para correr un bot 24/7, en un solo viaje por SSH: el sistema, un Node que
 * alcance, el motor del bot con su sesión iniciada, systemd de usuario y el linger. Lo que falta y
 * Dolphin no puede hacer solo (iniciar sesión, permisos de root) se dice con el comando exacto.
 */

/** La carpeta donde vive el núcleo de Dolphin en el servidor (al lado de lo que deja dolphind). */
export const NUCLEO_REMOTO = '.dolphin-remote/nucleo-dolphin'

/** El Node que pide el núcleo (`engines` de su package.json). */
const NODE_MINIMO = { mayor: 22, menor: 12 }

const PRUEBA_DE_NODE = `const [a,b]=process.versions.node.split(".").map(Number);process.stdout.write(a>${NODE_MINIMO.mayor}||(a===${NODE_MINIMO.mayor}&&b>=${NODE_MINIMO.menor})?process.versions.node:"")`

const COMANDOS_DEL_MOTOR: Record<
  Exclude<MotorDeDelfin, 'mentira'>,
  { programa: string; estado: string; login: string; instalar: string }
> = {
  claude: {
    programa: 'claude',
    estado: 'claude auth status',
    login: 'claude auth login',
    instalar: 'curl -fsSL https://claude.ai/install.sh | bash'
  },
  codex: {
    programa: 'codex',
    estado: 'codex login status',
    login: 'codex login',
    instalar: 'npm install -g @openai/codex'
  }
}

export function scriptDeRevision(motor: MotorDeDelfin, carpetaLocal: string): string {
  // El Node de dolphind primero (ya está y se probó al conectar), después el del sistema.
  const candidatos = [...dolphindPosixNodeRuntimeGlobs(), '$(command -v node 2>/dev/null)'].join(
    ' '
  )
  const base = carpetaLocal.split(/[\\/]/).findLast(Boolean) ?? ''
  const lineas = [
    'echo "sistema=$(uname -s)"',
    'echo "home=$HOME"',
    'echo "usuario=$(id -un)"',
    `for n in ${candidatos}; do`,
    '  [ -x "$n" ] || continue',
    `  v=$("$n" -e ${quotePosixShell(PRUEBA_DE_NODE)} 2>/dev/null)`,
    '  if [ -n "$v" ]; then echo "node=$n"; echo "nodeVersion=$v"; break; fi',
    'done',
    'systemctl --user show-environment >/dev/null 2>&1; echo "systemd=$?"',
    'echo "linger=$(loginctl show-user "$(id -un)" -p Linger --value 2>/dev/null)"',
    `echo "huella=$(cat "$HOME"/${quotePosixShell(`${NUCLEO_REMOTO}/.huella`)} 2>/dev/null)"`
  ]
  if (base && /^[\w.-]+$/.test(base)) {
    lineas.push(`[ -d "$HOME"/${quotePosixShell(base)} ] && echo "carpetaExiste=${base}"`)
  }
  if (motor !== 'mentira') {
    const m = COMANDOS_DEL_MOTOR[motor]
    lineas.push(
      `if command -v ${m.programa} >/dev/null 2>&1; then echo "motorEsta=1"; ${m.estado} >/dev/null 2>&1; echo "motorLogin=$?"; else echo "motorEsta=0"; fi`
    )
  }
  lineas.push('true')
  return lineas.join('\n')
}

export type RevisionCruda = RevisionDelServidor & {
  home: string
  usuario: string
  node: string | null
  huella: string
}

function datosDe(salida: string): Map<string, string> {
  const datos = new Map<string, string>()
  for (const linea of salida.split(/\r?\n/)) {
    const igual = linea.indexOf('=')
    if (igual > 0) {
      datos.set(linea.slice(0, igual).trim(), linea.slice(igual + 1).trim())
    }
  }
  return datos
}

function pasoDelMotor(motor: MotorDeDelfin, datos: Map<string, string>): EstadoDePaso {
  if (motor === 'mentira') {
    return { paso: 'motor', estado: 'ok' }
  }
  const m = COMANDOS_DEL_MOTOR[motor]
  if (datos.get('motorEsta') !== '1') {
    return { paso: 'motor', estado: 'falta', detalle: 'sin-instalar', comando: m.instalar }
  }
  if (datos.get('motorLogin') !== '0') {
    return { paso: 'motor', estado: 'falta', detalle: 'sin-sesion', comando: m.login }
  }
  return { paso: 'motor', estado: 'ok', detalle: motor }
}

export function leerRevision(
  servidor: ServidorParaDelfines,
  motor: MotorDeDelfin,
  id: string,
  salida: string
): RevisionCruda {
  const datos = datosDe(salida)
  const home = datos.get('home') ?? ''
  const usuario = datos.get('usuario') ?? ''
  const node = datos.get('node') || null
  const linux = datos.get('sistema') === 'Linux'
  const enableLinger = `sudo loginctl enable-linger ${usuario || '$USER'}`
  const pasos: EstadoDePaso[] = [
    linux
      ? { paso: 'sistema', estado: 'ok', detalle: 'Linux' }
      : { paso: 'sistema', estado: 'falta', detalle: datos.get('sistema') || 'desconocido' },
    node
      ? { paso: 'node', estado: 'ok', detalle: datos.get('nodeVersion') ?? '' }
      : {
          paso: 'node',
          estado: 'falta',
          comando:
            'curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs'
        },
    pasoDelMotor(motor, datos),
    datos.get('systemd') === '0'
      ? { paso: 'systemd', estado: 'ok' }
      : { paso: 'systemd', estado: 'falta', comando: enableLinger },
    datos.get('linger') === 'yes'
      ? { paso: 'linger', estado: 'ok' }
      : { paso: 'linger', estado: 'aviso', comando: enableLinger }
  ]
  const existente = datos.get('carpetaExiste')
  return {
    ...servidor,
    pasos,
    listo: pasos.every((paso) => paso.estado !== 'falta'),
    carpetaSugerida: home ? `${home}/${existente ?? `dolphin-bots/${id}`}` : '',
    home,
    usuario,
    node,
    huella: datos.get('huella') ?? ''
  }
}

/** Sin la ruta de la casa del servidor: es suya, no hace falta mandarla a la pantalla. */
export function revisionPublica(cruda: RevisionCruda): RevisionDelServidor {
  const { home: _home, usuario: _usuario, node: _node, huella: _huella, ...publica } = cruda
  return publica
}
