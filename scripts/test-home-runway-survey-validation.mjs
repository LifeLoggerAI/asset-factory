import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

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

for (const destination of ['source', 'existing-review', 'source-parent', 'symlink', 'dangling-symlink']) {
  test(`survey validator preserves data when output is ${destination}`, (t) => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'urai-survey-boundary-'))
    t.after(() => fs.rmSync(temp, { recursive: true, force: true }))
    const root = path.join(temp, 'media')
    fs.mkdirSync(root)
    const media = path.join(root, 'S01_PUSH-retained.mp4')
    fs.writeFileSync(media, 'retained source sentinel')
    let output = root
    if (destination === 'existing-review') { output = path.join(temp, 'review'); fs.mkdirSync(output); fs.writeFileSync(path.join(output, 'receipt.json'), 'prior evidence') }
    if (destination === 'source-parent') output = temp
    if (destination.includes('symlink')) { output = path.join(temp, 'output-link'); fs.symlinkSync(destination === 'symlink' ? root : path.join(temp, 'absent'), output) }
    const result = spawnSync('bash', ['scripts/validate-home-runway-surveys.sh', root, output], { encoding: 'utf8' })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /output already exists/)
    assert.equal(fs.readFileSync(media, 'utf8'), 'retained source sentinel')
    if (destination === 'existing-review') assert.equal(fs.readFileSync(path.join(output, 'receipt.json'), 'utf8'), 'prior evidence')
    if (destination.includes('symlink')) assert.ok(fs.lstatSync(output).isSymbolicLink())
  })
}
