import { readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { processHealthAutoExportText } from './healthAutoExport.ts'

const inputPath = process.argv[2]

if (!inputPath) {
  console.error('Usage: npm run processor:once -- <health-auto-export.json>')
  process.exitCode = 2
} else {
  try {
    const filePath = resolve(inputPath)
    const text = await readFile(filePath, 'utf8')
    const result = processHealthAutoExportText({
      sourceFile: basename(filePath),
      text,
    })

    console.log(
      JSON.stringify(
        {
          fileName: basename(filePath),
          auditStatus: result.audit.status,
          totalRows: result.audit.totalRows,
          normalizedCount: result.records.length,
          rejectedRows: result.rejectedRows,
          warningCount: result.warnings.length,
        },
        null,
        2,
      ),
    )
  } catch (error) {
    console.error(`Processor failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
