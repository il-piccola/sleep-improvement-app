# O-15 Cloudflare配置 進捗

2026-10-01（Asia/Tokyo）

## 現在の状態

Cloudflare経由の配置とiPhone Safariでの表示確認が完了した。利用者はTailscaleを使わず、ドメインも購入しない。Cloudflare Tunnel、Workers VPC Service、Worker、Accessが稼働している。Zero Trust FreeでWorker全体を保護し、Worker本体でも本人メールとの一致を必須にしている。未ログインの画面・API要求はAccessのログイン画面へ転送される。

利用URL: https://sleep-compass-private.il-piccola-fleuriste.workers.dev/

現在のWeb、API、データ処理はN100のWindows上で動作するため、外出先からの利用にもN100の電源・ネット接続・稼働状態が必要。N100がスリープや停止中はアプリを利用できない。利用者はMac miniへの移行を予定しているが未入手のため保留。[Mac mini移行 引き継ぎ](./o15-mac-mini-migration-handoff.md)に手順と設定ひな形を用意した。

## 完了した作業

- `npm run build`の成果物を`127.0.0.1:5180`で配信する本番Webサーバーを追加した。`/api`は既存のループバックAPI `127.0.0.1:8787`へ同一オリジンで転送する。
- Windowsログオン時に本番Webだけを起動する`Sleep Compass Production Web`タスクを追加・起動した。既存の`Sleep Compass Local Runtime`も稼働中。
- 別アプリに割り当てられた4173番は使用していない。
- Cloudflare公式リリースの`cloudflared` 2026.9.3 Windows実行ファイルをユーザー領域に配置し、公式GitHubリリースのSHA-256と一致することを確認した。
- rawフォルダーの状態を読めなくなった場合、古いキャッシュが残っていてもProcessed Dataの鮮度を`stale`、理由を`raw_status_unavailable`と表示するようにした。
- `cloudflare/worker.mjs`にAccessの本人認証と本人メール一致を必須とするWorkerを用意した。認証がない場合は閉じ、Workers VPC Service経由で同一オリジンの本番Webへ転送する。
- Tunnel `sleep-compass-private`と`localhost:5180`専用VPC Service `sleep-compass-web`を作成した。TunnelはQUIC接続でhealthy。トークンと実行ファイルはGit除外の`runtime-secrets`と`runtime-bin`へ置き、本人のみが読めるACLをトークンへ設定した。
- Worker `sleep-compass-private`を`https://sleep-compass-private.il-piccola-fleuriste.workers.dev`へ配置した。Access有効化前は未認証要求をWorkerがHTTP 403で拒否した。有効化後はAccessがログイン画面へHTTP 302で転送する。
- Windowsログオン時にTunnelを起動する`Sleep Compass Cloudflare Tunnel`タスクを追加した。停止・再起動後に単一の`cloudflared`プロセスとRunning状態を確認した。
- iPhone SafariでZero Trust Freeの初期登録とWorkerのAccess設定を完了した。Scopeは`All traffic`、Authentication policyは`Cloudflare account: Allow`、Session durationは24時間。チーム名は`yellow-snow-468e`。利用者から認証後のアプリ表示画像を受領した。

## ローカル検証

- `http://127.0.0.1:5180/`: HTTP 200。
- `http://127.0.0.1:5180/api/import-status?compact=1`: 完成Processed Dataの`dataVersion`を返す。
- `http://127.0.0.1:5180/api/healthz`: `healthy`、`fresh`。
- 5180番の待受アドレスは`127.0.0.1`。
- `npm run test:local-runtime`、`npm run build`、`npm run lint`、本番Webを対象にした`npm run runtime:check`が成功。
- `node --test tests/cloudflare-worker.test.mjs`の3件が成功。本人メール不一致・Access認証なしの拒否、転送時の認証情報除去、許可メソッドの制限を確認した。
- Wrangler `dev`はこのWindows環境の`workerd`がaccess violationで停止するため、ローカルのVPC経由テストは実施できていない。本番のAccess・Worker・VPC・Tunnel・Web経路はiPhone Safariでアプリが表示できたことを確認した。
- 2026-10-01の未認証HTTP確認では`/`、`/api/healthz`、`/api/health-records?month=2026-09`がすべてHTTP 302で`yellow-snow-468e.cloudflareaccess.com`のログイン画面へ転送され、睡眠データは返されなかった。
- 同時刻の本番Webを対象にした`npm run runtime:check`は`api=ok web=ok data=processed_data freshness=fresh`。rawは142件、watcherは稼働中でエラーなし。
- Local Runtime、Production Web、Cloudflare Tunnelの3つのWindowsタスクがRunningで、cloudflaredは単一プロセス。

## ドメイン購入なしのCloudflare構成

1. 完了: SafariでZero Trust Freeの有効化を確認。Wrangler OAuthにはAccessアプリ管理の権限がないため、利用者がSafariでAccessを設定した。
2. 完了: Cloudflare AccessでWorker全体をCloudflareアカウントメンバーに限定。Worker本体は本人のメールに一致しない場合も拒否する。
3. 完了: 未認証の画面とAPIがログイン画面へ転送されることと、認証後のiPhone Safariでアプリとデータが表示されることを確認。Safariの全タブの個別操作は未確認。
4. 今後の運用確認: Windows自体を再起動した後のWeb、API、Tunnel復旧は未確認。ログオン時の起動設定とTunnelタスクの停止・再起動は確認済み。Mac miniへの移行は保留で、自動起動・Drive同期・再起動復旧を実機で検証する。手順はMac mini移行引き継ぎに記載した。

`*.workers.dev`はCloudflareが提供するURLで、ドメイン購入は不要。Workers VPCは2026-09-30時点でベータ版であり、仕様変更の可能性がある。健康データを含むWebとAPIを、AccessなしのQuick Tunnelや公開Pagesへ直接置く運用は採用しない。

2026-09-30にWranglerのデバイス認証をiPhone Safariで完了した。`cloudflare/wrangler.example.jsonc`のdry-run配置チェックとWorkerの単体テストは成功した。

2026-10-01、利用者がSafariでZero Trust Freeの初期登録を完了した。Cloudflare公式資料によるとFreeプランでも初期登録に支払い情報が必要で、Freeプラン自体は課金されない。現在はCloudflare標準のAccess認証を採用している。

参考: [Workers VPC](https://developers.cloudflare.com/workers-vpc/)、[VPC Service手順](https://developers.cloudflare.com/workers-vpc/get-started/)、[WorkersとAccess](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)、[Zero Trust初期設定](https://developers.cloudflare.com/cloudflare-one/setup/)、[Wranglerデバイス認証](https://developers.cloudflare.com/changelog/post/2026-08-04-wrangler-login-device-flow/)。
