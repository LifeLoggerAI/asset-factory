# Asset Factory V1.5

This is the restored, headless, API-driven core of the Asset Factory, now with a user-friendly front-end studio for job submission and management.

## Architecture

The system is composed of three main components:

*   **API Server (`engine/server.js`)**: A lightweight Express.js server that exposes a RESTful API for creating and managing asset generation jobs.
*   **Background Worker (`engine/worker.js`)**: A simple Node.js process that polls for new jobs, processes them, and updates their status.
*   **Asset Factory Studio (`assetfactory-studio/`)**: A Next.js application that provides a user interface for interacting with the Asset Factory API.

### Data Flow

1.  A user interacts with the **Asset Factory Studio** to create and submit a new job.
2.  The studio sends a `POST` request to the `/api/jobs` endpoint, which in turn calls the core engine's `/v1/jobs` endpoint.
3.  The API server creates a new job file in the `jobs` directory with a `queued` status.
4.  The background worker polls the `jobs` directory for new jobs.
5.  When a `queued` job is found, the worker "generates" the asset (in this implementation, it creates a dummy text file) and places it in the `outputs` directory.
6.  The worker updates the job file's status to `completed` or `failed`.
7.  The user can view the status of their jobs on the **Asset Factory Studio**'s job history page.

## V1.5 Features

*   **Job Submission UI:** A user-friendly web interface for submitting and tracking jobs.
*   **Brand-Safe Presets:** A system for creating and using predefined job templates for consistent, brand-aligned content.
*   **Strengthened Backend:** Improved validation and schema enforcement for a more robust API.

## Roadmap

*   **V1 (Complete):** Headless API-driven core for asset generation.
*   **V1.5 (Complete):**
    *   [x] Productise: Create a user interface for submitting jobs.
    *   [x] Productise: Implement a "presets" feature.
    *   [x] Harden: Strengthen backend schema and validation.
*   **V2 (Upcoming):**
    *   [ ] Advanced UI: Implement a more dynamic and interactive user interface.
    *   [ ] Complex Presets: Allow for more complex and conditional preset logic.
    *   [ ] Billing & Metering: Integrate a billing and metering system.


## Running the System

1.  **Install dependencies:** `npm install`
2.  **Create a `.env` file** in the root of the project with the following content:

    ```
    ASSET_FACTORY_API_KEY=your_long_random_secret
    ```

3.  **Start the server and worker:** `npm start`

This will use `foreman` to run both the API server and the background worker concurrently. To run the studio, navigate to the `assetfactory-studio` directory and run `npm run dev`.

## API Endpoints

*   `GET /health`: Health check endpoint. No authentication required.
*   `POST /v1/jobs`: Create a new asset generation job. Requires a valid `X-API-Key` header.
*   `GET /v1/jobs/:jobId`: Get the status of a job. Requires a valid `X-API-Key` header.
*   `GET /v1/jobs/:jobId/download`: Download the output of a completed job as a ZIP archive. Requires a valid `X-API-Key` header.
