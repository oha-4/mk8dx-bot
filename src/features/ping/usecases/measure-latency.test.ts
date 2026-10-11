import { describe, expect, test } from 'vitest'
import { measureLatency } from './measure-latency.ts'

describe('measureLatency', () => {
    test('Gateway の遅延をミリ秒で返す', () => {
        expect(measureLatency({ gatewayPing: () => 41.6 })).toEqual({ measured: true, milliseconds: 42 })
    })

    test('未計測なら measured: false', () => {
        expect(measureLatency({ gatewayPing: () => -1 })).toEqual({ measured: false })
    })
})
