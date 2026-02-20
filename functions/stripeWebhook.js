
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const db = admin.firestore();

// IMPORTANT: Set these in your Firebase environment configuration
// firebase functions:config:set stripe.secret="your_stripe_secret_key"
// firebase functions:config:set stripe.webhook_secret="whsec_..."
const stripe = require("stripe")(functions.config().stripe.secret);
const webhookSecret = functions.config().stripe.webhook_secret;

exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;

  try {
    // 1. Verify the event came from Stripe
    event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
  } catch (err) {
    console.error(`Webhook signature verification failed.`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const data = event.data.object;

  // 2. Get the user ID from the event metadata
  // IMPORTANT: Your Stripe checkout session MUST be created with this metadata.
  const userId = data.metadata.userId;
  if (!userId) {
    // This is a critical failure. A webhook was received without a way to link it to a user.
    console.error("Webhook received without a userId in metadata.", data);
    return res.status(400).send("Missing userId in metadata.");
  }

  const tenantRef = db.collection("tenants").doc(userId);

  // 3. Handle the specific event type to keep our database in sync with Stripe
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
      // Subscription is active, paid, trialing, or even past_due.
      // We sync the latest status and billing period end date.
      await tenantRef.update({
        subscriptionStatus: data.status, // e.g., "active", "trialing", "past_due"
        stripeSubscriptionId: data.id,
        currentPeriodEnd: admin.firestore.Timestamp.fromMillis(data.current_period_end * 1000),
        plan: data.items.data[0].price.id, // Store the price ID for plan management
      });
      break;

    case "customer.subscription.deleted":
      // Subscription was canceled by the user or due to non-payment.
      await tenantRef.update({
        subscriptionStatus: "canceled",
      });
      break;

    default:
      // We don't handle other events for now, but we log them for observability.
      console.log(`Unhandled Stripe event type: ${event.type}`);
  }

  // 4. Acknowledge the event has been received so Stripe doesn't retry.
  res.json({ received: true });
});
