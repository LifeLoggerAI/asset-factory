import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync('scripts/validate-home-runway-surveys.sh', 'utf8')

test('survey validator requires the exact eight governed survey identities', () => {
  for (const id of ['S01_PUSH','S02_PULLBACK','S03_LEFT','S04_RIGHT','S05_CW_ARC','S06_CCW_ARC','S07_ELEVATION','S08_DIAGONAL']) {
    assert.match(source, new RegExp(id))
  }
})

test('survey validator performs no provider/API calls and never claims literal acceptance', () => {
  assert.doesNotMatch(source, /curl|api\.dev\.runwayml|Authorization:|RUNWAY_API_KEY|RUNWAYML_API_SECRET/)
  assert.match(source, /literalVisualAcceptance:"pending-human-or-supported-visual-review"/)
  assert.match(source, /reconstructionSuitability:"pending-literal-motion-review"/)
  assert.match(source, /literalVisualAcceptance:false/)
})

test('survey validator samples stable interior frames and hashes retained evidence', () => {
  assert.match(source, /for pct in 10 30 50 70 90/)
  assert.match(source, /sha256sum/)
  assert.match(source, /ffprobe/)
  assert.match(source, /ffmpeg/)
  assert.match(source, /contact-sheet/)
})
