import { Writable } from 'node:stream'
import { describe, expect, test } from 'vitest'
import { createLogger } from './logger.ts'

const capture = () => {
    const lines: Record<string, unknown>[] = []
    const stream = new Writable({
        write(chunk: Buffer, _encoding, callback) {
            lines.push(JSON.parse(chunk.toString()) as Record<string, unknown>)
            callback()
        },
    })
    return { lines, stream }
}

describe('createLogger', () => {
    test('設定したレベル未満のログは出力しない', () => {
        const { lines, stream } = capture()
        const logger = createLogger('warn', stream)
        logger.info('hidden')
        logger.warn('shown')
        expect(lines.map((line) => line['msg'])).toEqual(['shown'])
    })

    test('JSON で出力し、トークンは伏せる', () => {
        const { lines, stream } = capture()
        const logger = createLogger('info', stream)
        logger.info({ token: 'secret' }, 'hello')
        expect(lines[0]).toMatchObject({ msg: 'hello', token: '[redacted]', level: 30 })
    })

    test('original に入れた Error も中身を残す', () => {
        const { lines, stream } = capture()
        const logger = createLogger('info', stream)
        logger.error({ err: new Error('send failed'), original: new Error('boom') }, 'x')
        expect(lines[0]).toMatchObject({ err: { message: 'send failed' }, original: { message: 'boom' } })
    })
})
