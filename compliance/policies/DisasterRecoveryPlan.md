## Asset Factory – Disaster Recovery Plan v1.0

### 1. Purpose

To provide a structured plan for recovering Asset Factory's services and data in the event of a catastrophic failure or disaster. This plan is designed to minimize downtime and data loss.

### 2. Key Objectives

- **Recovery Time Objective (RTO):** The target time to restore service to an operational state is **24 hours**.
- **Recovery Point Objective (RPO):** The target for maximum acceptable data loss is **24 hours**.

### 3. Backup and Recovery Strategy

- **Firestore Database:**
  - **Backup:** Daily automated exports of the entire Firestore database are configured and saved to a regional Google Cloud Storage bucket.
  - **Recovery:** In the event of data corruption or loss, the database can be restored from the latest successful daily backup.

- **Cloud Storage Assets:**
  - **Backup:** Customer-generated assets stored in Google Cloud Storage have versioning enabled. This protects against accidental deletion or modification.
  - **Recovery:** Previous versions of assets can be restored directly from the Cloud Storage bucket if needed.

- **Cloud Functions and Application Code:**
  - **Recovery:** All application code and infrastructure definitions are stored in a Git repository. In the event of a regional outage, the application can be redeployed to a different region from the repository.

### 4. Disaster Recovery Testing

- The disaster recovery plan will be tested on an annual basis.
- Tests will involve a simulated restoration of the Firestore database and a redeployment of the application to a test environment.
- The results of each test will be documented in `compliance/evidence/dr-test-log.md`.