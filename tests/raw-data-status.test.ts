import assert from 'node:assert/strict'
import {
  assessProcessedDataFreshness,
  type RawJsonFilesStatus,
} from '../server/rawDataStatus.ts'

const raw: RawJsonFilesStatus = {
  fileCount: 2,
  latestFileName: 'HealthAutoExport-2026-09-08.json',
  latestModifiedAt: '2026-09-08T00:00:00.000Z',
}

const processed = {
  inputFiles: [
    { modifiedAt: '2026-09-07T00:00:00.000Z' },
    { modifiedAt: '2026-09-08T00:00:00.000Z' },
  ],
} as never

assert.equal(assessProcessedDataFreshness(raw, processed).status, 'fresh')
assert.equal(
  assessProcessedDataFreshness(
    { ...raw, latestModifiedAt: '2026-09-08T00:00:01.000Z' },
    processed,
  ).status,
  'stale',
)
assert.equal(assessProcessedDataFreshness({ ...raw, fileCount: 3 }, processed).reason, 'raw_file_count_differs')
assert.equal(assessProcessedDataFreshness(raw, null).status, 'no_snapshot')
assert.equal(assessProcessedDataFreshness({ fileCount: 0, latestFileName: null, latestModifiedAt: null }, processed).status, 'no_raw_data')

console.log('raw data status tests passed')
