# Asset-Factory: Input/Output Schema v1

This document defines the data structures for inputs and outputs of the Asset-Factory pipeline.

## Input Schema

A job request to the Asset-Factory should be a JSON object with the following structure:

```json
{
  "story_input": {
    "title": "The Little Star That Could",
    "scenes": [
      {
        "scene_number": 1,
        "prompt": "A small, timid star hiding behind a large, colorful nebula.",
        "narration": "In a quiet corner of the galaxy, there was a little star who was afraid of the dark."
      },
      {
        "scene_number": 2,
        "prompt": "The little star peeking out, watching other stars twinkle and dance.",
        "narration": "He watched the other stars shine brightly, wishing he could be as brave as them."
      }
    ]
  },
  "mood": "inspirational",
  "audience": "kids",
  "duration_target": 60,
  "platform_targets": ["youtube_shorts", "instagram_reels"]
}
```

### Fields:

-   `story_input` (object, required): The core narrative content.
    -   `title` (string, required): The title of the story.
    -   `scenes` (array of objects, required): The scenes of the story.
        -   `scene_number` (integer, required): The order of the scene.
        -   `prompt` (string, required): The visual prompt for the scene's image/video generation.
        -   `narration` (string, required): The narration text for the scene.
-   `mood` (string, required): The desired mood of the generated assets.
    -   Enum: `"inspirational"`, `"playful"`, `"educational"`, `"mysterious"`, `"comedic"`.
-   `audience` (string, required): The target audience.
    -   Enum: `"kids"`, `"adults"`, `"brands"`, `"gen-z"`.
-   `duration_target` (integer): The desired total duration of video assets in seconds.
-   `platform_targets` (array of strings, required): The target platforms for asset optimization.
    -   Enum values: `"youtube_shorts"`, `"instagram_reels"`, `"tiktok"`, `"urai_storytime"`.

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
