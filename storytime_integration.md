# URAI Storytime & Asset-Factory Integration

This document outlines how the URAI Storytime product can be integrated with the Asset-Factory to automate content production.

## Overview

The goal is to enable a seamless flow where a story created in Storytime can be automatically converted into a complete set of media assets (video, audio, storyboards) by the Asset-Factory. This will allow Storytime to scale its content library rapidly and with a high degree of consistency.

## The Workflow

1.  **Story Creation in Storytime:** A writer or editor creates a new story within the Storytime CMS. The story is structured with scenes, characters, and narration.

2.  **Conversion to Asset-Factory Schema:** The Storytime backend takes the new story and transforms it into the JSON format specified by the [Asset-Factory Input Schema](asset_factory_schema.md).

3.  **API Request to Asset-Factory:** The Storytime backend sends a `POST` request to the Asset-Factory API's `/v1/jobs` endpoint with the generated JSON as the request body.

4.  **Asset Generation:** The Asset-Factory receives the job, generates the assets, and makes them available at a downloadable URL.

5.  **Asset Ingestion into Storytime:** The Storytime backend polls the `/v1/jobs/{job_id}` endpoint until the job is complete. It then downloads the asset bundle and ingests the individual assets (video, audio, etc.) into the Storytime product, associating them with the original story.

## Example: "The Little Star That Could"

### 1. Storytime CMS Input

In the Storytime CMS, the story might look like this:

-   **Title:** The Little Star That Could
-   **Scene 1:**
    -   **Prompt:** A small, timid star hiding behind a large, colorful nebula.
    -   **Narration:** In a quiet corner of the galaxy, there was a little star who was afraid of the dark.
-   **Scene 2:**
    -   **Prompt:** The little star peeking out, watching other stars twinkle and dance.
    -   **Narration:** He watched the other stars shine brightly, wishing he could be as brave as them.

### 2. Conversion to JSON

The Storytime backend would convert this into the following JSON:

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
  "platform_targets": ["urai_storytime"]
}
```

### 3. API Call and Ingestion

This JSON is sent to the Asset-Factory. When the job is complete, the Storytime backend receives a response with the URLs to the generated assets. These assets are then automatically added to the Storytime experience, making the new story available to users with a full suite of generated media.

## Benefits of Integration

-   **Scalability:** Allows for the rapid creation of new Storytime content.
-   **Consistency:** Ensures a consistent visual and audio style across all stories.
-   **Efficiency:** Frees up the Storytime team to focus on creating new narratives, rather than on the technical aspects of asset production.
-   **Validation:** This integration serves as the first and most critical use case for the Asset-Factory, proving its value and robustness before it is offered to external clients.
