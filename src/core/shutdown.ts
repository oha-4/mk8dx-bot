import type { Logger } from './logger.ts'

export const SHUTDOWN_TIMEOUT_MS = 10_000

type Dependencies = {
    /** 新しい入力の受け付けを止め、実行中の処理を待つ */
    stopAccepting: () => Promise<void>
    closeClient: () => Promise<void>
    closeDatabase: () => void
    logger: Logger
    exit: (code: number) => void
    timeoutMs?: number
}

export type Shutdown = (reason: string, exitCode?: number) => Promise<void>

/**
 * 停止処理を作る。2 回目以降の呼び出しは無視する。timeoutMs を過ぎても終わらなければ強制終了する。
 */
export const createShutdown = ({
    stopAccepting,
    closeClient,
    closeDatabase,
    logger,
    exit,
    timeoutMs = SHUTDOWN_TIMEOUT_MS,
}: Dependencies): Shutdown => {
    let started = false
    return async (reason, exitCode = 0) => {
        if (started) return
        started = true
        logger.info({ reason }, '停止します')
        const timer = setTimeout(() => {
            logger.error({ reason, timeoutMs }, '停止処理が時間内に終わらなかったため強制終了します')
            exit(1)
        }, timeoutMs)
        try {
            await stopAccepting()
            await closeClient()
            closeDatabase()
            clearTimeout(timer)
            logger.info('停止しました')
            exit(exitCode)
        } catch (error) {
            clearTimeout(timer)
            logger.error({ err: error }, '停止処理に失敗しました')
            exit(1)
        }
    }
}

type SignalSource = { on: (event: 'SIGTERM' | 'SIGINT', listener: () => void) => unknown }

export const installSignalHandlers = (process: SignalSource, shutdown: Shutdown) => {
    for (const signal of ['SIGTERM', 'SIGINT'] as const) {
        process.on(signal, () => void shutdown(signal, 0))
    }
}
