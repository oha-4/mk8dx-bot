import type { Role, User } from 'discord.js'
import { expectTypeOf, test } from 'vitest'
import { defineSlashCommand } from './slash-command.ts'

test('execute の options の型をオプション定義から導出する', () => {
    defineSlashCommand({
        name: 'typed',
        description: 'x',
        options: {
            text: { type: 'string', description: 'x', required: true },
            count: { type: 'integer', description: 'x' },
            flag: { type: 'boolean', description: 'x', required: true },
            who: { type: 'user', description: 'x', required: true },
            role: { type: 'role', description: 'x' },
            mode: {
                type: 'string',
                description: 'x',
                required: true,
                choices: [
                    { name: 'a', value: 'a' },
                    { name: 'b', value: 'b' },
                ],
            },
        },
        execute: async (_interaction, options) => {
            expectTypeOf(options.text).toEqualTypeOf<string>()
            expectTypeOf(options.count).toEqualTypeOf<number | undefined>()
            expectTypeOf(options.flag).toEqualTypeOf<boolean>()
            expectTypeOf(options.who).toEqualTypeOf<User>()
            expectTypeOf(options.role).toExtend<Role | object | undefined>()
            expectTypeOf(options.mode).toEqualTypeOf<'a' | 'b'>()
            // @ts-expect-error 宣言していないオプションは参照できない
            void options.missing
        },
    })
})
