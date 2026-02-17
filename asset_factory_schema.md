# Asset-Factory: Input/Output Schema v1

This document defines the data structures for inputs and outputs of the Asset-Factory pipeline.

## Input Schema (v1.ts)

A job request to the Asset-Factory should be a JSON object conforming to the `AssetFactoryInputV1` interface.

```json
{
  "storyStructure": "hero_journey",
  "audienceType": "gen-z",
  "tone": "inspirational",
  "durationSeconds": 90,
  "platformTargets": ["tiktok", "youtube_shorts"],
  "visualStyle": "cinematic_anime",
  "voiceProfile": "deep_male_narrator",
  "pacing": "fast",
  "callToAction": "Visit our website to learn more!",
  "brandGuidelines": {
    "colors": ["#FFFFFF", "#000000", "#FF0000"],
    "fonts": ["Montserrat", "Lato"],
    "logoUrl": "https://storage.googleapis.com/urai-assets/logo.png"
  }
}
```

### Fields:

-   `storyStructure` (string, required): The narrative structure of the content.
    -   Enum: `"problem_solution"`, `"hero_journey"`, `"listicle"`, `"cinematic"`.
-   `audienceType` (string, required): The target audience for the content.
-   `tone` (string, required): The desired emotional tone of the content.
-   `durationSeconds` (number, required): The target duration of the video output in seconds.
-   `platformTargets` (array of strings, required): A list of target platforms for asset optimization.
-   `visualStyle` (string, required): The desired visual style of the generated assets.
-   `voiceProfile` (string, required): The desired voice profile for narration.
-   `pacing` (string, required): The pacing of the video edits.
    -   Enum: `"slow"`, `"medium"`, `"fast"`.
-   `callToAction` (string, optional): A call to action to be included at the end.
-   `brandGuidelines` (object, optional): An object containing brand-specific assets and guidelines.
    -   `colors` (array of strings, required): Primary brand colors.
    -   `fonts` (array of strings, required): Brand fonts.
    -   `logoUrl` (string, optional): A URL to the brand's logo.

## Output Schema

The output of a successful job will be a JSON object with the following structure:

```json
{
  "job_id": "job-12345-abcdef",
  "status": "completed",
  "created_at": "2024-10-27T10:00:00Z",
  "export_bundle_url": "https://storage.googleapis.com/urai-assets/job-12345-abcdef.zip",
  "assets": [
    {
      "type": "video",
      "platform": "youtube_shorts",
      "url": "https://storage.googleapis.com/urai-assets/job-12345-abcdef/video_shorts.mp4",
      "metadata": {
        "duration": 60,
        "format": "mp4",
        "resolution": "1080x1920"
      }
    },
    {
      "type": "audio",
      "url": "https://storage.googleapis.com/urai-assets/job-12345-abcdef/narration.mp3",
      "metadata": {
        "duration": 58,
        "format": "mp3"
      }
    },
    {
      "type": "subtitles",
      "url": "https://storage.googleapis.com/urai-assets/job-12345-abcdef/subtitles.srt",
      "metadata": {
        "format": "srt"
      }
    }
  ]
}
```

### Fields:

-   `job_id` (string): The unique identifier for the job.
-   `status` (string): The status of the job (`"queued"`, `"running"`, `"completed"`, `"failed"`).
-   `created_at` (string): The timestamp of job creation.
-   `export_bundle_url` (string): A URL to a ZIP file containing all generated assets.
-   `assets` (array of objects): A list of the individual assets generated.
    -   `type` (string): The type of the asset (`"video"`, `"audio"`, `"image"`, `"subtitles"`, `"storyboard_pdf"`).
    -   `platform` (string, optional): The target platform if the asset is platform-specific.
    -   `url` (string): The URL to the asset.
    -   `metadata` (object): A key-value map of asset-specific metadata.
