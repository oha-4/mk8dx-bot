export const PREFIXES = ['%', '％'] as const

export type PrefixInvocation = {
    /** 実際に入力された名前（エイリアスの場合はエイリアス） */
    name: string
    /** 名前より後ろを空白で区切ったもの */
    tokens: string[]
}

/**
 * `%name a b` 形式のメッセージ本文を分解する。プレフィックスの直後に名前がなければ undefined。
 */
export const parsePrefixInvocation = (content: string): PrefixInvocation | undefined => {
    const prefix = PREFIXES.find((candidate) => content.startsWith(candidate))
    if (prefix === undefined) return undefined
    const body = content.slice(prefix.length)
    if (body === '' || /^\s/.test(body)) return undefined
    const [name, ...tokens] = body.trim().split(/\s+/)
    if (name === undefined) return undefined
    return { name, tokens }
}

const SNOWFLAKE = /^\d{17,20}$/

const idFrom = (token: string, mention: RegExp): string | undefined => {
    const id = mention.exec(token)?.[1] ?? token
    return SNOWFLAKE.test(id) ? id : undefined
}

export const toInteger = (token: string): number | undefined =>
    /^[+-]?\d+$/.test(token) ? Number.parseInt(token, 10) : undefined

export const toNumber = (token: string): number | undefined => {
    if (token.trim() === '') return undefined
    const value = Number(token)
    return Number.isFinite(value) ? value : undefined
}

const TRUE_WORDS = new Set(['true', 'yes', 'on', '1'])
const FALSE_WORDS = new Set(['false', 'no', 'off', '0'])

export const toBoolean = (token: string): boolean | undefined => {
    const lower = token.toLowerCase()
    if (TRUE_WORDS.has(lower)) return true
    if (FALSE_WORDS.has(lower)) return false
    return undefined
}

/** `<@id>`・`<@!id>`・id を受け付け、ユーザー ID を返す */
export const toUserId = (token: string): string | undefined => idFrom(token, /^<@!?(\d+)>$/)

/** `<#id>`・id を受け付け、チャンネル ID を返す */
export const toChannelId = (token: string): string | undefined => idFrom(token, /^<#(\d+)>$/)

/** `<@&id>`・id を受け付け、ロール ID を返す */
export const toRoleId = (token: string): string | undefined => idFrom(token, /^<@&(\d+)>$/)
