import assert from 'node:assert/strict'
import {
  auditHealthAutoExportMetrics,
  mergeMetricAuditSummaries,
} from '../cloud-api/src/lib/healthMetricsAudit.js'
import { parseDriveSyncOptions } from '../cloud-api/src/routes/driveSync.js'

function run(): void {
  testListsMetricsAndKeepsSleepHandledSeparately()
  testMissingDataDoesNotThrow()
  testUnknownMetricDoesNotThrow()
  testFieldPresenceAndAggregation()
  testSampleLimits()
  testAuditDoesNotIncludeMetricDataBody()
  testStructureAuditDetectsRowKeysWithoutValues()
  testStructureAuditDetectsCandidateFields()
  testStructureAuditClassifiesDenseDateOnlyRows()
  testStructureAuditSampleLimits()
  testMergeSummaries()
  testDriveSyncAuditProcessedMetricsDefaultsOff()
  testDriveSyncAuditProcessedMetricsLimit()
  testDriveSyncMetricStructureAuditDefaultsOff()
  testDriveSyncBackfillHealthMetricsOptions()
  console.log('health metrics audit test cases passed')
}

function testListsMetricsAndKeepsSleepHandledSeparately(): void {
  const audit = auditHealthAutoExportMetrics({
    metrics: [
      {
        name: 'sleep_analysis',
        data: [{ startDate: '2026-05-24T00:00:00+09:00', endDate: '2026-05-24T01:00:00+09:00', value: 'Core' }],
      },
      {
        name: 'step_count',
        data: [{ startDate: '2026-05-24T10:00:00+09:00', endDate: '2026-05-24T10:05:00+09:00', value: 120, unit: 'count' }],
      },
    ],
  })

  assert.equal(audit.metricCount, 2)
  assert.equal(audit.nonSleepMetricCount, 1)
  assert.equal(audit.warningCount, 0)

  const sleep = audit.metrics.find((metric) => metric.metricName === 'sleep_analysis')
  const steps = audit.metrics.find((metric) => metric.metricName === 'step_count')

  assert.equal(sleep?.handling, 'handled_as_sleep')
  assert.equal(sleep?.saveCandidate, false)
  assert.equal(steps?.handling, 'metric_audit')
  assert.equal(steps?.saveCandidate, true)
}

function testMissingDataDoesNotThrow(): void {
  const audit = auditHealthAutoExportMetrics({
    metrics: [{ name: 'heart_rate' }],
  })

  assert.equal(audit.metricCount, 1)
  assert.equal(audit.status, 'completed_with_warnings')
  assert.equal(audit.metrics[0].metricName, 'heart_rate')
  assert.equal(audit.metrics[0].hasData, false)
  assert.ok(audit.metrics[0].warningCount > 0)
}

function testUnknownMetricDoesNotThrow(): void {
  const audit = auditHealthAutoExportMetrics({
    metrics: [
      {
        name: 'custom_metric',
        data: [{ date: '2026-05-24', value: 'medium', unit: 'level' }],
      },
    ],
  })

  assert.equal(audit.metricCount, 1)
  assert.equal(audit.metrics[0].metricName, 'custom_metric')
  assert.equal(audit.metrics[0].saveCandidate, 'unknown')
  assert.equal(audit.metrics[0].inferredAggregation, 'daily_summary')
}

function testFieldPresenceAndAggregation(): void {
  const raw = auditHealthAutoExportMetrics({
    metrics: [
      {
        name: 'heart_rate',
        data: [
          { startDate: '2026-05-24T10:00:00+09:00', endDate: '2026-05-24T10:01:00+09:00', value: 80, unit: 'count/min' },
        ],
      },
    ],
  }).metrics[0]
  const daily = auditHealthAutoExportMetrics({
    metrics: [
      {
        name: 'resting_heart_rate',
        data: [{ date: '2026-05-24', value: 68, unit: 'count/min' }],
      },
    ],
  }).metrics[0]

  assert.equal(raw.hasStart, true)
  assert.equal(raw.hasEnd, true)
  assert.equal(raw.hasDate, false)
  assert.equal(raw.hasValue, true)
  assert.equal(raw.hasUnit, true)
  assert.equal(raw.inferredAggregation, 'raw')

  assert.equal(daily.hasStart, false)
  assert.equal(daily.hasEnd, false)
  assert.equal(daily.hasDate, true)
  assert.equal(daily.inferredAggregation, 'daily_summary')
}

function testSampleLimits(): void {
  const audit = auditHealthAutoExportMetrics({
    metrics: [
      {
        name: 'multi_unit',
        data: Array.from({ length: 12 }, (_unused, index) => ({
          value: index % 2 === 0 ? index : String(index),
          unit: `unit-${index}`,
        })),
      },
    ],
  })
  const metric = audit.metrics[0]

  assert.equal(metric.unitSamples.length, 5)
  assert.ok(metric.valueTypeSamples.length <= 5)
  assert.ok(metric.warnings.length <= 10)
}

function testAuditDoesNotIncludeMetricDataBody(): void {
  const privateValue = 'PRIVATE_HEALTH_VALUE_SHOULD_NOT_APPEAR'
  const audit = auditHealthAutoExportMetrics({
    metrics: [
      {
        name: 'heart_rate',
        data: [{ startDate: '2026-05-24T10:00:00+09:00', endDate: '2026-05-24T10:01:00+09:00', value: privateValue, unit: 'count/min' }],
      },
    ],
  })

  assert.equal(JSON.stringify(audit).includes(privateValue), false)
  assert.equal(audit.metrics[0].valueTypeSamples[0], 'string')
}

function testStructureAuditDetectsRowKeysWithoutValues(): void {
  const privateValue = 'PRIVATE_NUMERIC_HEALTH_VALUE_SHOULD_NOT_APPEAR'
  const audit = auditHealthAutoExportMetrics(
    {
      metrics: [
        {
          name: 'heart_rate',
          data: [
            {
              endDate: '2026-05-24T10:01:00+09:00',
              sourceName: 'Watch',
              startDate: '2026-05-24T10:00:00+09:00',
              unit: 'count/min',
              valueNumeric: privateValue,
            },
          ],
        },
      ],
    },
    { includeStructure: true },
  )
  const structure = audit.metrics[0].structure

  assert.ok(structure)
  assert.deepEqual(
    structure.rowShapes[0].keys,
    ['endDate', 'sourceName', 'startDate', 'unit', 'valueNumeric'],
  )
  assert.equal(JSON.stringify(audit).includes(privateValue), false)
}

function testStructureAuditDetectsCandidateFields(): void {
  const audit = auditHealthAutoExportMetrics(
    {
      metrics: [
        {
          name: 'heart_rate',
          data: [
            {
              bpm: 70,
              metadata: { unit: 'count/min' },
              startDate: '2026-05-24T10:00:00+09:00',
              endDate: '2026-05-24T10:01:00+09:00',
            },
          ],
        },
      ],
    },
    { includeStructure: true },
  )
  const structure = audit.metrics[0].structure

  assert.ok(structure)
  assert.equal(
    structure.numericFieldCandidates.some((candidate) => candidate.fieldPath === 'bpm'),
    true,
  )
  assert.equal(
    structure.unitFieldCandidates.some((candidate) => candidate.fieldPath === 'metadata.unit'),
    true,
  )
  assert.equal(structure.startFormat, 'datetime')
  assert.equal(structure.hasTimezoneOffset, true)
}

function testStructureAuditClassifiesDenseDateOnlyRows(): void {
  const audit = auditHealthAutoExportMetrics(
    {
      metrics: [
        {
          name: 'step_count',
          data: Array.from({ length: 30 }, (_unused, index) => ({
            date: '2026-05-24',
            value: index,
          })),
        },
      ],
    },
    { includeStructure: true },
  )
  const structure = audit.metrics[0].structure

  assert.ok(structure)
  assert.equal(structure.dateFormat, 'date_only')
  assert.equal(structure.uniqueDateCount, 1)
  assert.equal(structure.maxRowsPerDate, 30)
  assert.equal(structure.inferredAggregationV2, 'raw')
}

function testStructureAuditSampleLimits(): void {
  const audit = auditHealthAutoExportMetrics(
    {
      metrics: [
        {
          name: 'custom_metric',
          data: Array.from({ length: 30 }, (_unused, index) => ({
            date: `2026-05-${String((index % 9) + 1).padStart(2, '0')}`,
            [`value_${index}`]: index,
            unit: `unit-${index}`,
          })),
        },
      ],
    },
    { includeStructure: true },
  )
  const structure = audit.metrics[0].structure

  assert.ok(structure)
  assert.ok(structure.rowKeyCounts.length <= 20)
  assert.ok(structure.rowShapes.length <= 5)
  assert.ok(structure.numericFieldCandidates.length <= 20)
  assert.ok(structure.unitFieldCandidates[0].unitNameSamples.length <= 5)
}

function testMergeSummaries(): void {
  const first = auditHealthAutoExportMetrics({
    metrics: [{ name: 'step_count', data: [{ date: '2026-05-24', value: 100, unit: 'count' }] }],
  })
  const second = auditHealthAutoExportMetrics({
    metrics: [{ name: 'step_count', data: [{ date: '2026-05-25', value: 200, unit: 'count' }] }],
  })
  const merged = mergeMetricAuditSummaries([first, second])

  assert.equal(merged.metricCount, 1)
  assert.equal(merged.metrics[0].rowCount, 2)
  assert.equal(merged.metrics[0].unitSamples.length, 1)
}

function testDriveSyncAuditProcessedMetricsDefaultsOff(): void {
  const options = parseDriveSyncOptions(new URL('https://example.test/api/drive-sync'))

  assert.equal(options.auditProcessedMetrics, false)
  assert.equal(options.auditProcessedMetricsLimit, 10)
  assert.equal(options.metricStructureAudit, false)
}

function testDriveSyncAuditProcessedMetricsLimit(): void {
  const enabled = parseDriveSyncOptions(
    new URL('https://example.test/api/drive-sync?auditProcessedMetrics=true&auditProcessedMetricsLimit=3'),
  )
  const capped = parseDriveSyncOptions(
    new URL('https://example.test/api/drive-sync?auditProcessedMetrics=1&auditProcessedMetricsLimit=999'),
  )
  const fallback = parseDriveSyncOptions(
    new URL('https://example.test/api/drive-sync?auditProcessedMetrics=true&auditProcessedMetricsLimit=-1'),
  )

  assert.equal(enabled.auditProcessedMetrics, true)
  assert.equal(enabled.auditProcessedMetricsLimit, 3)
  assert.equal(capped.auditProcessedMetrics, true)
  assert.equal(capped.auditProcessedMetricsLimit, 20)
  assert.equal(fallback.auditProcessedMetrics, true)
  assert.equal(fallback.auditProcessedMetricsLimit, 10)
}

function testDriveSyncMetricStructureAuditDefaultsOff(): void {
  const enabled = parseDriveSyncOptions(
    new URL('https://example.test/api/drive-sync?metricStructureAudit=true'),
  )
  const disabled = parseDriveSyncOptions(
    new URL('https://example.test/api/drive-sync?metricStructureAudit=false'),
  )

  assert.equal(enabled.metricStructureAudit, true)
  assert.equal(disabled.metricStructureAudit, false)
}

function testDriveSyncBackfillHealthMetricsOptions(): void {
  const defaults = parseDriveSyncOptions(new URL('https://example.test/api/drive-sync'))
  const enabled = parseDriveSyncOptions(
    new URL('https://example.test/api/drive-sync?backfillHealthMetrics=true&backfillHealthMetricsLimit=3'),
  )
  const capped = parseDriveSyncOptions(
    new URL('https://example.test/api/drive-sync?backfillHealthMetrics=1&backfillHealthMetricsLimit=999'),
  )

  assert.equal(defaults.backfillHealthMetrics, false)
  assert.equal(defaults.backfillHealthMetricsLimit, 10)
  assert.equal(enabled.backfillHealthMetrics, true)
  assert.equal(enabled.backfillHealthMetricsLimit, 3)
  assert.equal(capped.backfillHealthMetrics, true)
  assert.equal(capped.backfillHealthMetricsLimit, 20)
}

run()
