# mk8dx-bot

MK8DX コミュニティ向けの Discord bot（TypeScript 版）。

## ローカル開発

### 準備

1. [mise](https://mise.jdx.dev/) で Node を入れ、npm で依存をインストールする（Node のバージョンは `.node-version` にあり、`mise.toml` の設定で mise がそれを読む）

    ```sh
    mise install
    npm install
    ```

2. Discord Developer Portal で開発用のアプリケーションを用意する（A1 で動かす beta 用とは別にする。同じトークンで同時に接続すると、両方が同じメッセージに応答するため）
    - Bot の **Message Content Intent** を有効にする（プレフィックスコマンドとメッセージリスナーに必要）
    - OAuth2 の URL Generator で `bot` と `applications.commands` を選び、開発用ギルドに招待する
3. 開発用の値を `.env.dev.sops.yaml`（SOPS + age で暗号化）に書く。`.sops.yaml` に公開鍵が登録された age の鍵が必要

    ```sh
    sops edit .env.dev.sops.yaml
    ```

    `DEV_GUILD_ID` を指定すると、コマンドがそのギルドにだけ即座に登録される。`.env.example` をコピーした `.env` でも起動できる

### 起動とチェック

```sh
MISE_ENV=dev mise exec -- npm run dev   # .env.dev.sops.yaml を復号して tsx watch で起動
npm run dev            # .env を読んで起動
npm run typecheck      # tsc --noEmit
npm run lint           # oxlint
npm run format         # oxfmt で整形（CI は format:check）
npm test               # vitest（*.test-d.ts の型テストも含む）
npm run build          # tsdown で dist/main.js を出力
npm run db:generate    # スキーマの変更から drizzle/ にマイグレーションを生成
pinact run             # GitHub Actions を SHA に固定する（mise.toml の pinact。CI でも同じバージョンで検査する）
```

`.npmrc` で、依存のインストールスクリプトを実行しない設定（`ignore-scripts`）と、公開から 7 日経ったバージョンだけを使う設定（`min-release-age`）を入れている。新しく公開されたばかりのバージョンを入れようとすると解決に失敗するので、その場合は 7 日経った版を指定する。

マイグレーションは起動時に、Discord に接続する前に自動で適用される。

## 環境変数

| 変数                     | 必須 | 説明                                                                                                            |
| ------------------------ | ---- | --------------------------------------------------------------------------------------------------------------- |
| `DISCORD_TOKEN`          | ○    | bot トークン                                                                                                    |
| `DISCORD_APPLICATION_ID` | ○    | Discord アプリケーション ID（コマンド登録に使う）                                                               |
| `ERROR_LOG_CHANNEL_ID`   | ○    | 想定外エラーの通知先チャンネル ID                                                                               |
| `DEV_GUILD_ID`           | -    | 指定するとすべてのコマンドをそのギルドにだけ登録する                                                            |
| `ADMIN_GUILD_ID`         | -    | 管理用のコマンド（`scope: 'admin'`）を登録し、実行を許すギルド。`DEV_GUILD_ID` を指定した場合はそちらが使われる |
| `DATABASE_PATH`          | ○    | SQLite ファイルのパス（コンテナでは `/data/bot.db`）                                                            |
| `LOG_LEVEL`              | -    | `fatal` / `error` / `warn` / `info` / `debug` / `trace`（既定: `info`）                                         |

コンテナで動かすときの Litestream 用の変数は `deploy/.env.example` を参照。

## feature の追加方法

機能は `src/features/<name>/` に置く。外側は feature で分け、中は次の層に分ける。`src/features/ping/` が見本。

```
src/features/<name>/
  commands/      入口: 引数を受け取り -> usecase -> view -> 返信
  listeners/     入口: メッセージを解釈し -> usecase -> view -> 返信
  usecases/      処理の本体: (deps, input) => result
  views/         result => BaseMessageOptions（embed、画像の添付など）
  repository.ts  DB アクセス（Drizzle）
  schema.ts      テーブル定義
  index.ts       Feature を export する
```

- 依存の向きは `commands / listeners -> usecases -> repository / 外部サービス`。views は usecase の結果の型だけを参照する
- **usecases は `discord.js` を import しない**（oxlint で禁止している）。DB や外部サービス、時計などは引数（deps）で受け取る。スラッシュ・プレフィックス・リスナーが同じ usecase を呼べ、Discord の偽オブジェクトなしでテストできる
- views は `BaseMessageOptions` を返す。`interaction.reply()` にも `message.channel.send()` にもそのまま渡せる
- プレフィックスコマンドの結果はチャンネルへの通常の投稿（`message.channel.send`）にする。本人に向けた応答だけを返信にしたい場合は `message.reply` を使う
- 処理が Discord の中で完結する小さな機能なら、usecase と view は省略して commands に直接書いてよい

### コマンドとリスナー

```ts
// スラッシュコマンド: options の宣言から execute の引数の型が決まる
export const searchSlash = defineSlashCommand({
    name: 'search',
    description: 'プレイヤーを検索します',
    options: { name: { type: 'string', description: 'プレイヤー名', required: true } },
    execute: (interaction, { name }) => interaction.reply(renderResult(search(deps, name))),
})

// プレフィックスコマンド（% と ％ の両方で反応する）。args は宣言順の位置引数
export const searchPrefix = definePrefixCommand({
    name: 'search',
    aliases: ['s', 'S'], // 大文字と小文字を区別して完全一致で照合する
    args: [{ name: 'name', type: 'string', required: true, rest: true }],
    execute: (message, { name }) => message.channel.send(renderResult(search(deps, name))),
})

// 独自の書式が必要なら args の代わりに parse を渡す
definePrefixCommand({ name: 'vs', usage: '%vs <tag...>', parse: (tokens) => ({ tags: tokens }), execute: ... })

// プレフィックスコマンドとして処理されなかったギルドのメッセージ（bot と webhook を除く）を受け取る
export const resultListener = defineMessageListener({ name: 'result', handle: async (message) => { ... } })
```

- `/ping` のような管理用のコマンドは `scope: 'admin'` を付ける。スラッシュコマンドは管理用ギルドにだけ登録され、どちらの入口でも管理用ギルドの外では未知のコマンドと同じ扱いになる
- 利用者に伝えるべき失敗は `UserFacingError` を throw する。スラッシュでは本人にだけ、プレフィックスでは通知を鳴らさない返信で表示され、エラーログチャンネルには通知されない
- それ以外の例外は、利用者に汎用メッセージを返し、エラーログチャンネルに通知される。リスナーの例外は利用者に返さない

### 登録

1. `src/features/<name>/index.ts` で `Feature`（`slashCommands` / `prefixCommands` / `listeners`）を export する
2. `src/features/index.ts` の `features` に追加する
3. テーブルがあれば `src/db/schema.ts` で `schema.ts` を re-export し、`npm run db:generate` でマイグレーションを生成してコミットする
