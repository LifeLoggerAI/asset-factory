# Asset Factory V1 - Cost Model

This document outlines the cost model for Asset Factory V1, detailing how costs are incurred, how revenue is generated, and how profitability is tracked.

## 1. Provider Costs (Cost of Goods Sold - COGS)

Our primary costs are associated with the third-party services that power the platform:

*   **Asset Generation Provider (e.g., Replicate/OpenAI):** This is the most significant cost driver. Costs are incurred on a per-job basis, depending on the processing time, and the specific model used.
*   **Firebase:**
    *   **Firestore:** Costs are based on document reads, writes, and deletes.
    *   **Cloud Functions:** Billed per invocation, vCPU-seconds, and GB-seconds.
    *   **Cloud Storage:** Costs for storing generated assets and data transfer.
*   **Vercel:** Hosting for the Next.js frontend, including bandwidth and serverless function execution.
*   **Stripe:** A percentage fee is charged on every transaction.

## 2. Revenue Model

Revenue is generated exclusively through monthly and annual subscriptions from users.

*   **Subscription Tiers:** Different tiers provide varying levels of usage credits and access to features.
*   **Usage Gating:** The system enforces subscription status and usage limits before allowing new jobs to be created.

## 3. Internal Billing Logic (`costUnits`)

To abstract away the fluctuating costs of different job types and providers, we use a normalized metric called `costUnits`.

*   **Weighted Calculation:** Each job type is assigned a weight based on its relative computational cost. The final `costUnits` for a job is a function of this weight and the job's processing duration.
*   **Cost & Margin Tracking:**
    *   The `costUnits` are recorded in the `usage_ledger` for each completed job.
    *   A corresponding `costUSD` is calculated based on a pre-defined conversion rate, representing the estimated cost of that job.
    *   This allows us to track the margin per job and overall.

## 4. Revenue Reconciliation

To ensure financial integrity, a scheduled job runs periodically to reconcile our internal usage data with Stripe's invoicing data.

*   **`billing_audit` Collection:** The results of each reconciliation are logged in this collection.
*   **Discrepancy Alerts:** Any significant discrepancies between the `usage_ledger` and Stripe invoices will trigger an alert for manual review.
