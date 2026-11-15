import {
  DOLPHIND_NODE_RUNTIME_DIR_PREFIX,
  DOLPHIND_NODE_RUNTIME_POSIX_EXECUTABLE,
  DOLPHIND_RUNTIMES_DIRNAME
} from '../../../shared/dolphind-artifacts'
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import { RELAY_REMOTE_DIR } from './remote-install-root'
import { DOLPHIND_MACHINE_HOMES_DIRNAME } from '../host-state/dolphind-machine-home'

/** POSIX shell glob words for dolphind's pinned Node runtimes; machine homes may hold other architectures, so callers must self-test each match. */
export function dolphindPosixNodeRuntimeGlobs(): [string, string] {
  const store = `${RELAY_REMOTE_DIR}/${DOLPHIND_RUNTIMES_DIRNAME}/${DOLPHIND_NODE_RUNTIME_DIR_PREFIX}`
  const executable = `/${DOLPHIND_NODE_RUNTIME_POSIX_EXECUTABLE}`
  const machineStores = `${RELAY_REMOTE_DIR}/${DOLPHIND_MACHINE_HOMES_DIRNAME}/`
  return [
    `"$HOME"/${quotePosixShell(store)}*${quotePosixShell(executable)}`,
    `"$HOME"/${quotePosixShell(machineStores)}*/${quotePosixShell(store)}*${quotePosixShell(executable)}`
  ]
}
