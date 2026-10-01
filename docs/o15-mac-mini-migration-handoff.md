# O-15 Mac mini移行 引き継ぎ

更新日: 2026-10-01（Asia/Tokyo）

## 再開時に最初に読むこと

**移行準備は完了。移行そのものは保留。** 利用者はMac mini（申告構成: M6 / 32 GB / 512 GB）をまだ持っていない。現行N100のWindows運用を継続し、Macが届いて利用者が移行再開を指示してから実機作業を行う。この文書の作成ではN100のタスク、Tunnel、データ、認証設定を変更していない。

ドメインは購入しない。Tailscaleは使わない。Cloudflareの標準Access認証を維持し、Webを旧Firebase / Cloud API経路へ戻さない。Linux Live USB案は過去の選択肢として残すが、今回の移行先はMac。クラウドへの処理移設は今回の範囲に含めない。

次回担当者は本書と[Cloudflare配置結果](./o15-cloudflare-deployment-progress.md)、[画面別取得・増分Processor検証](./o15b-incremental-processing-validation.md)、`AGENTS.md`を読む。開発作業では`.agents/skills/ai-agent-monitor/SKILL.md`に従ってrunner登録と`monitor status`から始める。過去のmonitor質問#2/#3は既にCloudflareログインが済んだ後の古い質問であり、再認証が必要な根拠として扱わない。

## 現行構成と再開時の確認先

```text
iPhone Health Auto Export → Google Drive JSON
  → N100: Drive for desktop → raw監視 → Processor → 完成スナップショット
  → API 127.0.0.1:8787 → 本番Web 127.0.0.1:5180
Safari → Cloudflare Access → Worker → VPC Service → Tunnel → 本番Web
```

| 項目 | 現行値 |
| --- | --- |
| N100の作業ツリー | `C:\Users\ilpic\sleep-improvement-app` |
| 保存済みの実装revision | `509dd4da091eba4a8a726eb0c0aba7895e7be017`（再開時は`origin/master`の後続更新も確認） |
| raw監視先 | `L:\マイドライブ\Health Auto Export\Sleep` |
| ローカル状態 | `server-data/`（`health-store.json`、`processed-files.json`と各`.bak`） |
| 完成データ | `processed-data/snapshots/` |
| 再生成できるキャッシュ | `processed-data/cache/processor/` |
| Node / npmの実測値 | Node `v22.23.1` / npm `10.9.8` |
| 利用URL | `https://sleep-compass-private.il-piccola-fleuriste.workers.dev/` |
| Worker / Tunnel名 | `sleep-compass-private` |
| Tunnel ID | `6c5e6a7a-5adb-4745-aead-b596927acb8b` |
| VPC Service名 / ID | `sleep-compass-web` / `01a0f0a9-6c19-7501-94f1-ef70a07c4ebd` |
| VPC接続先 | `localhost:5180`、TunnelはQUIC |
| Cloudflare account ID | `eb186f33a7fc3c3bd3707e429fdc54cc` |
| Zero Trustチーム | `yellow-snow-468e`、Zero Trust Free |
| Access設定 | All traffic / Cloudflare account: Allow / 24 hours |
| Worker内部の本人制限 | `ALLOWED_EMAIL`と認証済みメールを照合。実値はCloudflare設定で確認 |
| N100自動起動タスク | `Sleep Compass Local Runtime` / `Sleep Compass Production Web` / `Sleep Compass Cloudflare Tunnel` |

2026-10-01の確認: raw 142件、snapshot `20260930T232001Z-1842e673`、APIと本番Webのhealthzは200 / healthy / fresh、watcherにエラーなし。3つのWindowsタスクはRunningで、8787と5180の待受は127.0.0.1。最初の10秒制限のruntimeチェックは両方タイムアウトし、30秒制限の個別再確認では両方正常応答した。負荷・応答時間の原因は未特定で、常に10秒以内に応答するとの保証には使わない。raw件数・snapshot IDは以後更新されるため、切替当日に再取得する。

Safariから認証後のアプリ表示を利用者が確認済み。未認証の画面とAPIはAccessログインへ302転送されることを確認済み。Mac実機、OS再起動後の復旧、Safariの全タブの個別操作は未検証。

## 保全対象

準備開始時はHEADが`4e07696bac976815d48e641671f1a5971d0a46dd`で、Cloudflare経路、画面別取得、増分Processorなどに未コミットの変更があった。その後、利用者のcommit・push依頼により、印刷機能・増分処理・Cloudflare経路・Mac引き継ぎ書とひな形を`509dd4da091eba4a8a726eb0c0aba7895e7be017`に保存した。ソースは`origin/master`から復元できる。Macでは最新の`origin/master`を取得し、旧revisionだけから移行を始めない。

再開時には再度`git status --short`を確認し、その時点の追加変更があれば作業ツリーを含む非公開バックアップまたはレビュー済みコミットで保全する。Gitから復元できるのはソース・公開用設定ひな形であり、raw JSON・Processed Data・ローカル状態・秘密情報は下表の別途保全・移送が必要。

保存前のWindows確認では`npm test`、`npm run lint`、`npm run build`がすべて成功した。Macでの実行・LaunchAgent起動は未検証。push対象は実トークンの混入と秘密情報形式を確認し、ローカル設定・実データがGit除外されていることを確認した。

| 対象 | 扱い |
| --- | --- |
| ソース、`package.json`、`package-lock.json`、`cloudflare/`、`scripts/`、`docs/` | 未コミット・未追跡の必要ファイルも含めて移す。lockfileを維持する |
| Google Drive raw JSON | Google Drive原本を維持。必要に応じて非公開の保全コピーを作り、Macへの同期後にファイル名・サイズ・SHA-256で照合する |
| `processed-data/snapshots/` | 完成スナップショットを保全。`manifest.json`と`complete.json`、データセットをまとめて移し、既存validatorで検証する |
| `server-data/` | `.bak`も含めて保全。変化するため最終コピーは書込み停止・処理終了を確認した時点で取得する |
| `.env.local` | 非公開で保全し、Macではテンプレートを基に作り直す。Windowsのパスをそのまま使わない |
| `.env.production`など他の環境設定 | 再開時に内容を安全に確認。本準備時点の`.env.production`には設定キーなし。秘密値を文書・ログへ出さない |
| `cloudflare/wrangler.jsonc` | ローカルのGit除外設定として保全。通常のホスト切替ではWorker再配置は不要 |
| `runtime-secrets/cloudflare-tunnel-token.txt` | 別途安全に転送。文書・Git・monitor artifact・公開zipに入れない。Macでは本人のみ読める権限を設定する |
| `processed-data/cache/processor/` | 任意。パス・mtimeなどの変化でキャッシュが使えない場合は再生成する |
| `processed-data/.working/`、`.processor-run.lock` | 実行中の作業物。Macの稼働データへ持ち込まない。N100側の稼働中ファイルを削除しない |
| `node_modules/`、`dist/`、Windowsの`cloudflared.exe` | Macへ流用しない。依存関係、Web build、macOS用cloudflaredをMacで用意する |

秘密情報・健康データ入りバックアップは非公開領域で管理する。Google Driveに保全するならraw監視先の外へ置く。バックアップごとに件数・サイズ・SHA-256を記録し、転送後も一致を確認する。本書は手順であり、実データの最終バックアップを作成した証明ではない。

## Macでの準備（Mac入手後）

1. macOSのバージョン、実CPUアーキテクチャ、空き容量、利用するユーザー名を確認する。Nodeはまず現行と同じ22系の互換版を使い、最新版への変更は別途検証する。
2. Node.js、Google Drive for desktop、macOS用cloudflaredを導入する。cloudflaredは公式のDarwin arm64版またはHomebrewを使い、実機のアーキテクチャに合わせる。Windows用exeは使わない。
3. 原本があるGoogleアカウントでDriveへログインし、FinderでHealth Auto ExportのSleepフォルダを確認する。対象フォルダを「オフラインで使用可能」にし、同期が完了して全JSONを読めることを確認する。Macの実パスをFinderで取得し、Windowsの`L:`パスを置換する。
4. アプリはGoogle Driveの同期フォルダ外、例として`/Users/<MAC_USER>/sleep-improvement-app`に置く。`server-data`、`processed-data`、ログ、秘密情報もrawフォルダの外のローカル領域に置く。
5. [Mac環境設定テンプレート](./templates/macos/env.mac.example)をプロジェクトの`.env.local`として複製し、rawの絶対パスを実値にする。このローダーは`$HOME`や`~`を展開しないため、rawパスへそのまま書かない。Webは同一オリジン`/api`を使い、`VITE_HEALTH_IMPORT_SERVER_URL`は空にする。
6. Nodeの依存関係は`npm ci`でMac上に再インストールし、`npm run build`を実行する。現在のフロント/API挙動と一致することを確認する。

Drive API専用コネクタやLinux向けrcloneは、今回のMac案では第一選択にしない。Drive for desktopを使う。MacのFile Providerとwatcherの相性、同期の遅延、再接続時の読取りは実機で検証する。rawとProcessed Dataが一致する`fresh`だけではDriveクラウド側の新規到着を確認した証拠にならないので、実際の新規Exportでも試す。

## ローカル動作確認とデータ再生成

N100は公開を続け、MacのTunnelはまだ起動しない。Mac側で先にローカル確認する。

Macのプロジェクトディレクトリで:

```sh
npm ci
npm run build
# それぞれ別のターミナルで実行し、公開用Viteは起動しない
npm run server
npm run serve:production
```

別のターミナルで:

```sh
SLEEP_COMPASS_WEB_URL=http://127.0.0.1:5180 npm run runtime:check
npm run test:local-runtime
npm run lint
```

移した完成スナップショットには`validateCompletedSnapshot`（`processor/snapshot.ts`）を使い、manifest・complete marker・各データセットのSHA-256を検証する。壊れたsnapshotや`.working`を完成データとして扱わない。

Macでrawのmtime等が変わり`stale`になる場合は、コピーの改ざんとは直ちに判断しない。原本のSHA-256を照合した上で、Mac側のAPI/watcherを停止してから再生成する。rawは読取り入力として保持する。

```sh
# 実際のFinderパスへ置換。API/watcherの停止と処理終了を先に確認する
PROCESSOR_CACHE_VALIDATION=sha256 npm run processor:snapshot -- "/実際の/Health Auto Export/Sleep" "./processed-data"
```

CLIの`processor:snapshot`は`.env.local`のrawパスを自動取得しないため、引数を省略しない。再生成完了後にAPI/watcherを再開し、freshと対象データを確認する。新snapshotは生成時刻や入力メタデータが異なるため、N100のsnapshot IDとの一致だけを合格条件にしない。

## Macの自動起動

`launchd`のユーザーLaunchAgentでAPI、本番Web、Tunnelをそれぞれ1プロセス起動する。ひな形を用意した:

- [API](./templates/macos/dev.sleepcompass.api.plist.example)
- [本番Web](./templates/macos/dev.sleepcompass.web.plist.example)
- [Tunnel](./templates/macos/dev.sleepcompass.tunnel.plist.example)

これらは**未インストールのひな形**。`__PROJECT_DIR__`、`__NODE_PATH__`、`__CLOUDFLARED_PATH__`をMacの実値へ置換する。`command -v node`と`command -v cloudflared`で絶対パスを確認し、plistのXMLを正しくエスケープして保存する。`~`、`$HOME`、シェルコマンド置換をplist内に残さない。

`runtime-logs/`と`runtime-secrets/`を先に作り、Macへ安全に転送したtokenファイルを`chmod 600`、秘密情報ディレクトリを`chmod 700`にする。token値をコマンド行に貼り付けず`--token-file`で渡す。既存Tunnelのtokenを使うので、zone選択を伴う`cloudflared tunnel login`は今回の手順に不要。tokenの再発行はN100へも影響するため、単なるMac準備として実施しない。

置換済みplistを`~/Library/LaunchAgents/`へ`.plist`として保存し、Macの`plutil -lint`で検証する。APIとWebを手動起動していた場合は先に終了し、各ポートが空いたことを確認してLaunchAgentを読み込む。

```sh
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/dev.sleepcompass.api.plist"
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/dev.sleepcompass.web.plist"
# Tunnelのbootstrapは次節の切替時だけ行う
```

`RunAtLoad`と`KeepAlive`でログイン時起動・終了後再起動を設定する。LaunchAgentはログイン済みユーザーのセッション用で、ログアウト後やログイン前の稼働は保証しない。Driveの起動・読取り権限、macOSのバックグラウンド実行設定、ログの増加、Macのスリープ設定を確認する。画面ロック、ログアウト、再起動は別の試験とし、再起動時にFileVaultの解除やユーザーログインが必要になる場合も確認する。

## 公開経路の切替と復旧

**同じTunnelでN100とMacのconnectorを並行起動して検証しない。** 同じTunnelのreplicaでは要求の接続先を指定できず、N100とMacのデータ版が混在し得る。Macで先にローカル試験を終える。

切替当日:

1. N100とMacのraw同期状況を確認する。必要な最終バックアップのため、N100側のAPI/watcherを一時停止し、処理終了後に最新の完成snapshotとserver-dataを保全する。取得後はN100のローカルAPIを再開して復旧可能にしておく。N100のrawや既存保存物を削除しない。
2. Macのローカル確認を済ませ、切替時点の新規raw取り込みが両側で一致していることを確認する。Mac側への最終データコピー時にもAPI/watcherの書込みを停止して整合性を保つ。
3. N100で`Stop-ScheduledTask -TaskName 'Sleep Compass Cloudflare Tunnel'`を実行し、N100のconnectorが終了したことを確認する。停止してもタスク登録自体は残るため、移行後にN100を再ログインさせる前にはこのタスクを無効化する。
4. MacのTunnel LaunchAgentをbootstrapし、QUIC接続とhealthyを確認する。URL、Worker、VPC Service、Accessを維持し、接続先は`localhost:5180`のまま使う。
5. 未認証で`/`と`/api/healthz`からデータが返らないことを確認し、本人のSafariでトップ、タイムライン、分割睡眠、診断、同期状態を操作する。直近7日詳細・31睡眠日要約と選択月取得の挙動を維持する。
6. 新しいiPhone ExportをGoogle Driveへ到着させ、Macで取得・処理・Safari表示まで進むことを確認する。Drive到着前のiOS実行待ちと、到着後の反映時間を区別して測る。
7. 成功後、N100のTunnelタスクを無効化し、再ログインで意図せず復帰しないようにする。不要なN100のアプリ自動起動タスクの無効化は対象3タスクに限定し、他アプリの4173番やタスクを操作しない。登録・旧データは復旧用に保持する。

復旧時は、まずMacのTunnelを`launchctl bootout "gui/$(id -u)" "$HOME/Library/LaunchAgents/dev.sleepcompass.tunnel.plist"`で停止する。その後N100のLocal RuntimeとProduction Webを正常化し、必要ならTunnelタスクを有効化して起動する。Mac切替後にDriveへ来たrawをN100も同期・処理し、最新データを確認してから復旧完了とする。CloudflareのURL・Access設定を削除する必要はない。

## 実機での受け入れチェック

- [ ] 移行時点の最新ソース・設定・データの保全が済み、転送後のハッシュ照合が成功
- [ ] Macの実OS・CPU・Node・cloudflaredとrawパスを記録
- [ ] APIとWebがループバックだけで待受、healthzがhealthy / fresh
- [ ] 完成snapshotのvalidatorが成功、Windows専用パスや作業中lockを稼働データへ持ち込んでいない
- [ ] rawの新規追加・同名更新が反映され、原本を破壊しない
- [ ] トップの範囲と選択月範囲、snapshot版の整合が維持される
- [ ] 本人Safariから表示でき、未認証・本人メール不一致でデータが返らない
- [ ] Drive一時停止・通信断では状態を確認でき、復帰後に欠落・重複なく取り込める
- [ ] 画面ロック中と再起動・再ログイン後のAPI、Web、Drive、Tunnel復旧を実測
- [ ] N100のconnectorが自動復帰せず、MacからN100への復旧方法が確認済み

## 次の担当者へ渡す依頼文

> N100 Windows上のSleep CompassをMac miniへ移行してください。まずdocs/o15-mac-mini-migration-handoff.mdとAGENTS.mdを読み、最新の作業ツリーと非公開データを保全してください。Macの実機情報とGoogle Driveのrawパスを確認し、同じURL・Cloudflare Accessを維持してください。Macでローカル検証が終わるまでは既存TunnelをMacで起動せず、公開経路がN100とMacへ混在しない順序で切り替えてください。新規Export・月別取得・再起動復旧・未認証拒否を確認し、復旧経路を保持してください。秘密情報や健康データ本文はGit・一般ログ・共有成果物へ含めないでください。

## 公式資料（再開時に現行仕様を再確認）

- [Google Drive for desktop対応OS](https://support.google.com/drive/answer/2375082?hl=ja)
- [Driveのオフラインファイル](https://support.google.com/drive/answer/2375012?hl=ja)
- [cloudflared macOS配布](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/)
- [同じTunnelのreplicaと接続先の制約](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-availability/)
- [AppleのLaunchAgent・LaunchDaemon説明（アーカイブ）](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html)
