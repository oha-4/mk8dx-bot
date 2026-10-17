# Proposal

## Why

旧 Python 版（mk8dx-bot.py）は動いているが型がなく、JS 版（mk8dx-bot.js）は永続化先の Deta Base が終了して動かない。旧機能の全移植、ユーザー/チャンネル/サーバー設定の保持、OBS レイヤー配信を TypeScript で型安全に積み上げるため、機能を載せる前に起動・コマンド・エラー通知・永続化・デプロイの土台を先に固める。

## What Changes

- TypeScript（Node 26 / ESM / npm）の新規プロジェクトを作り、lint・format・型チェック・テストを CI で回す
- Discord bot として起動し、型付きで定義したコマンドを、スラッシュコマンドとプレフィックスコマンド（`%` / `％`、エイリアスあり）の両方で受け付ける。プレフィックスのない通常メッセージを機能に渡すメッセージリスナーも用意する。動作確認用のコマンドは `ping` の 1 つだけ
- コマンド実行中のエラーを、利用者向けの応答と開発者向けのログチャンネル通知に分けて扱う（旧 dev cog 相当）
- SQLite を永続化先とし、起動時にスキーママイグレーションを適用する。DB ファイルは OCI Object Storage（A1 と同じテナンシーの Always Free 枠、S3 互換 API）へ継続的にレプリケーションし、DB が失われた場合は起動時に自動で復元する
- arm64 コンテナイメージを GHCR の既存のイメージ名に `edge` タグ（main の最新）で公開し、OCI A1 上の Dockhand スタックとして、Python 版とは別の beta 用 Discord アプリケーションで並行稼働させる
- feature ベースのディレクトリ構成（`src/core` / `src/db` / `src/features/*`）を確立し、以後の機能 change が同じ型で追加できるようにする

対象外: 旧機能（lounge / sokuji / track / gather / tool）の移植、設定 DB のスキーマ、OBS overlay（Firebase RTDB + mk8dx.pages.dev）、画像生成、i18n、シャーディング、本番アプリケーションへの切り替え。

## Capabilities

### New Capabilities

- `bot-runtime`: bot の起動・設定検証・スラッシュ / プレフィックスコマンドとメッセージリスナーへの振り分け・停止までのライフサイクル
- `error-reporting`: コマンドとリスナーの実行時のエラーを利用者への応答と開発者ログチャンネルへの通知に振り分ける振る舞い
- `data-persistence`: SQLite への永続化、起動時のマイグレーション、オブジェクトストレージへのレプリケーションと失われた DB の自動復元
- `deployment`: コンテナイメージの公開と、旧 bot と衝突しない並行稼働の制約

### Modified Capabilities

なし

## Impact

- 新規コード: リポジトリ全体（現状は OpenSpec のみ）
- 新規依存: discord.js v14、drizzle-orm / drizzle-kit、better-sqlite3、Litestream、oxlint / oxfmt、Vitest ほか
- 外部システム: beta 用と開発用の新しい Discord アプリケーション（それぞれ bot トークン、Message Content intent を有効化）、OCI Object Storage のバケットと S3 互換 API 用の Customer Secret Key、GHCR、OCI A1 上の Dockhand スタック（新規）
- 既存システム: GHCR パッケージ `ghcr.io/oha-4/mk8dx-bot` に新リポジトリからの書き込み権限を追加する。Python 版のコンテナ（`mk8dx-bot-py`）と、それが参照する `latest` タグには手を入れない
