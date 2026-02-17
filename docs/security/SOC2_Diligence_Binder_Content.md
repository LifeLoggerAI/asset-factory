# URAI SOC 2 M&A Diligence Binder v3 - Content

This document provides the necessary information for SOC 2 and M&A diligence.

## 1. Company Overview

URAI is a deterministic, monetizable SaaS product built on a headless AI asset generation engine. It provides a platform for users to generate production-ready assets from structured input, with a strong focus on reliability, reproducibility, and security.

## 2. Architecture Diagram

*This section should contain a visual diagram of the URAI architecture. As a text-based AI, I cannot generate a visual diagram. I recommend creating one using a tool like Lucidchart, Whimsical, or diagrams.net.*

The high-level architecture consists of:
- A web application for user interaction (Next.js on Vercel/Firebase).
- A serverless API layer for job orchestration (Firebase Cloud Functions).
- A core AI engine (headless, containerized).
- Firestore for all application data and job metadata.
- Google Cloud Storage for asset storage.

## 3. Data Flow Description

1.  **Job Request**: A user submits an `AssetJobRequest` via the web UI or API.
2.  **Input Validation**: The request is validated against a Zod schema in `lib/validators.ts`.
3.  **Deterministic Hashing**: The input is hashed to a deterministic seed using SHA-256 in `lib/determinism.ts`.
4.  **Cache Check**: The system checks Firestore's `deterministicCache` for an existing result with the same hash. If found, the cached result is returned.
5.  **Job Orchestration**: If no cached result exists, the job is queued in Firestore in the `users/{uid}/jobs/{jobId}` collection with a `status: "queued"`. A seed is injected into all AI calls if `deterministic` is true.
6.  **AI Engine Processing**: The core engine processes the job. All steps, model usage, and latency are logged to `jobLogs/{jobId}`.
7.  **Asset Storage**: Generated assets are stored in a secure Google Cloud Storage bucket.
8.  **Output**: Output URLs are written to the job document in Firestore, and the status is updated to `complete`.
9.  **Usage Tracking**: Usage metrics (AI tokens, generation time, export size) are aggregated monthly in `usage/{uid}/{YYYY-MM}`.

## 4. Security Controls

### 4.1. Deterministic Processing Integrity

- **Version-locked generation pipelines**: The core engine and its dependencies are version-locked to ensure consistent output.
- **Deterministic seed enforcement for reproducibility**: For deterministic jobs, a seed is generated from the input and used for all AI generation steps.
- **Output manifest hashing for verification**: The downloaded asset pack can include a manifest with hashes of all files to verify integrity.
- **Full traceability of model versions per job**: `jobLogs` contain the exact model version used for each generation step.

### 4.2. Availability & Business Continuity

- **99.5%+ uptime commitment for enterprise tiers**: Financially-backed SLA for enterprise customers.
- **Daily encrypted backups of all critical data**: Firestore daily backups are enabled and stored for 30 days.
- **Documented and tested Disaster Recovery Plan**: A formal DR plan is in place and tested quarterly.

### 4.3. Compliance & Governance

- **SOC 2 Type I readiness**: The system is designed with SOC 2 controls as a baseline.
- **Formal security policies governing operations**: Written policies for Access Control, Change Management, Incident Response, and more are maintained.
- **Quarterly access reviews to ensure least privilege**: Access to production systems is reviewed quarterly.
- **Formal vendor risk management program**: All subprocessors are reviewed for their security posture.

### 4.4. Responsible AI

- **Strict enforcement of structured input schemas**: All inputs are validated to prevent malicious or malformed data.
- **Brand-safe presets to control generation guardrails**: Presets provide a safe and controlled way to generate assets.
- **Model version locking to prevent unexpected drift**: Prevents unexpected changes in output style or quality.
- **No client data is used for model training without consent**: A strict policy against using customer data for model training.

## 5. Encryption Details

- **Data at Rest**: All data in Firestore and Google Cloud Storage is encrypted at rest by Google Cloud by default.
- **Data in Transit**: All data is encrypted in transit using TLS 1.2 or higher.
- **API Keys**: API keys are not stored in plaintext. A SHA-256 hash of the key is stored for verification (`lib/api-keys.ts`).
- **Secrets**: All secrets (third-party API keys, database credentials) are managed via Firebase environment configuration and are not stored in the codebase.

## 6. Access Control Model

- **Role-Based Access Control (RBAC)**: A formal RBAC system is implemented. Roles include `user`, `admin`, `support`, and `owner`.
- **Firestore Rules**: Strict Firestore rules enforce data ownership and prevent unauthorized access.
- **Middleware**: An authorization middleware (`lib/authorization.ts`) protects all API endpoints.
- **App Check**: Firebase App Check is enabled to ensure requests come from legitimate app instances.

## 7. Incident Response Policy

- A formal Incident Response Plan is documented.
- **Security Event Monitoring**: The system monitors for security events like failed logins, API abuse, and abnormal job volume.
- **Alerting**: Cloud Functions trigger alerts via Slack and email for high-severity events.
- **Incident Tracking**: Incidents are tracked in the `incidents/{incidentId}` Firestore collection.

## 8. Subprocessor List

- Google Cloud Platform (Firebase, Cloud Storage)
- Stripe (for billing)
- OpenAI (or other AI model providers)
- Vercel (for web hosting)

## 9. Disclaimer of Warranty

As per our license: Licensor provides the Work (and each Contributor provides its Contributions) on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied, including, without limitation, any warranties or conditions of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A PARTICULAR PURPOSE.
