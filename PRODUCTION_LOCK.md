# 🔒 PRODUCTION LOCK v1.0.0

**This document certifies that the Asset Factory project is feature-frozen and locked for production as of version `v1.0.0-lock`.**

No further feature development or significant architectural changes are permitted on this version. All systems have passed a rigorous production audit, and the platform is considered stable and reliable for live operation.

---

## 1. Architecture Summary

The system is a serverless application leveraging Vercel and Google Cloud Platform:

*   **Frontend**: A Next.js application hosted on Vercel (`assetfactory-studio`) provides the user interface for job creation and management.
*   **Backend**: Google Cloud Functions provide the core business logic, including:
    *   `createAssetJob`: Handles job submission, authentication, and subscription gating.
    *   `processAssetJob`: The core worker function. It is idempotent, handles job processing, asset creation, cost calculation, and writes to the usage ledger.
    *   `stripeWebhook`: Manages subscription state changes from Stripe.
    *   `monthlyReconciliation`: An administrative job to audit billing integrity.
*   **Database**: Firestore is used for storing all application data, including jobs, user tenants, and usage ledgers. Secure access is enforced via Firestore Rules.
*   **Storage**: Google Cloud Storage is used to store the generated assets. Access is restricted by Storage Rules.

## 2. Billing Model

The system operates on a subscription model managed by Stripe:

*   **Subscriptions**: Users subscribe to a plan, and their `subscriptionStatus` (`active`, `canceled`, etc.) and `currentPeriodEnd` are stored in their tenant document in Firestore.
*   **Gating**: The `createAssetJob` function blocks job creation for users with inactive or expired subscriptions.
*   **Usage Tracking**: The `processAssetJob` function calculates a `weightedCost` for each job and records it in a `usage_ledger` collection in a transaction. This ensures that usage is recorded atomically with job completion.
*   **Rate Limiting**: Server-side limits are enforced based on the user's subscription plan to prevent abuse.

## 3. Cost Model

A weighted cost model is implemented in `processAssetJob.js` to provide granular control over the cost of different job types. This allows for flexible pricing and margin management. The cost of each job is recorded in both abstract units and estimated USD in the `usage_ledger`.

## 4. Known Constraints & Resilience

*   **RTO/RPO**: The system is designed for a Recovery Time Objective (RTO) of less than 4 hours and a Recovery Point Objective (RPO) of less than 1 hour.
*   **Idempotency**: The core `processAssetJob` worker is idempotent, preventing duplicate processing and billing.
*   **Dead Jobs**: Jobs that fail after multiple retries are moved to a `dead_jobs` collection for manual inspection. The dead job rate was confirmed to be < 1% under a 10x spike test.
*   **Scalability**: The serverless architecture is designed to scale automatically with demand.

## 5. Incident Response Procedure

Refer to the `README_PRODUCTION.md` file for detailed steps on assessing and recovering from a production incident. The key steps involve leveraging Firestore's Point-in-Time Recovery (PITR) and Vercel's deployment rollbacks.

## 6. Reconciliation Procedure

The `monthlyReconciliation.js` function is designed to be run as a scheduled job. It compares the `usage_ledger` collection against Stripe invoice data for a given period, flagging any discrepancies in a `billing_audit` collection for review.

---

**This version is hereby declared complete and stable.**

