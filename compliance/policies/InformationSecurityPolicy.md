## Asset Factory – Information Security Policy v1.0

### 1. Purpose

To establish a formal security framework and set of controls that protect the confidentiality, integrity, and availability of Asset Factory's systems, services, and customer data.

### 2. Scope

This policy applies to all Asset Factory employees, contractors, and systems involved in the development, deployment, and maintenance of our production and development environments.

### 3. Core Principles

- **Least Privilege Access:** Users and systems are granted only the permissions necessary to perform their functions.
- **Deterministic Production Integrity:** The core architecture is designed to ensure that content generation is repeatable, traceable, and governable.
- **Version-Controlled Changes:** All changes to production code and infrastructure are managed through a version-controlled, peer-reviewed process.
- **Data Encryption:** All customer data is encrypted at rest and in transit.
- **Logged and Traceable Operations:** All significant system events, particularly those related to job creation and data access, are logged and auditable.

### 4. Access Controls

- All access to production systems requires multi-factor authentication (MFA).
- Role-Based Access Control (RBAC) is enforced at the application and infrastructure layers, leveraging Firestore's `teamMembers` collection.
- Production database access is restricted to authorized service accounts and administrative personnel performing documented maintenance.
- Shared credentials are strictly prohibited.

### 5. Data Protection

- All data is encrypted in transit using TLS 1.2 or higher.
- All data at rest in Firestore and Cloud Storage is encrypted by Google Cloud by default.
- API keys are not stored in plaintext. They are hashed using SHA-256 before being stored in the `apiKeys` collection.

### 6. Monitoring

- Job execution, API access, and administrative actions are logged to facilitate security auditing.
- Audit logs are retained for a minimum of 12 months.
- Automated alerts are configured to detect anomalous activity, such as failed login spikes, abnormal job volume, and high error rates.