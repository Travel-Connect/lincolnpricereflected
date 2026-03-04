# Review Pack 生成手順

## 概要

Review Pack は、ChatGPT に Lincoln Price Reflected の UI/システムレビューを依頼するための
証跡一式（仕様書・設定・ジョブ結果・スクリーンショット）を自動で収集・パッケージングするツールです。

## 前提条件

- Node.js 22+ がインストール済み
- `C:\lincolnpricereflected` にリポジトリがクローン済み
- `.env` に `SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` が設定済み
- `npm install` 実行済み

## 実行方法

### 最新ジョブを対象に生成

```bash
cd C:\lincolnpricereflected
npm run review:pack -- --latest
```

### 特定ジョブを対象に生成

```bash
npm run review:pack -- --job-id <uuid>
```

### オプション一覧

| オプション | 説明 | デフォルト |
|-----------|------|-----------|
| `--latest` | 最新の成功ジョブ（なければ最新ジョブ）を対象 | — |
| `--job-id <uuid>` | 指定ジョブIDを対象 | — |
| `--with-ui-screens` | UIスクリーンショット格納用フォルダを準備 | false |
| `--include-artifacts <mode>` | `safe` / `all` / `none` | safe |

**Artifacts モード:**
- `safe` (既定): スクリーンショット(.png)と Excel(.xlsx) のみ。HTML ダンプ(.html)と Network ログ(.jsonl) は Cookie やヘッダー情報を含む可能性があるため除外。
- `all`: 全 artifact を含む。**機密注意**の警告ファイルが追加されます。
- `none`: artifact を含まない。

## 出力先

```
C:\lincolnpricereflected\data\review-packs\<YYYYMMDD-HHMMSS>\
├── manifest.json
├── review_context.md
├── review_request.md
├── redactions_report.md
├── create-zip.ps1
├── docs/
├── config/
├── system_snapshot/
├── job_snapshot/
└── ui_screens/
```

> 全ての生成物は `C:\lincolnpricereflected` 配下に出力されます。
> プロジェクト外へのファイル生成はコード上で禁止されています。

## ZIP 化

生成後に ZIP を作成するには:

```powershell
cd C:\lincolnpricereflected\data\review-packs\<YYYYMMDD-HHMMSS>
powershell -ExecutionPolicy Bypass -File create-zip.ps1
```

ZIP ファイルは `C:\lincolnpricereflected\data\review-packs\` 直下に `<YYYYMMDD-HHMMSS>.zip` として出力されます。

## ChatGPT にレビューを依頼する

1. 上記手順で Review Pack を生成
2. `create-zip.ps1` で ZIP 化
3. ChatGPT を開く
4. ZIP ファイルを添付
5. `review_request.md` の内容をコピーしてプロンプトに貼り付け
6. 送信

### 貼り付け用テンプレート

`docs/review/chatgpt_review_prompt_template.md` にテンプレートがあります。
Review Pack 生成時にも `review_request.md` が自動で同梱されるので、
通常はそちらを使ってください。

## 機密チェック

Review Pack 生成時に以下の自動チェックが実行されます:

1. **ファイル名チェック**: `.env`, `secret`, `cookie`, `token` 等のパターンを含むファイルは自動除外
2. **内容チェック**: JSON/MD/TXT 内の JWT トークンパターン、Service Role Key 参照を検出
3. **DB 取得時**: `user_id` (PII) は自動除外、認証情報系カラムは取得しない
4. **safe モード**: HTML ダンプ（Cookie含む可能性）、Network ログ（ヘッダー含む可能性）を除外

除外結果は `redactions_report.md` に記録されます。

## UI スクリーンショット

`--with-ui-screens` を指定すると `ui_screens/` フォルダが準備されます。
現時点では手動でスクリーンショットを格納する運用です。

### 推奨スクリーンショット

| ファイル名 | 画面 |
|-----------|------|
| `01_login.png` | ログイン画面 |
| `02_job_new_step1.png` | 新規ジョブ: ファイルアップロード |
| `03_job_new_step2.png` | 新規ジョブ: 処理B設定 |
| `04_job_new_step3.png` | 新規ジョブ: 最終確認 |
| `05_job_detail_running.png` | ジョブ詳細: 実行中 |
| `06_job_detail_success.png` | ジョブ詳細: 成功 |
| `07_history.png` | 実行履歴 |
| `08_settings.png` | 設定 |

## トラブルシューティング

### `Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY`

`.env` が正しく設定されているか確認:
```bash
cat .env | grep SUPABASE
```

### `ジョブが見つかりません`

DB にジョブレコードが存在するか確認。`--latest` は全ジョブから探します。
特定のジョブを指定する場合は Web UI のジョブ詳細ページで UUID を確認してください。

### 生成物が `C:\lincolnpricereflected` 外に出る

ツールがパス検証でエラーを出します。`data/review-packs/` は `.gitignore` で
追跡対象外にしてください。

### `Path validation failed` / `パス検証エラー`

生成スクリプトはすべての出力パスが `C:\lincolnpricereflected` 配下であることを検証します。
シンボリックリンクやジャンクションにより実体パスがプロジェクト外になる場合、
このエラーが発生します。出力先ディレクトリのパスを確認してください。
