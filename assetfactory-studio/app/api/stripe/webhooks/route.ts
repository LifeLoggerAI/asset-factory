import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { recordUsage } from '@/lib/server/assetFactoryStore';

const WEBHOOK_TOLERANCE_SECONDS = 300;

type StripeLikeEvent = {
  id?: string;
  type?: string;
  created?: number;
  data?: {
    object?: Record<string, unknown>;
  };
};

type StripeSignatureVerificationResult =
  | { ok: true }
  | { ok: false; error: string };

function parseStripeSignature(header: string) {
  return header.split(',').reduce(
    (acc, part) => {
      const [key, value] = part.split('=');
      if (key === 't' && value) acc.timestamp = value;
      if (key === 'v1' && value) acc.signatures.push(value);
      return acc;
    },
    { timestamp: '', signatures: [] as string[] }
  );
}

function secureCompareHex(left: string, right: string) {
  try {
    const leftBuffer = Buffer.from(left, 'hex');
    const rightBuffer = Buffer.from(right, 'hex');

    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  } catch {
    return false;
  }
}

function verifyStripeSignature(input: {
  payload: string;
  signatureHeader: string;
  webhookSecret: string;
  now?: number;
}): StripeSignatureVerificationResult {
  const parsed = parseStripeSignature(input.signatureHeader);
  const timestamp = Number(parsed.timestamp);

  if (!Number.isFinite(timestamp) || parsed.signatures.length === 0) {
    return { ok: false, error: 'Invalid Stripe signature header' };
  }

  const now = input.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > WEBHOOK_TOLERANCE_SECONDS) {
    return { ok: false, error: 'Stripe signature timestamp outside tolerance' };
  }

  const signedPayload = `${parsed.timestamp}.${input.payload}`;
  const expectedSignature = createHmac('sha256', input.webhookSecret)
    .update(signedPayload, 'utf8')
    .digest('hex');

  const matched = parsed.signatures.some((signature) => secureCompareHex(signature, expectedSignature));

  if (!matched) {
    return { ok: false, error: 'Stripe signature verification failed' };
  }

  return { ok: true };
}

function tenantIdFromEvent(event: StripeLikeEvent) {
  const object = event.data?.object;
  const metadata = object?.metadata;

  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const tenantId = (metadata as Record<string, unknown>).tenantId;
    if (typeof tenantId === 'string' && tenantId.trim()) return tenantId;
  }

  const clientReferenceId = object?.client_reference_id;
  if (typeof clientReferenceId === 'string' && clientReferenceId.trim()) return clientReferenceId;

  return 'unknown';
}

export async function POST(req: NextRequest) {
  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeWebhookSecret) {
    return NextResponse.json(
      {
        received: false,
        configured: false,
        error: 'Stripe webhook handling is not configured. Set STRIPE_WEBHOOK_SECRET before enabling billing webhooks.',
      },
      { status: 501 }
    );
  }

  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ received: false, error: 'Missing Stripe signature' }, { status: 400 });
  }

  const payload = await req.text();
  const verification = verifyStripeSignature({
    payload,
    signatureHeader: signature,
    webhookSecret: stripeWebhookSecret,
  });

  if (!verification.ok) {
    return NextResponse.json({ received: false, error: verification.error }, { status: 400 });
  }

  let event: StripeLikeEvent;
  try {
    event = JSON.parse(payload) as StripeLikeEvent;
  } catch {
    return NextResponse.json({ received: false, error: 'Invalid Stripe webhook JSON' }, { status: 400 });
  }

  await recordUsage({
    action: 'stripe.webhook.received',
    eventId: event.id,
    stripeEventId: event.id,
    stripeEventType: event.type,
    tenantId: tenantIdFromEvent(event),
    stripeCreatedAt: event.created,
  });

  return NextResponse.json({
    received: true,
    configured: true,
    eventId: event.id,
    eventType: event.type,
  });
}
