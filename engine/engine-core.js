const { v4: uuidv4 } = require('uuid')
const CryptoJS = require('crypto-js')
const { buildShort, buildLong, buildThread } = require('./formats')

const VERSION = "v1.2.0"

function selectFormat(topic, format) {
  if (format === "long") return buildLong(topic)
  if (format === "thread") return buildThread(topic)
  return buildShort(topic)
}

function generateBundle(topic, format) {
  const id = uuidv4()
  const timestamp = new Date().toISOString()

  const preset = selectFormat(topic, format)

  const bundle = {
    id,
    timestamp,
    version: VERSION,
    topic,
    format: preset.type,
    durationTarget: preset.durationTarget,
    hooks: preset.hooks,
    structure: preset.structure,
    thumbnail: `Cinematic lighting, bold text: "${topic}", high contrast`,
    captions: [
      `${topic} is evolving.`,
      `This changes everything.`,
      `The shift has started.`,
      `Follow for more.`
    ]
  }

  const hash = CryptoJS.SHA256(JSON.stringify(bundle)).toString()

  return {
    manifestVersion: VERSION,
    generatedAt: timestamp,
    hash,
    bundle
  }
}

module.exports = { generateBundle }
