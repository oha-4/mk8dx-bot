import { defineConfig } from 'drizzle-kit'

// マイグレーションの SQL を生成する。適用は起動時に src/db/migrate.ts が行う
export default defineConfig({
    dialect: 'sqlite',
    schema: './src/db/schema.ts',
    out: './drizzle',
})
