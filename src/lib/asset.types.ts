export type AssetDefinition = {
  assetId: string
  name: string
  category: string
  type: 'visual' | 'motion' | 'audio' | 'cinematic' | 'bundle'
  formats: string[]
  generatorVersion: string
  inputParamsSchema: Record<string, unknown>
  deterministicSeed: string
  deprecated: boolean
  createdAt: number
}

export type AssetVersion = {
  assetId: string
  version: string
  hash: string
  files: {
    path: string
    format: string
    bytes: number
  }[]
  previewUrls: string[]
  generationTimeMs: number
  locked: boolean
  createdAt: number
}

export type AssetJob = {
  jobId: string
  assetId: string
  status: 'queued' | 'running' | 'validating' | 'hashing' | 'complete' | 'failed'
  progress: number
  logs: string[]
  startedAt: number
  finishedAt?: number
}

export type AssetPack = {
  packId: string
  name: string
  assets: { assetId: string; version: string }[]
  targetUse: string
  version: string
  exportedAt: number
}

export type AuditLog = {
  id: string
  action: string
  actor: string
  targetId: string
  timestamp: number
  meta?: Record<string, unknown>
}
