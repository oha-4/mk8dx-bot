import type { Message } from 'discord.js'
import { UserFacingError } from './errors.ts'
import {
    PREFIXES,
    toBoolean,
    toChannelId,
    toInteger,
    toNumber,
    toRoleId,
    toUserId,
    type PrefixInvocation,
} from './prefix.ts'

export type PrefixArgType = 'string' | 'integer' | 'number' | 'boolean' | 'user' | 'channel' | 'role'

export type PrefixArgDefinition = {
    readonly name: string
    readonly type: PrefixArgType
    readonly required?: boolean
    /** 最後の string 引数にだけ付けられる。残りのトークンをすべて空白でつないで受け取る */
    readonly rest?: boolean
}

type ValueOf<T extends PrefixArgType> = T extends 'integer' | 'number' ? number : T extends 'boolean' ? boolean : string

export type PrefixArgsOf<A extends readonly PrefixArgDefinition[]> = {
    [D in A[number] as D['name']]: D extends { readonly required: true }
        ? ValueOf<D['type']>
        : ValueOf<D['type']> | undefined
}

type Execute<Args> = (message: Message<true>, args: Args, invocation: PrefixInvocation) => Promise<unknown>

type BaseDefinition = {
    name: string
    aliases?: readonly string[]
    /** 使い方の表示に使う説明 */
    description?: string
}

export type PrefixCommand = {
    readonly name: string
    readonly aliases: readonly string[]
    readonly usage: string
    run: (message: Message<true>, invocation: PrefixInvocation) => Promise<unknown>
}

const TYPE_LABEL: Record<PrefixArgType, string> = {
    string: '文字列',
    integer: '整数',
    number: '数値',
    boolean: 'true / false',
    user: 'ユーザーのメンションか ID',
    channel: 'チャンネルのメンションか ID',
    role: 'ロールのメンションか ID',
}

const CONVERT: Record<PrefixArgType, (token: string) => unknown> = {
    string: (token) => token,
    integer: toInteger,
    number: toNumber,
    boolean: toBoolean,
    user: toUserId,
    channel: toChannelId,
    role: toRoleId,
}

const usageOf = (name: string, args: readonly PrefixArgDefinition[]): string => {
    const parts = args.map((arg) => {
        const label = arg.rest === true ? `${arg.name}...` : arg.name
        return arg.required === true ? `<${label}>` : `[${label}]`
    })
    return [`${PREFIXES[0]}${name}`, ...parts].join(' ')
}

const validateArgs = (name: string, args: readonly PrefixArgDefinition[]) => {
    args.forEach((arg, index) => {
        if (arg.rest === true && (index !== args.length - 1 || arg.type !== 'string')) {
            throw new Error(`${name}: rest は最後の string 引数にだけ指定できます（${arg.name}）`)
        }
        const previous = args[index - 1]
        if (arg.required === true && previous !== undefined && previous.required !== true) {
            throw new Error(`${name}: 必須の引数は任意の引数より前に置いてください（${arg.name}）`)
        }
    })
}

/**
 * 宣言に従ってトークンを位置引数に割り当てて変換する。余ったトークンは無視する（invocation.tokens からは参照できる）。
 */
export const parsePrefixArgs = (
    args: readonly PrefixArgDefinition[],
    tokens: readonly string[],
    usage: string,
): Record<string, unknown> => {
    const values: Record<string, unknown> = {}
    args.forEach((arg, index) => {
        const token = arg.rest === true ? tokens.slice(index).join(' ') || undefined : tokens[index]
        if (token === undefined) {
            if (arg.required === true)
                throw new UserFacingError(`引数 ${arg.name} を指定してください\n使い方: ${usage}`)
            values[arg.name] = undefined
            return
        }
        const value = CONVERT[arg.type](token)
        if (value === undefined) {
            throw new UserFacingError(`引数 ${arg.name} は${TYPE_LABEL[arg.type]}で指定してください\n使い方: ${usage}`)
        }
        values[arg.name] = value
    })
    return values
}

/**
 * プレフィックスコマンドを定義する。args の宣言から execute に渡す値の型を導出する。
 * 独自の書式が必要な場合は args の代わりに parse を渡す。
 */
export function definePrefixCommand<const A extends readonly PrefixArgDefinition[]>(
    definition: BaseDefinition & { args: A; execute: Execute<PrefixArgsOf<A>> },
): PrefixCommand
export function definePrefixCommand<Args>(
    definition: BaseDefinition & { usage?: string; parse: (tokens: string[]) => Args; execute: Execute<Args> },
): PrefixCommand
export function definePrefixCommand(
    definition: BaseDefinition & {
        args?: readonly PrefixArgDefinition[]
        usage?: string
        parse?: (tokens: string[]) => unknown
        execute: Execute<never>
    },
): PrefixCommand {
    const args = definition.args ?? []
    validateArgs(definition.name, args)
    const usage = definition.usage ?? usageOf(definition.name, args)
    const parse = definition.parse ?? ((tokens: string[]) => parsePrefixArgs(args, tokens, usage))
    // 宣言と execute の対応は overload の型で保証している
    const execute = definition.execute as Execute<unknown>
    return {
        name: definition.name,
        aliases: definition.aliases ?? [],
        usage,
        run: async (message, invocation) => execute(message, parse(invocation.tokens), invocation),
    }
}
