import { describe, expect, test } from 'vitest'
import { defineMessageListener } from './listener.ts'
import { definePrefixCommand } from './prefix-command.ts'
import { createRegistry } from './registry.ts'
import { defineSlashCommand } from './slash-command.ts'

const slash = (name: string) => defineSlashCommand({ name, description: name, options: {}, execute: async () => {} })
const prefix = (name: string, aliases: string[] = []) =>
    definePrefixCommand({ name, aliases, args: [], execute: async () => {} })
const listener = (name: string) => defineMessageListener({ name, handle: async () => {} })

describe('createRegistry', () => {
    test('features からコマンドとリスナーを集める', () => {
        const ping = prefix('ping', ['p'])
        const registry = createRegistry([
            { name: 'a', slashCommands: [slash('ping')], prefixCommands: [ping], listeners: [listener('l1')] },
            { name: 'b', listeners: [listener('l2')] },
        ])
        expect(registry.findSlashCommand('ping')?.name).toBe('ping')
        expect(registry.findSlashCommand('unknown')).toBeUndefined()
        expect(registry.findPrefixCommand('ping')).toBe(ping)
        expect(registry.findPrefixCommand('p')).toBe(ping)
        expect(registry.listeners.map((l) => l.name)).toEqual(['l1', 'l2'])
        expect(registry.slashCommandsJSON().map((json) => json.name)).toEqual(['ping'])
    })

    test('scope ごとにスラッシュコマンドの JSON を返す', () => {
        const admin = defineSlashCommand({
            name: 'admin',
            description: 'x',
            scope: 'admin',
            options: {},
            execute: async () => {},
        })
        const registry = createRegistry([{ name: 'a', slashCommands: [slash('ping'), admin] }])
        expect(registry.slashCommandsJSON('global').map((json) => json.name)).toEqual(['ping'])
        expect(registry.slashCommandsJSON('admin').map((json) => json.name)).toEqual(['admin'])
        expect(registry.slashCommandsJSON().map((json) => json.name)).toEqual(['ping', 'admin'])
    })

    test('プレフィックスの名前とエイリアスは大文字と小文字を区別する', () => {
        const can = prefix('can', ['c', 'C'])
        const registry = createRegistry([{ name: 'a', prefixCommands: [can] }])
        expect(registry.findPrefixCommand('C')).toBe(can)
        expect(registry.findPrefixCommand('CAN')).toBeUndefined()
    })

    test('重複はエラーにする', () => {
        expect(() => createRegistry([{ name: 'a', slashCommands: [slash('x'), slash('x')] }])).toThrow('x')
        expect(() =>
            createRegistry([
                { name: 'a', prefixCommands: [prefix('ping', ['p'])] },
                { name: 'b', prefixCommands: [prefix('pong', ['p'])] },
            ]),
        ).toThrow('p（ping と pong）')
        expect(() => createRegistry([{ name: 'a', prefixCommands: [prefix('x'), prefix('y', ['x'])] }])).toThrow('x')
    })
})
