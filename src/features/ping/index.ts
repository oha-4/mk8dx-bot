import type { Feature } from '../../core/registry.ts'
import { pingPrefix, pingSlash } from './commands/ping.ts'

export const ping: Feature = {
    name: 'ping',
    slashCommands: [pingSlash],
    prefixCommands: [pingPrefix],
}
