# 完了条件チェック (Definition of Done)

## PR レベルの完了条件

| # | 条件 | 必須 |
|---|------|------|
| 1 | すべての成果物が `C:\lincolnpricereflected` 配下にある | Yes |
| 2 | セレクタのハードコードがない（`config/selectors.json` 経由） | Yes |
| 3 | secrets がコード・ログに含まれていない | Yes |
| 4 | 型チェック (`tsc --noEmit`) がパス | Yes |
| 5 | lint がパス | Yes |
| 6 | テスト or 手動動作確認が完了 | Yes |
| 7 | PR 説明に変更概要とテスト手順がある | Yes |
| 8 | 依存 PR がマージ済み | Yes |

## ステップレベルの完了条件

### PARSE（Excel パース）
- [ ] C4 起点の矩形領域を正しく取得
- [ ] 正規化ルールが適用済み
- [ ] RankMatrix 構造体に変換完了
- [ ] 異常値・欠損の検出と処理

### STEPA（施設 ID チェック）
- [ ] `dl.g_header_id dd` から施設 ID を取得
- [ ] 期待する施設 ID と完全一致
- [ ] 不一致なら FAILED で即停止

### STEP0（カレンダー DOM 更新）
- [ ] page.evaluate で DOM 更新が実行された
- [ ] inputPriceRankCd / inputPriceRankNm / inputRankStyleText が更新された
- [ ] 保存が成功した

### STEPB（一括コピー）
- [ ] 施設ID再チェック（verifyFacilityId）が実行され一致を確認
- [ ] 全対象カレンダーへコピー→送信継続が完了
- [ ] 各操作後のレスポンス確認

### STEPC（出力→突合検証）
- [ ] 期間分割（3ヶ月制約）が正しく動作
- [ ] 出力データと Excel 入力データの完全一致検証
- [ ] 不一致時は詳細を artifacts に保存して FAILED

## ジョブレベルの完了条件

- [ ] 全ステップが SUCCESS
- [ ] `jobs.last_completed_step` = `DONE`
- [ ] 検証結果（result_json）が保存済み
- [ ] 失敗ステップがある場合は artifacts（スクショ/HTML/ネットワークログ）が保存済み

## プロジェクト完了条件（M6: 運用開始）

- [ ] 全 Phase の PR がマージ済み
- [ ] E2E パイプライン（処理 A→0→B→C）通し実行で SUCCESS
- [ ] ジョブ resume テスト合格
- [ ] 運用ドキュメント完備
