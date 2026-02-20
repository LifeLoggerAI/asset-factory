
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '../../../../lib/firebase';
import { admin } from '../../../../lib/firebase-admin';
import { logger } from '../../../../lib/logger'; // IMPORT THE CENTRAL LOGGER

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2023-10-16',
});

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET as string;

async function handler(req: NextRequest) {
  const sig = req.headers.get('stripe-signature') as string;
  const reqBuffer = await req.arrayBuffer();
  const body = Buffer.from(reqBuffer).toString('utf8');

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
    logger.info('Stripe webhook signature verified.', { eventId: event.id, eventType: event.type });
  } catch (err: any) {
    logger.error('Stripe webhook signature verification failed.', { error: err.message });
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object as Stripe.Checkout.Session;
      await fulfillOrder(session);
      break;

    case 'invoice.payment_succeeded':
      const invoice = event.data.object as Stripe.Invoice;
      await renewSubscription(invoice);
      break;

    case 'customer.subscription.deleted':
      const subscription = event.data.object as Stripe.Subscription;
      await cancelSubscription(subscription);
      break;
      
    default:
      logger.warn('Unhandled Stripe webhook event type.', { eventType: event.type });
  }

  return NextResponse.json({ received: true });
}

async function fulfillOrder(session: Stripe.Checkout.Session) {
    const tenantId = session.client_reference_id;
    const priceId = session.line_items?.data[0].price?.id;

    if (!tenantId || !priceId) {
        logger.error('CRITICAL: Missing tenantId or priceId in checkout session.', { sessionId: session.id });
        return;
    }

    logger.info('Fulfilling order for tenant.', { tenantId, priceId, sessionId: session.id });

    try {
        const tenantRef = admin.firestore().collection('tenants').doc(tenantId);
        await tenantRef.update({
            planId: priceId,
            stripeCustomerId: session.customer,
            subscriptionStatus: 'active',
            planActivatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        logger.info('✅ Tenant successfully subscribed.', { tenantId, priceId });
    } catch (error) {
        logger.error('❌ Error updating tenant record for order fulfillment.', { tenantId, error: error.message });
    }
}

async function renewSubscription(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  logger.info('Renewing subscription for customer.', { customerId });

  try {
      const tenantQuery = await admin.firestore().collection('tenants').where('stripeCustomerId', '==', customerId).limit(1).get();
      if(tenantQuery.empty) {
          logger.error('CRITICAL: Could not find tenant for subscription renewal.', { customerId });
          return;
      }
      const tenantDoc = tenantQuery.docs[0];
      await tenantDoc.ref.update({ subscriptionStatus: 'active' });
      logger.info('✅ Subscription successfully renewed.', { tenantId: tenantDoc.id });
  } catch(error) {
    logger.error('❌ Error renewing subscription.', { customerId, error: error.message });
  }
}

async function cancelSubscription(subscription: Stripe.Subscription) {
    const customerId = subscription.customer as string;
    logger.info('Cancelling subscription for customer.', { customerId });

    try {
        const tenantQuery = await admin.firestore().collection('tenants').where('stripeCustomerId', '==', customerId).limit(1).get();
        if(tenantQuery.empty) {
            logger.error('CRITICAL: Could not find tenant for subscription cancellation.', { customerId });
            return;
        }
        const tenantDoc = tenantQuery.docs[0];
        await tenantDoc.ref.update({ subscriptionStatus: 'cancelled' });
        logger.info('✅ Subscription successfully cancelled.', { tenantId: tenantDoc.id });
    } catch(error) {
        logger.error('❌ Error cancelling subscription.', { customerId, error: error.message });
    }
}

export { handler as POST };
