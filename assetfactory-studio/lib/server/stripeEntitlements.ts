import { getAdminDb } from './firebaseAdmin';

type RecordLike = Record<string, unknown>;

export type StripeLikeEvent = {
  id?: string;
  type?: string;
  created?: number;
  data?: { object?: RecordLike };
};

export type StripeEntitlement = {
  tenantId: string;
  status: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  stripeProductId?: string;
  planName?: string;
  maxMonthlyJobs?: number;
  maxMonthlyUnits?: number;
  maxMonthlyCostCents?: number;
  sourceEventId?: string;
  sourceEventType?: string;
  stripeCreatedAt?: number;
};

function record(value: unknown): RecordLike | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordLike : undefined;
}

function str(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function num(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const found = str(value);
    if (found) return found;
  }
  return undefined;
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const found = num(value);
    if (found !== undefined) return found;
  }
  return undefined;
}

function metadata(value: unknown) {
  return record(record(value)?.metadata) ?? {};
}

function clean<T extends RecordLike>(input: T): T {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as T;
}

function firstPrice(object: RecordLike | undefined) {
  const items = record(object?.items);
  const data = Array.isArray(items?.data) ? items.data : [];
  const item = record(data[0]);
  return record(item?.price);
}

function eventStatus(event: StripeLikeEvent, object: RecordLike | undefined) {
  const objectStatus = str(object?.status);
  if (objectStatus) return objectStatus;
  if (event.type === 'invoice.payment_failed') return 'past_due';
  if (event.type === 'checkout.session.completed' || event.type === 'invoice.paid') return 'active';
  return 'unknown';
}

export function buildStripeEntitlement(event: StripeLikeEvent): StripeEntitlement | null {
  const object = event.data?.object;
  const objectMetadata = metadata(object);
  const subscriptionDetailsMetadata = metadata(record(object?.subscription_details));
  const price = firstPrice(object);
  const priceMetadata = metadata(price);

  const tenantId = firstString(
    objectMetadata.tenantId,
    objectMetadata.assetFactoryTenantId,
    objectMetadata.workspaceId,
    subscriptionDetailsMetadata.tenantId,
    subscriptionDetailsMetadata.assetFactoryTenantId,
    object?.client_reference_id
  );

  if (!tenantId) return null;

  return clean({
    tenantId,
    status: eventStatus(event, object),
    stripeCustomerId: firstString(object?.customer),
    stripeSubscriptionId: firstString(object?.subscription, event.type?.startsWith('customer.subscription.') ? object?.id : undefined),
    stripePriceId: firstString(price?.id, object?.price),
    stripeProductId: firstString(price?.product, object?.product),
    planName: firstString(objectMetadata.assetFactoryPlanName, objectMetadata.planName, priceMetadata.assetFactoryPlanName, priceMetadata.planName, price?.nickname),
    maxMonthlyJobs: firstNumber(objectMetadata.assetFactoryMaxMonthlyJobs, objectMetadata.maxMonthlyJobs, priceMetadata.assetFactoryMaxMonthlyJobs, priceMetadata.maxMonthlyJobs),
    maxMonthlyUnits: firstNumber(objectMetadata.assetFactoryMaxMonthlyUnits, objectMetadata.maxMonthlyUnits, priceMetadata.assetFactoryMaxMonthlyUnits, priceMetadata.maxMonthlyUnits),
    maxMonthlyCostCents: firstNumber(objectMetadata.assetFactoryMaxMonthlyCostCents, objectMetadata.maxMonthlyCostCents, priceMetadata.assetFactoryMaxMonthlyCostCents, priceMetadata.maxMonthlyCostCents),
    sourceEventId: event.id,
    sourceEventType: event.type,
    stripeCreatedAt: event.created,
  });
}

function tenantPatch(entitlement: StripeEntitlement, now: string) {
  return clean({
    stripeCustomerId: entitlement.stripeCustomerId,
    stripeSubscriptionId: entitlement.stripeSubscriptionId,
    stripePriceId: entitlement.stripePriceId,
    stripeProductId: entitlement.stripeProductId,
    assetFactoryEntitlement: clean({ ...entitlement, updatedAt: now }),
    assetFactoryPlan: clean({
      status: entitlement.status,
      planName: entitlement.planName,
      maxMonthlyJobs: entitlement.maxMonthlyJobs,
      maxMonthlyUnits: entitlement.maxMonthlyUnits,
      maxMonthlyCostCents: entitlement.maxMonthlyCostCents,
      stripePriceId: entitlement.stripePriceId,
      source: 'stripe-webhook',
      updatedAt: now,
    }),
    updatedAt: now,
  });
}

export async function persistStripeEntitlement(event: StripeLikeEvent) {
  const db = getAdminDb();
  if (!db) return { configured: false, applied: false, duplicate: false, reason: 'firestore unavailable' };
  if (!event.id) return { configured: true, applied: false, duplicate: false, reason: 'missing event id' };

  const entitlement = buildStripeEntitlement(event);
  const now = new Date().toISOString();
  const eventRef = db.collection('assetFactoryStripeEvents').doc(event.id);
  let duplicate = false;
  let applied = false;

  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(eventRef);
    if (existing.exists) {
      duplicate = true;
      return;
    }

    transaction.set(eventRef, clean({
      eventId: event.id,
      type: event.type,
      tenantId: entitlement?.tenantId,
      stripeCreatedAt: event.created,
      processedAt: now,
      entitlementApplied: Boolean(entitlement),
    }));

    if (entitlement) {
      transaction.set(db.collection('tenants').doc(entitlement.tenantId), tenantPatch(entitlement, now), { merge: true });
      applied = true;
    }
  });

  return {
    configured: true,
    applied,
    duplicate,
    entitlement: entitlement ?? undefined,
    reason: duplicate ? 'duplicate event' : applied ? undefined : 'no tenant id on event',
  };
}
