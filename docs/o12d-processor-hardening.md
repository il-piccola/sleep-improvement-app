# O-12d Processor hardening

Status: **IMPLEMENTED — consolidated validation待ち**  
Phase: **O-12d — Processor hardening**  
Updated: **2026-08-24**

## 1. 目的

O-12cで独立化したData Processorを、N100上で長期運用できるlocal-first Processorへ堅牢化する。

このphaseではCloud停止・Firestore移行・Sleep Compass Web切替は行わない。

## 2. 実装範囲

### A. local state安全化

`server/safeJsonFile.ts`

- temporary file経由のstate write
- primary更新前にbackupを保持
- primary破損/欠落時はvalid backupからrecovery
- valid backupからprimaryを復元
- primary/backup双方invalidなら`JsonStateCorruptionError`
- corruptionをempty stateとして黙って扱わない

`server/healthStore.ts`

- `health-store.json`をsafe JSON stateへ移行
- `loadHealthStoreWithStatus()`で`ok / missing / recovered_from_backup`を区別
- import historyの50件truncateを撤廃

### B. processed-file ledger安全化

`server/processedFiles.ts`

- persistent identityをabsolute pathからraw root基準`relativePath`へ変更
- path separatorを`/`へcanonical化
- drive letter / mount pathをpersistent identityへ保存しない
- 500件truncateを撤廃
- importer versionを`3`へ更新
- legacy absolute `path` entryはconfigured raw rootがある場合のみrelativeへ変換
- metadata-first unchanged判定
- metadataが変化した場合のみstreaming SHA-256計算
- metadataが変わっても同一content hashなら再importしない
- ledgerの一部entryがinvalidなら黙ってdropせずstate invalidとしてbackup recoveryへ回す

### C. watcher / rescan hardening

`server/watchHealthExports.ts`

- metadata-first skip
- conditional SHA-256
- deterministic recursive scan order
- per-file failureをqueue全体failureへ波及させない
- watcher disable option

`server/rescan.ts`

- local HTTP server依存を撤廃
- server未起動でもstandalone one-shot rescan可能

### D. OS/path configuration

`server/config.ts`

追加config:

- `HEALTH_IMPORT_WATCH_ENABLED`
- `HEALTH_IMPORT_DATA_DIR`
- `PROCESSED_DATA_DIR`
- `PROCESSED_DATA_BACKUP_DIR`

ルール:

- implementationにdrive letterや`マイドライブ`をhardcodeしない
- state / processed output / backupは`HEALTH_EXPORT_WATCH_DIR`の下へ置けない
- current N100 observed pathはhost configでのみ設定する

`.env.example`から旧`K:` hardcodeを削除した。

### E. immutable Processed Data snapshot

`processor/snapshot.ts`

- schema `1.0.0`
- canonical JSON/JSONL dataset publication
- stable JSON key ordering
- dataset recordCount / byteLength / SHA-256
- manifest required fields/config validation
- canonical dataset required-field validation
- local `.working` areaで生成
- `complete.json`生成前にdataset/manifest検証
- unique snapshot directoryへrenameしてpublish
- existing snapshot IDをoverwriteしない
- `complete.json` / manifest SHA / dataset SHA/count validation
- incomplete/corrupt snapshotをconsumer validationでreject

### F. Google Drive backup境界

snapshot writerはoptional `backupRoot`を受ける。

- localで完成済みsnapshotだけをcopy
- backup先はraw watch rootとは分離
- manifest/datasetsを先にcopy
- hash/count再検証
- `complete.json`を最後にcopy
- backup側も`validateCompletedSnapshot()`を通す
- backup失敗時は`complete.json`を残さずincomplete扱い
- completed backupを自動削除しない

O-12d validationではsynthetic temp backupを利用し、実Health dataや実Google Driveへは書き込まない。実Driveへのfirst canonical backupはO-12e reconstruction実行時に行う。

### G. raw directory → canonical snapshot

`processor/processDirectory.ts`

- raw root配下JSONをdeterministic順でscan
- absolute host pathをsnapshotへ保存しない
- raw root基準relative path + metadata + content hashから`sourceFileId`
- C1 Health Auto Export normalization
- C2 canonical sleep integration/block/sleep-day
- C3 daily health metrics / sleep-window health metrics
- canonical sleep-records / blocks / days / source summaries / overlaps / health metrics / diagnostics生成
- failure/unsupported fileも`input-files.jsonl` / diagnosticsに記録
- raw bodyをdiagnosticsへ保存しない

`processor/runDirectory.ts`

```text
npm run processor:snapshot -- <raw-root> <processed-data-root> [backup-root]
```

server / Web / Cloud / Firebase / Tailscaleなしでsnapshot生成できる。

## 3. Synthetic hardening test

`tests/processor-hardening.test.ts`

実Health dataを使わずtemp directoryだけで以下をまとめて検証する。

- atomic state + backup recovery
- primary/backup双方corrupt時の明示error
- relative-path processed ledger
- metadata-first skip
- metadata change + same content hash skip
- standalone watcher rescan
- second rescan metadata skip
- configurable local/processed/backup paths
- raw root配下へのoutput禁止
- immutable snapshot publication
- local/backup complete marker validation
- same snapshot ID overwrite拒否
- tamper後のSHA validation failure
- synthetic raw directory → canonical snapshot end-to-end
- snapshot内にabsolute raw rootが含まれないこと

## 4. O-12d Exit Gate

次を全て満たしたらO-12d COMPLETEとする。

- [x] atomic state write実装
- [x] corruption distinction/recovery実装
- [x] health-store history truncate撤廃
- [x] path-portable processed ledger実装
- [x] 500件truncate撤廃
- [x] metadata-first / conditional SHA実装
- [x] standalone rescan実装
- [x] watcher output/root分離config実装
- [x] OS-portable config実装
- [x] immutable snapshot writer実装
- [x] complete marker / hash/count validation実装
- [x] completed-snapshot backup実装
- [x] raw directory → snapshot standalone Processor実装
- [ ] synthetic hardening test PASS
- [ ] root build PASS
- [ ] final worktree CLEAN
- [ ] full regression PASS、または既知`uv_os_get_passwd ENOMEM`のみのenvironment exception

O-12d完了前にO-12eの実データmigration/reconstructionを開始しない。
