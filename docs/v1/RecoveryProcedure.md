# Asset Factory V1 - Recovery Procedure

This document outlines the procedures for recovering from various failure scenarios in Asset Factory V1. 

## 1. Dead Job Triage & Manual Retry

When a job fails all its retry attempts, it is moved to the `dead-jobs` collection. This is the primary manual recovery task.

**Procedure:**

1.  **Monitor the `dead-jobs` Collection:** Set up an alert to be notified when a new document is added to this collection.
2.  **Inspect the Job Document:** Examine the `error` field and `logs` within the job document to diagnose the cause of failure.
3.  **Identify the Root Cause:** 
    *   **Transient Provider Issue:** If the error was temporary (e.g., a brief outage from the AI provider), the job can likely be re-queued.
    *   **Corrupted Input:** If the input data was invalid, the job cannot be retried. The user should be notified.
    *   **Internal Bug:** If the failure is due to a bug in the processing logic, **do not retry the job**. Escalate the issue immediately to the on-call engineering team by creating a high-priority incident ticket. Include the `jobId` and the error logs. Once engineering confirms a fix has been deployed, the job can be manually re-queued by following the procedure in step 4.
4.  **Manual Re-queue (if applicable):** 
    *   To retry the job, copy the dead job document back into the `jobs` collection.
    *   Reset the `status` to `"pending"`.
    *   Remove the `error` field.
    *   Crucially, **ensure the `jobId` remains the same** to prevent duplicate processing if the original job somehow recovers.
5.  **Notify User (if not retry-able):** If the job failed due to invalid input, contact the user to inform them and provide guidance on how to correct the input for a new job.

## 2. System-Wide Outage (Global Kill Switch)

If a critical vulnerability is discovered or a major system-wide failure is in progress (e.g., runaway costs), the global kill switch must be engaged.

**Procedure:**

1.  **Engage Kill Switch:** In the Firebase console, navigate to the `system_config` collection and find the `globals` document. Set the `SYSTEM_LOCKDOWN` flag to `true`.
2.  **Verify Lockdown:** Once the flag is set, the `createAssetJob` function will immediately start rejecting all new job requests. Existing jobs in the queue will continue to process.
3.  **Address the Underlying Issue:** With new job submissions halted, the engineering team can safely diagnose and fix the root cause of the emergency.
4.  **Disengage Kill Switch:** Once the issue is resolved and verified, set `SYSTEM_LOCKDOWN` back to `false`.

## 3. Disaster Recovery (Full System Restore)

In the event of a catastrophic data loss (e.g., accidental deletion of the Firestore database), the system will be restored from backup. This is a last resort.

**Procedure:**

1.  **Reference the Formal DR Plan:** The official, up-to-date Disaster Recovery plan is the source of truth for this procedure. (As noted in `SOC2_Diligence_Binder_Content.md`, this is a formal, tested plan).
2.  **Restore from Backup:** Use the Firebase console to restore the Firestore database from the most recent daily backup.
3.  **Reconcile Data:** After the restore, there may be data inconsistencies. 
    *   Manually review jobs that were in `processing` state at the time of the last backup to avoid double-billing.
    *   Run the Stripe reconciliation job to ensure the `usage_ledger` is consistent with Stripe invoices.
4.  **Communicate with Users:** Post a notice on the system status page and notify users via email about the outage and restoration process.
