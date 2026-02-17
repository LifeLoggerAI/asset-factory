## Asset Factory – Data Retention Policy v1.0

### 1. Purpose

To define the default retention periods for various types of data stored within the Asset Factory platform. This policy ensures that data is retained for as long as necessary for business, legal, and compliance purposes, and is securely disposed of when no longer needed.

### 2. Data Types and Retention Periods

- **Job Records (`jobs` collection):**
  - Retained for a minimum of **24 months** to allow for customer review, historical analysis, and reproducibility checks.

- **Output Manifests (`manifests` collection):**
  - Retained for a minimum of **24 months**, linked to their corresponding job records.

- **Usage Logs (`usageLogs` collection):**
  - Retained for a minimum of **36 months** for billing, financial auditing, and platform analytics.

- **API Key Hashes (`apiKeys` collection):**
  - Retained indefinitely unless a project or key is explicitly deleted.

- **Audit Logs:**
  - System and security audit logs are retained for a minimum of **12 months**.

- **Customer-Generated Assets (in Cloud Storage):**
  - Retained as long as the corresponding `manifest` record exists. Deletion of a job or manifest will trigger the deletion of associated stored assets.

### 3. Data Deletion

- **Automated Deletion:** Where feasible, automated processes will be implemented to dispose of data once it has exceeded its defined retention period.
- **Customer-Initiated Deletion:** Customers may request the deletion of their project data. This action is irreversible and will be completed within 30 days.

### 4. Legal and Compliance Holds

If data is subject to a legal hold or other compliance requirement, it will be exempted from the standard retention policy and preserved until the hold is lifted.