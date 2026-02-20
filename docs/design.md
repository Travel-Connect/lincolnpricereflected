# 詳細設計書 — Lincoln Price Reflected

> **更新日**: 2026-02-20
> **ステータス**: Runner (PARSE〜STEPC) 実装・テスト完了。Web GUI 未着手。

## 1. システムアーキテクチャ

### 1.1 全体構成図
```
┌─────────────────────────────────────────────────────┐
│                    apps/web (Next.js)  ※未着手       │
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
         │  (lincoln schema)   │
         │  ┌────────────────┐ │
         │  │ PostgreSQL     │ │
         │  │ - facilities   │ │
         │  │ - jobs         │ │
         │  │ - job_steps    │ │
         │  │ - job_expected │ │
         │  │   _ranks       │ │
         │  └────────────────┘ │
         │  ┌────────────────┐ │
         │  │ Storage        │ │
         │  │ - lincoln-     │ │
         │  │   excel-uploads│ │
         │  │ - lincoln-     │ │
         │  │   artifacts    │ │
         │  └────────────────┘ │
         └──────────┬──────────┘
                    │
┌───────────────────┼──────────────────────────────────┐
│            apps/runner (TypeScript + Playwright)      │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐       │
│  │ PARSE  │→│ STEPA  │→│ STEP0  │→│ STEPB  │       │
│  │ Excel  │ │Facility│ │Calendar│ │ Bulk   │       │
│  │ Parse  │ │ Check  │ │ Inject │ │ Copy   │       │
│  └────────┘ └────────┘ └────────┘ └───┬────┘       │
│                                       ↓             │
│                                  ┌────────┐         │
│                                  │ STEPC  │         │
│                                  │ Output │         │
│                                  │Verify  │         │
│                                  └────────┘         │
│  ┌──────────────────────────────────────────────┐   │
│  │  Shared: Auth, Selectors, Supabase, Retry    │   │
│  └──────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

### 1.2 ディレクトリ構成（実装済み）
```
lincolnpricereflected/
├── apps/
│   ├── web/                           # Next.js (※未着手)
│   └── runner/                        # Playwright 自動化 (実装済み)
│       ├── src/
│       │   ├── main.ts                # エントリポイント
│       │   ├── auth/                  # 認証モジュール
│       │   │   ├── index.ts           # re-export
│       │   │   ├── login.ts           # ログイン処理
│       │   │   ├── two-factor.ts      # 2FA 待機
│       │   │   ├── facility-switch.ts # 施設切替
│       │   │   └── session.ts         # セッション管理
│       │   ├── steps/                 # 各処理ステップ
│       │   │   ├── index.ts           # ステップレジストリ
│       │   │   ├── step-parse.ts      # PARSE: Excel パース
│       │   │   ├── step-a.ts          # STEPA: 施設ID検証
│       │   │   ├── step0.ts           # STEP0: カレンダーランク反映
│       │   │   ├── step0-helpers.ts   # STEP0: Supabase/DOM操作
│       │   │   ├── step-b.ts          # STEPB: 料金ランク一括設定
│       │   │   ├── step-c.ts          # STEPC: 出力+突合検証
│       │   │   └── step-c-helpers.ts  # STEPC: xlsx解析+検証ロジック
│       │   ├── parsers/               # Excel パーサ
│       │   │   ├── parse_excel.py     # Python (openpyxl)
│       │   │   ├── excel-reader.ts    # TS ラッパー
│       │   │   └── save-expected-ranks.ts # Supabase 保存
│       │   ├── artifact-writer.ts     # スクショ・ログ保存
│       │   ├── errors.ts             # カスタムエラー型
│       │   ├── facility-lookup.ts     # 施設ID変換
│       │   ├── job-state.ts           # ジョブ状態管理
│       │   ├── network-recorder.ts    # ネットワークログ
│       │   ├── retry.ts              # リトライロジック
│       │   ├── selectors.ts          # selectors.json ローダ
│       │   ├── supabase-client.ts    # Supabase クライアント
│       │   └── verify-facility.ts    # 施設ID検証共通関数
│       ├── tests/                     # ユニットテスト (vitest)
│       │   ├── step-c-helpers.test.ts
│       │   ├── step0-helpers.test.ts
│       │   ├── step-a.test.ts
│       │   ├── facility-lookup.test.ts
│       │   └── step0.test.ts
│       └── package.json
│
├── scripts/                           # デモ・テストスクリプト
│   ├── demo-run.ts                    # 全パイプラインテスト
│   ├── demo-resume.ts                 # resume テスト
│   ├── demo-stepc.ts                  # STEPC 単体テスト
│   ├── web-capture-5070.ts            # 5070 DOM キャプチャ
│   └── ...                            # 各種探索・キャプチャスクリプト
│
├── config/
│   ├── selectors.json                 # 全セレクタ集約 (TBD なし)
│   └── rank-types.json                # ランクタイプ定義
│
├── supabase/
│   └── migrations/
│       ├── 20260218000001_facilities.sql
│       ├── 20260218000002_jobs.sql
│       ├── 20260218000003_plans.sql
│       ├── 20260218000004_storage.sql
│       └── 20260218000005_schema_grants.sql
│
├── data/
│   ├── artifacts/                     # ジョブ生成物 (ローカル)
│   │   └── job-{uuid}/               # ジョブごとのディレクトリ
│   │       ├── *.png                  # スクリーンショット
│   │       ├── *.xlsx                 # 出力 xlsx
│   │       └── STEPC-verification.txt # 検証結果テキスト
│   └── chrome-profile/               # 永続化ブラウザプロファイル
│
├── docs/
│   ├── requirements.md
│   └── design.md                      # (本書)
│
└── package.json                       # monorepo root
```

---

## 2. データベース設計

> スキーマ: `lincoln`（OTAlogin の `public` と分離）

### 2.1 ER図
```
facilities 1──* facility_aliases
facilities 1──* jobs
jobs       1──* job_steps
jobs       1──* job_expected_ranks
jobs       1──* artifacts
```

### 2.2 テーブル定義

#### job_expected_ranks (パース済みランク)
| カラム | 型 | 制約 | 説明 |
|--------|-----|------|------|
| id | uuid | PK | |
| job_id | uuid | FK → jobs.id ON DELETE CASCADE | |
| date | date | NOT NULL | 対象日付 |
| room_type | text | NOT NULL | 部屋タイプ名 (Excel B列の値そのまま) |
| rank_code | text | NOT NULL | ランクコード (A〜Z 等) |
| created_at | timestamptz | default now() | |

> 他テーブル (facilities, jobs, job_steps, artifacts) は変更なし。

---

## 3. 処理詳細設計（実装済み）

### 3.1 ジョブ状態遷移

```
PENDING → RUNNING → SUCCESS
                  → FAILED → (resume) → RUNNING → ...
```

ステップ遷移:
```
null → PARSE → STEPA → STEP0 → STEPB → STEPC → DONE
```

### 3.2 認証モジュール (`apps/runner/src/auth/`)

#### ログイン (`login.ts`)
```
1. https://www.tl-lincoln.net/accomodation/Ascsc1000InitAction.do へ遷移
2. ログインID/PW を入力してログインボタンクリック
3. 遷移先 URL で結果判定:
   - トップページ → ログイン成功
   - 2FA ページ → needs2FA: true を返却
   - エラーメッセージ → 例外スロー
```

#### 2FA 待機 (`two-factor.ts`)
```
1. 2FA 入力画面を検知 (input.cFormTextInputMiddle)
2. コンソールに「2FA 入力待ち」を表示
3. ユーザーがブラウザで手動入力 → 遷移完了を検知
4. タイムアウト: 5分
```

#### 施設切替 (`facility-switch.ts`)
```
1. トップページの施設切替入力欄 (input.cFormTextInputSwitch) にフォーカス
2. 施設名キーワードを入力 → jQuery UI autocomplete 候補から選択
3. 選択で Ascsc1010SwitchAction.do へフォーム送信
4. ★ 初回は MASC1042 (二重ログインエラー) が頻出
5. エラー検知 → 同じ操作を再試行 → 強制切替成功
6. ヘッダーの施設IDで切替成功を確認
```

### 3.3 PARSE — Excel パース (`step-parse.ts`)

#### 処理フロー
```
1. Python (parse_excel.py) を subprocess で実行
   - openpyxl で横カレンダーシートを解析
   - ファイル名から施設名候補を正規表現で抽出
   - 行4以降: B列=部屋タイプ名, C列以降=ランクコード
   - 行3: 日付ヘッダー (datetime 型)
2. JSON 形式で結果を標準出力
3. TypeScript (excel-reader.ts) で受け取り
4. save-expected-ranks.ts で Supabase job_expected_ranks に保存
   - 500行ずつバッチ insert (Supabase max_rows 制約対応)
```

#### 入力 Excel 構造 (横カレンダーシート)
```
     B列          C列    D列    E列  ...
行3  (日付基準)   2/1    2/2    2/3  ...
行4  和室コンド(単泊)  V      V      U   ...
行5  和室コンド(連泊)  V      V      T   ...
行6  和室コンド5名(単泊)  V   V      U   ...
行7  和室コンド5名(連泊)  V   V      T   ...
行8  0 (終端)
```

### 3.4 STEPA — 施設ID一致チェック (`step-a.ts`)

#### 処理フロー (実装済み)
```
1. Lincoln トップページ (6800系) へ遷移
2. ヘッダーの dl.g_header_id dd から施設IDテキスト取得
3. Supabase facilities テーブルから期待する lincoln_id を取得
4. 一致 → 次へ / 不一致 → FacilityMismatchError で即停止
```

### 3.5 STEP0 — カレンダーランク反映 (`step0.ts`, `step0-helpers.ts`)

#### 重要な DOM 知見
Lincoln 6800 カレンダーは **日レベル** (1日1ランク)。部屋タイプ別ではない。

```
カレンダーセル構造（実際の DOM）:
<a class="calendarTableBtn c_rank_X" style="background-color:...">
  <span class="calendar_table_day">18</span>
  <span class="calendarTableRank">[X]</span>
  <input name="inputTargetDate" value="20260218">     ← 日付 (YYYYMMDD)
  <input name="inputPriceRankCd" value="X">            ← 現在のランク
  <input name="defaultInputPriceRankCd" value="X">     ← 変更検知用 (※更新禁止)
  <input name="inputPriceRankNm" value="[X]">
  <input name="inputRankStyleText" value="...">
  <input name="inputSalesStopSetFlg" value="">
</a>
```

> **重要**: `defaultInputPriceRankCd` は **更新してはならない**。
> Lincoln の `doUpdate()` は `inputPriceRankCd` と `defaultInputPriceRankCd` を比較して変更を検知する。
> 両方を同じ値にすると「変更なし」と判定され、保存が無効になる。

#### ランクスタイル収集
ランクパレットボタン (`a.rankBtn[data-id]`) から CSS を収集:
```typescript
// step0-helpers.ts: collectRankStyles()
document.querySelectorAll(rankPaletteBtnSelector).forEach(btn => {
  const rankId = btn.getAttribute("data-id");
  if (rankId) styleMap[rankId] = btn.getAttribute("style") || "";
});
```

#### 処理フロー (実装済み)
```
1. Supabase から expected ranks を取得 → RankMap (date→roomType→rankCode)
2. RankMap を日レベルに平坦化: rankMapToDateRank() → {date: rankCode}
   ※ 最初の roomType のランクを使用（カレンダーは日レベルのため）
3. 6800 カレンダー一覧へ遷移
4. 「テストカレンダー」をクリック → カレンダー詳細
5. 期間終了日を max_date に設定 → 再描画待ち
6. ランクパレットからスタイルを収集 (29種確認済み)
7. page.evaluate(updateCalendarCells, {dateRanks, styleMap, sel})
   - 全 a.calendarTableBtn を走査
   - inputTargetDate の value (YYYYMMDD) から日付キーを生成
   - 期待するランクがあればアンカーのclass/style/hidden inputsを更新
8. doUpdate() ダイアログを accept して保存
   ★ page.on('dialog', d => d.accept()) が必須
   ★ Playwright はデフォルトで dismiss → 保存サイレント失敗を防ぐ
```

### 3.6 STEPB — 料金ランク一括設定 (`step-b.ts`)

#### 処理フロー (実装済み)
```
1. 5050 (Ascsc5050InitAction.do) へ遷移
2. 施設ID検証
3. 月範囲を算出 (expected_ranks の min〜max date)
4. 各月について:
   a. プラングループセット「カレンダーテスト」を選択
   b. コピー元に「テストカレンダー」を autocomplete 入力
   c. doCopy() クリック → コピー完了待ち
   d. 最終月以外: doSend(true) = 「送信して続ける」
      最終月: doSend(false) = 「送信して閉じる」
   e. confirm ダイアログ「送信します。よろしいですか？」→ accept
   f. 通知ダイアログ「処理を受け付けました。」→ accept
   g. ポップアップウィンドウ (Comsc0040) を検知して閉じる
   h. 翌月ボタンで次月へ遷移
```

#### confirm / popup ハンドリング
```typescript
// 全ダイアログを自動 accept
page.on("dialog", async (d) => { await d.accept(); });
// ポップアップウィンドウを自動 close
context.on("page", async (newPage) => { await newPage.close(); });
```

### 3.7 STEPC — 出力→突合検証 (`step-c.ts`, `step-c-helpers.ts`)

#### 出力フロー (実装済み)
```
1. 5070 (Ascsc5070InitAction.do) へ遷移
2. 施設ID検証
3. 出力期間: 本日 ～ 2ヶ月後末日を設定
4. 検索ボタンクリック → プラン一覧表示
5. Dual-list でプラン選択:
   - 右側 select#sectionTableSelect2 (利用可能) からプランを選択
   - ← ボタン (#sectionTableBtn3) で左側 (出力対象) に移動
6. 「ランクのみ出力」チェックボックスを JS で操作:
   ★ カスタムスタイルで非表示 → Playwright の .check() は使えない
   ★ page.evaluate() で cb.checked=true, イベント発火, hidden input 設定
7. doOutput() クリック → page.waitForEvent("download")
8. ダウンロード完了 → artifacts/job-{id}/ に保存
```

#### 出力 xlsx 構造
```
Row 1: "出力期間:2026年02月20日～2026年04月30日"
Row 2: (空)
Row 3: "ネット室タイプグループ" | "プラングループ"

--- プランブロック (5行 × N ブロック) ---
Row N+0: [roomType(A)] | [planName(B)] | "月日" | 02/20 | 02/21 | ...
Row N+1:                               |  ""    |  売   |  売   | ...
Row N+2:                               | "販売室数" | 1  |  0    | ...
Row N+3:                               | "ランク"   | R  |  W    | ...  ← ★ここが検証対象
Row N+4: (空セパレータ)

マージセル:
  A列: ネット室タイプグループ名 (複数ブロックにまたがる)
  B列: プラン名 (5行分)
```

#### Room type マッピング
出力 xlsx の (ネット室タイプグループ + プラン名) → 入力 Excel の room_type:

| 出力 roomType | プラン名に含む | → 入力 room_type |
|---|---|---|
| 和室コンド | 単泊 | 和室コンド(単泊) |
| 和室コンド | 連泊 | 和室コンド(連泊) |
| 和室コンド ～5名仕様～ | 単泊 | 和室コンド5名(単泊) |
| 和室コンド ～5名仕様～ | 連泊 | 和室コンド5名(連泊) |

マッピング設定は `RoomTypeMapping` インターフェースで施設ごとに定義可能。

#### 突合検証ロジック (実装済み)
```typescript
// step-c-helpers.ts

// 1. parseOutputXlsx(filePath, roomTypeMapping)
//    - xlsx (SheetJS) でファイル読み込み
//    - Row 1 から出力期間 (年月日) を解析
//    - "月日" 行でプランブロック開始を検出
//    - マージセルから roomType/planName を解決
//    - "ランク" 行からランクコードを抽出
//    - MM/DD → YYYY-MM-DD 変換 (年は期間ヘッダーから推定)

// 2. verifyRanks(expectedRankMap, parsedOutput)
//    - 出力期間内の全エントリを比較
//    - 一致/不一致/欠落をカウント
//    - 不一致詳細 (日付, roomType, expected, actual) を記録
//    - 結果を STEPC-verification.txt に保存
//    - 不一致あり → VerificationFailedError スロー

interface VerificationResult {
  totalChecked: number;
  matchCount: number;
  mismatchCount: number;
  missingInExpected: number;
  missingInActual: number;
  mismatches: MismatchDetail[];
  summary: string;          // テキスト形式の検証結果
}
```

---

## 4. セレクタ設計

全セレクタは `config/selectors.json` に集約。TBD は **すべて解決済み** (2026-02-18)。

主要セクション:
- `auth`: ログインフォーム, 2FA, エラーメッセージ
- `navigation`: ページ遷移リンク
- `facilitySwitch`: 施設切替 autocomplete
- `step0`: 6800 カレンダー DOM (ランクアンカー, パレット, 期間ドロップダウン, 保存ボタン)
- `stepA`: 施設ID テキスト
- `stepB`: 5050 一括設定 (コピー, 送信, 月ナビ, プラングループセット)
- `stepC`: 5070 出力 (日付, 検索, dual-list, ランクのみチェック, 出力ボタン)

---

## 5. 施設固有設定

### 5.1 畳の宿 那覇壺屋 (Y77131) — テスト済み

| 設定項目 | 値 |
|---|---|
| テストカレンダー名 | テストカレンダー |
| テストプラングループセット | カレンダーテスト (ID: 491885) |
| STEPC 出力プラン (テスト用) | `6,46` (和室コンド/カレンダーテスト), `5,47` (和室コンド5名/カレンダーテスト) |
| STEPC 出力プラン (本番用) | 施設設定により可変 |
| Room type mapping | 和室コンド → 和室コンド, 和室コンド ～5名仕様～ → 和室コンド5名 |

### 5.2 OutputPlan インターフェース

```typescript
interface OutputPlan {
  value: string;  // "roomTypeId,planId" (e.g. "6,46")
  label: string;  // 表示名
}

interface StepCOptions {
  outputPlans?: OutputPlan[];
  roomTypeMapping?: RoomTypeMapping;
  skipVerification?: boolean;
}
```

---

## 6. テスト実績

### 6.1 全パイプラインテスト (2026-02-20)

**Excel**: 【畳の宿那覇壺屋様】料金変動案_20260212.xlsx
**プラン**: カレンダーテスト (テスト用)

| ステップ | 結果 | 詳細 |
|---|---|---|
| PARSE | OK | 1460 entries, 4 room types, 365 dates |
| STEPA | OK | Y77131 一致 |
| STEP0 | OK | 347 cells 更新 |
| STEPB | OK | 12ヶ月送信完了 |
| STEPC | OK | **140/140 完全一致** |

### 6.2 ユニットテスト

```
apps/runner/tests/step-c-helpers.test.ts  — 10 tests passed
apps/runner/tests/step0-helpers.test.ts   — passed
apps/runner/tests/facility-lookup.test.ts — passed
```

---

## 7. エラーハンドリング設計

### 7.1 エラー分類 (`errors.ts`)
| エラー種別 | クラス名 | 対処 |
|-----------|----------|------|
| セレクタ未定義 | SelectorTBDError | 即停止 |
| セレクタ不存在 | SelectorNotFoundError | 即停止 |
| 施設ID不一致 | FacilityMismatchError | 即停止、期待値と実値をログ |
| 検証失敗 | VerificationFailedError | 即停止、不一致詳細をファイル保存 |
| 操作タイムアウト | OperationTimeoutError | リトライ対象 |
| ネットワークエラー | NetworkError | リトライ対象 |
| 2FAタイムアウト | TwoFactorTimeoutError | 即停止 |
| リトライ超過 | RetryExhaustedError | 即停止 |

### 7.2 Artifacts 保存
- スクリーンショット: `data/artifacts/job-{id}/{step}_{timestamp}.png`
- HTML: `data/artifacts/job-{id}/{step}_{timestamp}.html`
- 出力 xlsx: `data/artifacts/job-{id}/PriceData_{timestamp}.xlsx`
- 検証結果: `data/artifacts/job-{id}/STEPC-verification.txt`

---

## 8. 環境変数

| 変数名 | 用途 |
|--------|------|
| LINCOLN_LOGIN_ID | Lincoln ログインID |
| LINCOLN_LOGIN_PW | Lincoln ログインPW |
| SUPABASE_URL | Supabase プロジェクトURL |
| SUPABASE_SERVICE_ROLE_KEY | Supabase サービスロールキー |

---

## 9. 依存ライブラリ

### Runner (`apps/runner/package.json`)
| パッケージ | 用途 |
|---|---|
| playwright | ブラウザ自動化 |
| @supabase/supabase-js | DB アクセス |
| dotenv | 環境変数 |
| xlsx (SheetJS) | 出力 xlsx パース (STEPC) |
| vitest | テスト |
| tsx | TypeScript 実行 |

### Python (`apps/runner/src/parsers/`)
| パッケージ | 用途 |
|---|---|
| openpyxl | 入力 Excel パース |

---

## 10. 未実装・今後の課題

| 項目 | 状態 | 備考 |
|---|---|---|
| Web GUI (Next.js) | 未着手 | アップロード, ジョブモニタ, 施設選択 |
| 施設別プラン設定 DB 化 | 未実装 | 現在はコード内にハードコード |
| 3ヶ月超の出力期間分割 | 未実装 | 現在は2ヶ月分のみ出力 |
| 本番プラングループセット対応 | テスト時制限 | 安全ルールに基づきカレンダーテストのみ |
| Supabase Realtime 連携 | 未実装 | ステップ進捗のリアルタイム通知 |
