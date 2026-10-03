import assert from 'node:assert/strict'
import fs from 'node:fs'

const schema=JSON.parse(fs.readFileSync('contracts/person-render-binding-v1.schema.json','utf8'))
const life=JSON.parse(fs.readFileSync('contracts/life-model-v1.json','utf8'))

assert.equal(schema.properties.schemaVersion.const,'urai-person-render-binding-v1')
assert.deepEqual(schema.properties.modality.enum,['voice','visual','motion'])
assert.equal(schema.properties.reviewState.const,'ACCEPTED')
assert.equal(schema.properties.bindingState.const,'promotion-candidate')
assert.equal(schema.properties.syntheticOutputMayBecomeHistoricalSource.const,false)
assert.equal(schema.properties.providerOwnsCanonicalIdentity.const,false)
assert.equal(life.invariants.providerOwnsCanonicalIdentity,false)
assert.equal(life.invariants.syntheticOutputMayBecomeHistoricalSource,false)
assert.ok(schema.required.includes('reviewReceiptHash'))
assert.ok(schema.required.includes('sourceAuthorityHash'))
assert.ok(schema.required.includes('consentRefs'))
assert.ok(schema.required.includes('syntheticOutputMayBecomeHistoricalSource'))
assert.ok(schema.required.includes('providerOwnsCanonicalIdentity'))
console.log('[PASS] PERSON_RENDER_BINDING_PROMOTION_CONTRACT')
