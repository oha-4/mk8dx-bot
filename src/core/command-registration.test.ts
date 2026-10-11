import { Routes } from 'discord.js'
import { describe, expect, test, vi } from 'vitest'
import { registerSlashCommands } from './command-registration.ts'

const APP = '100000000000000010'
const GUILD = '100000000000000011'
const body = [{ name: 'ping', description: 'x' }]

describe('registerSlashCommands', () => {
    test('開発用ギルドが指定されていればギルドに一括登録する', async () => {
        const put = vi.fn(async () => [])
        const result = await registerSlashCommands({ put }, { applicationId: APP, devGuildId: GUILD }, body)
        expect(put).toHaveBeenCalledWith(Routes.applicationGuildCommands(APP, GUILD), { body })
        expect(result).toEqual({ scope: 'guild', count: 1 })
    })

    test('指定がなければグローバルに一括登録する', async () => {
        const put = vi.fn(async () => [])
        const result = await registerSlashCommands({ put }, { applicationId: APP, devGuildId: undefined }, [])
        expect(put).toHaveBeenCalledWith(Routes.applicationCommands(APP), { body: [] })
        expect(result).toEqual({ scope: 'global', count: 0 })
    })
})
