import { AttachmentBuilder, EmbedBuilder, type BaseMessageOptions, type Client } from 'discord.js'
import type { Logger } from './logger.ts'

type Location = {
    guildId: string | null
    channelId: string | null
}

export type ErrorContext =
    | ({ kind: 'slash'; commandName: string; options: readonly { name: string; value: unknown }[] } & Location)
    | ({ kind: 'prefix'; content: string } & Location)
    | ({ kind: 'listener'; listenerName: string; content: string } & Location)
    | { kind: 'process'; source: 'client' | 'unhandledRejection' | 'uncaughtException' }

export type ErrorReporter = {
    /** 想定外のエラーをエラーログチャンネルに通知する。通知の失敗は内部で記録し、throw しない */
    report: (error: unknown, context: ErrorContext) => Promise<void>
}

const EMBED_DESCRIPTION_LIMIT = 4096
const FIELD_LIMIT = 1024
const ERROR_COLOR = 0xe5_48_4d

const codeBlock = (text: string, limit: number) => {
    const fence = '```'
    const room = limit - fence.length * 2 - 2
    const body = text.length > room ? `${text.slice(0, room - 1)}…` : text
    return `${fence}\n${body}\n${fence}`
}

const describeError = (error: unknown) =>
    error instanceof Error
        ? { type: error.name, message: error.message, trace: error.stack ?? `${error.name}: ${error.message}` }
        : { type: typeof error, message: String(error), trace: String(error) }

const SOURCE_LABEL: Record<ErrorContext['kind'], string> = {
    slash: 'スラッシュコマンド',
    prefix: 'プレフィックスコマンド',
    listener: 'メッセージリスナー',
    process: 'プロセス',
}

const contextFields = (context: ErrorContext): { name: string; value: string }[] => {
    switch (context.kind) {
        case 'slash':
            return [
                { name: 'コマンド', value: codeBlock(`/${context.commandName}`, FIELD_LIMIT) },
                { name: 'オプション', value: codeBlock(JSON.stringify(context.options), FIELD_LIMIT) },
            ]
        case 'prefix':
            return [{ name: 'メッセージ', value: codeBlock(context.content, FIELD_LIMIT) }]
        case 'listener':
            return [
                { name: 'リスナー', value: codeBlock(context.listenerName, FIELD_LIMIT) },
                { name: 'メッセージ', value: codeBlock(context.content, FIELD_LIMIT) },
            ]
        case 'process':
            return [{ name: 'イベント', value: codeBlock(context.source, FIELD_LIMIT) }]
    }
}

const locationField = (context: ErrorContext) => {
    if (context.kind === 'process') return []
    const guild = context.guildId ?? 'DM'
    const channel = context.channelId === null ? '-' : `<#${context.channelId}> (${context.channelId})`
    return [{ name: '場所', value: `ギルド: ${guild}\nチャンネル: ${channel}` }]
}

/**
 * エラーログチャンネルに送る内容を組み立てる。
 */
export const buildErrorReport = (error: unknown, context: ErrorContext, now: Date): BaseMessageOptions => {
    const { type, message, trace } = describeError(error)
    const unix = Math.floor(now.getTime() / 1000)
    const embed = new EmbedBuilder()
        .setColor(ERROR_COLOR)
        .setTitle(type)
        .setDescription(codeBlock(message || '(メッセージなし)', EMBED_DESCRIPTION_LIMIT))
        .addFields(
            { name: '発生元', value: SOURCE_LABEL[context.kind] },
            ...contextFields(context),
            ...locationField(context),
            { name: '発生時刻', value: `<t:${unix}:F>` },
        )
        .setTimestamp(now)
    const file = new AttachmentBuilder(Buffer.from(trace, 'utf8'), { name: 'traceback.txt' })
    return { embeds: [embed], files: [file] }
}

type Dependencies = {
    client: Pick<Client, 'channels'>
    channelId: string
    logger: Logger
    now?: () => Date
}

export const createErrorReporter = ({
    client,
    channelId,
    logger,
    now = () => new Date(),
}: Dependencies): ErrorReporter => ({
    report: async (error, context) => {
        logger.error({ err: error, context }, '想定外のエラーが発生しました')
        try {
            const channel = await client.channels.fetch(channelId)
            if (channel === null || !channel.isSendable()) {
                throw new Error(`エラーログチャンネル ${channelId} に送信できません`)
            }
            await channel.send(buildErrorReport(error, context, now()))
        } catch (sendError) {
            logger.error({ err: sendError, original: error, context }, 'エラーログチャンネルへの通知に失敗しました')
        }
    },
})
