# Spec Delta

## Purpose

bot を再現可能なコンテナイメージとして公開し、既存の Python 版 bot と衝突せずに同じホストで並行稼働できるようにする。

## ADDED Requirements

### Requirement: 品質チェックの自動実行
main ブランチへの push と pull request のたびに、lint・format 差分・型チェック・テストが自動で実行され、いずれかが失敗した場合はその実行が失敗として報告されなければならない（SHALL）。

#### Scenario: 型エラーを含む pull request
- **WHEN** 型エラーを含むコミットで pull request を作成する
- **THEN** チェックが失敗として報告される

### Requirement: arm64 イメージの公開
main ブランチへの push のたびに linux/arm64 のコンテナイメージがビルドされ、コンテナレジストリに、コミット SHA のタグと並行稼働用のチャンネルタグ `beta` の両方で公開されなければならない（SHALL）。品質チェックが失敗したコミットのイメージは公開してはならない（MUST NOT）。

#### Scenario: main への push
- **WHEN** 品質チェックが通るコミットを main に push する
- **THEN** そのコミット SHA のタグと `beta` タグで arm64 イメージが公開される

#### Scenario: チェックが失敗した push
- **WHEN** テストが失敗するコミットを main に push する
- **THEN** イメージは公開されない

### Requirement: 旧 bot との分離
並行稼働の間、新しい bot は Python 版 bot とは別の Discord アプリケーション、別のスタック、別のデータボリュームで稼働しなければならない（SHALL）。イメージ名は Python 版と共有してよいが、Python 版が参照する `latest` タグを公開してはならない（MUST NOT）。新しい bot の公開やデプロイによって、Python 版 bot のイメージやコンテナが変更されてはならない（MUST NOT）。

#### Scenario: 新しいイメージの公開
- **WHEN** 新しい bot のイメージが公開される
- **THEN** Python 版 bot が参照する `latest` タグの指す内容は変わらない

#### Scenario: 並行稼働
- **WHEN** 新しい bot と Python 版 bot を同じホストで同時に稼働させる
- **THEN** 両方がそれぞれのトークンで Discord に接続し、互いのコマンド登録を上書きしない

### Requirement: 設定値の外部化
秘密値（bot トークン、オブジェクトストレージの認証情報）はイメージやリポジトリに含めず、実行時の環境変数で渡さなければならない（MUST）。リポジトリには、必要な環境変数の名前と意味を示す見本ファイルを置かなければならない（SHALL）。

#### Scenario: イメージに秘密値が含まれない
- **WHEN** 公開されたイメージの内容と履歴を調べる
- **THEN** bot トークンやオブジェクトストレージの認証情報は含まれていない
