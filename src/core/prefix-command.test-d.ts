import { expectTypeOf, test } from 'vitest'
import { definePrefixCommand } from './prefix-command.ts'

test('execute の args の型を引数定義から導出する', () => {
    definePrefixCommand({
        name: 'typed',
        args: [
            { name: 'hour', type: 'integer', required: true },
            { name: 'flag', type: 'boolean' },
            { name: 'who', type: 'user' },
            { name: 'note', type: 'string', rest: true },
        ],
        execute: async (_message, args) => {
            expectTypeOf(args.hour).toEqualTypeOf<number>()
            expectTypeOf(args.flag).toEqualTypeOf<boolean | undefined>()
            expectTypeOf(args.who).toEqualTypeOf<string | undefined>()
            expectTypeOf(args.note).toEqualTypeOf<string | undefined>()
            // @ts-expect-error 宣言していない引数は参照できない
            void args.missing
        },
    })
})

test('parse の戻り値の型が execute に渡る', () => {
    definePrefixCommand({
        name: 'vs',
        parse: (tokens) => ({ tags: tokens, count: tokens.length }),
        execute: async (_message, args) => {
            expectTypeOf(args).toEqualTypeOf<{ tags: string[]; count: number }>()
        },
    })
})
