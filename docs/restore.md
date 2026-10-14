# DB の復元

bot のデータは SQLite（コンテナ内の `/data/bot.db`、ボリューム `mk8dx-bot-data`）に保存され、Litestream が Cloudflare R2 へ継続的に複製している。

## 仕組み

```
コンテナ起動（deploy/entrypoint.sh）
  1. litestream restore -if-db-not-exists -if-replica-exists /data/bot.db
       DB ファイルがなく、レプリカがあれば最新の状態を復元する。DB があれば何もしない
  2. litestream replicate -exec "node /app/dist/main.js"
       1 時間ごとに変更を R2 へ同期する。停止時は bot の終了後に最終同期する
```

- A1 が突然失われた場合、失うデータは最大で直近の 1 時間分。停止（デプロイや再起動）では失わない
- スナップショットは 24 時間ごと、保持は 7 日（`deploy/litestream.yml`）。7 日以内なら任意の時点に戻せる
- ボリュームを失ったときは、**何もせずスタックを起動し直せば自動で復元される**

## 手動で復元する

以下はすべて、スタックの `.env` と同じ環境変数を読む一時コンテナで実行する。A1 上では、スタックのディレクトリ（`/opt/hawser-stacks/mk8dx-bot`）で行う。

```sh
cd /opt/hawser-stacks/mk8dx-bot
alias ls-run='docker compose run --rm --no-deps --entrypoint sh -v "$PWD/restore:/restore" bot -c'
mkdir -p restore && chmod 777 restore
```

### 1. どの時点に戻せるかを確認する

```sh
ls-run 'litestream ltx -config /etc/litestream.yml -level all /data/bot.db'
```

各行の `created` が、その時点までの変更を含むファイルの作成時刻。任意の時点への復元は、このファイルの境界に合わせて行われる。

### 2. 別の場所に復元して中身を確かめる

稼働中の DB には触れずに、`./restore/bot.db` へ書き出す。

```sh
# 最新の状態
ls-run 'litestream restore -config /etc/litestream.yml -o /restore/bot.db /data/bot.db'

# 任意の時点（UTC。指定時刻ちょうどに作られたファイルは含まれない）
ls-run 'litestream restore -config /etc/litestream.yml -timestamp 2026-10-12T03:00:00Z -o /restore/bot.db /data/bot.db'

# 実際には書き出さず、復元の計画だけを見る
ls-run 'litestream restore -config /etc/litestream.yml -dry-run -timestamp 2026-10-12T03:00:00Z -o /restore/bot.db /data/bot.db'
```

復元した DB を開いて確認する。

```sh
ls-run 'node -e "const D=require(\"/app/node_modules/better-sqlite3\");const db=new D(\"/restore/bot.db\",{readonly:true});console.log(db.pragma(\"integrity_check\",{simple:true}));console.log(db.prepare(\"select name from sqlite_master where type=\x27table\x27\").pluck().all())"'
```

### 3. 稼働中の DB を置き換える（過去の時点に戻す場合）

```sh
docker compose stop bot
# 現在の DB を退避してから、復元した DB に入れ替える
docker compose run --rm --no-deps --entrypoint sh -v "$PWD/restore:/restore" bot -c '
  mkdir -p /data/before-restore &&
  mv /data/bot.db /data/bot.db-wal /data/bot.db-shm /data/before-restore/ 2>/dev/null;
  cp /restore/bot.db /data/bot.db'
docker compose start bot
```

`/data/bot.db` があるので起動時の自動復元は行われず、入れ替えた DB がそのまま使われる。以後の変更は通常どおり R2 に複製される。

## ローカルでの確認

`deploy/compose.local.yaml` は、レプリカを R2 ではなくボリューム（`file:///replica/bot`）に置く。上の手順は、`cd /opt/hawser-stacks/mk8dx-bot` の代わりに次のようにすれば、そのままローカルで試せる。

```sh
alias ls-run='MISE_ENV=dev mise exec -- docker compose -f deploy/compose.local.yaml run --rm --no-deps --entrypoint sh -v "$PWD/restore:/restore" bot -c'
```

## 確認の記録

| 日付       | 環境                                  | 内容                                                                                                                                                                                                         | 結果       |
| ---------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| 2026-10-12 | ローカル（file レプリカ）             | データボリュームを削除して起動すると自動で復元される。DB がある状態で起動すると復元されない                                                                                                                  | 期待どおり |
| 2026-10-12 | ローカル（file レプリカ）             | 手順 1〜3（一覧、`-o` での復元と読み出し、`-dry-run -timestamp`、稼働中の DB の差し替え）。差し替え後の書き込みもレプリカに複製され、最新の復元に含まれる                                                    | 期待どおり |
| 2026-10-15 | ローカル（実際の bot、file レプリカ） | 稼働中の書き込みが 8 秒でレプリカに反映。`docker stop` で bot が先に停止し、最終同期のあと exit 0（0.5 秒）。停止 12 秒前の書き込みを含めて、ボリューム削除後の起動で自動復元。DB がある再起動では復元しない | 期待どおり |
