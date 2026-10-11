import { z } from 'zod'

const snowflake = z.string().regex(/^\d{17,20}$/, 'Discord の ID（17〜20 桁の数字）')
const blankToUndefined = (value: unknown) => (value === '' ? undefined : value)

const configSchema = z.object({
    DISCORD_TOKEN: z.string().min(1, '空でない文字列'),
    DISCORD_APPLICATION_ID: snowflake,
    ERROR_LOG_CHANNEL_ID: snowflake,
    DEV_GUILD_ID: z.preprocess(blankToUndefined, snowflake.optional()),
    DATABASE_PATH: z.string().min(1, '空でない文字列'),
    LOG_LEVEL: z.preprocess(
        blankToUndefined,
        z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    ),
})

export type Config = {
    discordToken: string
    applicationId: string
    errorLogChannelId: string
    devGuildId: string | undefined
    databasePath: string
    logLevel: z.infer<typeof configSchema>['LOG_LEVEL']
}

export type ConfigIssue = {
    key: string
    expected: string
}

export type ConfigResult = { ok: true; config: Config } | { ok: false; issues: ConfigIssue[] }

/**
 * 環境変数を検証する。失敗時の issue には設定名と期待する形式だけを含め、値は含めない。
 */
export const parseConfig = (env: Record<string, string | undefined>): ConfigResult => {
    const result = configSchema.safeParse(env)
    if (!result.success) {
        const issues = result.error.issues.map((issue) => ({
            key: issue.path.join('.'),
            expected: issue.code === 'invalid_type' ? '必須' : issue.message,
        }))
        return { ok: false, issues }
    }
    const data = result.data
    return {
        ok: true,
        config: {
            discordToken: data.DISCORD_TOKEN,
            applicationId: data.DISCORD_APPLICATION_ID,
            errorLogChannelId: data.ERROR_LOG_CHANNEL_ID,
            devGuildId: data.DEV_GUILD_ID,
            databasePath: data.DATABASE_PATH,
            logLevel: data.LOG_LEVEL,
        },
    }
}
