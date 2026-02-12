require('dotenv').config()
const fs = require('fs-extra')
const path = require('path')
const { generateBundle } = require('./engine-core')

const OUTPUT_DIR = path.join(__dirname, 'outputs')
const LOG_DIR = path.join(__dirname, 'logs')

async function ensureDirs() {
  await fs.ensureDir(OUTPUT_DIR)
  await fs.ensureDir(LOG_DIR)
}

async function writeBundle(manifest) {
  const filePath = path.join(OUTPUT_DIR, `${manifest.bundle.id}.json`)
  await fs.writeJson(filePath, manifest, { spaces: 2 })

  const logPath = path.join(LOG_DIR, 'engine.log')
  await fs.appendFile(
    logPath,
    `${manifest.generatedAt} | ${manifest.bundle.id} | ${manifest.bundle.topic} | ${manifest.hash}\n`
  )

  console.log(`Bundle created: ${filePath}`)
  console.log(`Hash: ${manifest.hash}`)
}

async function run() {
  const topic = process.argv[2]
  const format = process.argv[3] || 'short'

  if (!topic) {
    console.log('Usage: af "Your Topic Here" short|long|thread')
    process.exit(1)
  }

  await ensureDirs()

  const manifest = generateBundle(topic, format)
  await writeBundle(manifest)
}

run()
