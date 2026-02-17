## Asset Factory – Access Control Policy v1.0

### 1. Purpose

To define the policies and procedures for managing access to Asset Factory's systems and data, ensuring that only authorized individuals have access based on the principle of least privilege.

### 2. User Provisioning & Deprovisioning

- **Provisioning:** User access is granted based on their role and responsibilities. Access requests must be approved by the project owner or a designated administrator.
- **Deprovisioning:** User access is revoked immediately upon termination of employment or contract. All associated credentials and access keys are deactivated.

### 3. Role-Based Access Control (RBAC)

- Access is managed through predefined roles stored in the `teamMembers` collection. The roles are:
  - **Owner:** Full administrative control over a project.
  - **Admin:** Can manage team members and billing.
  - **Editor:** Can create and manage jobs.
  - **Viewer:** Read-only access.
- These roles are enforced by Firestore Security Rules and Cloud Functions middleware.

### 4. Quarterly Access Reviews

- A formal access review of all users with access to production systems will be conducted every 90 days.
- The review will verify that each user's access is still required and appropriate for their role.
- Inactive accounts will be disabled or removed.
- The completion of each review will be documented in `compliance/evidence/access-review-log.md`.