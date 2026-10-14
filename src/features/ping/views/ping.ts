import type { BaseMessageOptions } from 'discord.js'
import type { LatencyResult } from '../usecases/measure-latency.ts'

export const renderPing = (result: LatencyResult): BaseMessageOptions => ({
    content: result.measured ? `Pong! ${result.milliseconds}ms` : 'Pong!（遅延はまだ計測されていません）',
})
