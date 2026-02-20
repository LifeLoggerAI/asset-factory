# Asset Factory V1 - Known Limitations

This document lists the known limitations of the Asset Factory V1 release. These are recognized constraints and areas for future improvement.

## 1. Asynchronous Job Processing

Jobs are not processed in real-time. When a user submits a job, it enters a queue and is processed asynchronously. Users will experience a delay between job submission and asset availability. The average processing time is tracked as a system metric, but there are no guaranteed processing times (SLAs) for individual jobs in V1.

## 2. Dependencies on External Providers

The system's availability and performance are directly dependent on the uptime and reliability of its core third-party providers:

*   **Firebase (Google Cloud)**
*   **Stripe**
*   **Vercel**
*   **Asset Generation AI Provider**

Any service disruption from these providers will directly impact Asset Factory's functionality.

## 3. Inherent Error & Retry Rates

While the system is designed for robustness, it is not immune to failures.

*   **Target Retry Rate:** < 5%. Some jobs may fail and require one or more retry attempts.
*   **Target Dead Job Rate:** < 1%. A small percentage of jobs may fail permanently after exhausting all retries and will be moved to the dead-letter queue for manual inspection.

These rates are considered acceptable for V1 but represent a known limitation.

## 4. Static Feature Set

Asset Factory V1 is considered feature-frozen. No new features, scope expansion, or major architectural changes will be made without a formal version increment. The current functionality is the complete functionality for V1.

## 5. Limited Administrative Tooling

V1 does not include a comprehensive administrative dashboard for managing users, jobs, or system configurations directly. System monitoring is handled through structured logging and metrics in Firebase, but manual intervention may require direct database access or running scripts.

## 6. Placeholder Legal Documents

The legal documents (Terms of Service, Privacy Policy, etc.) are placeholders. They require review and finalization by a legal professional before any public, scaled launch.

## 7. Fixed Concurrency

The job processing worker has a fixed concurrency guard. This is a deliberate safety control to prevent runaway costs and system overload but also imposes a hard limit on the number of jobs that can be processed simultaneously. This could become a bottleneck under sustained high traffic.
