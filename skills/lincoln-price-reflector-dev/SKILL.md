# lincoln-price-reflector-dev

Lincoln Price Reflected プロジェクトの**開発ルール・規約を固定する** Skill。

## トリガーフレーズ例

1. 「開発ルールを確認して」
2. 「新しいファイルを作りたい」
3. 「PR を作って」「コミットしたい」
4. 「ディレクトリ構成はどうなっている？」
5. 「完了条件を教えて」
6. 「secrets の扱いはどうする？」
7. 「ジョブ再開（resume）の設計を確認して」

## 入力

- 開発者の作業意図（ファイル追加・PR 作成・設計確認など）

## 出力

- ルールに準拠した成果物（コード・PR・ディレクトリ）
- 違反がある場合は警告メッセージ

## 核心ルール

| # | ルール | 詳細 |
|---|--------|------|
| 1 | **作業ディレクトリ固定** | すべての成果物は `C:\lincolnpricereflected` 配下に作成。外部にファイルを作らない |
| 2 | **絶対パス宣言** | ファイル作成前に「作成先: C:\lincolnpricereflected\...」と宣言する |
| 3 | **セレクタ直書き禁止** | セレクタは `config/selectors.json` に集約。コード中のハードコード禁止 |
| 4 | **Git 運用** | PR はスラッシュコマンドで作成。1PR = 1責務で小さく分割 |
| 5 | **secrets 管理** | ID/PW は環境変数 (`LINCOLN_LOGIN_ID` 等)。DB に平文保存しない |
| 6 | **差分表 UI 禁止** | 差分表 UI は作らない。完全一致検証で NG なら即停止 |
| 7 | **ジョブ再開 (resume)** | `jobs.last_completed_step` を都度更新し、続きから再開可能にする |

## 禁止事項

- `C:\lincolnpricereflected` 外への成果物・一時ファイル作成
- `config/selectors.json` 以外の場所へのセレクタ定義
- 環境変数以外の場所への認証情報保存
- 差分表 UI の実装

## チェックリスト

### 実行前

- [ ] 作成先パスが `C:\lincolnpricereflected` 配下であることを確認
- [ ] 既存のディレクトリ構成（→ [project-structure.md](references/project-structure.md)）に適合するか確認
- [ ] 変更対象ファイルが他の未マージ PR と競合しないか確認

### 実行中

- [ ] ファイル作成時は絶対パスを宣言してから作成
- [ ] セレクタを使う場合は `config/selectors.json` から読み込み
- [ ] secrets をコードやログに露出させていないか確認

### 失敗時

- [ ] エラーメッセージとスタックトレースをログに記録
- [ ] 作業途中のファイルがある場合は状態を明記してコミットしない
- [ ] 原因を特定し、対応方針を決めてから再実行

## 参照ドキュメント

- [references/project-structure.md](references/project-structure.md) — 推奨ディレクトリ構成
- [references/pr-workflow.md](references/pr-workflow.md) — PR 分割テンプレ
- [references/definition-of-done.md](references/definition-of-done.md) — 完了条件チェック
- `docs/requirements.md` — 要件定義書
- `docs/design.md` — 詳細設計書
- `docs/wbs.md` — 実装 WBS
