import { EventEmitter } from 'node:events'
import type { Client } from 'discord.js'
import { describe, expect, test, vi } from 'vitest'
import { fakeReporter } from '../testing/discord.ts'
import { installProcessHandlers } from './process-handlers.ts'

const setup = () => {
    const client = new EventEmitter()
    const process = new EventEmitter()
    const reporter = fakeReporter()
    const shutdown = vi.fn(async () => {})
    installProcessHandlers({ client: client as unknown as Client, process, reporter, shutdown })
    return { client, process, reporter, shutdown }
}

describe('installProcessHandlers', () => {
    test('Discord クライアントのエラーを通知する', () => {
        const { client, reporter } = setup()
        const error = new Error('gateway')
        client.emit('error', error)
        expect(reporter.report).toHaveBeenCalledWith(error, { kind: 'process', source: 'client' })
    })

    test('処理されなかった reject を通知する', () => {
        const { process, reporter, shutdown } = setup()
        const reason = new Error('rejected')
        process.emit('unhandledRejection', reason)
        expect(reporter.report).toHaveBeenCalledWith(reason, { kind: 'process', source: 'unhandledRejection' })
        expect(shutdown).not.toHaveBeenCalled()
    })

    test('uncaughtException は通知してから停止する', async () => {
        const { process, reporter, shutdown } = setup()
        const error = new Error('fatal')
        process.emit('uncaughtException', error)
        expect(reporter.report).toHaveBeenCalledWith(error, { kind: 'process', source: 'uncaughtException' })
        await vi.waitFor(() => expect(shutdown).toHaveBeenCalledWith('uncaughtException', 1))
    })
})
