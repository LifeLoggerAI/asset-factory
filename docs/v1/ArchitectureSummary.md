# Asset Factory V1 - Architecture Summary

This document provides a high-level overview of the Asset Factory V1 architecture.

## Core Components

1.  **Frontend (Next.js):** A client-facing application built with Next.js and hosted on Vercel. It provides the user interface for managing assets, jobs, and subscriptions.

2.  **Firebase Backend:** Serves as the primary backend, utilizing several Firebase services:
    *   **Firestore:** The main database for storing job data, user information, and application state.
    *   **Firebase Authentication:** Manages user authentication and identity.
    *   **Cloud Functions:** Hosts the serverless backend logic, including the API endpoints, Stripe webhooks, and job processing triggers.
    *   **Cloud Storage for Firebase:** Stores all generated assets in a structured and secure manner.

3.  **Stripe Integration:** Manages all billing and subscription-related logic. Webhooks from Stripe are used to keep subscription statuses in sync with the application.

4.  **Job Processing Engine:** A serverless function (`processAssetJob`) triggered by new documents in the `jobs` collection. It handles the core logic of asset generation, including status management, billing, and error handling.

## Data Flow (Job Creation)

1.  A user with an active subscription submits a new job request through the frontend.
2.  The `createAssetJob` function is called, which validates the user's subscription and usage limits.
3.  A new job document is created in the `jobs` collection in Firestore with a `pending` status.
4.  The `processAssetJob` function is triggered.
5.  The function processes the job, generates the asset, and stores it in Cloud Storage.
6.  The job status is updated to `completed` in Firestore.
7.  A usage record is written to the `usage_ledger` collection for billing reconciliation.
