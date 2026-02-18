# セレクタ棚卸し — Lincoln Price Reflected

## 1. 概要

本ドキュメントは TL-Lincoln の各画面で使用するセレクタを一元管理する。
すべてのセレクタは `config/selectors.json` に集約し、コード内での直書きは禁止する。

### ステータス定義
| ステータス | 意味 |
|-----------|------|
| **CONFIRMED** | 動作確認済み。実装に使用可能 |
| **TBD** | 未取得。実装時はガードで安全に停止 |
| **REFERENCE** | 参考リポジトリ由来。実環境での確認が必要 |

---

## 2. セレクタ一覧

### 2.1 ログイン・認証 (auth)

| キー | セレクタ | ステータス | 備考 |
|------|---------|-----------|------|
| auth.loginUrl | `https://www.tl-lincoln.net/accomodation/Ascsc1000InitAction.do` | CONFIRMED | ログインURL |
| auth.loginIdInput | TBD | TBD | ログインID入力フィールド |
| auth.loginPwInput | TBD | TBD | パスワード入力フィールド |
| auth.loginButton | TBD | TBD | ログインボタン |
| auth.twoFactorInput | TBD | TBD | 2FA入力フィールド |
| auth.twoFactorSubmit | TBD | TBD | 2FA送信ボタン |

### 2.2 施設切替 (facilitySwitch)

| キー | セレクタ | ステータス | 備考 |
|------|---------|-----------|------|
| facilitySwitch.openButton | TBD | **TBD** | 施設切替ダイアログを開くボタン |
| facilitySwitch.searchInput | TBD | **TBD** | 施設検索入力 |
| facilitySwitch.selectItem | TBD | **TBD** | 施設候補選択 |
| facilitySwitch.confirmButton | TBD | **TBD** | 施設切替確定 |

> **優先度: 高** — 全処理に影響するため、早期に取得が必要。

### 2.3 処理0 — カレンダーDOM (step0)

| キー | セレクタ | ステータス | 備考 |
|------|---------|-----------|------|
| step0.monthTables | `table.calendarTable` | REFERENCE | 月カレンダーテーブル群 |
| step0.dayInCell | `.calendar_table_day` | REFERENCE | セル内の日付要素 |
| step0.rankText | `.calendarTableRank` | REFERENCE | ランク表示テキスト |
| step0.roomTypeTitle | `.calendarTableTitle` | REFERENCE | 部屋タイプタイトル |
| step0.rankAnchor | `a.calendarTableBtn` | REFERENCE | ランクリンク |
| step0.inputPriceRankCd | `input[name="inputPriceRankCd"]` | REFERENCE | ランクコード hidden input |
| step0.defaultInputPriceRankCd | `input[name="defaultInputPriceRankCd"]` | REFERENCE | デフォルトランクコード |
| step0.inputPriceRankNm | `input[name="inputPriceRankNm"]` | REFERENCE | ランク名 hidden input |
| step0.inputRankStyleText | `input[name="inputRankStyleText"]` | REFERENCE | ランクスタイル hidden input |
| step0.saveButton | TBD | **TBD** | 保存/送信ボタン |

> **TBD: step0.saveButton** — 処理0の完了に必須。Lincoln カレンダー詳細画面の保存ボタンを特定する必要あり。

### 2.4 処理A — 施設ID確認 (stepA)

| キー | セレクタ | ステータス | 備考 |
|------|---------|-----------|------|
| stepA.facilityIdText | `dl.g_header_id dd` | CONFIRMED | 6800 detail 画面の施設ID表示 |

### 2.5 処理B — 料金ランク一括設定 5050 (stepB)

| キー | セレクタ | ステータス | 備考 |
|------|---------|-----------|------|
| stepB.copyButton | `a[onclick="doCopy()"]` | CONFIRMED | コピーボタン |
| stepB.sendContinueButton | `a[onclick="doSend(true);"]` | CONFIRMED | 送信継続ボタン |
| stepB.autoCompleteList | `ul#ui-id-1` | CONFIRMED | オートコンプリートリスト |
| stepB.autoCompleteItem | `ul#ui-id-1 li.ui-menu-item a` | CONFIRMED | オートコンプリート候補 |

### 2.6 処理C — 出力・検証 5070 (stepC)

| キー | セレクタ | ステータス | 備考 |
|------|---------|-----------|------|
| stepC.fromYear | `select[name="objectDateFromYear"]` | CONFIRMED | 開始年 |
| stepC.fromMonth | `select[name="objectDateFromMonth"]` | CONFIRMED | 開始月 |
| stepC.fromDay | `select[name="objectDateFromDay"]` | CONFIRMED | 開始日 |
| stepC.toYear | `select[name="objectDateToYear"]` | CONFIRMED | 終了年 |
| stepC.toMonth | `select[name="objectDateToMonth"]` | CONFIRMED | 終了月 |
| stepC.toDay | `select[name="objectDateToDay"]` | CONFIRMED | 終了日 |
| stepC.searchButton | `a[onclick="doSearch();"]` | CONFIRMED | 検索ボタン |
| stepC.planGroupPickerButton | `#sectionTableBtn3` | CONFIRMED | プラングループ選択ボタン |
| stepC.outputButton | `a[onclick="doOutput();"]` | CONFIRMED | 出力ボタン |
| stepC.rankOnlyHidden | `#hid_sectionBoxBodyListItem` | CONFIRMED | ランクのみ出力の隠し要素 |
| stepC.rankOnlyToggle | TBD | **TBD** | ランクのみ出力の実際のクリック対象 |

> **TBD: stepC.rankOnlyToggle** — `#hid_sectionBoxBodyListItem` は隠し要素であり、実際のクリック対象は別の要素。Lincoln 5070 画面で特定が必要。

---

## 3. TBD セレクタまとめ（未解決）

以下のセレクタが未取得のため、該当処理はガード付きで停止する。

| # | キー | 影響する処理 | 取得方法 |
|---|------|-------------|---------|
| 1 | facilitySwitch.* (4項目) | 全処理 | Lincoln 画面で施設切替操作時に DevTools で特定 |
| 2 | step0.saveButton | 処理0 | Lincoln カレンダー詳細画面の保存ボタンを DevTools で特定 |
| 3 | stepC.rankOnlyToggle | 処理C | Lincoln 5070 画面で「ランクのみ」トグルのクリック対象を DevTools で特定 |
| 4 | auth.loginIdInput | ログイン | Lincoln ログイン画面で DevTools で特定 |
| 5 | auth.loginPwInput | ログイン | Lincoln ログイン画面で DevTools で特定 |
| 6 | auth.loginButton | ログイン | Lincoln ログイン画面で DevTools で特定 |
| 7 | auth.twoFactorInput | 2FA | 2FA 画面表示時に DevTools で特定 |
| 8 | auth.twoFactorSubmit | 2FA | 2FA 画面表示時に DevTools で特定 |

---

## 4. セレクタ更新手順

### 4.1 新しいセレクタを取得したとき

1. **config/selectors.json** の該当キーを `"TBD"` から実際のセレクタ文字列に変更
2. **docs/selectors_catalog.md** の該当行のステータスを `CONFIRMED` に変更し、セレクタ値を記入
3. コミット & PR（セレクタ更新のみの小さなPR）

### 4.2 セレクタが壊れたとき（Lincoln 側の DOM 変更）

1. Lincoln の画面を DevTools で調査し、新しいセレクタを特定
2. **config/selectors.json** を更新
3. **docs/selectors_catalog.md** を更新
4. 影響範囲をテスト（該当ステップの手動実行）
5. コミット & PR

### 4.3 REFERENCE セレクタの確認

参考リポジトリ由来（REFERENCE）のセレクタは、初回実装時に実環境で以下を確認する:

1. セレクタが実際の Lincoln DOM に存在するか
2. セレクタが一意に要素を特定できるか
3. 確認後、ステータスを CONFIRMED に更新

---

## 5. ガード実装ルール

### 5.1 TBD ガード
```typescript
// セレクタが "TBD" の場合、SelectorTBDError をスロー
const selector = getSelector("step0.saveButton");
// → "TBD" なら SelectorTBDError("Selector 'step0.saveButton' is TBD...")
```

### 5.2 存在チェック
```typescript
// ページ上にセレクタが存在しない場合
const element = await page.$(selector);
if (!element) {
  throw new SelectorNotFoundError(`Element not found: ${selector}`);
}
```

### 5.3 ログ出力
セレクタ使用時は必ずログに記録する:
```
[INFO] Using selector stepB.copyButton: a[onclick="doCopy()"]
[WARN] Selector step0.saveButton is TBD — stopping safely
[ERROR] Selector stepB.copyButton not found in DOM
```
