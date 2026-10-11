# Tasks

## 1. プロジェクトの土台

- [x] 1.1 `mise.toml`（node 26、pnpm）と `package.json`（`"type": "module"`、`packageManager`、`engines`）を作り、`mise install && pnpm install` が成功することを確認する
- [x] 1.2 `tsconfig.json`（strict、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、NodeNext）を作り、空の `src/main.ts` で `pnpm typecheck` が通ることを確認する
- [x] 1.3 oxlint・oxfmt を exact バージョンで追加して設定ファイルを置き、`pnpm lint` と `pnpm format:check` が通ることを確認する
- [x] 1.4 Vitest を追加し、サンプルテスト 1 件で `pnpm test` が通ることを確認する（サンプルは 2 章で置き換える）
- [x] 1.5 tsdown を追加して `pnpm build` で `dist/main.js` が出力されること、tsx で `pnpm dev` が起動することを確認する
- [x] 1.6 `.gitignore`（`dist/`、`node_modules/`、`*.db*`、`.env`）を整え、`git status` に生成物が出ないことを確認する

## 2. 設定とロガー

- [x] 2.1 `src/core/config.ts` に zod の環境変数スキーマ（design D3）を実装し、正常系・欠落・形式不正・トークン値がエラー出力に含まれないことを確認するテストを通す
- [x] 2.2 `src/core/logger.ts`（JSON 出力、`LOG_LEVEL`）を実装し、レベルによる出力の抑制をテストで確認する
- [x] 2.3 `.env.example`（ルート、ローカル開発用）を置き、README に記載された環境変数とスキーマが一致していることを確認する

## 3. コマンド定義とディスパッチ

- [x] 3.1 `src/core/prefix.ts` を実装し、`%` / `％` の検出、空白区切り（連続した空白を含む）、型変換の関数（数値・真偽値・user / channel / role のメンションと ID）をテストで確認する
- [x] 3.2 `src/core/slash-command.ts` に `defineSlashCommand`（基本 7 型、`required`、`choices`）を実装し、生成される登録 JSON のテストと、`execute` の `options` の型テスト（`expectTypeOf`）を通す
- [x] 3.3 `src/core/prefix-command.ts` に `definePrefixCommand`（`aliases`、位置引数、`rest`、`parse` による置き換え）を実装し、引数の割り当てと変換、変換失敗時に使い方を添えた `UserFacingError` になること、`execute` の `args` と `parse` の戻り値の型テストを通す
- [x] 3.4 `src/core/listener.ts`（`defineMessageListener`）と `src/core/registry.ts` を実装し、features からのスラッシュ / プレフィックスコマンドとリスナーの収集、名前とエイリアス（大文字と小文字を区別）による検索、名前・エイリアス・スラッシュコマンド名が重複したときのエラーをテストで確認する
- [x] 3.5 `src/core/errors.ts`（`UserFacingError`）と `src/core/dispatcher.ts` を実装し、次をテストで確認する: スラッシュの正常系・未知のコマンド、プレフィックスの正常系・一致しないときは無応答、bot と webhook の投稿の無視、コマンドとして処理したメッセージがリスナーに渡らないこと、通常メッセージがリスナーに渡ること、`UserFacingError` と想定外例外への入口ごとの応答（スラッシュでは未応答 / deferred / replied の各状態で正しい API が呼ばれること）
- [x] 3.6 `src/features/ping/` を、規約の見本として `commands/`・`usecases/`・`views/` の構成で作り（`/ping` と `%ping`、エイリアス `p`）、`src/features/index.ts` に登録する。usecase の単体テスト（discord.js なし）と、両方の入口での応答内容のテストを通す
- [x] 3.7 oxlint に、`src/features/*/usecases/**` から `discord.js` の import を禁止するルールを追加し、違反するファイルを一時的に置いたときに `pnpm lint` が失敗し、外すと通ることを確認する

## 4. エラー通知

- [x] 4.1 `src/core/error-reporter.ts` を実装し、embed の項目（共通: 種類・メッセージ・ギルドとチャンネル・時刻、スラッシュ: コマンド名とオプション、プレフィックスとリスナー: メッセージ本文）と `traceback.txt` の添付をテストで確認する
- [x] 4.2 通知の送信が失敗した場合に、元のエラーと送信失敗がログに記録され、例外が外に漏れないことをテストで確認する
- [x] 4.3 dispatcher から想定外エラーのときだけ error-reporter が呼ばれ、`UserFacingError` では呼ばれないこと、リスナーの例外では利用者への返信がなく通知だけが送られることをテストで確認する
- [x] 4.4 `client.on('error')`・`unhandledRejection`・`uncaughtException` のハンドラを実装し、それぞれが reporter に流れること（`uncaughtException` は shutdown も呼ぶこと）をテストで確認する

## 5. DB とマイグレーション

- [x] 5.1 drizzle-orm・drizzle-kit・better-sqlite3 を追加し、`pnpm install` 後に better-sqlite3 が読み込めることを確認する（13 系はビルド済みバイナリを同梱しているため、ビルドスクリプトの許可は不要）
- [x] 5.2 `src/db/client.ts`（WAL、`busy_timeout`、`synchronous=NORMAL`、`foreign_keys`）を実装し、一時ファイルで開いたときの PRAGMA 値をテストで確認する
- [x] 5.3 `drizzle.config.ts`、`src/db/schema.ts`（features の re-export）、`pnpm db:generate` を整え、スキーマが空の状態で generate がエラーにならないことを確認する
- [x] 5.4 `src/db/migrate.ts` を実装し、テスト用マイグレーションを使って、空の DB への適用・再起動時に再適用されないこと・失敗時に DB が適用前の状態に保たれることをテストで確認する

## 6. 起動・停止の組み立て

- [x] 6.1 `src/core/shutdown.ts` を実装し、SIGTERM / SIGINT で受け付けの停止 → DB と client のクローズ → exit 0、10 秒を超えたら強制終了することをテストで確認する
- [x] 6.2 `src/main.ts` で、設定 → DB を開く → migrate → client（intents は `Guilds`・`GuildMessages`・`MessageContent`）→ ready 後にコマンドを一括登録（`DEV_GUILD_ID` の有無で登録先を切り替え）→ login の順に組み立て、`pnpm typecheck` と全テストが通ることを確認する
- [ ] 6.3 beta 用の Discord アプリケーション（Message Content intent を有効化）と開発用ギルドで `pnpm dev` を起動し、`/ping`・`%ping`・`％p` の応答、`%unknown` に無応答なこと、想定外エラーのログチャンネル通知、コマンド削除後の再起動で登録から消えることを手動で確認する
- [ ] 6.4 README に、ローカル開発の手順（mise、`.env`、`pnpm dev`、開発用ギルドへの登録）と、feature の追加方法（`commands/`・`listeners/`・`usecases/`・`views/`・`repository.ts` の役割、依存の向き、usecase を省略してよい条件、`features/index.ts` への登録）を書き、その手順どおりに起動できることを確認する

## 7. コンテナと Litestream

- [x] 7.1 `Dockerfile`（multi-stage、`node:26-slim`、固定バージョンの Litestream バイナリ、非 root、`/data` の VOLUME）を作り、`docker build --platform linux/arm64` が成功することを確認する
- [x] 7.2 `deploy/litestream.yml`（`sync-interval: 10s`、スナップショット 24 時間、保持 7 日、レプリカ URL と認証情報は環境変数）と `deploy/entrypoint.sh`（`restore -if-db-not-exists -if-replica-exists` → `replicate -exec`）を作り、`shellcheck` が通ることを確認する
- [ ] 7.3 `deploy/compose.local.yaml`（`file://` のレプリカ）でコンテナを起動し、DB への書き込みから 30 秒以内にレプリカに反映されることを確認する
- [ ] 7.4 同じ構成で、ボリュームを削除してから再起動したときに自動で復元されること、DB があるときは復元されないことを確認する
- [ ] 7.5 `docker stop` で、アプリが exit 0 で終了し、Litestream の最終同期のあとにコンテナが止まること（`stop_grace_period: 30s` 以内）をログで確認する
- [x] 7.6 `deploy/compose.yaml`（本番用、名前付きボリューム、json-file 10m x 3、`stop_grace_period: 30s`）と `deploy/.env.example` を作り、`docker compose -f deploy/compose.yaml config` が通ることを確認する
- [x] 7.7 `docs/restore.md` に、自動復元の仕組みと、手動での復元（任意時点を含む）の手順を書き、その手順どおりに別のディレクトリへ復元した DB が開けることを確認する
- [x] 7.8 `docker history` とイメージ内のファイルを調べ、秘密値が含まれていないことを確認する

## 8. CI

- [x] 8.1 `.github/workflows/ci.yaml` の `check` ジョブ（PR と main、oxlint・`oxfmt --check`・tsc・vitest）を作り、型エラーを入れた PR で失敗することを確認する
- [ ] 8.2 GHCR パッケージ `mk8dx-bot` の Manage Actions access で `oha-4/mk8dx-bot` に Write 権限を付与したうえで、同じワークフローの `image` ジョブ（main のみ、`needs: check`、`ubuntu-24.04-arm`、linux/arm64、`docker/metadata-action` で `ghcr.io/oha-4/mk8dx-bot` に `edge` と `<sha>`。`latest` は含めない）を作る。main への push で `:edge` が公開され、`:latest` の digest が変わっていないことを確認する
- [x] 8.3 pinact で Action を SHA 固定し、pinact の検査ワークフローを追加して、それが通ることを確認する

## 9. 本番での並行稼働（統合確認）

- [ ] 9.1 R2 のバケットとバケット専用の API トークンを用意し、Cloudflare の請求通知を設定する。A1 上で `docker pull ghcr.io/oha-4/mk8dx-bot:edge` が成功することを確認する
- [ ] 9.2 Dockhand にスタック `mk8dx-bot` を作成して起動し、`/ping` の応答・エラーログチャンネルへの通知・R2 上のレプリカを確認する。あわせて、Python 版の `mk8dx-bot-py-bot-1` が稼働を続け、そのコマンドが変わっていないことを確認する
- [ ] 9.3 本番で復元のリハーサル（停止 → ボリューム削除 → 起動 → 自動復元）を行い、結果を `docs/restore.md` に追記する
- [ ] 9.4 1 週間稼働させた後、R2 のメトリクスで Class A 操作数とストレージ使用量を確認し、月換算で無料枠内に収まっていることを `docs/restore.md` に記録する

## Workflow follow-up

- レビューのあと、change をアーカイブする（`/opsx:archive`）。
