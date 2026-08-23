# O-12a Google Drive mount 最終確認

Status: **READY — Codex追加実行不要**  
Phase: **O-12a — 現状監査**

## 目的

`CX-O12A-003` では `GoogleDriveFS running: true` まで確認できたが、Codex実行環境からlogical drive情報へのアクセスが拒否され、mount pathを取得できなかった。

このため、Drive mountの最終確認はCodex/PowerShellを追加消費せず、Google Drive for desktopの設定画面をread-onlyで確認する。

## 確認方法

WindowsのGoogle Drive for desktopを開く。

1. タスクトレイのGoogle Driveアイコンを開く。
2. 設定アイコン → **設定** を開く。
3. 右上の歯車（詳細設定）を開く。
4. **Google Driveのストリーミングの場所** を確認する。
5. 次のどちらかだけを記録する。
   - Drive letter（例: `X:`）
   - Folder path（例: `C:\...\GoogleDrive`）
6. 設定は変更しない。
7. その場所から `Health Auto Export` → `Sleep` が見えることだけ確認する。health JSON本文は開かない。

## 返却内容

```text
OBS-O12A-DRIVE-001
Streaming location: <drive letter または folder path>
Health Auto Export visible: true / false
Sleep visible: true / false
変更: なし
```

## 判定

- streaming locationが確認でき、`Health Auto Export/Sleep` が見えればDrive mount inventoryはPASS。
- connected Google Drive側ではraw source存在を既に確認済みなので、ここではOS-visible boundaryだけ確認する。
- drive letterは現状証拠として記録してよいが、O-12実装へhardcodeしない。

## 参考

Google Drive for desktopのWindows版は、Google Driveのストリーミング場所としてdrive letterだけでなくfolderを選択できる。したがって、logical drive列挙だけではmount locationを完全には判定できない。
