
# Asset Factory V1 - Product Specification

**Version:** `1.0.1-restored`

**Status:** `FROZEN`

## 1. Overview

Asset Factory V1 is a headless, API-driven, deterministic asset generation engine. It is designed for internal, programmatic use. It accepts a job request, processes it asynchronously, and produces a set of consistent, verifiable digital assets.

It is a pure "factory" - it does not concern itself with user identity, billing, plans, or any other SaaS-level concepts. Its sole responsibility is to transform an input (a topic) into a deterministic output bundle.

## 2. Core Concepts

- **Headless:** No user interface. Interaction is exclusively via a REST API.
- **Asynchronous:** All asset generation is handled via a job-based system. The API immediately returns a job ID, and processing occurs in the background.
- **Deterministic:** For a given input, the output is guaranteed to be identical every time. The system may employ input hashing and manifest validation to enforce this.
- **API-Key Authenticated:** Access is controlled by a single, shared secret API key. There is no concept of individual users or roles.
- **Job-Based:** The fundamental unit of work is a "job".

## 3. Architecture

The system is composed of two primary components:

1.  **API Server (`server.v1.js`):** A lightweight Express.js server that exposes the API endpoints. It is responsible for:
    *   API Key authentication.
    *   Job creation and queuing.
    *   Job status retrieval.
    *   Serving the final downloadable asset bundle.
2.  **Engine Worker (`engine-worker.js`):** A separate Node.js process forked by the API server for each job. It is responsible for:
    *   Executing the long-running, CPU-intensive asset generation tasks.
    *   Creating the individual assets (video, audio, etc.).
    *   Bundling the assets into a single ZIP archive.
    *   Updating the job status file.

## 4. Job Lifecycle

1.  A client sends a `POST /v1/jobs` request with a valid API key and a topic.
2.  The API Server validates the request, creates a unique `jobId`, queues the job, and immediately returns a `202 Accepted` response with the `jobId`.
3.  A background worker process begins executing the job.
4.  The job status transitions from `queued` to `running`.
5.  The worker generates all required assets and bundles them.
6.  The job status transitions from `running` to `completed`.
7.  The client can poll `GET /v1/jobs/:id` to check the status.
8.  Once completed, the client can download the output from `GET /v1/jobs/:id/download`.

## 5. Storage

- **Job Definitions:** Stored as JSON files in the `/jobs` directory on the local filesystem, partitioned by `jobId`.
- **Output Artifacts:** Stored in the `/outputs` directory on the local filesystem, partitioned by `jobId`.

This architecture is self-contained and does not rely on external databases or storage services for its core operation.
