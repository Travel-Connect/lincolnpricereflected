# excel-horizontal-range-parser

Excel の**可変範囲パース仕様を固定する** Skill。

## トリガーフレーズ例

1. 「Excel のパース処理を実装して」
2. 「C4 起点のデータ範囲を読み取りたい」
3. 「ランクマトリクスの構造を確認して」
4. 「Excel に異常値があったときの挙動は？」
5. 「単泊/連泊の判定はどうする？」
6. 「正規化ルールを教えて」
7. 「テストケースを確認したい」

## 入力

- Excel ファイル（`.xlsx`）
  - ファイル名規約: `【{施設名}様】料金変動案_{YYYYMMDD}[_自動生成].xlsx`
- シート名: 固定（設定可能）

## 出力

- **期待ランクデータ**: `{ date: string, rank: string }[]` の構造
- 正確には `RankMatrix` 型（date × roomType → rankCode のマッピング）

## 核心ルール

| # | ルール |
|---|--------|
| 1 | **シート名は固定**（設定で変更可能） |
| 2 | **C4 セルを起点**に右方向・下方向に走査 |
| 3 | **右側終端**: 列方向に走査し空白セルで終了 |
| 4 | **下側終端**: 行方向に走査し空白セルで終了 |
| 5 | 取得値は**正規化**する（→ [normalization.md](references/normalization.md)） |
| 6 | **A/B（単泊/連泊）は自動判定不可** — UI で手動紐づけ |
| 7 | 出力は `date/rank` 構造の期待ランクデータ |
| 8 | **異常値・欠損**がある場合は停止 or 警告 |

## パースフロー

```
1. Excel ファイルを開く
2. 指定シートを選択
3. C4 を起点に矩形領域を検出
   - 右端: 列を右へ走査 → 空白セルで終端
   - 下端: 行を下へ走査 → 空白セルで終端
4. 行ヘッダー（C列）: 日付データ
5. 列ヘッダー（4行目）: 部屋タイプ / ランク名
6. データ矩形内の各セルを正規化
7. RankMatrix 構造体に変換
8. 異常値チェック → 問題あれば停止/警告
```

## RankMatrix 型

```typescript
interface RankMatrix {
  facilityNameCandidate: string;    // ファイル名から抽出
  dates: string[];                  // YYYY-MM-DD 形式
  roomTypes: string[];              // 列ヘッダーから
  matrix: Map<string, Map<string, string>>;  // date → roomType → rankCode
}
```

## 禁止事項

- `C:\lincolnpricereflected` 外への成果物・一時ファイル作成
- A/B（単泊/連泊）の自動判定実装（UI 手動紐づけの前提を崩さない）
- 異常値・欠損を無視した処理続行
- 正規化ルール外の暗黙的な値変換

## チェックリスト

### 実行前

- [ ] Excel ファイルが `.xlsx` 形式であること
- [ ] シート名が想定と一致すること
- [ ] C4 セルにデータが存在すること

### 実行中

- [ ] 右側終端・下側終端が正しく検出されていること
- [ ] 日付が YYYY-MM-DD 形式に正規化されていること
- [ ] 空白・全角スペース等が正規化されていること
- [ ] 異常値がある場合は停止 or 警告を出していること

### 失敗時

- [ ] どのセルで異常が発生したか（行番号・列番号）をログ出力
- [ ] パース途中の部分結果は使用しない
- [ ] エラーメッセージに「期待される形式」を明記

## 参照ドキュメント

- [references/excel-format.md](references/excel-format.md) — 入力 Excel の例・終端判定
- [references/normalization.md](references/normalization.md) — 正規化ルールと禁止変換
- [references/test-cases.md](references/test-cases.md) — 最低限のテストケース
- `docs/design.md` § 4 — Excel パーサ設計
