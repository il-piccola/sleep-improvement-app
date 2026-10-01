# O-15b Google Drive JSON差分取得 設計検討

> 画面別取得と増分Processor案の検証結果は[O-15b 画面別取得・増分Processor案 検証報告](./o15b-incremental-processing-validation.md)を参照。トップは直近7日詳細＋最低31睡眠日分の要約、月表示は選択月、Processorは月境界ではなく影響範囲の閉包を再計算する。

## 状態と判断

**IMPLEMENTED LOCALLY — 画面別取得と増分Processorは実装・Windows実raw検証済み。Drive接続とLinux/N100実機検証は未実施。**

目的は、Health Auto ExportがGoogle DriveへのJSONアップロードを完了した後、その変更をN100の永続領域へ安全に取り込み、Sleep CompassのProcessed Dataへ速やかに反映すること。iPhone内で健康データが記録されてからの時間は、iOSとHealth Auto Exportの実行時刻に左右されるため、別に計測する。

**実施順序:** まずアプリコードを追加せず、Linuxの`rclone copy`を60〜120秒間隔で起動して永続raw領域へ取得し、既存watcher/Processorへ渡す方式を実機検証する。Drive到着後5分以内の反映、同名更新の検出と原本保全、通信断・再起動後の再開が満たせない場合に、下記の専用Drive APIコネクタへ進む。Driveのpush通知は初期実装に採用しない。5分は暫定目標であり、実機計測で確定する。

## 追加アプリ実装なしの第一案

```text
Health Auto Export → Google Drive対象フォルダ
  → rclone copy（読み取り専用OAuth、systemd timerで反復）
  → Linux永続raw領域 → 既存watcher → 既存Processor
  → 既存API → Web（約60秒ごとに再取得）
```

- 必要なのはLinuxへの`rclone`導入、Drive認証、永続領域、`HEALTH_EXPORT_WATCH_DIR`設定、systemdのtimer/service、ログと復旧手順。Sleep Compassの取得コードは追加しない。現行Windowsに`rclone`は未導入で、Linux側の導入・設定は未検証。
- `rclone copy`を使い、`sync`/`bisync`によるローカル原本削除と、`--inplace`による未完成JSONの公開を避ける。更新前の同名JSONは`--backup-dir`でwatch root外の永続履歴へ保全する。履歴先は実行ごとに重ならないパスとし、初回に上書き・復元動作を確認する。対象はHealth Auto ExportのJSONフォルダだけとし、元フォルダと宛先の件数・ハッシュを初回に照合する。
- 60秒のtimerは前回実行が終わってから次を起動し、重複実行させない。アップロード直後の検出、差分ダウンロード、増分キャッシュ再処理、Web再取得の合計を測る。`rclone copy`の通常判定はサイズと更新時刻などを使うため、同一サイズ・同一mtimeの内容更新まで要件にするなら`--checksum`を試す。Processorはctimeも変更判定に使い、`PROCESSOR_CACHE_VALIDATION=sha256`で全内容を再検証できる。
- `rclone`の終了コード・最終成功時刻はsystemd/journal等で確認できるが、現行Webの`/api/healthz`にはDrive照会の成功時刻が入らない。Drive同期だけ停止しても既存rawとProcessed Dataが一致していれば`healthy`になり得る。無改修で運用する場合は外部のtimer監視を必須とし、画面内で同期停止を正確に示すには小さなアプリ変更が必要。
- 同名の別Driveファイル、同名内容更新、Drive側削除、OAuth失効、永続領域未マウントを実機で試す。Driveでの削除をローカルに反映しない点は原本保全に有利だが、Driveの意図的な削除を自動判別できない。

この第一案で合格すれば専用コネクタの開発は不要。以下のDrive API案は、第一案が反映時間・更新検出・監視要件を満たさない場合の拡張案として残す。

## 現行システムで確認したこと

- WindowsはDrive for desktopが公開するフォルダを`HEALTH_EXPORT_WATCH_DIR`として監視する。WebとAPIは同一オリジン、APIは`127.0.0.1:8787`で動く。
- 2026-09-30のローカル原本メタデータはJSON 140件、合計約1.23 GiB、中央値約5.3 MiB、最大約27.7 MiB。直近30日の更新は32件。原本本文は本調査で表示・記録していない。
- `server/watchHealthExports.ts`はJSONの追加・変更を検知し、定期スキャンも行う。`processor/processDirectory.ts`は未変更ファイルの正規化済み結果を永続キャッシュから再利用し、完全スナップショットを再集計・発行する。
- Webは約60秒ごとにcompact statusだけを確認し、データ版が変わった場合に直近31睡眠日または選択月を取得する。Drive照会、ダウンロード、Processor、Web取得を分けて評価する。
- `cloud-api/src/lib/drive.ts`には旧Cloud用のDrive一覧・ダウンロード実装がある。フォルダIDによる絞り込みや取得フィールドは参考にできるが、旧Cloud認証・Firestore経路をLinuxの本番Webへ戻さない。

## 「リアルタイム」の範囲

```text
Apple Healthに記録
  → iPhoneでHealth Auto Exportが実行
  → Driveへのアップロード完了【取得側で測れる起点】
  → 次のDrive照会（最長約60秒を目標）
  → 変更JSONを取得・検証・原子的に配置
  → watcherが検知しProcessorがスナップショットを完成
  → Webの次回再取得（最長約60秒）
```

Health Auto Export公式ヘルプによると、健康データはiPhoneがロック中には読めず、iOSのバックグラウンド実行も指定時刻を保証しない。したがって「Apple Healthへの記録から5分以内」は保証できない。Driveへの到着後の遅延と、到着前の遅延を画面・運用ログで分ける。

## 取得方式の比較

| 方式 | 反映速度 | 利点 | 主な問題 | 判断 |
| --- | --- | --- | --- | --- |
| Drive API `files.list`を60秒ごとに照会 | 照会待ちは最大約60秒。後段の処理時間が加わる | ファイルID、サイズ、MD5、versionを管理し、変更分だけ取得できる。転送・失敗・再開を明確に記録できる | OAuthとコネクタの実装・保守が必要 | 第一案が不合格なら採用 |
| `rclone copy`をsystemd timerで反復 | タイマー間隔次第 | アプリコードを増やさず試せる。既定のローカルダウンロードは一時ファイルとrenameを使う | 同名ファイル、再取得判定、Drive側の変更履歴、業務上の鮮度をアプリから観測しにくい。専用OAuth clientが必要 | **最初に実機検証** |
| Drive `changes.watch`のpush通知 | 通知を契機に照会できる | 無変更時の照会を減らせる | Googleが到達できるHTTPS webhook、チャネル更新、欠落時の定期照会が必要。通知自体に変更内容はない | 初期実装では採用しない |
| DriveをFUSE mountして既存watcherに見せる | mountのキャッシュと通信状態次第 | 既存パスを流用しやすい | 切断・再起動中のファイル一覧や読み込みの一貫性を保証しにくい | 原本入力には採用しない |

`rclone sync`や`bisync`はDriveで消えた原本をローカルから消す可能性があるため、保全対象のrawディレクトリには使わない。`rclone copy`は宛先の余分なファイルを削除しない。`--inplace`は未完成ファイルをwatcherへ見せ得るため使わない。

## 第一案が不合格の場合の専用コネクタ詳細

### 1. Drive照会

1. Health Auto Exportの対象フォルダを**名前でなくフォルダID**で固定する。現行フォルダは直下にJSONがあり、再帰探索は現時点で不要。フォルダ構造の変更は設定変更として検出する。
2. `files.list`を`'<folderId>' in parents and trashed = false`で照会し、`pageSize=1000`でページを最後まで取得する。必要なフィールドを`nextPageToken,incompleteSearch,files(id,name,mimeType,size,md5Checksum,modifiedTime,version,parents)`に絞る。`.json`拡張子と通常のDrive blobを採用し、想定外の形式は隔離・警告する。
3. 照会が1ページでも失敗するか`incompleteSearch`が立ったら、その回の結果を不完全な一覧として破棄する。前回状態を「今回確認済み」に更新しない。
4. `fileId + md5Checksum + size`を内容の照合単位にし、`version`と`modifiedTime`も監査用に保存する。ファイル名や更新時刻だけで未変更と判断しない。同名の異なるfileIdが見つかった場合は、片方を上書きせず同期エラーにする。初回に`fileId → ローカル相対パス`を固定し、Drive上の名前変更だけで原本のローカルパスとProcessorのsource identityを変えない。
5. Driveで消えたファイルは即座にローカル原本から消さない。削除・移動・アクセス喪失を状態として記録し、人が確認してから保全方針を決める。

### 2. ダウンロードと公開

1. 新規・内容変更のJSONだけを`files.get?alt=media`で取得する。取得サイズ上限は現行最大27.7 MiBを余裕をもって超える設定値とし、超過は失敗として可視化する。
2. 監視対象外の永続`staging`にストリーミング保存し、実バイト数・MD5・SHA-256を計算する。Driveの`size`・`md5Checksum`と比較し、JSONとして解析可能か、Health Auto Export入力形式かを確認する。個人の健康データ本文はログに出さない。
3. ダウンロード後にDriveの該当ファイルのメタデータを再確認する。取得中に内容が変わった場合、その一時ファイルは公開せず次回再試行する。
4. Driveのファイル名をパスとして使う前に区切り文字、`..`、制御文字、同名衝突を検査する。`staging`と`raw-current`を同じファイルシステム上に置き、完成済みファイルだけをatomic renameで公開する。同名ファイルの旧版は、watch root外の保全領域へコピーしてから置き換える。`.partial`や旧版をProcessorの探索対象に含めない。
5. 公開後に`fileId`、内容ハッシュ、ローカル相対パス、取得時刻、成功状態を永続マニフェストへ原子的に記録する。途中で電源断になっても次回のDrive照会とローカルハッシュ照合から再開できるようにする。
6. 既存Processorのsource identityは相対パス・サイズ・mtime・SHA-256を含むため、Windows原本とLinux移行原本のmtimeを比較する。移行時に同一identityを保つ必要があればmtimeを保全し、実ファイルで差分を検証する。

### 3. Processorへの接続

- コネクタはraw JSONを配置するまでを担当する。正規化・重複統合・スナップショット公開は既存Processorの責務に保つ。
- 初期案では既存watcherの`add/change`で再処理を始め、定期スキャンを復旧経路にする。コネクタとAPIから同時に全件スナップショットを作らない。
- 1回のDrive照会で複数ファイルが到着した場合は、全件配置後に1回だけProcessorを起動する設計も検討する。既存watcherとの二重起動を避ける排他制御が必要。
- Windowsローカルの実raw 141件では、初回69.3秒、変更なし再実行6.3秒、キャッシュ約34.2 MBだった。N100では1件追加時のmiss 1件とLive USB書き込み量を実測する。

## 認証と保存先

- 読み込みには`drive.readonly`が必要。`drive.metadata.readonly`だけではJSON本文を取得できない。`drive.file`はHealth Auto Exportが作った既存ファイルを通常は列挙できないため、単純な置換先にはならない。
- `drive.readonly`はDrive全体の閲覧・取得を許すrestricted scopeであり、フォルダID指定は**APIの検索範囲**であってOAuth権限そのものの縮小ではない。専用Googleアカウントに対象フォルダだけを共有して読む方式と、本人アカウントの読み取り専用OAuth方式を接続試験で比較する。
- 個人用OAuth clientを使う場合、同意画面が「External / Testing」のままだとrefresh tokenが7日で失効する。長期運用可能な構成を先に確認し、トークン更新・失効時の再認証手順を記録する。`rclone`を使う場合も、共有client IDの2026年終了予定があるため専用clientを前提にする。
- 認証情報、同期マニフェスト、`raw-current`、`staging`、原本旧版、Processed DataはLive USB再起動後も残る領域へ置く。秘密情報はリポジトリ・公開Web・一般ログへ置かず、サービス専用ユーザーだけが読めるようにする。
- O-12は通常運用のGoogle Drive API依存を外す方針だった。O-15でLinuxの原本取得にDrive APIを使うなら、**O-12のローカル処理・Webは独立のまま、原本配送の境界でDrive APIを再採用する**という方針変更を明記する。Drive断中も既存Processed Dataは閲覧可能にし、鮮度を正常と表示しない。
- `rclone`のDrive連携も内部ではDrive APIを使うため、このO-12方針変更は追加アプリ実装の有無に関係なく必要。
- 現行のDrive API公開資料では`files.list`は100 quota units/回。140件が1ページに収まる場合、60秒照会は概算144,000 units/日となる。対象プロジェクトのquotaと将来の課金条件は実際の設定画面で確認し、照会間隔を設定可能にする。この概算は追加の取得・再試行を含まない。

## 状態監視と故障時の動き

Driveの`lastSuccessfulCheckAt`、`lastDriveChangeAt`、`lastDownloadAt`、`lastPublishedSnapshotAt`、未処理件数、最後のエラーを分けて記録する。「最近新規ファイルがない」と「Driveを確認できていない」を区別する。`/api/healthz`はDrive確認の失敗、raw永続領域のマウント失敗、処理遅延をそれぞれ示す。

現行`server/server.ts`ではraw走査に失敗しても過去の`rawStatusCache`を保持し、`rawStatusError`だけでは`healthy`判定を落とさない。このままではマウント消失後に古い原本状態で`fresh`となり得るため、O-15実装時に修正する。

| 事象 | 自動動作 | 利用者に見せる状態 |
| --- | --- | --- |
| Drive通信断・429/5xx | 指数バックオフし、次回照会で全一覧とローカル状態を照合 | 最終確認時刻と同期停止を表示。既存スナップショットは閲覧可 |
| OAuth失効・403 | 再試行を抑え、再認証が必要と明示 | 同期停止。古いデータを最新と表示しない |
| ダウンロード途中の電源断 | stagingだけ破棄または再利用し、次回再取得 | 原本未公開。Processed Dataは前回完成版を維持 |
| 同名ファイルまたはハッシュ不一致 | 自動上書きを止める | 要確認として明示 |
| raw永続領域のマウント失敗 | サービス起動を止めるかdegradedにし、空ディレクトリへ書かない | 原本利用不可と表示 |
| Processor失敗 | 原本を保持し、前回完成スナップショットを維持して再試行 | 原本取得済み・反映未完了を区別 |

## 受け入れ試験

1. 初回移行: DriveとWindows原本の件数・ファイル単位のサイズ/ハッシュを比較し、全件取得とProcessed Data再生成を確認する。
2. 新規JSON: iPhone手動ExportのDrive到着時刻、N100の検出・取得時刻、snapshot完成時刻、Web反映時刻を測る。暫定目標はDrive到着後5分以内。
3. 同名更新: 内容が更新された同一fileIdを再取得し、旧版を保全したうえで新データを反映する。同名別fileIdは自動上書きしない。
4. 故障注入: 通信断、OAuth失効、途中切断、ディスク容量不足、永続領域未マウント、Processor失敗、N100再起動を試す。再開後に欠落・二重化がないことを確認する。
5. セキュリティ: コネクタの認証情報がブラウザ・APIレスポンス・ログ・Gitに含まれず、Drive側は読み込み専用、Cloudflare Accessの外から睡眠データを取得できないことを確認する。
6. 性能: N100で141件/約1.24 GiBの初回処理と1件追加時の増分キャッシュ処理を実測し、CPU・メモリ・ディスク書き込み量を記録する。

## 実装前に確定する項目

1. 「リアルタイム」の合格値。上記5分は暫定で、起点はDriveアップロード完了とする。
2. Health Auto Exportの実際の自動実行間隔、iPhoneロック中の遅延、同日ファイルの上書き・新規作成パターン。
3. 専用Googleアカウントへのフォルダ共有が可能か、OAuth clientの長期運用条件を満たせるか。
4. Live USBの永続領域、容量、暗号化、秘密情報保管方法、未マウント時の停止方法。
5. N100でのProcessor初回処理時間と1件追加時の増分処理時間。Drive到着から画面反映まで5分を超える場合は区間別に見直す。

## 参照した公式資料

- [Health Auto Export: Google Drive automation](https://help.healthyapps.dev/en/health-auto-export/automations/google-drive/)
- [Health Auto Export: sync timing FAQ](https://help.healthyapps.dev/en/health-auto-export/faq/)
- [Google Drive: file search](https://developers.google.com/workspace/drive/api/guides/search-files)
- [Google Drive: file download](https://developers.google.com/workspace/drive/api/guides/manage-downloads)
- [Google Drive: change notifications](https://developers.google.com/workspace/drive/api/guides/push)
- [Google Drive: OAuth scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [Google OAuth: refresh token expiration](https://developers.google.com/identity/protocols/oauth2)
- [Google Drive: usage limits](https://developers.google.com/workspace/drive/api/guides/limits)
- [rclone: copy](https://rclone.org/commands/rclone_copy/)
- [rclone: Google Drive](https://rclone.org/drive/)
