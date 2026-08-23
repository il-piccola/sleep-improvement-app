import assert from 'node:assert/strict'
import { processHealthAutoExportText } from '../processor/healthAutoExport.ts'

const validInput = JSON.stringify({
  metrics: [
    {
      name: 'sleep_analysis',
      data: [
        {
          startDate: '2026-08-22T23:00:00+09:00',
          endDate: '2026-08-23T00:00:00+09:00',
          value: 'Core',
          sourceName: 'Test Watch',
        },
        {
          startDate: '2026-08-23T00:00:00+09:00',
          endDate: '2026-08-23T00:30:00+09:00',
          value: 'REM',
          sourceName: 'Test Watch',
        },
        {
          startDate: '2026-08-23T00:30:00+09:00',
          value: 'Deep',
          sourceName: 'Test Watch',
        },
      ],
    },
  ],
})

const result = processHealthAutoExportText({
  sourceFile: 'synthetic-health-export.json',
  text: validInput,
})

assert.equal(result.sourceFile, 'synthetic-health-export.json')
assert.equal(result.records.length, 2)
assert.equal(result.rejectedRows, 1)
assert.equal(result.audit.convertibleRows, 2)
assert.equal(result.audit.rejectedRows, 1)
assert.deepEqual(
  result.records.map((record) => record.stage),
  ['asleep_core', 'asleep_rem'],
)

assert.throws(
  () =>
    processHealthAutoExportText({
      sourceFile: 'broken.json',
      text: '{not-json',
    }),
  /JSONではありません/,
)

console.log('processor-health-auto-export: PASS')
