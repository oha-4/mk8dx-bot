import { Routes } from 'discord.js'
import { describe, expect, test, vi } from 'vitest'
import { registerSlashCommands } from './command-registration.ts'

const APP = '100000000000000010'
const DEV = '100000000000000011'
const ADMIN = '100000000000000012'
const commands = {
    global: [{ name: 'search', description: 'x' }],
    admin: [{ name: 'ping', description: 'x' }],
}

describe('registerSlashCommands', () => {
    test('開発用ギルドが指定されていれば、すべてをそのギルドに一括登録し、グローバルには触れない', async () => {
        const put = vi.fn(async () => [])
        const result = await registerSlashCommands(
            { put },
            { applicationId: APP, devGuildId: DEV, adminGuildId: ADMIN },
            commands,
        )
        expect(put.mock.calls).toEqual([
            [Routes.applicationGuildCommands(APP, DEV), { body: [...commands.global, ...commands.admin] }],
        ])
        expect(result).toEqual({ registered: [{ target: 'dev-guild', count: 2 }], unregisteredAdminCount: 0 })
    })

    test('一般向けはグローバルに、管理用は管理用ギルドに一括登録する', async () => {
        const put = vi.fn(async () => [])
        const result = await registerSlashCommands(
            { put },
            { applicationId: APP, devGuildId: undefined, adminGuildId: ADMIN },
            commands,
        )
        expect(put.mock.calls).toEqual([
            [Routes.applicationCommands(APP), { body: commands.global }],
            [Routes.applicationGuildCommands(APP, ADMIN), { body: commands.admin }],
        ])
        expect(result).toEqual({
            registered: [
                { target: 'global', count: 1 },
                { target: 'admin-guild', count: 1 },
            ],
            unregisteredAdminCount: 0,
        })
    })

    test('管理用ギルドが未設定なら、管理用コマンドは登録せず数を返す', async () => {
        const put = vi.fn(async () => [])
        const result = await registerSlashCommands(
            { put },
            { applicationId: APP, devGuildId: undefined, adminGuildId: undefined },
            commands,
        )
        expect(put.mock.calls).toEqual([[Routes.applicationCommands(APP), { body: commands.global }]])
        expect(result).toEqual({ registered: [{ target: 'global', count: 1 }], unregisteredAdminCount: 1 })
    })
})
