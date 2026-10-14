import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createLogger } from './logger.ts'
import { createShutdown, installSignalHandlers } from './shutdown.ts'

beforeEach(() => {
    vi.useFakeTimers()
})

afterEach(() => {
    vi.useRealTimers()
})

const setup = (stopAccepting: () => Promise<void> = async () => {}) => {
    const order: string[] = []
    const exit = vi.fn((code: number) => {
        order.push(`exit:${code}`)
    })
    const shutdown = createShutdown({
        stopAccepting: async () => {
            order.push('stopAccepting')
            await stopAccepting()
        },
        closeClient: async () => {
            order.push('closeClient')
        },
        closeDatabase: () => {
            order.push('closeDatabase')
        },
        logger: createLogger('silent'),
        exit,
    })
    return { shutdown, order, exit }
}

describe('createShutdown', () => {
    test('受け付けを止め、client と DB を閉じてから exit 0 する', async () => {
        const { shutdown, order } = setup()
        await shutdown('SIGTERM')
        expect(order).toEqual(['stopAccepting', 'closeClient', 'closeDatabase', 'exit:0'])
    })

    test('2 回目の呼び出しは無視する', async () => {
        const { shutdown, exit } = setup()
        await shutdown('SIGTERM')
        await shutdown('SIGINT')
        expect(exit).toHaveBeenCalledTimes(1)
    })

    test('10 秒以内に終わらなければ強制終了する', async () => {
        const { shutdown, exit } = setup(() => new Promise(() => {}))
        void shutdown('SIGTERM')
        await vi.advanceTimersByTimeAsync(9_999)
        expect(exit).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(1)
        expect(exit).toHaveBeenCalledWith(1)
    })

    test('停止処理が失敗したら exit 1 する', async () => {
        const { shutdown, exit } = setup(async () => {
            throw new Error('boom')
        })
        await shutdown('SIGTERM')
        expect(exit).toHaveBeenCalledWith(1)
    })
})

describe('installSignalHandlers', () => {
    test('SIGTERM と SIGINT で終了コード 0 の停止を始める', () => {
        const process = new EventEmitter()
        const shutdown = vi.fn(async () => {})
        installSignalHandlers(process, shutdown)
        process.emit('SIGTERM')
        process.emit('SIGINT')
        expect(shutdown.mock.calls).toEqual([
            ['SIGTERM', 0],
            ['SIGINT', 0],
        ])
    })
})
