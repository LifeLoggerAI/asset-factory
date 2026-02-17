export interface AssetJobRequest {
  version: "1.0"
  preset?: "marketing-kit" | "story-video" | "capcut-pack" | "social-carousel"

  prompt: {
    title?: string
    description: string
    tone?: string
    duration?: number
    platform?: "tiktok" | "instagram" | "youtube" | "capcut"
    language?: string
  }

  assets: {
    video?: boolean
    images?: boolean
    audio?: boolean
    storyboard?: boolean
    subtitles?: boolean
  }

  deterministic?: boolean
}
