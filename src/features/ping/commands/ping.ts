import { MessageFlags, type Client } from 'discord.js'
import { definePrefixCommand } from '../../../core/prefix-command.ts'
import { defineSlashCommand } from '../../../core/slash-command.ts'
import { measureLatency } from '../usecases/measure-latency.ts'
import { renderPing } from '../views/ping.ts'

const run = (client: Client) => renderPing(measureLatency({ gatewayPing: () => client.ws.ping }))

export const pingSlash = defineSlashCommand({
    name: 'ping',
    description: 'bot の応答速度を確認します',
    options: {},
    execute: (interaction) => interaction.reply({ ...run(interaction.client), flags: MessageFlags.Ephemeral }),
})

export const pingPrefix = definePrefixCommand({
    name: 'ping',
    aliases: ['p'],
    description: 'bot の応答速度を確認します',
    args: [],
    execute: (message) => message.reply(run(message.client)),
})
