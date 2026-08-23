# O-12a Google Drive mount 最終確認

Status: **PASS**  
Phase: **O-12a — 現状監査**  
Evidence ID: `OBS-O12A-DRIVE-001`

## 目的

`CX-O12A-003` では `GoogleDriveFS running: true` まで確認できたが、Codex実行環境からlogical drive情報へのアクセスが拒否され、mount pathを取得できなかった。

このため、Drive mountの最終確認はCodex/PowerShellを追加消費せず、N100上でread-only目視確認した。

## 確認結果

2026-08-23にユーザーがN100上で次を確認した。

```text
Streaming location: L:\マイドライブ
Health Auto Export visible: true
Sleep visible: true
変更: なし
```

実際のraw source path:

```text
L:\マイドライブ\Health Auto Export
```

その配下に `Sleep` directoryが存在する。

## 判定

**PASS**

- N100からOS-visible Google Drive境界を確認できた。
- `L:\マイドライブ\Health Auto Export` が見える。
- その配下に `Sleep` が見える。
- connected Google Drive側でもraw source存在は別途確認済み。
- drive letter `L:` は現在環境の観測値としてのみ扱い、O-12実装へhardcodeしない。
- Processorではraw rootを設定値として受け取り、persistent identityにはabsolute path/drive letterを含めない。

## 補足

`CX-O12A-002` / `CX-O12A-003` が `Health Auto Export` を見つけられなかった主因は、Codex実行環境のlogical drive列挙制約に加え、raw sourceが `L:` 直下ではなく `L:\マイドライブ\Health Auto Export` に存在していたことと整合する。

Google Drive for desktopのWindows版は、Google Driveのストリーミング場所としてdrive letterだけでなくfolderを選択できるため、logical drive列挙だけではmount locationを完全には判定できない。
