
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

// onTenantCreate
// -----------------------------------------------------------------------------
/**
 * Triggered when a new tenant is created.
 * 
 * Responsibilities:
 * 1. Create a default 'admin' member for the user who created the tenant.
 * 2. Create a default tenant settings document.
 * 3. Create a billing profile.
 * 4. Log the creation event in the audit log.
 */
export const onTenantCreate = functions.firestore
    .document("tenants/{tenantId}")
    .onCreate(async (snap, context) => {
        const tenantId = context.params.tenantId;
        const tenantData = snap.data();

        // TODO: Implement logic
        console.log(`New tenant created with ID: ${tenantId}`);

        return null;
    });

// onTenantUpdate
// -----------------------------------------------------------------------------
/**
 * Triggered when a tenant is updated.
 * 
 * Responsibilities:
 * 1. Log the update event in the audit log.
 * 2. If the 'enabled' flag is changed, update the status of all users in that tenant.
 */
export const onTenantUpdate = functions.firestore
    .document("tenants/{tenantId}")
    .onUpdate(async (change, context) => {
        const tenantId = context.params.tenantId;
        const beforeData = change.before.data();
        const afterData = change.after.data();

        // TODO: Implement logic
        console.log(`Tenant ${tenantId} was updated.`);

        return null;
    });
