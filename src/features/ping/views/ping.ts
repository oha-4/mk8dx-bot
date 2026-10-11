import type { BaseMessageOptions } from 'discord.js'
import type { LatencyResult } from '../usecases/measure-latency.ts'

export const renderPing = (result: LatencyResult): BaseMessageOptions => ({
    content: result.measured ? `Pong! ${result.milliseconds}ms` : 'Pong!（遅延はまだ計測されていません）',
})

// CI の失敗確認用（このブランチは確認後に削除する）
export const shouldFail: number = 'not a number'
