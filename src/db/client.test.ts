import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { openDatabase } from './client.ts'

const dirs: string[] = []
const tempPath = () => {
    const dir = mkdtempSync(join(tmpdir(), 'mk8dx-db-'))
    dirs.push(dir)
    return join(dir, 'nested', 'bot.db')
}

afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('openDatabase', () => {
    test('親ディレクトリを作り、PRAGMA を設定して開く', () => {
        const handle = openDatabase(tempPath())
        const pragma = (name: string) => handle.sqlite.pragma(name, { simple: true })
        expect(pragma('journal_mode')).toBe('wal')
        expect(pragma('busy_timeout')).toBe(5000)
        expect(pragma('synchronous')).toBe(1) // NORMAL
        expect(pragma('foreign_keys')).toBe(1)
        handle.close()
        expect(handle.sqlite.open).toBe(false)
        handle.close() // 2 回目は何もしない
    })
})
