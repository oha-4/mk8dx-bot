import type { Message } from 'discord.js'
import { describe, expect, test, vi } from 'vitest'
import { UserFacingError } from './errors.ts'
import { definePrefixCommand } from './prefix-command.ts'

const message = {} as Message<true>
const ID = '123456789012345678'

describe('definePrefixCommand', () => {
    test('位置引数を宣言順に割り当てて変換する', async () => {
        const execute = vi.fn(async () => {})
        const command = definePrefixCommand({
            name: 'can',
            aliases: ['c', 'C'],
            args: [
                { name: 'hour', type: 'integer', required: true },
                { name: 'who', type: 'user' },
                { name: 'note', type: 'string', rest: true },
            ],
            execute,
        })
        const invocation = { name: 'c', tokens: ['21', `<@${ID}>`, 'よろしく', 'お願いします'] }
        await command.run(message, invocation)
        expect(execute).toHaveBeenCalledWith(message, { hour: 21, who: ID, note: 'よろしく お願いします' }, invocation)
        expect(command.aliases).toEqual(['c', 'C'])
    })

    test('任意の引数が省略されたら undefined、余ったトークンは無視する', async () => {
        const execute = vi.fn(async () => {})
        const command = definePrefixCommand({ name: 'x', args: [{ name: 'a', type: 'string' }], execute })
        await command.run(message, { name: 'x', tokens: [] })
        expect(execute).toHaveBeenLastCalledWith(message, { a: undefined }, { name: 'x', tokens: [] })
        await command.run(message, { name: 'x', tokens: ['1', '2'] })
        expect(execute).toHaveBeenLastCalledWith(message, { a: '1' }, { name: 'x', tokens: ['1', '2'] })
    })

    test('必須の引数がないと使い方を添えた UserFacingError になる', async () => {
        const command = definePrefixCommand({
            name: 'can',
            args: [
                { name: 'hour', type: 'integer', required: true },
                { name: 'note', type: 'string', rest: true },
            ],
            execute: async () => {},
        })
        expect(command.usage).toBe('%can <hour> [note...]')
        await expect(command.run(message, { name: 'can', tokens: [] })).rejects.toThrow(
            new UserFacingError('引数 hour を指定してください\n使い方: %can <hour> [note...]'),
        )
    })

    test('変換に失敗すると UserFacingError になる', async () => {
        const command = definePrefixCommand({
            name: 'can',
            args: [{ name: 'hour', type: 'integer', required: true }],
            execute: async () => {},
        })
        const run = command.run(message, { name: 'can', tokens: ['abc'] })
        await expect(run).rejects.toBeInstanceOf(UserFacingError)
        await expect(run).rejects.toThrow('引数 hour は整数で指定してください')
    })

    test('parse で独自の書式に置き換えられる', async () => {
        const execute = vi.fn(async () => {})
        const command = definePrefixCommand({
            name: 'vs',
            usage: '%vs <tag...>',
            parse: (tokens) => ({ tags: tokens.map((token) => token.toUpperCase()) }),
            execute,
        })
        await command.run(message, { name: 'vs', tokens: ['a', 'b'] })
        expect(execute).toHaveBeenCalledWith(message, { tags: ['A', 'B'] }, { name: 'vs', tokens: ['a', 'b'] })
        expect(command.usage).toBe('%vs <tag...>')
    })

    test('不正な宣言は定義時にエラーにする', () => {
        expect(() =>
            definePrefixCommand({
                name: 'x',
                args: [
                    { name: 'a', type: 'string', rest: true },
                    { name: 'b', type: 'string' },
                ],
                execute: async () => {},
            }),
        ).toThrow('rest')
        expect(() =>
            definePrefixCommand({
                name: 'x',
                args: [
                    { name: 'a', type: 'string' },
                    { name: 'b', type: 'string', required: true },
                ],
                execute: async () => {},
            }),
        ).toThrow('必須')
    })
})
