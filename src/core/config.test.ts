import { describe, expect, test } from 'vitest'
import { parseConfig } from './config.ts'

const validEnv = {
    DISCORD_TOKEN: 'secret-token-value',
    DISCORD_APPLICATION_ID: '123456789012345678',
    ERROR_LOG_CHANNEL_ID: '223456789012345678',
    DATABASE_PATH: '/data/bot.db',
}

describe('parseConfig', () => {
    test('正しい環境変数を読み込む', () => {
        const result = parseConfig({
            ...validEnv,
            DEV_GUILD_ID: '323456789012345678',
            ADMIN_GUILD_ID: '423456789012345678',
            LOG_LEVEL: 'debug',
        })
        expect(result).toEqual({
            ok: true,
            config: {
                discordToken: 'secret-token-value',
                applicationId: '123456789012345678',
                errorLogChannelId: '223456789012345678',
                devGuildId: '323456789012345678',
                adminGuildId: '423456789012345678',
                databasePath: '/data/bot.db',
                logLevel: 'debug',
            },
        })
    })

    test('任意の設定が空文字のときは未設定として扱う', () => {
        const result = parseConfig({ ...validEnv, DEV_GUILD_ID: '', ADMIN_GUILD_ID: '', LOG_LEVEL: '' })
        expect(result.ok && result.config.devGuildId).toBeUndefined()
        expect(result.ok && result.config.adminGuildId).toBeUndefined()
        expect(result.ok && result.config.logLevel).toBe('info')
    })

    test('必須の設定が欠けていると設定名を返す', () => {
        const { DISCORD_TOKEN: _, ...env } = validEnv
        const result = parseConfig(env)
        expect(result).toEqual({ ok: false, issues: [{ key: 'DISCORD_TOKEN', expected: '必須' }] })
    })

    test('形式が不正だと設定名と期待する形式を返す', () => {
        const result = parseConfig({ ...validEnv, ERROR_LOG_CHANNEL_ID: 'general' })
        expect(result).toEqual({
            ok: false,
            issues: [{ key: 'ERROR_LOG_CHANNEL_ID', expected: 'Discord の ID（17〜20 桁の数字）' }],
        })
    })

    test('失敗時の結果に秘密値を含めない', () => {
        const result = parseConfig({ ...validEnv, DISCORD_APPLICATION_ID: 'x' })
        expect(JSON.stringify(result)).not.toContain('secret-token-value')
    })
})
