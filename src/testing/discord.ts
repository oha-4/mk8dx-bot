import type { ChatInputCommandInteraction, Client, Interaction, Message } from 'discord.js'
import { vi } from 'vitest'
import type { ErrorReporter } from '../core/error-reporter.ts'

export const GUILD_ID = '100000000000000001'
export const CHANNEL_ID = '100000000000000002'

const fakeClient = (ping = 42) => ({ ws: { ping } }) as unknown as Client<true>

/** 応答状態を実際の interaction と同じように変化させる、スラッシュコマンドの偽オブジェクト */
export const fakeSlashInteraction = (
    commandName: string,
    options: { data?: { name: string; value: unknown }[]; values?: Record<string, unknown> } = {},
) => {
    const state = { deferred: false, replied: false }
    const values = options.values ?? {}
    const getter = (name: string) => values[name] ?? null
    const interaction = {
        commandName,
        guildId: GUILD_ID,
        channelId: CHANNEL_ID,
        client: fakeClient(),
        isChatInputCommand: () => true,
        options: {
            data: options.data ?? [],
            getString: getter,
            getInteger: getter,
            getNumber: getter,
            getBoolean: getter,
            getUser: getter,
            getChannel: getter,
            getRole: getter,
        },
        get deferred() {
            return state.deferred
        },
        get replied() {
            return state.replied
        },
        reply: vi.fn(async () => {
            state.replied = true
        }),
        deferReply: vi.fn(async () => {
            state.deferred = true
        }),
        editReply: vi.fn(async () => {
            state.replied = true
        }),
        followUp: vi.fn(async () => {}),
    }
    return interaction as typeof interaction & ChatInputCommandInteraction & Interaction
}

export const fakeMessage = (
    content: string,
    author: { bot?: boolean } = {},
    extra: { webhookId?: string | null; inGuild?: boolean } = {},
) => {
    const message = {
        content,
        author: { bot: author.bot ?? false },
        webhookId: extra.webhookId ?? null,
        guildId: GUILD_ID,
        channelId: CHANNEL_ID,
        client: fakeClient(),
        inGuild: () => extra.inGuild ?? true,
        reply: vi.fn(async () => ({})),
    }
    return message as typeof message & Message<true>
}

export const fakeReporter = () => {
    const report = vi.fn<ErrorReporter['report']>(async () => {})
    return { report } satisfies ErrorReporter
}
