import {
    ApplicationCommandOptionType,
    type ChatInputCommandInteraction,
    type RESTPostAPIChatInputApplicationCommandsJSONBody,
    type User,
} from 'discord.js'
import type { CommandScope } from './command-scope.ts'

type Choice<V extends string | number> = { readonly name: string; readonly value: V }

type BaseOption = { readonly description: string; readonly required?: boolean }

export type SlashOptionDefinition =
    | (BaseOption & { readonly type: 'string'; readonly choices?: readonly Choice<string>[] })
    | (BaseOption & { readonly type: 'integer' | 'number'; readonly choices?: readonly Choice<number>[] })
    | (BaseOption & { readonly type: 'boolean' | 'user' | 'channel' | 'role' })

type Resolver = ChatInputCommandInteraction['options']
type ChannelValue = NonNullable<ReturnType<Resolver['getChannel']>>
type RoleValue = NonNullable<ReturnType<Resolver['getRole']>>

type ValueOf<D extends SlashOptionDefinition> = D extends { readonly choices: readonly Choice<infer V>[] }
    ? V
    : D['type'] extends 'string'
      ? string
      : D['type'] extends 'integer' | 'number'
        ? number
        : D['type'] extends 'boolean'
          ? boolean
          : D['type'] extends 'user'
            ? User
            : D['type'] extends 'channel'
              ? ChannelValue
              : RoleValue

export type SlashOptionsOf<O extends Record<string, SlashOptionDefinition>> = {
    [K in keyof O]: O[K] extends { readonly required: true } ? ValueOf<O[K]> : ValueOf<O[K]> | undefined
}

export type SlashCommandDefinition<O extends Record<string, SlashOptionDefinition>> = {
    name: string
    description: string
    scope?: CommandScope
    options: O
    execute: (interaction: ChatInputCommandInteraction, options: SlashOptionsOf<O>) => Promise<unknown>
}

export type SlashCommand = {
    readonly name: string
    readonly scope: CommandScope
    toJSON: () => RESTPostAPIChatInputApplicationCommandsJSONBody
    run: (interaction: ChatInputCommandInteraction) => Promise<unknown>
}

const NAME = /^[-_\p{Ll}\p{Lo}\p{N}]{1,32}$/u

const OPTION_TYPE = {
    string: ApplicationCommandOptionType.String,
    integer: ApplicationCommandOptionType.Integer,
    number: ApplicationCommandOptionType.Number,
    boolean: ApplicationCommandOptionType.Boolean,
    user: ApplicationCommandOptionType.User,
    channel: ApplicationCommandOptionType.Channel,
    role: ApplicationCommandOptionType.Role,
} as const

const resolveOption = (options: Resolver, name: string, definition: SlashOptionDefinition): unknown => {
    switch (definition.type) {
        case 'string':
            return options.getString(name) ?? undefined
        case 'integer':
            return options.getInteger(name) ?? undefined
        case 'number':
            return options.getNumber(name) ?? undefined
        case 'boolean':
            return options.getBoolean(name) ?? undefined
        case 'user':
            return options.getUser(name) ?? undefined
        case 'channel':
            return options.getChannel(name) ?? undefined
        case 'role':
            return options.getRole(name) ?? undefined
    }
}

/**
 * スラッシュコマンドを定義する。options の宣言から、登録用の JSON と execute に渡す値の型を導出する。
 */
export const defineSlashCommand = <const O extends Record<string, SlashOptionDefinition>>(
    definition: SlashCommandDefinition<O>,
): SlashCommand => {
    const entries = Object.entries(definition.options) as [string, SlashOptionDefinition][]
    for (const name of [definition.name, ...entries.map(([optionName]) => optionName)]) {
        if (!NAME.test(name)) throw new Error(`スラッシュコマンドの名前が不正です: ${name}`)
    }

    // Discord は必須のオプションが任意のものより前にあることを求める
    const ordered = entries.toSorted(([, a], [, b]) => Number(b.required === true) - Number(a.required === true))

    return {
        name: definition.name,
        scope: definition.scope ?? 'global',
        toJSON: () => ({
            name: definition.name,
            description: definition.description,
            options: ordered.map(([name, option]) => ({
                name,
                description: option.description,
                type: OPTION_TYPE[option.type],
                required: option.required === true,
                ...('choices' in option && option.choices !== undefined ? { choices: [...option.choices] } : {}),
            })) as RESTPostAPIChatInputApplicationCommandsJSONBody['options'],
        }),
        run: async (interaction) => {
            const values = Object.fromEntries(
                entries.map(([name, option]) => [name, resolveOption(interaction.options, name, option)]),
            )
            return definition.execute(interaction, values as SlashOptionsOf<O>)
        },
    }
}
