# O-15 Cloudflare版とN100 Live USB運用計画

## 状態

**方針更新（2026-10-01）— Cloudflare配置とiPhone Safari表示は完了。利用者は将来Mac miniへ移行する予定で、Mac未入手のため移行は保留。下記Linux Live USB案は従来案として残す。**

再開時は[Mac mini移行 引き継ぎ](./o15-mac-mini-migration-handoff.md)を先に読む。N100 Windowsの現行運用を継続し、本書を根拠にLinux導入や切替を始めない。Macの実機検証・データ移行は未実施。

作成日: 2026-09-30（Asia/Tokyo）

Windows上の本番Web配信とCloudflare側の残作業は[O-15 Cloudflare配置 進捗](./o15-cloudflare-deployment-progress.md)を参照する。

## 1. 目的

N100を当面Linux Live USBで運用できるようにし、その期間もSleep CompassをCloudflare経由の固定URLで安全に利用する。OSが変わっても、iPhoneのHealth Auto Export原本からの取り込み、Processed Dataの更新、再起動後の復旧を維持する。

O-14はWindows上のTailscale URL分離を完了した記録として維持する。O-15は新しい公開経路とLinux運用の計画であり、O-13の印刷機能とは独立する。

## 2. 現状と移行の制約

- WebはVite開発サーバー（`127.0.0.1:5173`）、ローカルAPIは`127.0.0.1:8787`。Webの`/api`プロキシがAPIへ転送する。現行Webには利用者ログインがない。
- WindowsではGoogle Drive for desktopの`L:`ドライブにあるHealth Auto ExportのJSONを監視する。Linux版Drive for desktopは提供されていないため、監視先をそのまま移すことはできない。
- Windowsログオンタスクが`dev:all`を起動している。Linuxでは別の起動・再起動監視が必要。
- Live USBが非永続構成なら、再起動でアプリ、トンネルの認証情報、原本のローカルコピー、`server-data`、`processed-data`、設定やログが失われ得る。これらは永続ストレージに置くか、再取得・再生成可能であることを検証する。
- Cloudflare Tunnelはアクセス経路を作る。N100が停止している間もSleep Compassを使いたい場合は、アプリとデータを別の常時稼働先へ移す追加計画が必要。

## 3. 目標構成

```text
iPhone Health Auto Export → Google Drive原本
                              ↓ 同期・取得（方式をO-15で決定）
N100永続ストレージ → raw JSON → Processor → Processed Data
                                  ↓
N100 Linux: Web静的配信 + 同一オリジン /api → ローカルAPI
                                  ↑
Cloudflare Access → workers.devのWorker → Workers VPC Service → Cloudflare Tunnel → N100のローカルWeb
```

- 固定URLはCloudflare提供の`*.workers.dev`を使い、ドメインは購入しない。`trycloudflare.com`のランダムURLは検証専用とする。
- Cloudflare Accessで許可した利用者だけが、Web、`/api`、ヘルス確認用URLへ到達できるようにする。Accessの保護を確認してから公開ルートを有効化し、トンネル側でもAccessトークン検証を検討する。
- WebとAPIは同一オリジンに保つ。公開先にVite開発サーバーを使い続ける前提にはせず、`npm run build`の成果物を配信するWebサーバーと`/api`のローカル転送を用意する。APIを独立した公開ホストにしない。
- ローカル本番Web配信は`npm run serve:production`で実装済み。既定の`127.0.0.1:5180`から`dist`を配信し、`/api`を`127.0.0.1:8787`へ転送する。4173は別アプリ用のため使用しない。実データの`/api/healthz`とcompact statusを同一オリジンで検証済み。
- アプリ、API、トンネル、原本取得処理はLinuxのサービスとして起動し、OS再起動後に復旧する。公開先から到達できる間だけアプリが動くことを明示する。
- 原本、ローカル状態、Processed Data、秘密情報は用途ごとに分けて永続化する。原本を処理済みデータの再生成で上書きしない。

## 4. 作業順序と判断ゲート

### O-15a: Live USBと永続領域の設計

1. Live USBの方式、再起動時に残る領域、永続ストレージの容量・マウント先・暗号化・バックアップ方法を確認する。
2. リポジトリ、依存関係、原本、`server-data`、`processed-data`、設定・秘密情報、ログの配置先を決める。`HEALTH_EXPORT_WATCH_DIR`等はLinuxの実パスへ設定し、コードに端末固有パスを埋め込まない。
3. 再起動後のマウント失敗時には古いProcessed Dataを「最新」と誤表示しない運用を決める。

**ゲート:** 再起動後に同じ永続データへアクセスでき、原本とProcessed Dataの退避・復元手順を確認できる。

### O-15b: Google Drive原本の取得・監視方式

取得方式・遅延目標・安全な配置・認証・故障時の扱いの詳細案は[O-15b Google Drive JSON差分取得 設計検討](./o15b-drive-json-acquisition-design.md)を参照する。実装前の判断事項は同文書に残す。

1. WindowsのDrive for desktopに代わる方式を決める。候補はGoogle Drive APIからの定期取得、またはLinuxで動く同期ツール。認証方法、最小権限、秘密情報の保存場所、更新検出、切断後の再試行を比較する。
2. 取得したJSONを永続ストレージのrawディレクトリへ安全に配置する。同期途中のファイルを処理しない方法を決め、同名ファイルや再取得の扱いを検証する。
3. 既存のwatcher、Processor、`/api/healthz`の鮮度判定との接続を確認する。原本ファイル数だけでなく、新規ファイルがProcessed Dataに反映されることを確認する。

**ゲート:** 新しいHealth Auto Export JSONの到着後に取り込み・Processed Data更新が完了し、切断・再起動後も重複や欠落なく再開できる。

### O-15c: LinuxのWeb・API運用

1. Production buildと静的ファイル配信、同一オリジン`/api`プロキシをLinuxで構成する。
2. API、原本取得処理、Webをサービス化し、起動順序、障害時の再起動、ログ、ローカルヘルスチェックを設ける。
3. APIはループバックのみで待ち受け、Webサーバーを経由しない直接公開がないことを確認する。

**ゲート:** 起動・再起動後にWebとAPIが応答し、原本の鮮度・Processorの状態を確認できる。

### O-15d: Cloudflare公開とアクセス制御

1. Cloudflareアカウントで`workers.dev`のURLと本人認証方法を設定する。
2. TunnelとWorkers VPC Serviceを作り、WorkerからN100のローカルWebへ接続する。`cloudflared`をサービス化する。
3. AccessでWorker全体を保護し、未認証者がアプリと睡眠データへ到達できないことを検証する。
4. PCとスマートフォンのブラウザでログイン、Web表示、睡眠記録、診断画面、`/api/healthz`の扱いを確認する。新URLではブラウザ保存設定の再設定が必要か確認する。

**ゲート:** 許可した利用者のみが固定URLを利用でき、Webと同一オリジンAPIが正常に動く。N100再起動後もトンネルとアプリが自動復旧する。

### O-15e: 切替と復旧手順

1. Windows環境の原本とProcessed Dataを保全し、Linux側へ必要なデータをコピーして件数・ハッシュ等で検証する。
2. Cloudflare側の実データの鮮度を確認してから日常利用URLを切り替える。移行確認中の復旧はWindowsのローカル実行環境で行う。
3. 原本取得・API・Web・Tunnelのどこで停止したか分かる確認手順と、旧環境へ戻す手順を記録する。

**完了条件:** Live USB再起動とネットワーク一時断の後、新規原本の取り込みを含めた一連の動作を再確認し、利用者端末から固定URLで閲覧できる。保全データの整合性、アクセス制御、ロールバック手順が確認済み。

## 5. 未決定事項

実装前に以下を確定する。計画作成の時点では未決定として扱う。

- `workers.dev`の実URL、およびAccessで許可する利用者・認証方法。
- Live USBで使う永続ストレージの形態とマウント先。N100が停止中でもアクセスを維持する必要があるか。
- Google Drive原本の取得方式と認証情報の管理方法。
- Linux配信サーバー・サービス管理方法。選択後に実機で性能と再起動復旧を確認する。

## 6. 参考資料

- [O-14 Tailscale URL分離](./o14-tailscale-url-coexistence.md)
- [現行ローカルWeb運用](../README.md#local-web-operation)
- [Cloudflare Tunnelの公開ルート](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/)
- [Cloudflare Accessのセルフホストアプリ保護](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)
- [Cloudflare Quick Tunnelの制約](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)
- [Google Drive for desktopの対応OS](https://support.google.com/drive/answer/2375082?hl=en)
- [Viteの静的配信ガイド](https://vite.dev/guide/static-deploy)
