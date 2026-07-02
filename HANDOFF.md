\# HANDOFF - sleep-improvement-app



\## 現在の目的

分割睡眠に対応した睡眠改善Webアプリを作る。



\## 現在できていること

\- Health Auto Export JSON / normalized SleepRecord\[] の読み込み

\- 睡眠ブロック化

\- 1日複数回睡眠の表示

\- 月指定によるタイムライン・分割睡眠の表示

\- 主睡眠候補・仮眠・夕方睡眠の判定

\- REM/Core/Deepの睡眠ステージ表示

\- 分割睡眠スコア

\- 昼夜逆転スコア

\- 今日の改善アクション

\- iPhone Safariで表示



\## 次にやること

Webアプリを主運用として、睡眠表示・データ診断・週次サマリー候補を改善する。



完了済みの主な段階：

1\. Phase 0 現状確認

2\. Phase 1 ソース別監査とsourceKey導入

3\. Phase 2 ソース品質スコア

4\. Phase 3 異なるsourceKey間の重複・重なり検出

5\. Phase 4 完全重複のみ自動統合する統合睡眠タイムライン

6\. Phase 5 ソース優先順位・除外設定UI

7\. Phase O-8b Cloud API側 sleepDay boundary可変化

8\. 月指定による当該月表示

9\. Phase O-9 REM/Core/Deep睡眠ステージ表示



\## 重要ルール

\- Withingsだけに限定しない

\- sourceKeyを導入する

\- source/sourceNameがない場合はunknown\_source

\- In Bedだけのデータは実睡眠データがない時だけ使う

\- Asleep/Core/REM/Deep/Unspecifiedは実睡眠

\- Awakeは睡眠ブロック内なら中途覚醒

\- 孤立Awakeは睡眠時間に入れない

\- REM/Core/Deepがある場合はタイムラインと分割睡眠詳細で区別表示する

\- 睡眠ステージ表示はセルフモニタリング用で、診断や原因断定には使わない

\- 完全重複だけ自動統合

\- 部分重複は判断保留

