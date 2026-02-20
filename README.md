# 🔐 HARDEN IDENTITY + ZERO-TRUST LAYER

We’re going to build a real identity authority for validator nodes.

This layer must support:

1. Node registration
2. Public key distribution
3. Key rotation
4. Revocation
5. Trust verification
6. Audit trail for identity changes
7. Optional threshold governance

---

# 🚀 ASSET FACTORY — PRODUCTION CHECKLIST (REAL)

We lock these five in order:

1️⃣ Deploy to production URL
2️⃣ Connect Stripe properly
3️⃣ Process real generation jobs
4️⃣ Store real assets in Storage
5️⃣ Enforce subscription gating

---

# ✅ End-to-End Testing Guide

This section provides the steps to manually test the complete business logic of Asset Factory, from user authentication to job creation and billing enforcement.

## Prerequisites

1.  **Firebase Project:** Your Firebase project is deployed.
2.  **Stripe Account:** You have a Stripe account with API keys and a subscription product created.
3.  **Test User:** You have created a test user in Firebase Authentication.

## Test Case 1: Unsubscribed User Attempts to Create Asset

**Goal:** Verify that a user without an active subscription is blocked from creating a job.

1.  **Action:** From a client application (or a test script), call the `createAssetJob` cloud function for your test user.
    *   **Payload:** `{ "type": "test-asset" }`
2.  **Expected Result:** The function call should **fail** with a `permission-denied` error and the message "Active subscription required."

## Test Case 2: User Subscribes and Creates Asset

**Goal:** Verify that a user with an active subscription can successfully create a job.

1.  **Action:**
    a. In your Firestore database, manually edit the tenant document for your test user (`tenants/{userId}`).
    b. Set the `subscriptionStatus` field to `"active"`.
2.  **Action:** Call the `createAssetJob` function again for the same user.
3.  **Expected Result:**
    a. The function call should **succeed** and return a `jobId`.
    b. A new document should be created in the `jobs` collection with `status: "pending"`.
    c. Shortly after, the `processAssetJob` function should trigger. Check the `jobs` document for `status: "completed"` and the `assets` collection for a new asset record.

## Test Case 3: Rate Limiting Enforcement

**Goal:** Verify that the system prevents abuse by rate-limiting job creation.

1.  **Action:** Using a script, call the `createAssetJob` function for the subscribed user 11 times in rapid succession (within 60 seconds).
2.  **Expected Result:** The first 10 calls should succeed. The 11th call should **fail** with a `resource-exhausted` error and the message "Rate limit exceeded. Please wait a minute."

## Test Case 4: Monthly Usage Limit Enforcement

**Goal:** Verify that users cannot create more assets than their monthly allowance.

1.  **Action:**
    a. In Firestore, manually create 100 documents in the `usage` collection for your test user. Ensure the `createdAt` timestamp is within the current month.
2.  **Action:** Call the `createAssetJob` function again for the same user.
3.  **Expected Result:** The function call should **fail** with a `resource-exhausted` error and the message "Monthly asset generation limit reached."

## Test Case 5: Stripe Webhook for Subscription Activation

**Goal:** Verify that a Stripe checkout event correctly activates a user's subscription.

1.  **Prerequisite:** You need your deployed `stripeWebhook` function URL.
2.  **Action:** Use the Stripe CLI to simulate a `checkout.session.completed` event. Replace the URL with your actual webhook URL and ensure the `client_reference_id` is the Firebase UID of your test user.

    ```bash
    stripe trigger checkout.session.completed --add "checkout_session:client_reference_id={YOUR_FIREBASE_UID}"
    ```

3.  **Expected Result:**
    a. Check the Firestore `tenants/{YOUR_FIREBASE_UID}` document.
    b. The `subscriptionStatus` field should be updated to `"active"`.
    c. A `stripeCustomerId` field should also be present.

---