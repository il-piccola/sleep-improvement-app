import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  server: { middlewareMode: true },
  appType: 'custom',
})

const { buildSleepBlocks } = await server.ssrLoadModule('/src/lib/analysis/buildSleepBlocks.ts')
const { groupBySleepDay } = await server.ssrLoadModule('/src/lib/analysis/groupBySleepDay.ts')
const { summarizeSleepDay } = await server.ssrLoadModule('/src/lib/analysis/summarizeSleepDay.ts')
const { checkDataQuality } = await server.ssrLoadModule('/src/lib/analysis/checkDataQuality.ts')

try {
  await runAllCases()
  console.log('sleep analysis test cases passed')
} finally {
  await new Promise((resolve) => setTimeout(resolve, 250))
  await server.close()
}

async function runAllCases() {
  testNormalSingleSleep()
  testTwoSleepsInOneDay()
  testThreeOrMoreSplitSleeps()
  testLongEveningSleep()
  testNapUnder90Minutes()
  testSupportSleepOver90Minutes()
  testCrossDateSleep()
  testSleepDayBoundary()
  testAwakeAndInBedAreNotCounted()
  testSleepStagesAreCounted()
  testDataQuality()
  await testHealthAutoExportImportFlow()
}

function testNormalSingleSleep() {
  const summary = summarizeOnlyDay([
    record('normal-main', '2026-05-14T23:00:00+09:00', '2026-05-15T06:00:00+09:00'),
  ])

  assertSummary(summary, {
    totalSleepMinutes: 420,
    blockCount: 1,
    mainCount: 1,
    napCount: 0,
    supportCount: 0,
    eveningCount: 0,
  })
  assert.equal(summary.fragmentation.score, 0)
  assert.equal(summary.circadian.score, 0)
}

function testTwoSleepsInOneDay() {
  const summary = summarizeOnlyDay([
    record('two-main', '2026-05-14T23:00:00+09:00', '2026-05-15T05:00:00+09:00'),
    record('two-nap', '2026-05-15T13:00:00+09:00', '2026-05-15T13:45:00+09:00'),
  ])

  assertSummary(summary, {
    totalSleepMinutes: 405,
    blockCount: 2,
    mainCount: 1,
    napCount: 1,
    supportCount: 0,
    eveningCount: 0,
  })
  assert.ok(summary.fragmentation.score > 0)
  assert.ok(summary.circadian.score > 0)
}

function testThreeOrMoreSplitSleeps() {
  const summary = summarizeOnlyDay([
    record('split-main', '2026-05-14T22:30:00+09:00', '2026-05-15T03:30:00+09:00'),
    record('split-support', '2026-05-15T08:00:00+09:00', '2026-05-15T09:40:00+09:00'),
    record('split-nap', '2026-05-15T14:30:00+09:00', '2026-05-15T15:10:00+09:00'),
  ])

  assertSummary(summary, {
    totalSleepMinutes: 440,
    blockCount: 3,
    mainCount: 1,
    napCount: 1,
    supportCount: 1,
    eveningCount: 0,
  })
  assert.equal(summary.fragmentation.level, 'high')
  assert.ok(summary.circadian.score > 0)
}

function testLongEveningSleep() {
  const summary = summarizeOnlyDay([
    record('evening-main', '2026-05-14T23:00:00+09:00', '2026-05-15T05:00:00+09:00'),
    record('evening-long', '2026-05-15T16:30:00+09:00', '2026-05-15T18:00:00+09:00'),
  ])

  assertSummary(summary, {
    totalSleepMinutes: 450,
    blockCount: 2,
    mainCount: 1,
    napCount: 0,
    supportCount: 1,
    eveningCount: 1,
  })
  assert.ok(summary.fragmentation.score > 0)
  assert.ok(summary.circadian.score > 0)
}

function testNapUnder90Minutes() {
  const summary = summarizeOnlyDay([
    record('nap-main', '2026-05-14T23:00:00+09:00', '2026-05-15T06:00:00+09:00'),
    record('nap-short', '2026-05-15T12:00:00+09:00', '2026-05-15T13:29:00+09:00'),
  ])

  assertSummary(summary, {
    totalSleepMinutes: 509,
    blockCount: 2,
    mainCount: 1,
    napCount: 1,
    supportCount: 0,
    eveningCount: 0,
  })
}

function testSupportSleepOver90Minutes() {
  const summary = summarizeOnlyDay([
    record('support-main', '2026-05-14T23:00:00+09:00', '2026-05-15T05:30:00+09:00'),
    record('support-long', '2026-05-15T10:00:00+09:00', '2026-05-15T11:45:00+09:00'),
  ])

  assertSummary(summary, {
    totalSleepMinutes: 495,
    blockCount: 2,
    mainCount: 1,
    napCount: 0,
    supportCount: 1,
    eveningCount: 0,
  })
}

function testCrossDateSleep() {
  const summary = summarizeOnlyDay([
    record('cross-date', '2026-05-14T23:30:00+09:00', '2026-05-15T07:00:00+09:00'),
  ])

  assert.equal(summary.sleepDayKey, '2026-05-14')
  assertSummary(summary, {
    totalSleepMinutes: 450,
    blockCount: 1,
    mainCount: 1,
    napCount: 0,
    supportCount: 0,
    eveningCount: 0,
  })
}

function testSleepDayBoundary() {
  const summaries = summarize([
    record('boundary-before', '2026-05-15T17:30:00+09:00', '2026-05-15T17:50:00+09:00'),
    record('boundary-after', '2026-05-15T18:30:00+09:00', '2026-05-15T19:10:00+09:00'),
    record('boundary-night', '2026-05-15T23:00:00+09:00', '2026-05-16T06:00:00+09:00'),
  ])

  const previousDay = summaries.find((summary) => summary.sleepDayKey === '2026-05-14')
  const nextDay = summaries.find((summary) => summary.sleepDayKey === '2026-05-15')

  assert.ok(previousDay)
  assert.ok(nextDay)
  assert.equal(previousDay.blockCount, 1)
  assert.equal(previousDay.totalSleepMinutes, 20)
  assert.equal(nextDay.blockCount, 2)
  assert.equal(nextDay.totalSleepMinutes, 460)
}

function testAwakeAndInBedAreNotCounted() {
  const summary = summarizeOnlyDay([
    record('in-bed', '2026-05-14T22:00:00+09:00', '2026-05-15T07:00:00+09:00', 'HKCategoryValueSleepAnalysisInBed'),
    record('awake', '2026-05-15T02:00:00+09:00', '2026-05-15T02:30:00+09:00', 'HKCategoryValueSleepAnalysisAwake'),
    record('actual-sleep', '2026-05-14T23:00:00+09:00', '2026-05-15T06:00:00+09:00'),
  ])

  assertSummary(summary, {
    totalSleepMinutes: 420,
    blockCount: 1,
    mainCount: 1,
    napCount: 0,
    supportCount: 0,
    eveningCount: 0,
  })
}

function testSleepStagesAreCounted() {
  const summary = summarizeOnlyDay([
    record('core', '2026-05-14T23:00:00+09:00', '2026-05-15T01:00:00+09:00', 'HKCategoryValueSleepAnalysisAsleepCore'),
    record('deep', '2026-05-15T01:00:00+09:00', '2026-05-15T03:00:00+09:00', 'HKCategoryValueSleepAnalysisAsleepDeep'),
    record('rem', '2026-05-15T03:00:00+09:00', '2026-05-15T05:00:00+09:00', 'HKCategoryValueSleepAnalysisAsleepREM'),
    record('unspecified', '2026-05-15T05:00:00+09:00', '2026-05-15T06:00:00+09:00', 'HKCategoryValueSleepAnalysisAsleepUnspecified'),
  ])

  assertSummary(summary, {
    totalSleepMinutes: 420,
    blockCount: 1,
    mainCount: 1,
    napCount: 0,
    supportCount: 0,
    eveningCount: 0,
  })
}

function testDataQuality() {
  const now = new Date('2026-05-15T12:00:00+09:00')
  const multipleSleepReport = checkDataQuality(
    [
      record('quality-main', '2026-05-14T23:00:00+09:00', '2026-05-15T06:00:00+09:00'),
      record('quality-nap', '2026-05-15T13:00:00+09:00', '2026-05-15T13:40:00+09:00'),
    ],
    now,
  )
  assert.equal(multipleSleepReport.hasMultipleSleepsInOneDay, true)
  assert.equal(multipleSleepReport.hasSourceInfo, false)
  assert.ok(multipleSleepReport.issues.some((issue) => issue.id === 'no-source'))

  const inBedOnlyReport = checkDataQuality(
    [record('inbed-only', '2026-05-15T00:00:00+09:00', '2026-05-15T08:00:00+09:00', 'HKCategoryValueSleepAnalysisInBed')],
    now,
  )
  assert.equal(inBedOnlyReport.level, 'insufficient')
  assert.ok(inBedOnlyReport.issues.some((issue) => issue.id === 'only-in-bed'))
  assert.ok(inBedOnlyReport.issues.some((issue) => issue.id === 'no-actual-sleep'))

  const awakeOnlyReport = checkDataQuality(
    [record('awake-only', '2026-05-15T00:00:00+09:00', '2026-05-15T01:00:00+09:00', 'HKCategoryValueSleepAnalysisAwake')],
    now,
  )
  assert.equal(awakeOnlyReport.level, 'insufficient')
  assert.ok(awakeOnlyReport.issues.some((issue) => issue.id === 'only-awake'))

  const aggregatedReport = checkDataQuality(
    [{ id: 'aggregate-like', value: 'HKCategoryValueSleepAnalysisAsleep', durationMinutes: 420 }],
    now,
  )
  assert.equal(aggregatedReport.isLikelyAggregated, true)
  assert.ok(aggregatedReport.issues.some((issue) => issue.id === 'aggregated-like'))
  assert.ok(aggregatedReport.issues.some((issue) => issue.id === 'no-date-range'))
}

async function testHealthAutoExportImportFlow() {
  const previousIndexedDB = globalThis.indexedDB
  globalThis.indexedDB = createFakeIndexedDB()

  try {
    const {
      importHealthAutoExportJson,
      loadImportHistory,
      loadSavedNormalizedSleepRecords,
    } = await server.ssrLoadModule('/src/lib/importers/importHealthAutoExportJson.ts')

    const fileName = '任意名_睡眠export(検証).json'
    const json = JSON.stringify({
      metrics: [
        {
          name: 'sleep_analysis',
          data: [
            {
              startDate: '2026-05-14 23:00:00 +0900',
              endDate: '2026-05-15 02:00:00 +0900',
              value: 'Core',
              sourceName: 'Withings Health Auto Export',
            },
            {
              startDate: '2026-05-15 02:00:00 +0900',
              endDate: '2026-05-15 03:00:00 +0900',
              value: 'REM',
              sourceName: 'Withings Health Auto Export',
            },
            {
              startDate: '2026-05-15 03:00:00 +0900',
              endDate: '2026-05-15 06:00:00 +0900',
              value: 'Deep',
              sourceName: 'Withings Health Auto Export',
            },
            {
              startDate: '2026-05-15 13:00:00 +0900',
              endDate: '2026-05-15 13:45:00 +0900',
              value: 'Asleep',
              sourceName: 'Withings Health Auto Export',
            },
            {
              startDate: '2026-05-15 14:00:00 +0900',
              endDate: '2026-05-15 14:15:00 +0900',
              value: 'Awake',
              sourceName: 'Withings Health Auto Export',
            },
            {
              startDate: '2026-05-15 21:30:00 +0900',
              endDate: '2026-05-15 22:00:00 +0900',
              value: 'In Bed',
              sourceName: 'Withings Health Auto Export',
            },
            {
              startDate: '2026-05-15 23:30:00 +0900',
              endDate: '2026-05-16 00:00:00 +0900',
              value: 'Invalid',
              sourceName: 'Withings Health Auto Export',
            },
          ],
        },
      ],
    })

    const first = await importHealthAutoExportJson(fileName, json)

    assert.equal(first.audit.status, 'needs_settings')
    assert.equal(first.audit.sleepAnalysisFound, true)
    assert.equal(first.audit.sleepAnalysisDataFound, true)
    assert.equal(first.audit.isNonAggregated, true)
    assert.equal(first.audit.hasMultipleSegmentsInOneDay, true)
    assert.equal(first.audit.sourceApp, 'Withings')
    assert.equal(first.audit.convertibleRows, 6)
    assert.equal(first.audit.rejectedRows, 1)
    assert.equal(first.audit.stageCounts.asleep_core, 1)
    assert.equal(first.audit.stageCounts.asleep_rem, 1)
    assert.equal(first.audit.stageCounts.asleep_deep, 1)
    assert.equal(first.audit.stageCounts.awake, 1)
    assert.equal(first.audit.stageCounts.in_bed, 1)
    assert.equal(first.importStats.importedFileName, fileName)
    assert.equal(first.importStats.normalizedCount, 6)
    assert.equal(first.importStats.newRecordCount, 6)
    assert.equal(first.importStats.duplicateSkippedCount, 0)
    assert.equal(first.importStats.totalSavedRecordCount, 6)
    assert.equal(first.records.length, 6)
    assert.equal(first.normalizedFile.sourceFile, fileName)
    assert.equal(first.normalizedFile.records.length, 6)

    const savedAfterFirstImport = await loadSavedNormalizedSleepRecords()
    assert.ok(savedAfterFirstImport)
    assert.equal(savedAfterFirstImport.length, 6)

    const second = await importHealthAutoExportJson(fileName, json)
    assert.equal(second.importStats.normalizedCount, 6)
    assert.equal(second.importStats.newRecordCount, 0)
    assert.equal(second.importStats.duplicateSkippedCount, 6)
    assert.equal(second.importStats.totalSavedRecordCount, 6)
    assert.equal(second.records.length, 6)

    const savedAfterSecondImport = await loadSavedNormalizedSleepRecords()
    assert.ok(savedAfterSecondImport)
    assert.equal(savedAfterSecondImport.length, 6)

    const history = await loadImportHistory()
    assert.ok(history.length >= 2)
    assert.equal(history[0].fileName, fileName)
    assert.equal(typeof history[0].importedAt, 'string')

    const summary = summarize(savedAfterSecondImport)
    assert.equal(summary.length, 1)
    assert.equal(summary[0].blockCount, 2)
    assert.equal(summary[0].napCandidateCount, 1)
    assert.ok(summary[0].fragmentation.score > 0)
    assert.ok(summary[0].circadian.score > 0)
  } finally {
    globalThis.indexedDB = previousIndexedDB
  }
}

function summarizeOnlyDay(records) {
  const summaries = summarize(records)
  assert.equal(summaries.length, 1)
  return summaries[0]
}

function summarize(records) {
  const blocks = buildSleepBlocks(records)
  const groups = groupBySleepDay(blocks)
  return groups.map((group) => summarizeSleepDay(group))
}

function assertSummary(
  summary,
  { totalSleepMinutes, blockCount, mainCount, napCount, supportCount, eveningCount },
) {
  const mainBlocks = summary.classifiedBlocks.filter((block) => block.labels.includes('main'))
  const supportBlocks = summary.classifiedBlocks.filter(
    (block) => !block.labels.includes('main') && !block.isNapCandidate,
  )

  assert.equal(summary.totalSleepMinutes, totalSleepMinutes)
  assert.equal(summary.blockCount, blockCount)
  assert.equal(mainBlocks.length, mainCount)
  assert.equal(summary.napCandidateCount, napCount)
  assert.equal(supportBlocks.length, supportCount)
  assert.equal(summary.eveningSleepCount, eveningCount)
  assert.equal(typeof summary.fragmentation.score, 'number')
  assert.equal(typeof summary.circadian.score, 'number')
}

function record(id, startDate, endDate, value = 'HKCategoryValueSleepAnalysisAsleepCore') {
  return {
    id,
    value,
    startDate,
    endDate,
    hasStartDate: true,
    hasEndDate: true,
  }
}

function createFakeIndexedDB() {
  const databases = new Map()

  return {
    open(name, version) {
      const request = createRequest()

      setTimeout(() => {
        let database = databases.get(name)
        let isNewDatabase = false

        if (!database) {
          database = createFakeDatabase(name)
          databases.set(name, database)
          isNewDatabase = true
        } else if (version > database.version) {
          database.version = version
          isNewDatabase = true
        }

        request.result = database

        if (isNewDatabase && typeof request.onupgradeneeded === 'function') {
          request.onupgradeneeded({ target: request })
        }

        setTimeout(() => {
          if (typeof request.onsuccess === 'function') {
            request.onsuccess({ target: request })
          }
        }, 0)
      }, 0)

      return request
    },
  }
}

function createFakeDatabase(name) {
  const stores = new Map()

  return {
    name,
    version: 1,
    objectStoreNames: {
      contains(storeName) {
        return stores.has(storeName)
      },
    },
    createObjectStore(storeName, options = {}) {
      const store = new Map()
      stores.set(storeName, { store, keyPath: options.keyPath ?? 'id' })
      return createFakeObjectStore(store, options.keyPath ?? 'id')
    },
    transaction(storeName) {
      const entry = stores.get(storeName)

      if (!entry) {
        throw new Error(`Missing store: ${storeName}`)
      }

      const transaction = {
        oncomplete: null,
        onerror: null,
        objectStore(requestedStoreName) {
          if (requestedStoreName !== storeName) {
            throw new Error(`Missing store: ${requestedStoreName}`)
          }

          return createFakeObjectStore(entry.store, entry.keyPath, transaction)
        },
      }

      return transaction
    },
    close() {},
  }
}

function createFakeObjectStore(store, keyPath = 'id', transaction) {
  let completionScheduled = false

  const scheduleCompletion = () => {
    if (completionScheduled || !transaction) {
      return
    }

    completionScheduled = true
    setTimeout(() => {
      if (typeof transaction.oncomplete === 'function') {
        transaction.oncomplete({ target: transaction })
      }
    }, 0)
  }

  return {
    get(key) {
      const request = createRequest()
      setTimeout(() => {
        request.result = store.get(key)
        if (typeof request.onsuccess === 'function') {
          request.onsuccess({ target: request })
        }
      }, 0)
      return request
    },
    put(value) {
      const key = value?.[keyPath]
      store.set(key, value)
      scheduleCompletion()
      return createRequest()
    },
  }
}

function createRequest() {
  return {
    result: undefined,
    error: null,
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
  }
}
