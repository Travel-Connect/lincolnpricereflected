# 既知セレクタ一覧

すべてのセレクタは `config/selectors.json` に定義。本ドキュメントは参照・棚卸し用。

## ステータス凡例

| ステータス | 意味 |
|-----------|------|
| CONFIRMED | 動作確認済み。実装に使用可能 |
| TBD | 未取得。ガードで安全に停止 |
| REFERENCE | 参考リポジトリ由来。実環境確認要 |

---

## auth（ログイン・認証）

| キー | セレクタ | ステータス |
|------|---------|-----------|
| auth.loginUrl | `https://www.tl-lincoln.net/accomodation/Ascsc1000InitAction.do` | CONFIRMED |
| auth.loginIdInput | TBD | TBD |
| auth.loginPwInput | TBD | TBD |
| auth.loginButton | TBD | TBD |
| auth.twoFactorInput | TBD | TBD |
| auth.twoFactorSubmit | TBD | TBD |

## facilitySwitch（施設切替）

| キー | セレクタ | ステータス |
|------|---------|-----------|
| facilitySwitch.openButton | TBD | TBD |
| facilitySwitch.searchInput | TBD | TBD |
| facilitySwitch.selectItem | TBD | TBD |
| facilitySwitch.confirmButton | TBD | TBD |

## step0（処理0: カレンダー DOM）

| キー | セレクタ | ステータス |
|------|---------|-----------|
| step0.monthTables | `table.calendarTable` | REFERENCE |
| step0.dayInCell | `.calendar_table_day` | REFERENCE |
| step0.rankText | `.calendarTableRank` | REFERENCE |
| step0.roomTypeTitle | `.calendarTableTitle` | REFERENCE |
| step0.rankAnchor | `a.calendarTableBtn` | REFERENCE |
| step0.inputPriceRankCd | `input[name="inputPriceRankCd"]` | REFERENCE |
| step0.defaultInputPriceRankCd | `input[name="defaultInputPriceRankCd"]` | REFERENCE |
| step0.inputPriceRankNm | `input[name="inputPriceRankNm"]` | REFERENCE |
| step0.inputRankStyleText | `input[name="inputRankStyleText"]` | REFERENCE |
| step0.saveButton | TBD | TBD |

## stepA（処理A: 施設 ID 確認 — 6800 detail）

| キー | セレクタ | ステータス |
|------|---------|-----------|
| stepA.facilityIdText | `dl.g_header_id dd` | CONFIRMED |

## stepB（処理B: 料金ランク一括設定 — 5050）

| キー | セレクタ | ステータス |
|------|---------|-----------|
| stepB.copyButton | `a[onclick="doCopy()"]` | CONFIRMED |
| stepB.sendContinueButton | `a[onclick="doSend(true);"]` | CONFIRMED |
| stepB.autoCompleteList | `ul#ui-id-1` | CONFIRMED |
| stepB.autoCompleteItem | `ul#ui-id-1 li.ui-menu-item a` | CONFIRMED |

## stepC（処理C: 出力・検証 — 5070）

| キー | セレクタ | ステータス |
|------|---------|-----------|
| stepC.fromYear | `select[name="objectDateFromYear"]` | CONFIRMED |
| stepC.fromMonth | `select[name="objectDateFromMonth"]` | CONFIRMED |
| stepC.fromDay | `select[name="objectDateFromDay"]` | CONFIRMED |
| stepC.toYear | `select[name="objectDateToYear"]` | CONFIRMED |
| stepC.toMonth | `select[name="objectDateToMonth"]` | CONFIRMED |
| stepC.toDay | `select[name="objectDateToDay"]` | CONFIRMED |
| stepC.searchButton | `a[onclick="doSearch();"]` | CONFIRMED |
| stepC.planGroupPickerButton | `#sectionTableBtn3` | CONFIRMED |
| stepC.outputButton | `a[onclick="doOutput();"]` | CONFIRMED |
| stepC.rankOnlyHidden | `#hid_sectionBoxBodyListItem` | CONFIRMED |
| stepC.rankOnlyToggle | TBD | TBD |

---

## TBD セレクタの埋め方

### 手順

1. Lincoln の対象画面をブラウザで開く
2. DevTools (F12) → Elements タブ
3. 対象要素を Inspect して CSS セレクタを特定
4. **一意性を確認**: `document.querySelectorAll(selector).length === 1`
5. `config/selectors.json` の該当キーを `"TBD"` から実際のセレクタに変更
6. `docs/selectors_catalog.md` のステータスを CONFIRMED に更新
7. 本ファイル (`references/selectors.md`) も同様に更新
8. コミット & PR（セレクタ更新のみの小さな PR）

### TBD 優先度

| 優先度 | セレクタ | 理由 |
|--------|---------|------|
| 高 | facilitySwitch.* (4項目) | 全処理に影響 |
| 高 | auth.login* (3項目) | ログインに必須 |
| 中 | auth.twoFactor* (2項目) | 2FA 対応に必要 |
| 中 | step0.saveButton | 処理0 の保存に必須 |
| 低 | stepC.rankOnlyToggle | 処理C でガード分岐可能 |

### REFERENCE セレクタの確認方法

参考リポジトリ由来（REFERENCE）のセレクタは初回実装時に実環境で確認:

1. セレクタが実際の Lincoln DOM に存在するか
2. セレクタが一意に要素を特定できるか
3. 確認後、ステータスを CONFIRMED に更新
