# O-14 Tailscale URL 分離・併用運用

## 状態

**COMPLETE — 設定適用・HTTPS応答検証済み**

対応日: 2026-09-17（Asia/Tokyo）

## 1. 目的と背景

Sleep Compass が以前使用していた `https://leto.taile04360.ts.net/` は、現在 Moonlight Bamboo!! に割り当てられている。両アプリを同時に利用できるよう、Sleep Compass に専用のHTTPSポートを追加した。

調査時、Sleep Compass の Web（5173）とローカルAPI（8787）は既に正常稼働していた。README に記載されていた旧URLと実際の Serve 設定が一致していなかった。

## 2. 確定した構成

| アプリ | Tailscale URL | ローカル転送先 |
|---|---|---|
| Moonlight Bamboo!! | `https://leto.taile04360.ts.net/` | `http://127.0.0.1:4173` |
| Sleep Compass | `https://leto.taile04360.ts.net:8443/` | `http://127.0.0.1:5173` |

Sleep Compass の `/api` は Vite のプロキシを通じて `http://127.0.0.1:8787` に転送される。両URLとも tailnet 内限定。Funnel は今回設定していない。

## 3. 実施内容

以下を実行し、Sleep Compass のエンドポイントをバックグラウンド設定として追加した。

```powershell
tailscale serve --bg --https=8443 http://127.0.0.1:5173
tailscale serve status
```

- 既存の443 → 4173の設定を維持した。
- Vite の `allowedHosts` は既に `leto.taile04360.ts.net` を許可しており、アプリコードの変更は不要だった。
- README の運用URLを更新し、設定コマンドと併用構成を記載した。
- ローカルAPI、保存データ、既存の起動タスクは変更していない。

## 4. 検証結果

設定適用後、ホストPCから証明書検証を有効にしたHTTPSリクエストで確認した。

| 確認対象 | 結果 |
|---|---|
| 既存URL `/` | HTTP 200、ページタイトル `Moonlight Bamboo!! ─ 風上に立つひと` |
| 新URL `:8443/` | HTTP 200、ページタイトル `sleep-improvement-app` |
| 新URL `:8443/api/healthz` | HTTP 200、`status=healthy`、`source=processed_data`、`freshness=fresh` |
| `tailscale serve status` | 443 → 4173 と 8443 → 5173 の両方を確認 |

スマートフォンからの画面操作と、PC再起動後の動作は今回未検証。ビルド・アプリテストはコード変更がないため実施していない。

## 5. 今後のURL変更

### ポート番号の変更

空きポートとtailnetのアクセス許可を確認すれば、同じホスト名でポート番号を変更できる。ローカルの転送先5173はそのままでよい。

例として8443から9443へ移す場合（以下は手順例であり、未実行）:

1. `tailscale serve status` と `Get-NetTCPConnection -State Listen` で既存割り当てを確認する。9443が使用中なら別のポートを選ぶ。
2. 新URLを追加する。

   ```powershell
   tailscale serve --bg --https=9443 http://127.0.0.1:5173
   ```

3. `https://leto.taile04360.ts.net:9443/` と同URLの `/api/healthz`、Moonlight Bamboo!! の既存URLを確認する。利用端末からもアクセスする。
4. ブックマークとREADMEを更新する。新旧URLは移行中に併用できる。
5. 旧URLが不要になったら、そのポートだけ停止する。

   ```powershell
   tailscale serve --https=8443 off
   ```

元に戻す場合は8443の追加コマンドを再実行して応答を確認し、不要になった9443を `tailscale serve --https=9443 off` で停止する。

`tailscale serve reset` は他アプリの設定にも影響するため、この切替手順では使わない。443はMoonlight Bamboo!! が使用しているため、Sleep Compass の転送先で上書きしない。

### ホスト名やパスの変更

- ホスト名変更は、ポート変更とは別の設計・設定が必要。現在の `leto` は端末の名前に結び付いているため、単純な端末名変更はMoonlight Bamboo!! のURLにも影響する。アプリ専用の別ホスト名が必要なら、Tailscale側の構成とViteの `allowedHosts` を確認する。
- `/sleep/` のようなパスへの変更は、Serveの設定だけで完了すると判断しない。現状はルート配下のアセットと `/api` を使うため、Viteのbase設定とAPI経路を含めた調整・検証が必要。
- URLのオリジン（スキーム・ホスト・ポート）が変わると、localStorageに保存された設定は新URLへ自動移行しない。睡眠日区切りやソース選択などは必要に応じて再設定する。サーバーに保存された睡眠データはURL変更で移動・削除されない。

## 6. 参照

- [Tailscale Serve CLI 公式ドキュメント](https://tailscale.com/docs/reference/tailscale-cli/serve)
- [README: Local Web operation](../README.md#local-web-operation)
- [Vite設定](../vite.config.ts)

本記録はO-14の運用変更を扱う。O-13の印刷レイアウト作業とは独立した対応。
