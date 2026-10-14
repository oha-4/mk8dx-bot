import { MessageFlags, type ChatInputCommandInteraction, type Interaction, type Message } from 'discord.js'
import type { ErrorReporter } from './error-reporter.ts'
import { UserFacingError } from './errors.ts'
import type { Logger } from './logger.ts'
import { parsePrefixInvocation } from './prefix.ts'
import type { Registry } from './registry.ts'

export const GENERIC_ERROR_MESSAGE = 'コマンドの実行中にエラーが発生しました。時間をおいてもう一度お試しください。'
export const UNKNOWN_COMMAND_MESSAGE = 'このコマンドは現在利用できません。'

export type Dispatcher = {
    handleInteraction: (interaction: Interaction) => Promise<void>
    handleMessage: (message: Message) => Promise<void>
    /** 新しいインタラクションとメッセージの受け付けを止める */
    close: () => void
    /** 実行中の処理がすべて終わるまで待つ */
    drain: () => Promise<void>
}

type Dependencies = {
    registry: Registry
    reporter: ErrorReporter
    logger: Logger
}

/** 誰のどのメッセージへの応答かがわかるよう返信にし、通知は鳴らさない。元のメッセージが消えていても送る */
const replyQuietly = (message: Message<true>, content: string) =>
    message.reply({ content, allowedMentions: { repliedUser: false }, failIfNotExists: false })

/** スラッシュコマンドの応答状態に合わせて、実行者にだけ見えるメッセージを返す */
const respondEphemeral = async (interaction: ChatInputCommandInteraction, content: string) => {
    if (interaction.deferred && !interaction.replied) {
        await interaction.editReply({ content })
    } else if (interaction.replied) {
        await interaction.followUp({ content, flags: MessageFlags.Ephemeral })
    } else {
        await interaction.reply({ content, flags: MessageFlags.Ephemeral })
    }
}

export const createDispatcher = ({ registry, reporter, logger }: Dependencies): Dispatcher => {
    let accepting = true
    const inFlight = new Set<Promise<void>>()

    const track = (task: Promise<void>) => {
        inFlight.add(task)
        void task.finally(() => inFlight.delete(task))
        return task
    }

    // 利用者への返信自体の失敗は、元の処理を止めずにログだけ残す
    const safely = async (action: () => Promise<unknown>, what: string) => {
        try {
            await action()
        } catch (error) {
            logger.error({ err: error }, `${what}に失敗しました`)
        }
    }

    const runSlash = async (interaction: ChatInputCommandInteraction) => {
        const command = registry.findSlashCommand(interaction.commandName)
        if (command === undefined) {
            await safely(() => respondEphemeral(interaction, UNKNOWN_COMMAND_MESSAGE), '未知のコマンドへの応答')
            return
        }
        try {
            await command.run(interaction)
        } catch (error) {
            if (error instanceof UserFacingError) {
                await safely(() => respondEphemeral(interaction, error.message), 'エラーの応答')
                return
            }
            await safely(() => respondEphemeral(interaction, GENERIC_ERROR_MESSAGE), 'エラーの応答')
            await reporter.report(error, {
                kind: 'slash',
                commandName: interaction.commandName,
                options: interaction.options.data.map(({ name, value }) => ({ name, value })),
                guildId: interaction.guildId,
                channelId: interaction.channelId,
            })
        }
    }

    const runMessage = async (message: Message<true>) => {
        const invocation = parsePrefixInvocation(message.content)
        const command = invocation === undefined ? undefined : registry.findPrefixCommand(invocation.name)
        if (command !== undefined && invocation !== undefined) {
            try {
                await command.run(message, invocation)
            } catch (error) {
                if (error instanceof UserFacingError) {
                    await safely(() => replyQuietly(message, error.message), 'エラーの応答')
                    return
                }
                await safely(() => replyQuietly(message, GENERIC_ERROR_MESSAGE), 'エラーの応答')
                await reporter.report(error, {
                    kind: 'prefix',
                    content: message.content,
                    guildId: message.guildId,
                    channelId: message.channelId,
                })
            }
            return
        }

        // コマンドとして処理しなかったメッセージだけをリスナーに渡す
        await Promise.all(
            registry.listeners.map(async (listener) => {
                try {
                    await listener.handle(message)
                } catch (error) {
                    if (error instanceof UserFacingError) {
                        logger.debug({ listener: listener.name, err: error }, 'リスナーが想定内のエラーで終了しました')
                        return
                    }
                    await reporter.report(error, {
                        kind: 'listener',
                        listenerName: listener.name,
                        content: message.content,
                        guildId: message.guildId,
                        channelId: message.channelId,
                    })
                }
            }),
        )
    }

    return {
        handleInteraction: async (interaction) => {
            if (!accepting || !interaction.isChatInputCommand()) return
            await track(runSlash(interaction))
        },
        handleMessage: async (message) => {
            if (!accepting || message.author.bot || message.webhookId !== null || !message.inGuild()) return
            await track(runMessage(message))
        },
        close: () => {
            accepting = false
        },
        drain: async () => {
            await Promise.allSettled(inFlight)
        },
    }
}
