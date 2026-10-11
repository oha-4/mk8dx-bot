import { defineConfig } from 'drizzle-kit'

// drizzle-kit は SQL の生成（generate）にだけ使い、DB には接続しない。適用は起動時に src/db/migrate.ts が行う
export default defineConfig({
    dialect: 'sqlite',
    schema: './src/db/schema.ts',
    out: './drizzle',
})
