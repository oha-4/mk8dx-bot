import { MessageFlags } from 'discord.js'
import { describe, expect, test } from 'vitest'
import { fakeMessage, fakeSlashInteraction } from '../../../testing/discord.ts'
import { pingPrefix, pingSlash } from './ping.ts'

describe('ping', () => {
    test('/ping は実行者にだけ見える形で遅延を返す', async () => {
        const interaction = fakeSlashInteraction('ping')
        await pingSlash.run(interaction)
        expect(interaction.reply).toHaveBeenCalledWith({ content: 'Pong! 42ms', flags: MessageFlags.Ephemeral })
    })

    test('%ping は元のメッセージへの返信で遅延を返す', async () => {
        const message = fakeMessage('%ping')
        await pingPrefix.run(message, { name: 'ping', tokens: [] })
        expect(message.reply).toHaveBeenCalledWith({ content: 'Pong! 42ms' })
    })

    test('エイリアス p を持つ', () => {
        expect(pingPrefix.aliases).toEqual(['p'])
    })
})
