import { Writable } from 'node:stream'
import type { APIEmbed, AttachmentBuilder, BaseMessageOptions, Client, EmbedBuilder } from 'discord.js'
import { describe, expect, test, vi } from 'vitest'
import { buildErrorReport, createErrorReporter } from './error-reporter.ts'
import { createLogger } from './logger.ts'

const NOW = new Date('2026-10-12T00:00:00Z')
const UNIX = NOW.getTime() / 1000
const CHANNEL = '100000000000000009'

const embedOf = (payload: BaseMessageOptions) => ((payload.embeds ?? [])[0] as EmbedBuilder).toJSON() as APIEmbed
const fileOf = (payload: BaseMessageOptions) => (payload.files ?? [])[0] as AttachmentBuilder
const fieldValue = (embed: APIEmbed, name: string) => embed.fields?.find((field) => field.name === name)?.value

const boom = () => {
    const error = new TypeError('cannot read x')
    error.stack = 'TypeError: cannot read x\n    at test (file.ts:1:1)'
    return error
}

describe('buildErrorReport', () => {
    test('スラッシュコマンドではコマンド名とオプションを含める', () => {
        const payload = buildErrorReport(
            boom(),
            {
                kind: 'slash',
                commandName: 'ping',
                options: [{ name: 'q', value: 'x' }],
                guildId: '100000000000000001',
                channelId: '100000000000000002',
            },
            NOW,
        )
        const embed = embedOf(payload)
        expect(embed.title).toBe('TypeError')
        expect(embed.description).toContain('cannot read x')
        expect(fieldValue(embed, '発生元')).toBe('スラッシュコマンド')
        expect(fieldValue(embed, 'コマンド')).toContain('/ping')
        expect(fieldValue(embed, 'オプション')).toContain('{"name":"q","value":"x"}')
        expect(fieldValue(embed, '場所')).toBe(
            'ギルド: 100000000000000001\nチャンネル: <#100000000000000002> (100000000000000002)',
        )
        expect(fieldValue(embed, '発生時刻')).toBe(`<t:${UNIX}:F>`)

        const file = fileOf(payload)
        expect(file.name).toBe('traceback.txt')
        expect((file.attachment as Buffer).toString()).toContain('at test (file.ts:1:1)')
    })

    test('プレフィックスコマンドとリスナーではメッセージ本文を含める', () => {
        const location = { guildId: '100000000000000001', channelId: '100000000000000002' }
        const prefix = embedOf(buildErrorReport(boom(), { kind: 'prefix', content: '%ping a', ...location }, NOW))
        expect(fieldValue(prefix, 'メッセージ')).toContain('%ping a')
        expect(fieldValue(prefix, 'コマンド')).toBeUndefined()

        const listener = embedOf(
            buildErrorReport(boom(), { kind: 'listener', listenerName: 'sokuji', content: '123456', ...location }, NOW),
        )
        expect(fieldValue(listener, 'リスナー')).toContain('sokuji')
        expect(fieldValue(listener, 'メッセージ')).toContain('123456')
    })

    test('Error 以外の値と長い本文も扱う', () => {
        const long = 'x'.repeat(5000)
        const embed = embedOf(
            buildErrorReport('rejected', { kind: 'prefix', content: long, guildId: null, channelId: null }, NOW),
        )
        expect(embed.title).toBe('string')
        expect(fieldValue(embed, 'メッセージ')?.length).toBeLessThanOrEqual(1024)
        expect(fieldValue(embed, '場所')).toBe('ギルド: DM\nチャンネル: -')
    })
})

const captureLogger = () => {
    const lines: Record<string, unknown>[] = []
    const stream = new Writable({
        write(chunk: Buffer, _encoding, callback) {
            lines.push(JSON.parse(chunk.toString()) as Record<string, unknown>)
            callback()
        },
    })
    return { lines, logger: createLogger('info', stream) }
}

describe('createErrorReporter', () => {
    test('エラーログチャンネルに送信する', async () => {
        const send = vi.fn(async () => {})
        const fetch = vi.fn(async () => ({ isSendable: () => true, send }))
        const { logger } = captureLogger()
        const reporter = createErrorReporter({
            client: { channels: { fetch } } as unknown as Client,
            channelId: CHANNEL,
            logger,
            now: () => NOW,
        })
        await reporter.report(boom(), { kind: 'process', source: 'unhandledRejection' })
        expect(fetch).toHaveBeenCalledWith(CHANNEL)
        expect(send).toHaveBeenCalledOnce()
    })

    test('送信に失敗しても throw せず、元のエラーと送信失敗を記録する', async () => {
        const fetch = vi.fn(async () => {
            throw new Error('Missing Access')
        })
        const { lines, logger } = captureLogger()
        const reporter = createErrorReporter({
            client: { channels: { fetch } } as unknown as Client,
            channelId: CHANNEL,
            logger,
        })
        await expect(reporter.report(boom(), { kind: 'process', source: 'client' })).resolves.toBeUndefined()
        expect(lines.map((line) => line['msg'])).toEqual([
            '想定外のエラーが発生しました',
            'エラーログチャンネルへの通知に失敗しました',
        ])
        expect(JSON.stringify(lines[1])).toContain('Missing Access')
        expect(JSON.stringify(lines[1])).toContain('cannot read x')
    })

    test('送信できないチャンネルなら送信失敗として記録する', async () => {
        const fetch = vi.fn(async () => ({ isSendable: () => false }))
        const { lines, logger } = captureLogger()
        const reporter = createErrorReporter({
            client: { channels: { fetch } } as unknown as Client,
            channelId: CHANNEL,
            logger,
        })
        await reporter.report(boom(), { kind: 'process', source: 'client' })
        expect(lines.at(-1)?.['msg']).toBe('エラーログチャンネルへの通知に失敗しました')
    })
})
