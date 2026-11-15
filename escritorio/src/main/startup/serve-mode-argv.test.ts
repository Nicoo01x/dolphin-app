import { describe, expect, it } from 'vitest'
import {
  argvRequestsServeMode,
  findServeSubcommandIndex,
  normalizeServeModeArgv
} from './serve-mode-argv'
import { getServeOptions } from './serve-options'
import { parseArgs as parseDolphindArgs } from '../dolphind/dolphind-command-arguments'
import { dolphindServeArgs, serveOptionArgs } from '../../shared/dolphind-serve-argv'

describe('serve-mode-argv', () => {
  it('does not treat serve as a subcommand when it is an option value', () => {
    expect(findServeSubcommandIndex(['app', '--user-data-dir', 'serve'])).toBe(-1)
    expect(argvRequestsServeMode(['app', '--user-data-dir', 'serve'])).toBe(false)
    expect(normalizeServeModeArgv(['app', '--user-data-dir', 'serve'])).toEqual([
      'app',
      '--user-data-dir',
      'serve'
    ])
    expect(findServeSubcommandIndex(['app', '--user-data-dir', '/tmp/x', 'serve'])).toBe(3)
  })

  it('refuses a help launch instead of binding a server', () => {
    // Help once launched a network-exposed pairing server silently; route CLI-form help to the CLI.
    for (const argv of [
      ['/AppRun', 'serve', '--help'],
      ['/AppRun', 'serve', '-h'],
      ['/AppRun', '--help', 'serve'],
      ['/AppRun', 'help', 'serve'],
      ['/AppRun', 'serve', 'help']
    ]) {
      expect(argvRequestsServeMode(argv), argv.join(' ')).toBe(false)
      expect(normalizeServeModeArgv(argv)).toEqual(argv)
    }
    // A value named help is not a help request.
    expect(argvRequestsServeMode(['/AppRun', 'serve', '--project-root', 'help'])).toBe(true)
    // Never reinterpret tokens after the operator's -- terminator.
    expect(argvRequestsServeMode(['/AppRun', 'serve', '--', '--help'])).toBe(true)
  })

  it('does not turn `--no-pairing=false` into no-pairing', () => {
    // CLI booleans require bare flags; translating --no-pairing=false would drop its value and invert operator intent.
    expect(
      normalizeServeModeArgv(['/AppRun', 'serve', '--port', '6768', '--no-pairing=false'])
    ).toEqual(['/AppRun', '--serve', '--serve-port', '6768', '--no-pairing=false'])
    expect(normalizeServeModeArgv(['/AppRun', 'serve', '--mobile-pairing=0'])).toEqual([
      '/AppRun',
      '--serve',
      '--mobile-pairing=0'
    ])
  })

  it('leaves real GUI launch argv alone', () => {
    // False serve detection replaces a desktop window with a listening runtime; exercise actual desktop argv shapes.
    for (const argv of [
      ['/Applications/Dolphin.app/Contents/MacOS/Dolphin', '-psn_0_123456'],
      ['C:\\Program Files\\Dolphin\\Dolphin.exe', '--squirrel-firstrun'],
      ['C:\\Program Files\\Dolphin\\Dolphin.exe', 'dolphin://worktree/serve'],
      ['/opt/dolphin/dolphin-ide', '/home/u/serve'],
      // Value tokens named serve are never subcommands.
      ['/opt/dolphin/dolphin-ide', '--pairing-code', 'serve'],
      ['/opt/dolphin/dolphin-ide', '--environment=serve'],
      ['/opt/dolphin/dolphin-ide', '--', 'serve'],
      ['/opt/dolphin/dolphin-ide', 'Serve']
    ]) {
      expect(argvRequestsServeMode(argv), argv.join(' ')).toBe(false)
      expect(normalizeServeModeArgv(argv)).toEqual(argv)
    }
  })

  it('does not treat a later positional serve as the subcommand after another command', () => {
    expect(findServeSubcommandIndex(['app', 'status', 'serve'])).toBe(-1)
    expect(argvRequestsServeMode(['app', 'status', 'serve'])).toBe(false)
  })

  it('keeps equals-form values that start with a flag marker intact', () => {
    expect(normalizeServeModeArgv(['/AppRun', 'serve', '--pairing-address=--no-pairng'])).toEqual([
      '/AppRun',
      '--serve',
      '--serve-pairing-address=--no-pairng'
    ])
  })

  it('does not splice prototype members onto argv for stray positionals', () => {
    expect(normalizeServeModeArgv(['/AppRun', 'serve', 'toString'])).toEqual([
      '/AppRun',
      '--serve',
      'toString'
    ])
  })

  it('passes args after `--` through verbatim', () => {
    expect(normalizeServeModeArgv(['/AppRun', 'serve', '--json', '--', '--port', '1'])).toEqual([
      '/AppRun',
      '--serve',
      '--serve-json',
      '--',
      '--port',
      '1'
    ])
  })

  it('carries --allow-public and --refuse-public to both serve hosts', () => {
    expect(parseDolphindArgs(dolphindServeArgs({ allowPublic: true })).allowPublic).toBe(true)
    expect(parseDolphindArgs(dolphindServeArgs({})).allowPublic).toBeUndefined()
    expect(getServeOptions(serveOptionArgs({ allowPublic: true }, '--serve-')).allowPublic).toBe(
      true
    )
    expect(getServeOptions(serveOptionArgs({}, '--serve-')).allowPublic).toBe(false)
    expect(parseDolphindArgs(dolphindServeArgs({ refusePublic: true })).refusePublic).toBe(true)
    expect(getServeOptions(serveOptionArgs({ refusePublic: true }, '--serve-')).refusePublic).toBe(
      true
    )
    expect(() => parseDolphindArgs(['--allow-public', '--refuse-public'])).toThrow(/not both/)
    expect(() => getServeOptions(['--serve-allow-public', '--serve-refuse-public'])).toThrow(
      /not both/
    )
  })
})
