import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema.ts'

// SQLite ドライバへの依存はこのファイルと migrate.ts に閉じ込める（design D6）

export type DB = BetterSQLite3Database<typeof schema>

export type DatabaseHandle = {
    db: DB
    /** 下位の SQLite 接続。PRAGMA の確認などに使う */
    sqlite: Database.Database
    close: () => void
}

export const openDatabase = (path: string): DatabaseHandle => {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    const sqlite = new Database(path)
    // Litestream は WAL を前提にする。手動の checkpoint はしない
    sqlite.pragma('journal_mode = WAL')
    sqlite.pragma('busy_timeout = 5000')
    sqlite.pragma('synchronous = NORMAL')
    sqlite.pragma('foreign_keys = ON')
    const db = drizzle(sqlite, { schema })
    return {
        db,
        sqlite,
        close: () => {
            if (sqlite.open) sqlite.close()
        },
    }
}
