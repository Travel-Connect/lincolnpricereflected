# 推奨ディレクトリ構成

## ルートレイアウト

```
C:\lincolnpricereflected\
├── apps/
│   ├── web/                    # Next.js (App Router) — Vercel デプロイ
│   │   ├── src/
│   │   │   ├── app/            # App Router ページ
│   │   │   │   ├── page.tsx    # ダッシュボード
│   │   │   │   ├── upload/     # Excel アップロード
│   │   │   │   ├── jobs/       # ジョブ一覧・詳細
│   │   │   │   └── api/        # API Routes
│   │   │   ├── components/     # UI コンポーネント
│   │   │   └── lib/            # ユーティリティ（Supabase クライアント等）
│   │   ├── package.json
│   │   └── next.config.js
│   │
│   └── runner/                 # Playwright 自動化 (Python/TS)
│       ├── src/
│       │   ├── main.ts         # エントリポイント + CLI
│       │   ├── steps/          # 各処理ステップ
│       │   │   ├── step0-calendar-import.ts
│       │   │   ├── stepA-facility-check.ts
│       │   │   ├── stepB-bulk-copy.ts
│       │   │   └── stepC-verify-output.ts
│       │   ├── auth/           # ログイン・2FA・施設切替
│       │   ├── parsers/        # Excel パーサ (Python uv + TS ラッパー)
│       │   ├── selectors.ts    # config/selectors.json ローダ + TBD ガード
│       │   ├── retry.ts        # リトライロジック
│       │   ├── artifacts.ts    # スクショ・ログ保存
│       │   └── job-state.ts    # ジョブ状態管理 (resume)
│       ├── package.json
│       └── playwright.config.ts
│
├── config/
│   └── selectors.json          # 全セレクタ集約（コード直書き禁止）
│
├── supabase/
│   ├── migrations/             # DDL マイグレーション
│   └── seed.sql                # 施設マスタ初期データ
│
├── docs/
│   ├── requirements.md         # 要件定義書
│   ├── design.md               # 詳細設計書
│   ├── selectors_catalog.md    # セレクタ棚卸し
│   └── wbs.md                  # 実装 WBS
│
├── skills/                     # Claude Skills
│   ├── lincoln-price-reflector-dev/
│   ├── lincoln-playwright-runbook/
│   └── excel-horizontal-range-parser/
│
├── data/
│   └── artifacts/              # ジョブ生成物（ローカル、git 管理外）
│
├── package.json                # monorepo root (workspaces)
├── turbo.json                  # Turborepo 設定 (optional)
├── .env.example                # 環境変数テンプレート
├── .gitignore
└── claude.md                   # Claude Code プロジェクト指示
```

## ディレクトリ追加時のルール

1. **必ず `C:\lincolnpricereflected` 配下** に作成する
2. 既存のカテゴリ（apps/ config/ docs/ supabase/）に属するものはそこに配置
3. 一時ファイル・ログ・スクショは `data/artifacts/` に配置
4. `.gitignore` で `data/artifacts/` と `.env` を除外する
5. 新規ディレクトリを作る前に、既存構成で代替できないか検討する
