# ローカル開発セットアップ

## 前提条件

- Node.js v22+ (npm 11+)
- Python 3.12+ / uv（Excel パーサ用）
- Supabase CLI
- Playwright

## セットアップ手順

### 1. リポジトリクローン

```bash
git clone https://github.com/Travel-Connect/lincolnpricereflected.git C:\lincolnpricereflected
cd C:\lincolnpricereflected
```

### 2. 環境変数

```bash
cp .env.example .env
# .env を編集して各値を設定
```

### 3. Web (Next.js)

```bash
npm install --force  # 初回はネイティブバイナリ解決のため --force が必要
npm run dev          # http://localhost:3000
```

### 4. Runner (Playwright)

```bash
cd apps/runner
npx playwright install chromium   # ブラウザインストール
npx tsx src/main.ts --job-id <uuid>  # Runner 実行
```

### 5. Supabase (ローカル)

```bash
npx supabase start      # ローカル Supabase 起動
npx supabase db reset   # マイグレーション + シード適用
```

## ディレクトリ制約

**すべての成果物は `C:\lincolnpricereflected` 配下に作成すること。**

ログ、スクリーンショット、生成 CSV 等の一時ファイルは `data/artifacts/` に保存する。
`C:\lincolnpricereflected` 外へのファイル作成は禁止。
