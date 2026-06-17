const fs = require('fs/promises')
const path = require('path')

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2))
}

async function updateLocalJob(dbPath, jobId, patch) {
  const db = await readJson(dbPath)
  const job = db.jobs.find((entry) => entry.id === jobId)

  if (!job) {
    throw new Error(`Job ${jobId} not found in ${dbPath}`)
  }

  Object.assign(job, patch)
  await writeJson(dbPath, db)
  return job
}

async function generateLocalAsset(job) {
  const outputDir = path.join(__dirname, '..', 'outputs', job.id)
  await fs.mkdir(outputDir, { recursive: true })

  const outputPath = path.join(outputDir, 'final_asset.txt')
  const contents = [
    `URAI Asset Factory local proof`,
    `jobId=${job.id}`,
    `format=${job.format}`,
    `prompt=${job.prompt}`,
    `generatedAt=${new Date().toISOString()}`,
  ].join('\n')

  await fs.writeFile(outputPath, contents)

  return [
    {
      type: job.format || 'text',
      path: `/outputs/${job.id}/final_asset.txt`,
      localPath: outputPath,
    },
  ]
}

async function processLocalMessage(message) {
  const { jobId, dbPath } = message || {}

  if (!jobId || !dbPath) {
    throw new Error('Local worker requires jobId and dbPath')
  }

  console.log(`[Worker] Processing local db job ${jobId}`)

  const runningJob = await updateLocalJob(dbPath, jobId, {
    status: 'running',
    startedAt: new Date().toISOString(),
  })

  const assets = await generateLocalAsset(runningJob)

  await updateLocalJob(dbPath, jobId, {
    status: 'completed',
    completedAt: new Date().toISOString(),
    assets,
  })

  console.log(`[Worker] ✅ Local job ${jobId} completed`)
}

process.on('message', (message) => {
  processLocalMessage(message)
    .then(() => process.exit(0))
    .catch(async (error) => {
      console.error(`[Worker] ❌ Local job failed: ${error.message}`)

      if (message && message.jobId && message.dbPath) {
        try {
          await updateLocalJob(message.dbPath, message.jobId, {
            status: 'failed',
            failedAt: new Date().toISOString(),
            error: error.message,
          })
        } catch (writeError) {
          console.error(`[Worker] ❌ Failed to record failure: ${writeError.message}`)
        }
      }

      process.exit(1)
    })
})

console.log('[Worker] Local Asset Factory worker ready')
