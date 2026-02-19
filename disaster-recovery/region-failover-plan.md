# Region Failover Plan

**Document Version: 1.0**
**Date: 2026-02-08**
**Author: Gemini**

## 1. Purpose

This document outlines the procedure for failing over the Asset Factory platform from its primary operational region (e.g., `us-central1`) to a designated secondary region (e.g., `us-east1`). The goal is to restore service within the established RTO and RPO targets in the event of a full region-wide outage.

*   **Recovery Time Objective (RTO):** 4 hours
*   **Recovery Point Objective (RPO):** 1 hour

## 2. Assumptions

This plan assumes the following infrastructure and configurations are in place **before** a disaster event:

*   **Firestore:** The database is configured for multi-region replication between the primary and secondary regions. Automated backups are also enabled.
*   **Cloud Storage:** Asset storage buckets are configured with geo-redundancy, or a robust backup and restore process is in place to the secondary region.
*   **Worker Fleet:** Container images for the `engine-worker` are stored in a global artifact registry, accessible from any region.
*   **API Gateway/CDN:** A global load balancer or CDN is in front of the API, capable of redirecting traffic to the secondary region's API endpoints.
*   **Environment Variables:** All necessary secrets and environment variables are stored securely and are accessible to the application and worker instances in the secondary region.

## 3. Failover Simulation: Step-by-Step Procedure

### Step 1: Detection and Declaration (T+0)

1.  **Detection:** A region-wide outage is detected via automated monitoring (e.g., Google Cloud status alerts, uptime checks failing).
2.  **Confirmation:** The on-call engineer confirms the outage is not a localized issue and impacts the entire primary region.
3.  **Declaration:** The on-call engineer, in consultation with the Head of Engineering, officially declares a disaster and initiates this failover plan.

### Step 2: Database Failover (T+15 mins)

1.  **Promote Secondary:** Follow the official Firestore documentation to promote the replica in the secondary region to the primary instance. This is the most critical and sensitive step.
2.  **Verify Write Access:** Once promoted, perform a small, controlled write operation (e.g., update a system status document) to confirm the new primary is accepting writes.

### Step 3: Reroute API and Worker Traffic (T+45 mins)

1.  **Update DNS/CDN:** Update the global load balancer or CDN configuration to redirect all API traffic from the primary region's endpoints to the secondary region's endpoints.
2.  **Scale Up Workers:** Deploy and scale up the `engine-worker` fleet in the secondary region. The workers will automatically connect to the now-primary Firestore instance in their region and begin processing the job queue.

### Step 4: Verify Storage and Asset Access (T+1 hr 30 mins)

1.  **Check Bucket Access:** Verify that the application and workers in the secondary region can read from and write to the geo-redundant Cloud Storage buckets.
2.  **Test Asset URLs:** Manually check a few existing asset URLs to ensure they are still resolving correctly via the CDN.

### Step 5: Full System Verification (T+2 hrs)

1.  **End-to-End Test:** Create a new job via the API.
2.  **Monitor Job Lifecycle:** Observe the job as it is picked up by a worker in the secondary region, processed, and marked as complete.
3.  **Verify Output:** Confirm that the output manifest is created correctly and the generated asset is accessible via its URL.
4.  **Check Dashboards:** Log in to the frontend application and verify that the usage and observability dashboards are loading data correctly.

### Step 6: Service Restored (T+2.5 hrs - Well within RTO)

At this point, the platform is fully operational in the secondary region. Public communication can be sent out to users informing them that the service has been restored.

## 4. Rollback Plan (Post-Disaster)

Once the primary region is confirmed to be stable and fully operational again, a rollback can be planned during a low-traffic maintenance window. The process is essentially the reverse of the failover, with the original primary region becoming the replica, and then carefully promoting it back to the primary instance.
