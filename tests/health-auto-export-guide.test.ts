import assert from 'node:assert/strict'
import {
  forbiddenOperationalGuideTerms,
  getHealthAutoExportGuideText,
  healthAutoExportGuide,
} from '../src/lib/status/healthAutoExportGuide'

const guideText = getHealthAutoExportGuideText()

for (const item of ['睡眠分析', '歩数', '歩行＋ランニング距離', 'アクティブエネルギー']) {
  assert.ok(guideText.includes(item), `recommended output should include ${item}`)
}

for (const item of ['心拍数', '呼吸数', '心拍変動 / HRV']) {
  assert.ok(guideText.includes(item), `sleep metric output should include ${item}`)
}

for (const item of ['基礎代謝', '階段', 'ヘッドフォン音量', '歩行速度', '歩幅', '歩行非対称性', '両脚支持時間']) {
  assert.ok(guideText.includes(item), `deferred output should include ${item}`)
}

for (const step of [
  '睡眠分析だけ',
  '直近1日',
  '歩数・距離・アクティブエネルギー',
  'Google Driveに新しいJSON',
  '翌朝8時の自動同期',
]) {
  assert.ok(guideText.includes(step), `recovery guide should mention ${step}`)
}

for (const term of forbiddenOperationalGuideTerms) {
  assert.ok(!guideText.includes(term), `guide should not include prohibited expression: ${term}`)
}

assert.equal(healthAutoExportGuide.outputSections.length, 4)
assert.ok(healthAutoExportGuide.recoverySteps.length >= 6)

console.log('health auto export guide test cases passed')
