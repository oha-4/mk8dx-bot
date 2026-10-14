import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import type { DB } from './client.ts'

/**
 * 未適用のマイグレーションを順番に適用する。未適用分はまとめて 1 つのトランザクションで実行されるため、
 * 途中で失敗すると適用前の状態に戻る。
 */
export const runMigrations = (db: DB, migrationsFolder: string): void => {
    migrate(db, { migrationsFolder })
}
