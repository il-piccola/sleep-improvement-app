# 睡眠データ仕様書

このアプリは、睡眠改善のために睡眠ブロックを分析するWebアプリです。医学的診断は行わず、睡眠の「傾向」と「目安」を表示します。健康データはブラウザ内で処理し、XML全文やJSON全文をアプリ状態に保存しません。

## 採用する本命データ形式

本命データ形式は `normalized-sleep-records.json` です。

アプリ側の分析ロジックは、最終的にすべての入力を `SleepRecord[]` に正規化して扱います。Health Auto Export JSONやAppleヘルスXMLを直接分析対象にするのではなく、読み込み時に `SleepRecord[]` へ変換します。

推奨フロー:

1. 可能なら事前に `normalized-sleep-records.json` を作る
2. アプリでは `normalized-sleep-records.json` を読み込む
3. Health Auto Export JSONやAppleヘルスXMLは互換入力として扱う

ファイル名は固定しません。ユーザーが任意のJSONまたはXMLファイルを選択し、内容から形式を判定します。

## Health Auto Export JSONとAppleヘルスXMLの扱い

Health Auto Export JSONは対応します。ただし、本命形式ではありません。

Health Auto Export JSONでは、`sleep_analysis` に相当する非集計データを優先します。非集計データとは、各睡眠レコードに開始時刻と終了時刻があるデータです。

AppleヘルスXMLも対応します。XML内の `Record` のうち、`type="HKCategoryTypeIdentifierSleepAnalysis"` のものだけを睡眠レコードとして取り込みます。

どちらの形式も、読み込み後は `SleepRecord[]` に正規化します。元のJSON全文やXML全文は保持しません。

## 睡眠ステージの変換ルール

アプリ内では、Apple Health互換の文字列を `value` として使います。
O-9以降は、睡眠ブロック内のステージ差分を `stageSegments` として表示モデルにも保持します。これはCloud APIレスポンスやフロント表示用の派生データであり、元の睡眠レコード保存形式を変更するものではありません。

変換ルール:

| 入力の意味 | 正規化後の `value` |
| --- | --- |
| asleep / sleep / 睡眠全般 | `HKCategoryValueSleepAnalysisAsleep` |
| core | `HKCategoryValueSleepAnalysisAsleepCore` |
| deep | `HKCategoryValueSleepAnalysisAsleepDeep` |
| rem | `HKCategoryValueSleepAnalysisAsleepREM` |
| awake | `HKCategoryValueSleepAnalysisAwake` |
| inBed / in_bed | `HKCategoryValueSleepAnalysisInBed` |
| 判定不能な値 | 元の文字列を保持 |

分析時の扱い:

| `value` の内容 | 分析上の種別 |
| --- | --- |
| `Asleep` を含む | 睡眠 |
| `InBed` を含む | ベッド上の睡眠関連ブロック |
| `Awake` を含む | 睡眠ブロック作成から除外 |
| その他 | unknownとして保持 |

表示時の扱い:

| 正規化ステージ | 表示 |
| --- | --- |
| `asleep_rem` | レム |
| `asleep_core` | コア |
| `asleep_deep` | 深い睡眠 |
| `asleep` / `asleep_unspecified` | 睡眠 |

睡眠ステージはセルフモニタリング用の表示です。医療的な診断、原因断定、睡眠の良し悪しの保証には使いません。

## 分割睡眠分析に必要な必須フィールド

分割睡眠分析を正しく行うには、各睡眠レコードに次のフィールドが必要です。

必須:

| フィールド | 内容 |
| --- | --- |
| `id` | レコードを識別するID |
| `value` | 睡眠ステージまたは睡眠カテゴリ |
| `startDate` | 睡眠開始日時。ISO 8601形式を推奨 |
| `endDate` | 睡眠終了日時。ISO 8601形式を推奨 |

推奨:

| フィールド | 内容 |
| --- | --- |
| `durationMinutes` | 睡眠時間。`startDate` と `endDate` がある場合は再計算可能 |
| `sourceName` | データ元名。存在する場合だけ使用 |
| `source` | データ元名。存在する場合だけ使用 |

`startDate` と `endDate` がある場合、`durationMinutes` は開始・終了時刻から再計算します。これにより、集計値よりも実際の睡眠ブロックを優先します。

`durationMinutes` だけのデータも読み込み可能ですが、次の分析は参考値になります。

- 設定された睡眠日区切り時刻をまたぐ睡眠日判定
- 夕方睡眠判定
- 最終起床時刻
- 睡眠中央時刻
- 昼夜逆転スコア

## source/sourceName の扱い

`source` または `sourceName` が存在する場合だけ使用します。

存在する場合:

- `hasSource` を `true` にする
- `sourceKind` は `present` にする
- `source` / `sourceName` に値を保持する

存在しない場合:

- 推測で補完しない
- 空文字や仮のデバイス名を入れない
- 分析自体は継続する

source情報は、睡眠ブロックの信頼性やデータ元表示に使える補助情報です。sourceがないことを理由に睡眠レコードを破棄してはいけません。

## 集計済みデータだった場合の扱い

Health Auto Export JSONで集計済みデータしか見つからない場合、読み込みは継続しますが警告を出します。

警告文:

`Health Auto Export JSONに集計済みデータしか見つかりませんでした。時刻分析は参考値になります。`

集計済みデータの扱い:

- `durationMinutes` があれば睡眠時間として使う
- `date` があれば日付情報として使う
- `startDate` / `endDate` がなければ時刻ベースの分析は参考値にする
- 睡眠ブロック数や分割睡眠の精度は下がる
- 非集計データが同じファイル内にある場合は、非集計データを優先する

集計済みデータだけを使って、「夕方睡眠」「最終起床時刻」「睡眠中央時刻」を断定してはいけません。

## normalized-sleep-records.json の形式

アプリが受け取る推奨形式は次の通りです。

```json
{
  "generatedAt": "2026-05-15T00:45:42.621Z",
  "sourceKind": "normalized-sleep-records",
  "inputFileName": "export.xml",
  "records": [
    {
      "id": "record-001",
      "value": "HKCategoryValueSleepAnalysisAsleepCore",
      "startDate": "2026-05-14T23:10:00+09:00",
      "endDate": "2026-05-15T06:40:00+09:00",
      "durationMinutes": 450,
      "hasStartDate": true,
      "hasEndDate": true,
      "hasSource": true,
      "sourceKind": "present",
      "sourceName": "Apple Watch"
    },
    {
      "id": "record-002",
      "value": "HKCategoryValueSleepAnalysisAsleepREM",
      "startDate": "2026-05-15T06:40:00+09:00",
      "endDate": "2026-05-15T07:00:00+09:00",
      "durationMinutes": 20,
      "hasStartDate": true,
      "hasEndDate": true,
      "hasSource": true,
      "sourceKind": "present",
      "sourceName": "Apple Watch"
    }
  ]
}
```

トップレベル:

| フィールド | 必須 | 内容 |
| --- | --- | --- |
| `generatedAt` | 推奨 | 正規化ファイルを作成した日時 |
| `sourceKind` | 推奨 | `normalized-sleep-records` |
| `inputFileName` | 任意 | 元ファイル名。固定名に依存しない |
| `records` | 必須 | `SleepRecord[]` |

`records[]`:

| フィールド | 必須 | 内容 |
| --- | --- | --- |
| `id` | 必須 | レコードID |
| `value` | 必須 | 睡眠ステージ |
| `startDate` | 強く推奨 | 開始日時 |
| `endDate` | 強く推奨 | 終了日時 |
| `durationMinutes` | 推奨 | 分単位の時間 |
| `dayIndex` | 任意 | 匿名サンプルや時刻なしデータ用の補助日番号 |
| `hasStartDate` | 任意 | 開始日時の有無 |
| `hasEndDate` | 任意 | 終了日時の有無 |
| `hasSource` | 任意 | source/sourceNameの有無 |
| `source` | 任意 | データ元 |
| `sourceName` | 任意 | データ元名 |
| `sourceKind` | 任意 | sourceの存在状態 |

## 今日のデータがない場合

読み込んだ `SleepRecord[]` に今日の日付のレコードがない場合、警告を出します。

警告文:

`今日の睡眠データがありません。最新日ではなく、読み込まれた範囲のデータを表示します。`

この警告は読み込み失敗ではありません。アプリは読み込まれた範囲の最新睡眠日を表示します。

## 今後の変更時に壊してはいけない前提

次の前提は壊してはいけません。

- 本命形式は `normalized-sleep-records.json`
- アプリ内部の分析入力は常に `SleepRecord[]`
- ファイル名で形式を固定判定しない
- JSON全文やXML全文をアプリ状態に保存しない
- 1日1回の睡眠を前提にしない
- 1日の中の睡眠ブロックをすべて残す
- 最長睡眠だけを見て他の睡眠を無視しない
- 睡眠日は設定された区切り時刻を基準に扱う
- 90分未満は仮眠候補として扱う
- 16:00以降、夜睡眠開始前に始まる睡眠は夕方睡眠として注意する
- 判定値は設定から変更できるようにする
- 集計済みデータしかない場合は警告を出す
- source/sourceNameは存在する場合だけ使う
- 睡眠ステージがある場合はREM/Core/Deepを表示に使うが、ステージがない睡眠データも破棄しない
- 今日のデータがない場合は警告を出す
- 診断名は出さず、「傾向」「目安」と表現する

## 参照上の注意

この文書は、現行のアプリ実装と正規化処理に基づくデータ契約です。`audit-results/summary.json`、`audit-results/decision.json`、`audit-results/normalization-report.json` が存在する場合は、それらの監査結果と突き合わせて更新してください。
