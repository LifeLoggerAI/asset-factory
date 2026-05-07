import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeWebhookSecret) {
    return NextResponse.json(
      {
        received: false,
        configured: false,
        error: 'Stripe webhook handling is not configured. Set STRIPE_WEBHOOK_SECRET and implement signature verification before enabling billing webhooks.',
      },
      { status: 501 }
    );
  }

  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ received: false, error: 'Missing Stripe signature' }, { status: 400 });
  }

  return NextResponse.json(
    {
      received: false,
      configured: true,
      error: 'Stripe SDK verification handler is not implemented in this deployment path yet.',
    },
    { status: 501 }
  );
}
