import { ApplicationCommandOptionType, type ChatInputCommandInteraction } from 'discord.js'
import { describe, expect, test, vi } from 'vitest'
import { defineSlashCommand } from './slash-command.ts'

describe('defineSlashCommand', () => {
    const command = defineSlashCommand({
        name: 'search',
        description: '検索する',
        options: {
            limit: { type: 'integer', description: '件数' },
            query: { type: 'string', description: '検索語', required: true },
            mode: {
                type: 'string',
                description: 'モード',
                choices: [
                    { name: '速い', value: 'fast' },
                    { name: '正確', value: 'exact' },
                ],
            },
        },
        execute: async () => {},
    })

    test('登録用の JSON を生成し、必須のオプションを先に並べる', () => {
        expect(command.toJSON()).toEqual({
            name: 'search',
            description: '検索する',
            options: [
                { name: 'query', description: '検索語', type: ApplicationCommandOptionType.String, required: true },
                { name: 'limit', description: '件数', type: ApplicationCommandOptionType.Integer, required: false },
                {
                    name: 'mode',
                    description: 'モード',
                    type: ApplicationCommandOptionType.String,
                    required: false,
                    choices: [
                        { name: '速い', value: 'fast' },
                        { name: '正確', value: 'exact' },
                    ],
                },
            ],
        })
    })

    test('interaction からオプションの値を解決して execute に渡す', async () => {
        const execute = vi.fn(async () => {})
        const withExecute = defineSlashCommand({
            name: 'search',
            description: '検索する',
            options: {
                query: { type: 'string', description: '検索語', required: true },
                limit: { type: 'integer', description: '件数' },
            },
            execute,
        })
        const interaction = {
            options: {
                getString: (name: string) => (name === 'query' ? 'mario' : null),
                getInteger: () => null,
            },
        } as unknown as ChatInputCommandInteraction
        await withExecute.run(interaction)
        expect(execute).toHaveBeenCalledWith(interaction, { query: 'mario', limit: undefined })
    })

    test('不正な名前は定義時にエラーにする', () => {
        expect(() =>
            defineSlashCommand({ name: 'Ping', description: 'x', options: {}, execute: async () => {} }),
        ).toThrow('Ping')
    })
})
