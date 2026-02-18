# トラブルシューティング

Lincoln Playwright 自動化でよくある失敗と対処法。

---

## 1. 要素待機タイムアウト

### 症状
```
TimeoutError: Waiting for selector "a[onclick="doCopy()"]" timed out
```

### 原因
- ページ読み込みが遅い
- セレクタが DOM に存在しない（Lincoln 側の変更）
- ページ遷移が完了していない

### 対処
1. タイムアウト値を確認（デフォルト 30s）
2. `page.waitForLoadState('networkidle')` を挟む
3. セレクタが変わっていないか DevTools で確認
4. 変わっていた場合 → `config/selectors.json` を更新

---

## 2. リトライ上限到達

### 症状
```
RetryExhaustedError: Max attempts (3) reached for stepB
```

### 原因
- Lincoln サーバーの一時的な不具合
- ネットワーク不安定
- セレクタの変更

### 対処
1. artifacts（スクショ/HTML）を確認して原因を特定
2. ネットワーク問題 → 時間を置いて resume で再開
3. セレクタ変更 → `config/selectors.json` を更新して再実行
4. リトライ回数を増やす場合は `RETRY_MAX_ATTEMPTS` 環境変数を変更

---

## 3. 要素消失（DOM 変更）

### 症状
```
SelectorNotFoundError: Element not found: a[onclick="doCopy()"]
```

### 原因
- Lincoln のアップデートで DOM 構造が変わった
- ポップアップやオーバーレイが要素を隠している
- iframe 内の要素を指定していない

### 対処
1. DevTools で現在の DOM を確認
2. セレクタを修正して `config/selectors.json` を更新
3. `docs/selectors_catalog.md` のステータスも更新
4. ポップアップ → 閉じるボタンを先にクリック
5. iframe → `page.frameLocator()` を使用

---

## 4. TBD セレクタによるガード停止

### 症状
```
SelectorTBDError: Selector "step0.saveButton" is TBD. Cannot proceed.
```

### 原因
- セレクタがまだ特定されていない

### 対処
1. Lincoln の対象画面を開いて DevTools でセレクタを特定
2. `config/selectors.json` を更新
3. `docs/selectors_catalog.md` を更新
4. 再実行

---

## 5. 2FA タイムアウト

### 症状
```
TwoFactorTimeoutError: 2FA input not completed within 300000ms
```

### 原因
- ユーザーが 2FA コードを入力しなかった
- 2FA 画面の検知に失敗した

### 対処
1. タイムアウト値を確認（`TWO_FACTOR_TIMEOUT_MS` デフォルト 300000ms = 5分）
2. 再実行してすぐに 2FA コードを入力
3. 2FA 画面のセレクタが変わっていないか確認

---

## 6. 施設 ID 不一致

### 症状
```
FacilityMismatchError: Expected "I38347" but got "D88689"
```

### 原因
- 施設切替が正しく行われなかった
- 別の施設にログインしている

### 対処
1. ログを確認して施設切替の成否を確認
2. 施設切替セレクタ（facilitySwitch.*）が正しいか確認
3. 手動で施設を切り替えてから resume

---

## 7. ポップアップ・アラートの割り込み

### 症状
- 操作が途中でブロックされる
- 予期しないダイアログが表示される

### 原因
- Lincoln のセッション警告
- 確認ダイアログ（「本当に実行しますか？」等）
- JavaScript alert/confirm

### 対処
1. `page.on('dialog')` でダイアログを自動処理
2. ポップアップのセレクタを特定して閉じる処理を追加
3. セッション切れ → 再ログインからやり直し

---

## 8. ダウンロードファイルの取得失敗（処理C）

### 症状
- 出力ボタンクリック後にファイルがダウンロードされない

### 原因
- ダウンロードイベントの検知失敗
- ブラウザのダウンロード設定
- 出力データが 0 件

### 対処
1. `page.waitForEvent('download')` の使用を確認
2. ダウンロード先ディレクトリが `C:\lincolnpricereflected\data\artifacts\` 配下か確認
3. 出力対象データが存在するか Lincoln 画面で確認

---

## 9. 3ヶ月制約の分割エラー（処理C）

### 症状
- 期間が 3ヶ月を超えて出力エラーになる

### 原因
- 分割ロジックの不備
- 月の境界計算ミス

### 対処
1. 分割ロジックが正しく 3ヶ月以内に収まっているか確認
2. from/to の日付設定が select 要素で正しく選択されているか確認
3. 各分割の結果を個別に検証

---

## 共通: artifacts の確認方法

失敗時に保存される artifacts:

| 種別 | パス | 用途 |
|------|------|------|
| スクショ | `data/artifacts/{job_id}/{step}_{timestamp}.png` | 失敗時の画面状態 |
| HTML | `data/artifacts/{job_id}/{step}_{timestamp}.html` | DOM 構造の確認 |
| ネットワークログ | `data/artifacts/{job_id}/{step}_{timestamp}_network.json` | リクエスト/レスポンスの確認 |
| 検証結果 | `data/artifacts/{job_id}/verification_{timestamp}.csv` | 突合結果の詳細 |

artifacts の保存先は必ず `C:\lincolnpricereflected\data\artifacts\` 配下。
