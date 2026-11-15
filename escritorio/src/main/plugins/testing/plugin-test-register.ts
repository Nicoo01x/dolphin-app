/** `node --import dolphin-test-register.mjs`: installs the plugin test hooks shipped beside it. */
import { register } from 'node:module'

register('./dolphin-test-hooks.mjs', import.meta.url)
