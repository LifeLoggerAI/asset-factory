# Asset-Factory V1 Product Specification

## 1. Introduction

This document provides the product and technical specifications for the V1 release of the URAI Asset-Factory. The goal of V1 is to stabilize the existing system, define its boundaries, and prepare it for reliable, programmatic use within the URAI ecosystem.

## 2. Product Vision & Goals

### Vision

Asset-Factory is the automated content and artifact generation system for the URAI ecosystem. It is an AI production line for turning ideas, stories, and data into finished media assets.

### V1 Goals

-   **Internal Reliability:** Stabilize the pipeline to ensure deterministic, repeatable outputs.
-   **External Clarity:** Define a clear, programmatic interface for other URAI services to use.
-   **Headless & API-Driven:** The primary interface for V1 will be a RESTful API. There will be no user-facing UI in this version.

## 3. Target Audience & Use Cases

### Primary Audience

-   Internal URAI development teams (specifically, the URAI Storytime team is the first intended user).

### Primary Use Case

-   **Automated Content Generation for Storytime:** A story created in the Storytime CMS is automatically sent to the Asset-Factory to generate a complete set of media assets (video, audio, etc.) which are then ingested back into Storytime.

## 4. Features & Requirements

### 4.1. Asset Generation Pipeline

-   **Description:** The core feature of the Asset-Factory is its ability to take a structured input and generate a set of media assets.
-   **User Story:** As a developer on the Storytime team, I want to be able to send a story to the Asset-Factory and receive a bundle of assets that I can then display in the Storytime app.
-   **Technical Requirements:**
    -   The system must accept a JSON object conforming to the [V1 Input Schema](asset_factory_schema.md).
    -   The system must generate the following asset types based on the input:
        -   Video (MP4)
        -   Audio (MP3)
        -   Subtitles (SRT)
        -   Image thumbnails (PNG)
    -   All generated assets must be stored in a cloud storage bucket.
    -   The system must produce an output conforming to the [V1 Output Schema](asset_factory_schema.md).

### 4.2. API

-   **Description:** A RESTful API for creating and managing asset generation jobs.
-   **User Story:** As a developer, I need a simple, predictable API to create new asset generation jobs and to check on their status.
-   **Technical Requirements:**
    -   The API must be authenticated using API keys.
    -   The API must implement the endpoints defined in the [V1 API Contract](asset_factory_api_v1.md).
    -   The API must be documented for internal developers.

### 4.3. Job Tracking

-   **Description:** The ability to track the status of an asset generation job.
-   **User Story:** As a developer, I need to know if a job is queued, running, completed, or has failed, so I can provide feedback to my users or retry failed jobs.
-   **Technical Requirements:**
    -   Every job must have a unique ID.
    -   The job status must be one of: `queued`, `running`, `completed`, `failed`.
    -   The `/v1/jobs/{job_id}` endpoint must return the current status of the job.

### 4.4. Export Bundles

-   **Description:** All assets for a given job should be downloadable as a single ZIP file.
-   **User Story:** As a developer, I want to be able to download all of the assets for a story in a single, organized package.
-   **Technical Requirements:**
    -   Upon job completion, the system must generate a ZIP file containing all assets.
    -   The URL to this ZIP file must be included in the job output.

## 5. Non-Functional Requirements

-   **Scalability:** The system should be able to handle at least 100 job requests per hour.
-   **Reliability:** The system should have an uptime of 99.9%.
-   **Security:** All API endpoints must be secure and require authentication. All data in transit and at rest must be encrypted.

## 6. V1.5 and Beyond (Future Scope)

The V1 release lays the groundwork for future productization. Future versions may include:

-   A minimal UI for creating jobs and downloading assets.
-   Presets for different asset kit types.
-   Platform-specific asset optimization toggles.
-   Monetization features (usage-based pricing, B2B plans).
