import { MessageFlags } from 'discord.js'
import { describe, expect, test, vi } from 'vitest'
import { CHANNEL_ID, GUILD_ID, fakeMessage, fakeReporter, fakeSlashInteraction } from '../testing/discord.ts'
import { GENERIC_ERROR_MESSAGE, UNKNOWN_COMMAND_MESSAGE, createDispatcher } from './dispatcher.ts'
import { UserFacingError } from './errors.ts'
import { defineMessageListener } from './listener.ts'
import { createLogger } from './logger.ts'
import { definePrefixCommand } from './prefix-command.ts'
import { createRegistry } from './registry.ts'
import { defineSlashCommand } from './slash-command.ts'

type Behavior = (target: { deferReply?: () => Promise<unknown> }) => Promise<unknown>

const setup = (behavior: Behavior = async () => {}) => {
    const slashExecute = vi.fn(async (interaction: { deferReply: () => Promise<unknown> }) => behavior(interaction))
    const prefixExecute = vi.fn(async () => behavior({}))
    const listenerHandle = vi.fn(async () => {})
    const registry = createRegistry([
        {
            name: 'test',
            slashCommands: [defineSlashCommand({ name: 'ping', description: 'x', options: {}, execute: slashExecute })],
            prefixCommands: [definePrefixCommand({ name: 'ping', aliases: ['p'], args: [], execute: prefixExecute })],
            listeners: [defineMessageListener({ name: 'spy', handle: listenerHandle })],
        },
    ])
    const reporter = fakeReporter()
    const dispatcher = createDispatcher({ registry, reporter, logger: createLogger('silent') })
    return { dispatcher, reporter, slashExecute, prefixExecute, listenerHandle }
}

const ephemeral = (content: string) => ({ content, flags: MessageFlags.Ephemeral })

describe('スラッシュコマンド', () => {
    test('登録されたコマンドを実行する', async () => {
        const { dispatcher, slashExecute, reporter } = setup()
        const interaction = fakeSlashInteraction('ping')
        await dispatcher.handleInteraction(interaction)
        expect(slashExecute).toHaveBeenCalledOnce()
        expect(reporter.report).not.toHaveBeenCalled()
    })

    test('未知のコマンドには利用できない旨を返す', async () => {
        const { dispatcher } = setup()
        const interaction = fakeSlashInteraction('removed')
        await dispatcher.handleInteraction(interaction)
        expect(interaction.reply).toHaveBeenCalledWith(ephemeral(UNKNOWN_COMMAND_MESSAGE))
    })

    test('UserFacingError はそのメッセージを返し、通知しない', async () => {
        const { dispatcher, reporter } = setup(async () => {
            throw new UserFacingError('プレイヤーが見つかりません')
        })
        const interaction = fakeSlashInteraction('ping')
        await dispatcher.handleInteraction(interaction)
        expect(interaction.reply).toHaveBeenCalledWith(ephemeral('プレイヤーが見つかりません'))
        expect(reporter.report).not.toHaveBeenCalled()
    })

    test('未応答で想定外の例外が起きたら汎用メッセージを返し、通知する', async () => {
        const error = new Error('boom')
        const { dispatcher, reporter } = setup(async () => {
            throw error
        })
        const interaction = fakeSlashInteraction('ping', { data: [{ name: 'q', value: 'x' }] })
        await dispatcher.handleInteraction(interaction)
        expect(interaction.reply).toHaveBeenCalledWith(ephemeral(GENERIC_ERROR_MESSAGE))
        expect(interaction.reply).not.toHaveBeenCalledWith(expect.objectContaining({ content: 'boom' }))
        expect(reporter.report).toHaveBeenCalledWith(error, {
            kind: 'slash',
            commandName: 'ping',
            options: [{ name: 'q', value: 'x' }],
            guildId: GUILD_ID,
            channelId: CHANNEL_ID,
        })
    })

    test('defer の後の例外は editReply で応答を完了する', async () => {
        const { dispatcher } = setup(async (interaction) => {
            await interaction.deferReply?.()
            throw new Error('boom')
        })
        const interaction = fakeSlashInteraction('ping')
        await dispatcher.handleInteraction(interaction)
        expect(interaction.editReply).toHaveBeenCalledWith({ content: GENERIC_ERROR_MESSAGE })
        expect(interaction.reply).not.toHaveBeenCalled()
    })

    test('応答済みの後の例外は followUp で返す', async () => {
        const { dispatcher } = setup(async () => {
            await interaction.reply({ content: 'ok' })
            throw new Error('boom')
        })
        const interaction = fakeSlashInteraction('ping')
        await dispatcher.handleInteraction(interaction)
        expect(interaction.followUp).toHaveBeenCalledWith(ephemeral(GENERIC_ERROR_MESSAGE))
    })
})

describe('プレフィックスコマンドとリスナー', () => {
    test('エイリアスでコマンドを実行し、リスナーには渡さない', async () => {
        const { dispatcher, prefixExecute, listenerHandle } = setup()
        const message = fakeMessage('％p a  b')
        await dispatcher.handleMessage(message)
        expect(prefixExecute).toHaveBeenCalledWith(message, {}, { name: 'p', tokens: ['a', 'b'] })
        expect(listenerHandle).not.toHaveBeenCalled()
    })

    test('一致しないプレフィックスには応答せず、リスナーに渡す', async () => {
        const { dispatcher, prefixExecute, listenerHandle } = setup()
        const message = fakeMessage('%unknown')
        await dispatcher.handleMessage(message)
        expect(prefixExecute).not.toHaveBeenCalled()
        expect(message.reply).not.toHaveBeenCalled()
        expect(listenerHandle).toHaveBeenCalledWith(message)
    })

    test('通常のメッセージはリスナーに渡す', async () => {
        const { dispatcher, listenerHandle } = setup()
        const message = fakeMessage('123456')
        await dispatcher.handleMessage(message)
        expect(listenerHandle).toHaveBeenCalledWith(message)
    })

    test('bot・webhook・ギルド外の投稿は無視する', async () => {
        const { dispatcher, prefixExecute, listenerHandle } = setup()
        await dispatcher.handleMessage(fakeMessage('%ping', { bot: true }))
        await dispatcher.handleMessage(fakeMessage('%ping', {}, { webhookId: '100000000000000003' }))
        await dispatcher.handleMessage(fakeMessage('%ping', {}, { inGuild: false }))
        expect(prefixExecute).not.toHaveBeenCalled()
        expect(listenerHandle).not.toHaveBeenCalled()
    })

    test('UserFacingError は返信し、通知しない', async () => {
        const { dispatcher, reporter } = setup(async () => {
            throw new UserFacingError('プレイヤーが見つかりません')
        })
        const message = fakeMessage('%ping')
        await dispatcher.handleMessage(message)
        expect(message.reply).toHaveBeenCalledWith('プレイヤーが見つかりません')
        expect(reporter.report).not.toHaveBeenCalled()
    })

    test('想定外の例外は汎用メッセージで返信し、本文つきで通知する', async () => {
        const error = new Error('boom')
        const { dispatcher, reporter } = setup(async () => {
            throw error
        })
        const message = fakeMessage('%ping')
        await dispatcher.handleMessage(message)
        expect(message.reply).toHaveBeenCalledWith(GENERIC_ERROR_MESSAGE)
        expect(reporter.report).toHaveBeenCalledWith(error, {
            kind: 'prefix',
            content: '%ping',
            guildId: GUILD_ID,
            channelId: CHANNEL_ID,
        })
    })

    test('リスナーの例外は返信せず、想定外のものだけ通知する', async () => {
        const { dispatcher, reporter, listenerHandle } = setup()
        const error = new Error('boom')
        listenerHandle.mockRejectedValueOnce(error)
        const message = fakeMessage('123456')
        await dispatcher.handleMessage(message)
        expect(message.reply).not.toHaveBeenCalled()
        expect(reporter.report).toHaveBeenCalledWith(error, {
            kind: 'listener',
            listenerName: 'spy',
            content: '123456',
            guildId: GUILD_ID,
            channelId: CHANNEL_ID,
        })

        listenerHandle.mockRejectedValueOnce(new UserFacingError('x'))
        await dispatcher.handleMessage(fakeMessage('123456'))
        expect(reporter.report).toHaveBeenCalledTimes(1)
    })
})

describe('停止', () => {
    test('close の後は新しい入力を受け付けず、drain で実行中の処理を待つ', async () => {
        const gate = Promise.withResolvers<void>()
        const { dispatcher, prefixExecute } = setup(() => gate.promise)
        const running = dispatcher.handleMessage(fakeMessage('%ping'))
        dispatcher.close()
        await dispatcher.handleMessage(fakeMessage('%ping'))
        expect(prefixExecute).toHaveBeenCalledTimes(1)

        let drained = false
        const drain = dispatcher.drain().then(() => {
            drained = true
        })
        await Promise.resolve()
        expect(drained).toBe(false)
        gate.resolve()
        await Promise.all([running, drain])
        expect(drained).toBe(true)
    })
})
