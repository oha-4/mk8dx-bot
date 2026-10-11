import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, test } from 'vitest'
import { openDatabase, type DatabaseHandle } from './client.ts'
import { runMigrations } from './migrate.ts'

const fixture = (name: string) => fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url))
const handles: DatabaseHandle[] = []
const dirs: string[] = []

const open = (path?: string) => {
    const dbPath = path ?? join(mkdtempSync(join(tmpdir(), 'mk8dx-migrate-')), 'bot.db')
    if (path === undefined) dirs.push(join(dbPath, '..'))
    const handle = openDatabase(dbPath)
    handles.push(handle)
    return { handle, path: dbPath }
}

const tables = (handle: DatabaseHandle) =>
    handle.sqlite
        .prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name")
        .pluck()
        .all()

const appliedCount = (handle: DatabaseHandle) =>
    handle.sqlite.prepare('select count(*) from __drizzle_migrations').pluck().get()

afterEach(() => {
    for (const handle of handles.splice(0)) handle.close()
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('runMigrations', () => {
    test('空の DB にすべてのマイグレーションを適用する', () => {
        const { handle } = open()
        runMigrations(handle.db, fixture('v1'))
        expect(tables(handle)).toEqual(['__drizzle_migrations', 'notes'])
        expect(appliedCount(handle)).toBe(1)
    })

    test('再起動しても再適用せず、既存データを残す', () => {
        const first = open()
        runMigrations(first.handle.db, fixture('v1'))
        first.handle.sqlite.prepare("insert into notes (id, body) values (1, 'keep')").run()
        first.handle.close()

        const second = open(first.path)
        runMigrations(second.handle.db, fixture('v1'))
        expect(appliedCount(second.handle)).toBe(1)
        expect(second.handle.sqlite.prepare('select body from notes').pluck().all()).toEqual(['keep'])
    })

    test('失敗したら、そのマイグレーションの適用前の状態に戻る', () => {
        const { handle } = open()
        runMigrations(handle.db, fixture('v1'))
        expect(() => runMigrations(handle.db, fixture('v2-broken'))).toThrow('missing_table')
        expect(tables(handle)).toEqual(['__drizzle_migrations', 'notes'])
        expect(appliedCount(handle)).toBe(1)
    })

    test('リポジトリのマイグレーションを空の DB に適用できる', () => {
        const { handle } = open()
        runMigrations(handle.db, fileURLToPath(new URL('../../drizzle', import.meta.url)))
        expect(tables(handle)).toContain('__drizzle_migrations')
    })
})
