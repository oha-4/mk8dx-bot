import type { RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js'
import type { MessageListener } from './listener.ts'
import type { PrefixCommand } from './prefix-command.ts'
import type { SlashCommand } from './slash-command.ts'

export type Feature = {
    readonly name: string
    readonly slashCommands?: readonly SlashCommand[]
    readonly prefixCommands?: readonly PrefixCommand[]
    readonly listeners?: readonly MessageListener[]
}

export type Registry = {
    findSlashCommand: (name: string) => SlashCommand | undefined
    /** 名前またはエイリアスで探す。大文字と小文字を区別する */
    findPrefixCommand: (nameOrAlias: string) => PrefixCommand | undefined
    readonly listeners: readonly MessageListener[]
    slashCommandsJSON: () => RESTPostAPIChatInputApplicationCommandsJSONBody[]
}

export const createRegistry = (features: readonly Feature[]): Registry => {
    const slash = new Map<string, SlashCommand>()
    const prefix = new Map<string, PrefixCommand>()
    const listeners: MessageListener[] = []

    for (const feature of features) {
        for (const command of feature.slashCommands ?? []) {
            if (slash.has(command.name)) throw new Error(`スラッシュコマンド名が重複しています: ${command.name}`)
            slash.set(command.name, command)
        }
        for (const command of feature.prefixCommands ?? []) {
            for (const key of [command.name, ...command.aliases]) {
                const existing = prefix.get(key)
                if (existing !== undefined) {
                    throw new Error(
                        `プレフィックスコマンドの名前が重複しています: ${key}（${existing.name} と ${command.name}）`,
                    )
                }
                prefix.set(key, command)
            }
        }
        listeners.push(...(feature.listeners ?? []))
    }

    return {
        findSlashCommand: (name) => slash.get(name),
        findPrefixCommand: (nameOrAlias) => prefix.get(nameOrAlias),
        listeners,
        slashCommandsJSON: () => [...slash.values()].map((command) => command.toJSON()),
    }
}
