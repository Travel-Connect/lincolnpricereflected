# 詳細設計書 — Lincoln Price Reflected

## 1. システムアーキテクチャ

### 1.1 全体構成図
```
┌─────────────────────────────────────────────────────┐
│                    apps/web (Next.js)                │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐           │
│  │ Upload   │ │ Job      │ │ Facility  │           │
│  │ Page     │ │ Monitor  │ │ Selector  │           │
│  └────┬─────┘ └────┬─────┘ └─────┬─────┘           │
│       │            │             │                   │
│  ┌────┴────────────┴─────────────┴──────┐           │
│  │         API Routes (Next.js)          │           │
│  └────────────────┬──────────────────────┘           │
└───────────────────┼──────────────────────────────────┘
                    │
         ┌──────────┴──────────┐
         │   Supabase          │
         │  ┌────────────────┐ │
         │  │ PostgreSQL     │ │
         │  │ - facilities   │ │
         │  │ - jobs         │ │
         │  │ - job_steps    │ │
         │  └────────────────┘ │
         │  ┌────────────────┐ │
         │  │ Storage        │ │
         │  │ - excel_uploads│ │
         │  │ - artifacts    │ │
         │  └────────────────┘ │
         └──────────┬──────────┘
                    │
┌───────────────────┼──────────────────────────────────┐
│            apps/runner (Playwright)                    │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐│
│  │ Step 0  │ │ Step A   │ │ Step B   │ │ Step C   ││
│  │ Calendar│ │ Facility │ │ Bulk     │ │ Verify   ││
│  │ Import  │ │ Check    │ │ Copy     │ │ Output   ││
│  └─────────┘ └──────────┘ └──────────┘ └──────────┘│
│  ┌──────────────────────────────────────────────────┐│
│  │             Shared: Auth, Selectors, Retry       ││
│  └──────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

### 1.2 ディレクトリ構成
```
lincolnpricereflected/
├── apps/
│   ├── web/                    # Next.js フロントエンド
│   │   ├── src/
│   │   │   ├── app/            # App Router
│   │   │   │   ├── page.tsx    # ダッシュボード
│   │   │   │   ├── upload/     # Excel アップロード
│   │   │   │   ├── jobs/       # ジョブ一覧・詳細
│   │   │   │   └── api/        # API Routes
│   │   │   ├── components/     # UI コンポーネント
│   │   │   └── lib/            # ユーティリティ
│   │   ├── package.json
│   │   └── next.config.js
│   │
│   └── runner/                 # Playwright 自動化
│       ├── src/
│       │   ├── main.ts         # エントリポイント
│       │   ├── steps/          # 各処理ステップ
│       │   │   ├── step0-calendar-import.ts
│       │   │   ├── stepA-facility-check.ts
│       │   │   ├── stepB-bulk-copy.ts
│       │   │   └── stepC-verify-output.ts
│       │   ├── auth/           # ログイン・2FA・施設切替
│       │   │   ├── login.ts
│       │   │   ├── two-factor.ts
│       │   │   └── facility-switch.ts
│       │   ├── parsers/        # Excel パーサ
│       │   │   ├── excel-reader.ts (or .py via uv)
│       │   │   └── rank-matrix.ts
│       │   ├── selectors.ts    # selectors.json ローダ + TBD ガード
│       │   ├── retry.ts        # リトライロジック
│       │   ├── artifacts.ts    # スクショ・ログ保存
│       │   └── job-state.ts    # ジョブ状態管理(resume)
│       ├── package.json
│       └── playwright.config.ts
│
├── supabase/
│   ├── migrations/             # DDL マイグレーション
│   └── seed.sql                # 施設マスタ初期データ
│
├── config/
│   └── selectors.json          # 全セレクタ集約
│
├── docs/
│   ├── requirements.md
│   ├── design.md
│   ├── selectors_catalog.md
│   └── wbs.md
│
├── package.json                # monorepo root (workspaces)
└── turbo.json                  # Turborepo 設定(optional)
```

## 2. データベース設計

### 2.1 ER図概要
```
facilities 1──* facility_aliases
facilities 1──* jobs
jobs       1──* job_steps
jobs       1──* artifacts
```

### 2.2 テーブル定義

#### facilities (施設マスタ)
| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | uuid | PK, default gen_random_uuid() | 内部ID |
| lincoln_id | varchar(10) | UNIQUE, NOT NULL | Lincoln施設ID (e.g. I38347) |
| name | text | NOT NULL | 施設正式名 |
| created_at | timestamptz | default now() | 作成日時 |
| updated_at | timestamptz | default now() | 更新日時 |

#### facility_aliases (施設エイリアス)
| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | uuid | PK | 内部ID |
| facility_id | uuid | FK → facilities.id | 施設参照 |
| alias | text | NOT NULL | エイリアス名 (e.g. "畳の宿那覇壺屋", "畳の宿") |
| created_at | timestamptz | default now() | 作成日時 |

UNIQUE(facility_id, alias)

#### jobs (ジョブ管理)
| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | uuid | PK | ジョブID |
| facility_id | uuid | FK → facilities.id | 対象施設 |
| status | text | NOT NULL, CHECK(status IN ('PENDING','RUNNING','SUCCESS','FAILED','CANCELLED')) | ジョブ状態 |
| last_completed_step | text | CHECK(step IN ('PARSE','STEP0','STEPA','STEPB','STEPC','DONE')) | 最後に完了したステップ |
| excel_file_path | text | NOT NULL | Supabase Storage パス |
| excel_original_name | text | | 元ファイル名 |
| stay_type | text | CHECK(stay_type IN ('A','B')) | A=単泊, B=連泊 (ユーザー手動設定) |
| target_period_from | date | | 対象期間（開始） |
| target_period_to | date | | 対象期間（終了） |
| summary_json | jsonb | | 実行前サマリ |
| result_json | jsonb | | 検証結果 |
| retry_count | int | default 3 | 最大リトライ回数 |
| created_at | timestamptz | default now() | 作成日時 |
| updated_at | timestamptz | default now() | 更新日時 |

#### job_steps (ステップ実行ログ)
| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | uuid | PK | |
| job_id | uuid | FK → jobs.id | |
| step | text | NOT NULL | PARSE, STEP0, STEPA, STEPB, STEPC |
| status | text | NOT NULL | PENDING, RUNNING, SUCCESS, FAILED |
| attempt | int | default 1 | 試行回数 |
| started_at | timestamptz | | 開始日時 |
| completed_at | timestamptz | | 完了日時 |
| error_message | text | | エラーメッセージ |
| metadata_json | jsonb | | ステップ固有のメタデータ |

#### artifacts (成果物・エビデンス)
| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | uuid | PK | |
| job_id | uuid | FK → jobs.id | |
| step | text | NOT NULL | 対象ステップ |
| type | text | NOT NULL | screenshot, html, network_log, verification_csv |
| storage_path | text | NOT NULL | Supabase Storage パス |
| created_at | timestamptz | default now() | |

### 2.3 Supabase Storage バケット
| バケット | 用途 |
|----------|------|
| excel-uploads | アップロードされたExcelファイル |
| artifacts | スクリーンショット・HTML・ログ・検証結果CSV |

## 3. 処理詳細設計

### 3.1 共通: ジョブ状態遷移
```
PENDING → RUNNING → SUCCESS
                  → FAILED → (resume) → RUNNING → ...
```

ステップ遷移:
```
null → PARSE → STEP0 → STEPA → STEPB → STEPC → DONE
```

resume 時は `last_completed_step` の次のステップから再開。

### 3.2 共通: セレクタ読み込み

```typescript
// apps/runner/src/selectors.ts
import selectors from '../../../config/selectors.json';

export function getSelector(path: string): string {
  // path example: "stepB.copyButton"
  const parts = path.split('.');
  let current: any = selectors;
  for (const part of parts) {
    current = current[part];
    if (!current) {
      throw new SelectorNotFoundError(`Selector not found: ${path}`);
    }
  }
  if (current === "TBD") {
    throw new SelectorTBDError(
      `Selector "${path}" is TBD. Cannot proceed until selector is defined in config/selectors.json.`
    );
  }
  return current;
}
```

**TBDガード**: セレクタが "TBD" の場合は `SelectorTBDError` をスローし、安全に停止。

### 3.3 共通: リトライロジック

```typescript
// apps/runner/src/retry.ts
interface RetryOptions {
  maxAttempts: number;    // default: 3
  delayMs: number;        // default: 2000
  backoffFactor: number;  // default: 2
  onRetry?: (attempt: number, error: Error) => void;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  // 指数バックオフでリトライ
  // 全リトライ失敗時は最後のエラーをスロー
}
```

### 3.4 共通: 2FA 検知・待機

```typescript
// apps/runner/src/auth/two-factor.ts
async function handle2FA(page: Page): Promise<void> {
  // 1. 2FA 入力画面を検知（セレクタ TBD → ガード）
  // 2. コンソールに「2FA入力を待っています...」表示
  // 3. page.waitForNavigation or ポーリングで入力完了を検知
  // 4. タイムアウト: 5分（設定可能）
}
```

### 3.5 処理0: コピー元カレンダーへランク反映

#### 処理フロー
```
1. カレンダー詳細画面へ遷移
2. 現在の DOM 状態を取得（monthTables）
3. Excel パース結果と DOM のマッピングを構築
   - 各月テーブル内の日付セル → Excel の日付
   - 各部屋タイプ（roomTypeTitle）→ Excel の部屋タイプ
4. page.evaluate で DOM を更新:
   - inputPriceRankCd を新ランクコードに
   - inputPriceRankNm を新ランク名に
   - inputRankStyleText を新スタイルに
   - defaultInputPriceRankCd は変更しない（差分検知用）
5. 保存/送信ボタンをクリック（セレクタ TBD → ガード）
6. 保存完了を確認（レスポンス or DOM変化）
```

#### DOM更新ロジック（lincolnリポジトリから移植）
```typescript
// page.evaluate 内で実行
function updateCalendarRanks(updates: RankUpdate[]) {
  // updates: [{ date, roomType, rankCd, rankNm, rankStyle }]
  const tables = document.querySelectorAll('table.calendarTable');
  // 各テーブルの roomTypeTitle から部屋タイプを特定
  // 各日付セルの .calendar_table_day から日付を特定
  // 一致するセルの hidden input を更新
  // rankAnchor のテキストとスタイルも更新（視覚フィードバック）
}
```

### 3.6 処理A: 施設ID一致チェック

#### 処理フロー
```
1. 6800 detail 画面へ遷移
2. facilityIdText (dl.g_header_id dd) からテキスト取得
3. 取得したIDを trim して期待する施設IDと比較
4. 一致 → 処理B へ
5. 不一致 → SelectorTBDError ではなく FacilityMismatchError をスローし即停止
```

### 3.7 処理B: 料金ランク一括設定

#### 処理フロー
```
1. 5050 画面へ遷移
2. コピー元カレンダーを選択（autoComplete 系セレクタ使用）
3. copyButton をクリック
4. レスポンス待ち
5. sendContinueButton をクリック
6. レスポンス待ち
7. 全対象について 2-6 を繰り返し
```

#### 注意点
- autoComplete の候補選択は `ul#ui-id-1 li.ui-menu-item a` をクリック
- 送信継続（doSend(true)）は「次のカレンダーへ続けて処理」の意味

### 3.8 処理C: 出力→突合検証

#### 処理フロー
```
1. 5070 画面へ遷移
2. 期間設定:
   - 対象期間が3ヶ月超の場合は3ヶ月ずつに分割
   - fromYear/fromMonth/fromDay, toYear/toMonth/toDay を select で設定
3. planGroupPickerButton をクリックしてプラングループ選択
4. 「ランクのみ出力」トグルを有効化（セレクタ TBD → ガード）
5. outputButton をクリック
6. ダウンロード完了を検知
7. ダウンロードしたファイルを解析
8. Excel 入力データと突合:
   - 日付 × 部屋タイプ × ランクコード の全組み合わせを比較
   - 完全一致: SUCCESS
   - 1件でも不一致: FAILED、不一致詳細をログ/CSV/JSON保存
```

#### 突合ロジック
```typescript
interface VerificationResult {
  status: 'SUCCESS' | 'FAILED';
  totalEntries: number;
  matchedEntries: number;
  mismatchedEntries: MismatchEntry[];
}

interface MismatchEntry {
  date: string;
  roomType: string;
  expectedRank: string;
  actualRank: string;
}
```

## 4. Excel パーサ設計

### 4.1 パースフロー
```
1. ファイル名から施設名候補を正規表現で抽出
   - /【(.+?)様】/ → 施設名候補
2. Supabase facility_aliases と照合
   - 完全一致 or 部分一致 → facility_id 特定
   - 一致なし → UI で手動選択
3. C4 を起点にデータ矩形を取得
   - 右端: 列方向に走査し、空白セルで終端
   - 下端: 行方向に走査し、空白セルで終端
4. 行ヘッダー: 日付列（C列にある日付データ）
5. 列ヘッダー: 部屋タイプ/ランク名（4行目のヘッダ行）
6. 結果: RankMatrix オブジェクト
```

### 4.2 RankMatrix 型
```typescript
interface RankMatrix {
  facilityNameCandidate: string;
  dates: string[];           // YYYY-MM-DD 形式
  roomTypes: string[];       // 列ヘッダーから
  matrix: Map<string, Map<string, string>>;  // date → roomType → rankCode
}
```

### 4.3 Python (uv) 利用箇所
Excel パースは openpyxl (Python) を使用。uv で依存管理。
TypeScript runner から subprocess で呼び出し、JSON で結果を受け取る。

```
apps/runner/src/parsers/
├── parse_excel.py          # Python スクリプト（uv管理）
├── pyproject.toml          # uv 依存定義
└── excel-reader.ts         # TS ラッパー（subprocess呼び出し）
```

## 5. フロントエンド設計

### 5.1 ページ構成
| パス | 機能 |
|------|------|
| / | ダッシュボード（最近のジョブ一覧） |
| /upload | Excel アップロード + 施設選択 + A/B紐づけ |
| /jobs | ジョブ一覧 |
| /jobs/[id] | ジョブ詳細（ステップ状態・ログ） |

### 5.2 アップロードフロー
```
1. Excel ファイルをドロップ/選択
2. ファイル名から施設名候補を自動抽出・照合
   - 一致: 施設を自動選択（変更可能）
   - 不一致: 施設ドロップダウンで手動選択
3. A(単泊) / B(連泊) をラジオボタンで選択
4. パースプレビュー表示:
   - 変更件数
   - 対象期間
   - 対象施設
   - 対象カレンダー
   - 対象プラングループ/プラン
5. 「実行」ボタン → 確認ダイアログ → ジョブ作成
```

### 5.3 ジョブモニタ
```
ジョブ詳細ページ:
┌─────────────────────────────────────┐
│ Job: abc-123-def                     │
│ Facility: 畳の宿 那覇壺屋 (Y77131)  │
│ Status: RUNNING                      │
│                                      │
│ Steps:                               │
│ ✅ PARSE     completed 10:00:01      │
│ ✅ STEP0     completed 10:00:15      │
│ ✅ STEPA     completed 10:00:20      │
│ 🔄 STEPB     running   10:00:25     │
│ ⬜ STEPC     pending                 │
│                                      │
│ [View Logs] [Cancel] [Resume]        │
└─────────────────────────────────────┘
```

## 6. 環境変数設計

| 変数名 | 用途 | 例 |
|--------|------|-----|
| LINCOLN_LOGIN_ID | Lincoln ログインID | (secret) |
| LINCOLN_LOGIN_PW | Lincoln ログインPW | (secret) |
| SUPABASE_URL | Supabase プロジェクトURL | https://xxx.supabase.co |
| SUPABASE_ANON_KEY | Supabase 匿名キー | eyJ... |
| SUPABASE_SERVICE_ROLE_KEY | Supabase サービスロールキー | eyJ... |
| PLAYWRIGHT_HEADLESS | ヘッドレスモード（通常false） | false |
| RETRY_MAX_ATTEMPTS | リトライ最大回数 | 3 |
| TWO_FACTOR_TIMEOUT_MS | 2FA 入力待ちタイムアウト | 300000 |

## 7. エラーハンドリング設計

### 7.1 エラー分類
| エラー種別 | クラス名 | 対処 |
|-----------|----------|------|
| セレクタ未定義 | SelectorTBDError | 即停止、TBDである旨を表示 |
| セレクタ不一致 | SelectorNotFoundError | 即停止、DOM変更の可能性を示唆 |
| 施設ID不一致 | FacilityMismatchError | 即停止、期待値と実値をログ |
| 検証失敗 | VerificationFailedError | 即停止、不一致詳細をファイル保存 |
| 操作タイムアウト | OperationTimeoutError | リトライ対象 |
| ネットワークエラー | NetworkError | リトライ対象 |
| 2FAタイムアウト | TwoFactorTimeoutError | 即停止、ユーザーに再実行を促す |

### 7.2 artifacts 保存
失敗時に自動保存する情報:
- スクリーンショット: `artifacts/{job_id}/{step}_{timestamp}.png`
- HTML スナップショット: `artifacts/{job_id}/{step}_{timestamp}.html`
- ネットワークログ: `artifacts/{job_id}/{step}_{timestamp}_network.json`
- 検証結果: `artifacts/{job_id}/verification_{timestamp}.csv`
