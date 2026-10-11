import type { Client } from 'discord.js'
import type { ErrorReporter } from './error-reporter.ts'

type EventSource = { on: (event: string, listener: (...args: unknown[]) => void) => unknown }

type Dependencies = {
    client: Pick<Client, 'on'>
    process: EventSource
    reporter: ErrorReporter
    /** uncaughtException の後はプロセスの状態を保証できないため、通知してから停止する */
    shutdown: (reason: string, exitCode: number) => Promise<void>
}

/**
 * コマンドとリスナーの外で起きたエラーをエラーログチャンネルに流す。
 */
export const installProcessHandlers = ({ client, process, reporter, shutdown }: Dependencies) => {
    client.on('error', (error) => {
        void reporter.report(error, { kind: 'process', source: 'client' })
    })
    process.on('unhandledRejection', (reason) => {
        void reporter.report(reason, { kind: 'process', source: 'unhandledRejection' })
    })
    process.on('uncaughtException', (error) => {
        void reporter
            .report(error, { kind: 'process', source: 'uncaughtException' })
            .finally(() => shutdown('uncaughtException', 1))
    })
}
