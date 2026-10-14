# Design

## Context

- リポジトリは OpenSpec の設定のみで、コードはない。動機は proposal.md の Why を参照。
- 旧実装の観察結果:
  - Python 版は `ghcr.io/oha-4/mk8dx-bot:latest` を `ubuntu-24.04-arm` 上で linux/arm64 のみビルドし、GitHub Actions は pinact で SHA 固定している。
  - A1 上では Dockhand（Hawser エージェント）のスタック `/opt/hawser-stacks/mk8dx-bot-py/`（`compose.yaml` + `.env`）として稼働し、ログは json-file（10m x 3）。
  - エラー通知（`dev/cog.py`）は、想定内の `BotError` は利用者へ ephemeral で返し、それ以外はログチャンネルに embed とトレースバックのファイルを送る。
- 稼働先: OCI A1（ap-osaka-1、aarch64、2 OCPU / 12GB、ルート領域の空き 13GB、PAYG）。ローカルの開発機も arm64。

## Goals / Non-Goals

**Goals:**
- 以後の機能 change が「`src/features/<name>/` を追加し、コマンドとスキーマを export するだけ」で載る構造
- コマンドのオプションが、定義から推論された型で実行関数に渡ること
- DB を失ってもレプリカから自動で戻ること
- ローカルでは Discord トークンと SQLite ファイルだけで起動できること（Litestream と R2 は不要）

**Non-Goals:**
- アプリケーションのテーブル（設定 DB は後続の change で扱う）
- 自動デプロイ（イメージ公開まで。スタックの更新は Dockhand で手動）
- 構造化ログの外部収集やメトリクス

## Decisions

### D1. 外側は feature で分け、feature の中は層で分ける

```
src/
  main.ts               エントリポイント（設定 -> DB -> client -> 登録 -> login）
  core/
    config.ts           環境変数のスキーマと読み込み
    logger.ts
    slash-command.ts    defineSlashCommand と型推論
    prefix-command.ts   definePrefixCommand と型推論
    prefix.ts           プレフィックスの検出、引数の分解、型変換の関数群
    listener.ts         defineMessageListener
    registry.ts         features からコマンドとリスナーを集め、名前・エイリアスで引く
    dispatcher.ts       interactionCreate / messageCreate -> 実行 -> エラー振り分け
    errors.ts           UserFacingError
    error-reporter.ts   ログチャンネル通知
    shutdown.ts
  db/
    client.ts           接続の生成（ドライバ依存はここだけ）
    schema.ts           features/*/schema.ts を re-export
    migrate.ts
  features/
    index.ts            全 feature の一覧
    ping/
      index.ts          { slashCommands, prefixCommands, listeners }
      commands/ping.ts  入口（スラッシュとプレフィックスの両方）
      usecases/measure-latency.ts
      views/ping.ts
drizzle/                drizzle-kit generate が出力するマイグレーション
deploy/                 compose.yaml, litestream.yml, entrypoint.sh, .env.example
docs/                   運用手順（復元など）
```

feature の中の標準的な構成と、依存の向き:

```
features/<name>/
  commands/      入口: 引数を受け取り -> usecase -> view -> 返信
  listeners/     入口: メッセージを解釈し -> usecase -> view -> 返信
  usecases/      処理の本体: (deps, input) => result
  views/         result => BaseMessageOptions（embed、画像の添付など）
  repository.ts  DB アクセス（Drizzle）
  schema.ts      テーブル定義

 commands / listeners --> usecases --> repository / 外部サービス
          |                  |
          +------> views <---+（result の型だけを参照）
```

- **usecases** は `discord.js` を import しない。DB や外部サービス、時計などは引数（deps）で受け取る。そのため、Discord の偽オブジェクトなしでテストできる。スラッシュ・プレフィックス・リスナー・（将来の）ボタンや OBS 配信が、同じ usecase を呼ぶ。
- **views** は Discord の `BaseMessageOptions` を返す。`interaction.reply()` と `message.channel.send()`（や `message.reply()`）のどちらにもそのまま渡せるので、入口ごとに違うのは返信の 1 行だけになる。
- **commands / listeners** は薄く保ち、引数の解釈と、usecase・view・返信の組み立てだけを行う。
- usecase と view は、処理が Discord の中で完結する小さな機能（`ping` のようなもの）では省略してよい。
- 規約は oxlint の `no-restricted-imports` で、`features/*/usecases/**` から `discord.js` を import できないようにする（ファイルのパスごとの override が oxlint で使えることは、実装時に確認する）。

feature は `{ slashCommands?, prefixCommands?, listeners?, schema? }` を export する。core は features を知らず、`features/index.ts` だけが一覧を持つ。代替案は旧 JS 版の、リポジトリ全体を `command / interaction / message / application` に分ける層分け。1 機能の変更が層をまたいで散るため採用しない。

### D2. 入口ごとに型付きの define を分け、共通化は usecase と view で行う

旧 Python 版はプレフィックスコマンドが主（`@commands.command` が 45 個に対し、スラッシュは 3 系統）で、エイリアスを多用している。そこで、入口ごとに自前の薄い define を用意し、機能のコードには discord.js の本物の型を渡す。

```ts
// features/ping/commands/ping.ts
const run = (client: Client) => renderPing(measureLatency(client))   // usecase -> view

export const pingSlash = defineSlashCommand({
  name: 'ping',
  description: '...',
  options: {},
  execute: (interaction) =>      // ChatInputCommandInteraction
    interaction.reply({ ...run(interaction.client), flags: MessageFlags.Ephemeral }),
})

export const pingPrefix = definePrefixCommand({
  name: 'ping',
  aliases: ['p'],
  args: [],
  execute: (message) => message.channel.send(run(message.client)),   // Message
})
```

- **`defineSlashCommand`**: オプションをオブジェクトリテラルで宣言し、Discord に登録する JSON と、`execute(interaction, options)` の `options` の型を両方導出する。最初は string / integer / number / boolean / user / channel / role の基本型と `required`・`choices` に対応する。
- **`definePrefixCommand`**: `args` を位置引数の配列として宣言し、`execute(message, args)` の `args` の型を導出する。本文から `%` / `％` と名前を除いて空白で分割し、宣言順に割り当てて型ごとに変換する（integer / number / boolean、user / channel / role はメンションか ID）。最後の string 引数に `rest: true` を付けると、残りをすべて受け取る。変換に失敗した場合は、使い方を添えた `UserFacingError` になる。旧版の `%c 21` や `%vs ...` のように独自の書式が必要なコマンドは、`parse(tokens) => Args` で置き換えられる。メンションや ID の変換関数は `core/prefix.ts` に置き、独自の parse からも使えるようにする。
- **照合**: プレフィックスの名前とエイリアスは、大文字と小文字を区別した完全一致（旧版の `c` / `C` のように、両方をエイリアスとして並べる運用を踏襲する）。名前とエイリアスの重複、またはスラッシュコマンド名の重複は、registry の構築時にエラーにする。
- **`defineMessageListener`**: `{ name, handle(message) }`。ギルドのメッセージのうち、bot と webhook の投稿を除き、プレフィックスコマンドとして処理されなかったものだけが渡る。
- スラッシュとプレフィックスで同じ引数を受け取るコマンドは、`options` と `args` を別々に宣言する。移植時にこの重複が目立つようなら、両方を生成できる共通の定義を後から足す。

代替案:
- 1 つの `defineCommand` から両方の入口を生やし、`CommandContext` で返信方法の違いを吸収する: usecase と view で共通化すると、CommandContext に残る役割は返信の 1 行だけになる。しかも、両方に共通する機能しか表に出せない。スラッシュだけの ephemeral・modal・autocomplete、メッセージだけのリアクション・入力中の表示・自分の返信の後からの編集・複数メッセージにまたがるやり取り（sokuji）が使いにくくなるため、採用しない。
- discord.js の `SlashCommandBuilder` と `interaction.options.getX()`: オプション名の文字列と型を手で揃える必要があり、型安全の目的を満たさない。
- 外部のフレームワーク（Sapphire など）: 規約が重く、discord.js のバージョン追従がフレームワーク依存になる。

サブコマンド、オートコンプリート、ボタンなどのコンポーネントの入口は、必要になった機能の change で追加する。

### D3. 設定は zod で検証する

`process.env` を zod スキーマで parse し、失敗したらフィールド名と期待形式だけをログに出して `process.exit(1)` する。値は出さない。Snowflake ID は数字の文字列として検証する。

| 変数 | 必須 | 用途 |
|---|---|---|
| `DISCORD_TOKEN` | ○ | bot トークン |
| `DISCORD_APPLICATION_ID` | ○ | コマンド登録 |
| `ERROR_LOG_CHANNEL_ID` | ○ | 想定外エラーの通知先 |
| `DEV_GUILD_ID` | - | 指定時はギルドに登録 |
| `DATABASE_PATH` | ○（イメージ内で既定値 `/data/bot.db`） | SQLite ファイル |
| `LOG_LEVEL` | - | 既定は `info` |
| `LITESTREAM_REPLICA_URL` ほか R2 認証情報 | コンテナ内のみ | Litestream が読む。アプリは読まない |

代替案は valibot（バンドルが小さい）。サーバー用途ではサイズの利点が薄く、エコシステムの厚い zod を採用する。

### D4. コマンド登録は起動時の一括上書き

`ready` の後に REST の bulk overwrite（PUT）で、`DEV_GUILD_ID` があればギルドに、なければグローバルに登録する。PUT は全体置換なので、コードから消えたコマンドも消える。代替案は手動で実行する `npm run commands:deploy` スクリプト。デプロイの手順が増え、登録し忘れのリスクがあるため採用しない。起動のたびに PUT しても、定義が同じなら Discord 側の変更はない。

### D5. エラーの振り分けは dispatcher に集約する

- dispatcher は入口の種類を知っているので、エラー時の返信も入口ごとに行う。
- プレフィックスコマンドの通常の結果は、チャンネルへの通常の投稿（`message.channel.send`）にする。旧 Python 版の応答の大半（`ctx.send` が 37 か所、`ctx.reply` は 2 か所）と同じ見た目にし、即時集計の表や挙手の一覧のようにチャンネル全体で見る結果を自然に出すため。返信にするかは各コマンドの入口で選べる。
- `UserFacingError(message)` を throw すると、そのメッセージを返す（スラッシュでは ephemeral、プレフィックスでは元のメッセージへの返信）。エラーは誰のどのメッセージへのものかを示すため返信にし、`allowedMentions: { repliedUser: false }` で通知は鳴らさず、`failIfNotExists: false` で元のメッセージが消えていても送る。エラーログチャンネルへの通知はしない。
- それ以外の例外は、汎用メッセージを同じ方法で返し、`error-reporter` が embed（種類・メッセージ・ギルドとチャンネル・時刻と、スラッシュではコマンド名とオプション、プレフィックスとリスナーではメッセージ本文）と `traceback.txt` をログチャンネルに送る。
- リスナーの例外は利用者に返さず、想定外のものだけを通知する。通常の会話に bot が割り込まないようにするため。
- スラッシュでは応答の状態（未応答 / deferred / replied）を見て、`reply` / `editReply` / `followUp` を使い分ける。
- 通知が失敗した場合は logger に記録し、例外は外に漏らさない。
- `client.on('error')` と `process.on('unhandledRejection')` は error-reporter に流す。`uncaughtException` はログと通知のあと shutdown 経由で終了する。プロセスの状態が保証できないため。

### D6. DB は better-sqlite3 + Drizzle 0.45、マイグレーションはアプリ内で実行する

- `db/client.ts` で better-sqlite3 を開き、`journal_mode=WAL`、`busy_timeout=5000`、`synchronous=NORMAL`、`foreign_keys=ON` を設定する。Litestream の前提は WAL。手動で checkpoint はしない。
- スキーマは各 feature の `schema.ts` に置き、`db/schema.ts` で re-export する。この change ではアプリのテーブルを作らない。
- `drizzle-kit generate` で `drizzle/` に SQL を生成し、起動時に `drizzle-orm/better-sqlite3/migrator` の `migrate()` を Discord 接続の前に実行する。drizzle-kit からは DB に接続しない（`push` は使わない）。
- **node:sqlite への移行条件**: Drizzle v1 が stable になり `drizzle-orm/node-sqlite` が `latest` に入ったら、`db/client.ts` と migrator の import だけを差し替える。2026-10 時点で、node:sqlite は Node 26 で Stability 1.2（RC）、Drizzle の node-sqlite は `1.0.0-beta` にのみ存在する。

代替案は node:sqlite + Drizzle v1 beta。ネイティブ依存はなくなるが、不安定な要素が 2 つ重なるため見送る。

### D7. Litestream は同じコンテナ内でアプリの親プロセスにする

```
entrypoint.sh
  1. litestream restore -if-db-not-exists -if-replica-exists $DATABASE_PATH
  2. exec litestream replicate -exec "node dist/main.js"
       |- WAL を監視し、R2 に 1 時間間隔で同期
       |- SIGTERM を子（node）に転送し、子の終了後に最終同期して終了
```

- 復元をマイグレーションより前に確実に行うため、この順序をコンテナの起動シーケンスで保証する（spec: data-persistence の自動復元）。
- `sync-interval: 1h`。この bot のデータ（設定や履歴）は、A1 が突然失われた場合に最大 1 時間分を失っても許容できる。停止時（デプロイや再起動）は最終同期するので失わない。Litestream は変更があった区間しかアップロードしないので、R2 の Class A は同期が月最大約 720 回と、コンパクションやスナップショットを合わせても無料枠の 100 万回に対して十分小さい。稼働後に R2 のメトリクスで確認する。代替案は `10s`（失うのは最大 10 秒分。無料枠には収まる）と、Litestream をやめて日次の `VACUUM INTO` を R2 に上げる方法（起動時の自動復元を自前で作る必要がある）。
- スナップショットは 24 時間ごと、保持は 7 日（任意時点への復元の範囲）。
- Litestream の arm64 バイナリは、公式イメージから multi-stage でコピーし、バージョンを固定する。
- ローカル開発では Litestream を使わず、`npm run dev` で直接起動する。開発用の秘密値は SOPS（age）で暗号化した `.env.dev.sops.yaml` に置き、`MISE_ENV=dev` のときだけ読まれる `mise.dev.toml` の `[env]` で復号して渡す。復元の確認は `deploy/compose.local.yaml`（`file://` のレプリカ）で行う。

代替案は Litestream を sidecar コンテナにする方法。「復元が終わってからアプリが起動する」順序と、停止時の最終同期を、compose の依存関係だけで保証するのが難しいため採用しない。

### D8. ツールチェーン

| 用途 | 採用 | 備考 |
|---|---|---|
| バージョン管理 | `.node-version`（node 26） | ローカルは mise（`mise.toml` の `idiomatic_version_file_enable_tools` で読む）、CI は `actions/setup-node` の `node-version-file`。Dockerfile のベースイメージのタグも揃える |
| パッケージマネージャ | npm（Node 同梱） | 設定は `.npmrc` |
| 開発実行 | tsx（watch） | |
| 型チェック | `tsc --noEmit`（strict、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`） | |
| ビルド | tsdown | Rolldown ベースで Oxc と同系統。依存は external のままにし、node_modules を同梱する |
| lint / format | oxlint + oxfmt（exact 固定） | 型情報を使う lint（tsgolint）は後で追加 |
| テスト | Vitest | |

代替案は esbuild（JS 版の実績あり）。設定がやや多く、tsdown のほうが TS ライブラリやアプリ向けの既定値がそろっているため採用しない。問題が出れば esbuild に戻せる。

パッケージマネージャは npm にする。単一パッケージのアプリなので pnpm の workspace やディスク節約の利点が効かず、Node 同梱の npm なら Docker と CI で別途入れる手間がない。代替案の pnpm は、依存のインストールスクリプトを既定で実行しない点が利点だったが、同じ守りを `.npmrc` で用意する。

- `ignore-scripts=true`: 依存のインストールスクリプトを実行しない。esbuild はプラットフォーム別の optional dependency でバイナリを配布し、better-sqlite3 13 は N-API のビルド済みバイナリ（linux-arm64 を含む）を同梱しているため、スクリプトなしで動く
- `min-release-age=7`: 公開から 7 日経ったバージョンだけを解決する（GitHub Actions の pinact と同じ基準）。公開直後のバージョンに混入した悪意あるコードを避けるため。直接の依存の範囲指定は、7 日経った版が解決できる下限にする
- Dockerfile にも `.npmrc` をコピーし、`npm ci` で lockfile どおりにインストールする

### D9. コンテナと CI

- Dockerfile は multi-stage（deps: `npm ci --omit=dev`、build: `npm ci` → tsdown。runtime: `node:26-slim` + Litestream バイナリ + `dist/` + `node_modules`）。非 root ユーザーで実行し、`/data` を VOLUME にする。
- GitHub Actions は 2 ジョブ。`check`（oxlint、`oxfmt --check`、tsc、vitest）は PR と main で実行する。Node は `actions/setup-node` で入れ、`cache: npm` で `~/.npm` をキャッシュする。`image` は main のみで、`needs: check`。`ubuntu-24.04-arm` 上で linux/arm64 をビルドする。Action は pinact で SHA 固定し、公開から 7 日未満のバージョンは拒否する（`.github/pinact.yaml`）。pinact のバージョンは mise.toml で管理し、CI の pinact ワークフローでは mise-action で同じ pinact を入れてから pinact-action を実行する。pinact-action は PATH に pinact があればそれを使い、なければ自身が固定したバージョンを入れる作りのため。PR では reviewdog で違反箇所をコメントする。pinact を自分で入れると pinact-action は aqua を入れず、reviewdog を `aqua exec` で呼べなくなるので、reviewdog も mise で入れる。reviewdog は CI でしか使わないため、`MISE_ENV=ci` のときだけ読まれる `mise.ci.toml` に置く。
- **イメージ名は Python 版と同じ `ghcr.io/oha-4/mk8dx-bot`、タグは `edge` と `<sha>`**。タグは `docker/metadata-action` で付ける（`type=edge,branch=main` と `type=sha`、`flavor: latest=false`）。main への push ごとのビルドに `edge` を付けるのは metadata-action が標準で用意している慣習で、`beta`（プレリリースの段階）や `nightly`（定期ビルド）とは意味が異なる。metadata-action の `labels` 出力は渡さない。含まれる `org.opencontainers.image.source` が GHCR のパッケージとリポジトリの紐づけに使われ、Python 版に紐づいた既存パッケージへの影響を確認していないため。同じイメージ名の中でもタグは独立しているので、Python 版が参照する `latest` には影響しない。パッケージは Python 版のリポジトリに紐づいているため、Package settings の Manage Actions access で `oha-4/mk8dx-bot` に Write 権限を付与する。CI のタグ指定には `latest` を含めない（spec: deployment の旧 bot との分離）。
- 代替案は別のイメージ名（`mk8dx-bot-next` など）。権限の設定は不要になるが、切り替え時にイメージ名の変更が必要になるため、採用しない。

### D10. デプロイ

- Dockhand に新しいスタック `mk8dx-bot` を作り、`deploy/compose.yaml` の内容を使う。
  - `stop_grace_period: 30s`: アプリの停止（最大 10 秒）+ Litestream の最終同期。
  - 名前付きボリューム `mk8dx-bot-data:/data`。
  - ログは Python 版と同じ json-file（10m x 3）。
- Discord Gateway の intents は `Guilds`・`GuildMessages`・`MessageContent`。MessageContent は特権 intent なので、beta 用アプリケーションの Developer Portal で有効にする。beta 用の bot は導入先が少なく、100 サーバー未満なので審査は不要。本番アプリケーションはすでに承認済み。
- `deploy/compose.yaml` は `ghcr.io/oha-4/mk8dx-bot:edge` を参照する。
- `.env` は Dockhand 上で設定し、リポジトリには `deploy/.env.example` だけを置く。
- Discord のアプリケーションは本番用（Python 版）・beta 用（A1 の edge スタック）・開発用（ローカル）の 3 つに分ける。同じトークンで複数のプロセスが接続すると、シャーディングなしでは両方が同じイベントを受けて二重に応答し、コマンドの登録も上書きし合うため。

## Risks / Trade-offs

- [better-sqlite3 の同梱バイナリが将来の Node で読み込めなくなる] → N-API なので Node のメジャー更新の影響は受けにくい。読み込めなくなった場合は、build ステージにコンパイラ類を入れてソースからビルドする。
- [oxfmt が 0.x のため、更新で整形結果が変わる] → exact で固定し、更新するときは整形し直しの差分を単独のコミットにする。
- [Litestream の 0.5 系で設定キーや挙動が変わる] → バージョンを固定する。復元手順の文書を、そのバージョンでの実地確認とセットで更新する。
- [プレフィックスの位置引数の解釈が、旧版の書式と合わないコマンドがある] → `definePrefixCommand` の `parse` で置き換えられるようにしておく。どの書式を採るかは、各機能を移植する change で旧版の挙動から決める。
- [起動のたびのグローバル登録で、反映待ちの間に古いコマンドが実行される] → dispatcher で未知のコマンドに応答する（spec: bot-runtime）。
- [A1 1 台が単一障害点] → データは Litestream で守る。可用性は単一ホストのまま受け入れる。
- [自前の `defineSlashCommand` / `definePrefixCommand` の保守コスト] → 対応する型を絞り、Discord の API 型（`discord-api-types`）を基にして作る。

## Migration Plan

1. Discord Developer Portal で beta 用のアプリケーションを作り、Message Content intent を有効にしてトークンを発行する。開発用ギルドに招待する。
2. Cloudflare R2 にバケットを作り、そのバケット専用の API トークン（Object Read & Write）を発行する。
3. GHCR パッケージ `mk8dx-bot` の Manage Actions access で、`oha-4/mk8dx-bot` に Write 権限を付与する。main に merge し、`:edge` が公開され、`:latest` が変わっていないことを確認する。
4. Cloudflare の請求通知を設定し、R2 の使用量が無料枠に近づいたら気付けるようにする。
5. Dockhand でスタック `mk8dx-bot` を作成し、`.env` を設定して起動する。`/ping` とエラー通知、R2 にレプリカが作られていることを確認する。
6. 復元のリハーサル: スタックを停止し、ボリュームを削除して起動し、自動で復元されることを確認する。

ロールバック: 新しいスタックを停止・削除するだけでよい。Python 版には影響しない。

将来の切り替え（この change の対象外）: 全機能の移植後に、Python 版の CI とスタックを止め、新しい CI が `latest` も公開するようにする。本番のスタックでは、承認済みの本番アプリケーションのトークンを新しいコードで使う。そうすれば、Message Content の承認と各サーバーへの導入状況を引き継げる。

## Open Questions

- Dockhand の自動更新（イメージの更新を検知して再作成する）を使うかどうか。手動の更新でもこの change の範囲は変わらない。
