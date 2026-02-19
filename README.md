
# Asset Factory

This project is a web-based application for generating assets, leveraging a decoupled architecture with a web server, a job queue, and a worker process. The system has been recently hardened to meet enterprise-grade security and reliability standards.

## Architecture

The system is composed of three main parts:

*   **Asset Factory Studio (`assetfactory-studio`)**: A Next.js application that provides the user interface for submitting and tracking asset generation jobs.
*   **Engine (`engine`)**: A Node.js application containing the core business logic:
    *   **API Server (`engine/server.js`)**: An Express server that exposes endpoints for creating and managing jobs. It is responsible for authentication, validation, and queuing jobs.
    *   **Worker (`engine/worker.js`)**: A process that polls a Firestore-based job queue and executes the asset generation tasks.
*   **Firebase (`lib/firebase`)**: Provides the backend infrastructure, including Firestore for the job queue and authentication.

## Getting Started

### Prerequisites

*   Node.js (v18 or later)
*   `pnpm` package manager
*   Firebase account and project

### Installation

1.  **Clone the repository:**

    ```bash
    git clone <repository-url>
    ```

2.  **Install dependencies:**

    ```bash
    pnpm install
    ```

3.  **Configure Firebase:**

    *   Create a Firebase project.
    *   Set up Firestore and create a service account.
    *   Copy the service account key to `engine/service-account.json`.

### Running the Application

The application is configured to run using `pm2`, a production-grade process manager for Node.js.

```bash
# Start the API server and the worker
pnpm start
```

To run the Next.js frontend:

```bash
cd assetfactory-studio
pnpm dev
```

## Security & Enterprise Readiness

This project has undergone a significant hardening process to address initial security vulnerabilities and to prepare it for enterprise adoption. Key improvements include:

*   **JWT-Based Authentication**: All sensitive endpoints are now protected by a robust JWT authentication system.
*   **Tenant Isolation**: The API enforces strict tenant isolation, ensuring that users can only access their own data.
*   **API Rate Limiting**: To prevent abuse and ensure service stability, the API now implements rate limiting (100 requests per 15 minutes per IP). This is a key measure for SOC2 compliance.
*   **Monetization & Auditing**: A billing and usage tracking system has been implemented using an event-sourcing pattern. This creates an immutable, auditable log of all billable events, ensuring every job is tracked from creation to completion with full traceability. A granular ledger system provides clear cost attribution for each tenant, forming the foundation for future monetization. The platform's integrity is further guaranteed by version-locked generation pipelines and cryptographic hashing of all output manifests. To ensure robust governance, we enforce formal security policies and conduct quarterly access reviews, maintaining the principle of least privilege.
*   **Improved User Experience**: The frontend now provides real-time updates on job status.
*   **Production-Ready**: The application now uses `pm2` for process management, ensuring greater reliability and uptime.
*   **Trust & Security Page**: A new page has been added to the application to provide a transparent overview of the system's security and reliability features.

