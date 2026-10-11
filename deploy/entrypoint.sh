#!/bin/sh
# コンテナの起動シーケンス（design D7）
#   1. DB ファイルがなく、レプリカがあれば復元する
#   2. Litestream を親プロセスにして bot を起動する。SIGTERM は bot に転送され、bot の終了後に最終同期する
set -eu

: "${DATABASE_PATH:?DATABASE_PATH を設定してください}"
: "${LITESTREAM_REPLICA_URL:?LITESTREAM_REPLICA_URL を設定してください（レプリケーションなしでは起動しません）}"

CONFIG=/etc/litestream.yml

litestream restore -config "$CONFIG" -if-db-not-exists -if-replica-exists "$DATABASE_PATH"
exec litestream replicate -config "$CONFIG" -exec "node /app/dist/main.js"
