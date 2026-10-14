import type { Message } from 'discord.js'

export type MessageListener = {
    readonly name: string
    /** bot・webhook の投稿と、プレフィックスコマンドとして処理したメッセージは渡されない */
    handle: (message: Message<true>) => Promise<unknown>
}

export const defineMessageListener = (listener: MessageListener): MessageListener => listener
