# Asset-Factory API Contract v1

This document outlines the version 1 API for the URAI Asset-Factory. This is a RESTful API that operates over HTTPS and uses JSON for all request and response bodies.

## Authentication

All API requests must be authenticated using a bearer token in the `Authorization` header.

`Authorization: Bearer <YOUR_API_KEY>`

## Endpoints

### Create Job

Creates a new asset generation job.

-   **Method:** `POST`
-   **Path:** `/v1/jobs`
-   **Request Body:** The request body must be a JSON object conforming to the [Asset-Factory Input Schema](asset_factory_schema.md).

**Example Request:**

```bash
curl -X POST \
  https://api.urai.com/v1/jobs \
  -H 'Authorization: Bearer <YOUR_API_KEY>' \
  -H 'Content-Type: application/json' \
  -d '{
    "story_input": {
      "title": "The Little Star That Could",
      "scenes": [
        {
          "scene_number": 1,
          "prompt": "A small, timid star hiding behind a large, colorful nebula.",
          "narration": "In a quiet corner of the galaxy, there was a little star who was afraid of the dark."
        }
      ]
    },
    "mood": "inspirational",
    "audience": "kids",
    "platform_targets": ["youtube_shorts"]
  }'
```

**Example Response (202 Accepted):**

The API will immediately return a `202 Accepted` response with a JSON object representing the initial state of the job. The job will then be processed asynchronously.

```json
{
  "job_id": "job-12345-abcdef",
  "status": "queued",
  "created_at": "2024-10-27T10:00:00Z"
}
```

### Get Job Status

Retrieves the status and results of a job.

-   **Method:** `GET`
-   **Path:** `/v1/jobs/{job_id}`

**Example Request:**

```bash
curl https://api.urai.com/v1/jobs/job-12345-abcdef \
  -H 'Authorization: Bearer <YOUR_API_KEY>'
```

**Example Response (200 OK):**

When the job is complete, the response will contain the full output schema.

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
    }
  ]
}
```
