import { fileURLToPath } from 'node:url'
import { Client, Events, GatewayIntentBits } from 'discord.js'
import { registerSlashCommands } from './core/command-registration.ts'
import { parseConfig } from './core/config.ts'
import { createDispatcher } from './core/dispatcher.ts'
import { createErrorReporter } from './core/error-reporter.ts'
import { createLogger } from './core/logger.ts'
import { installProcessHandlers } from './core/process-handlers.ts'
import { createRegistry } from './core/registry.ts'
import { createShutdown, installSignalHandlers } from './core/shutdown.ts'
import { openDatabase } from './db/client.ts'
import { runMigrations } from './db/migrate.ts'
import { features } from './features/index.ts'

// src/main.ts（開発）と dist/main.js（本番）のどちらからも、1 つ上の drizzle/ を指す
const MIGRATIONS_FOLDER = fileURLToPath(new URL('../drizzle', import.meta.url))

const parsed = parseConfig(process.env)
if (!parsed.ok) {
    createLogger('info').fatal({ issues: parsed.issues }, '設定が不正なため起動できません')
    process.exit(1)
}
const config = parsed.config
const logger = createLogger(config.logLevel)

const database = openDatabase(config.databasePath)
try {
    runMigrations(database.db, MIGRATIONS_FOLDER)
} catch (error) {
    logger.fatal({ err: error }, 'マイグレーションに失敗したため起動できません')
    database.close()
    process.exit(1)
}

const registry = createRegistry(features)
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
})
const reporter = createErrorReporter({ client, channelId: config.errorLogChannelId, logger })
// 開発中は開発用ギルドで管理用コマンドも使えるようにする
const dispatcher = createDispatcher({
    registry,
    adminGuildId: config.devGuildId ?? config.adminGuildId,
    reporter,
    logger,
})
const shutdown = createShutdown({
    stopAccepting: async () => {
        dispatcher.close()
        await dispatcher.drain()
    },
    closeClient: () => client.destroy(),
    closeDatabase: () => database.close(),
    logger,
    exit: (code) => process.exit(code),
})

installProcessHandlers({ client, process, reporter, shutdown })
installSignalHandlers(process, shutdown)

client.once(Events.ClientReady, async (ready) => {
    logger.info({ user: ready.user.tag }, 'Discord に接続しました')
    try {
        const result = await registerSlashCommands(
            ready.rest,
            { applicationId: config.applicationId, devGuildId: config.devGuildId, adminGuildId: config.adminGuildId },
            { global: registry.slashCommandsJSON('global'), admin: registry.slashCommandsJSON('admin') },
        )
        logger.info({ registered: result.registered }, 'スラッシュコマンドを登録しました')
        if (result.unregisteredAdminCount > 0) {
            logger.warn(
                { count: result.unregisteredAdminCount },
                'ADMIN_GUILD_ID が未設定のため、管理用のスラッシュコマンドを登録しませんでした',
            )
        }
    } catch (error) {
        await reporter.report(error, { kind: 'process', source: 'client' })
    }
})
client.on(Events.InteractionCreate, (interaction) => void dispatcher.handleInteraction(interaction))
client.on(Events.MessageCreate, (message) => void dispatcher.handleMessage(message))

try {
    await client.login(config.discordToken)
} catch (error) {
    logger.fatal({ err: error }, 'Discord へのログインに失敗しました')
    await shutdown('login failed', 1)
}
