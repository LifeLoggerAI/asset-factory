# Asset Factory V1 (Restored)

This is the restored, headless, API-driven core of the Asset Factory. It is designed to be a simple, robust, and scalable system for generating assets.

## Architecture

The system is composed of two main components:

*   **API Server (`engine/server.js`)**: A lightweight Express.js server that exposes a RESTful API for creating and managing asset generation jobs.
*   **Background Worker (`engine/worker.js`)**: A simple Node.js process that polls for new jobs, processes them, and updates their status.

### Data Flow

1.  A client sends a `POST` request to the `/v1/jobs` endpoint with an API key and a JSON payload describing the desired asset.
2.  The API server creates a new job file in the `jobs` directory with a `queued` status.
3.  The background worker polls the `jobs` directory for new jobs.
4.  When a `queued` job is found, the worker "generates" the asset (in this implementation, it creates a dummy text file) and places it in the `outputs` directory.
5.  The worker updates the job file's status to `completed` or `failed`.
6.  The client can then poll the `/v1/jobs/:jobId` endpoint to check the status of the job.
7.  Once the job is `completed`, the client can download the generated asset(s) as a ZIP archive from the `/v1/jobs/:jobId/download` endpoint.

## Running the System

1.  **Install dependencies:** `npm install`
2.  **Create a `.env` file** in the root of the project with the following content:

    ```
    ASSET_FACTORY_API_KEY=your_long_random_secret
    ```

3.  **Start the server and worker:** `npm start`

This will use `foreman` to run both the API server and the background worker concurrently.

## API Endpoints

*   `GET /health`: Health check endpoint. No authentication required.
*   `POST /v1/jobs`: Create a new asset generation job. Requires a valid `X-API-Key` header.
*   `GET /v1/jobs/:jobId`: Get the status of a job. Requires a valid `X-API-Key` header.
*   `GET /v1/jobs/:jobId/download`: Download the output of a completed job as a ZIP archive. Requires a valid `X-API-Key` header.
