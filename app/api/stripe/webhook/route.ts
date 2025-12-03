import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/stripe-client";
import { addCredits } from "@/lib/db/users";
import Stripe from "stripe";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  console.log("🔔 Webhook received at:", new Date().toISOString());
  console.log("📝 Signature present:", !!signature);

  if (!signature) {
    console.error("❌ Missing stripe-signature header");
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("❌ Missing STRIPE_WEBHOOK_SECRET");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    console.log("✅ Webhook signature verified");
    console.log("📦 Event type:", event.type);
    console.log("🆔 Event ID:", event.id);
  } catch (err) {
    console.error("❌ Webhook signature verification failed:", err);
    return NextResponse.json(
      { error: "Webhook signature verification failed" },
      { status: 400 }
    );
  }

  // Обработка события checkout.session.completed
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    console.log("💳 Processing checkout.session.completed");
    console.log("🆔 Session ID:", session.id);
    console.log("💰 Amount total:", session.amount_total);
    console.log("💵 Currency:", session.currency);
    console.log("✅ Payment status:", session.payment_status);
    console.log("📋 Metadata:", JSON.stringify(session.metadata, null, 2));

    const userId = session.metadata?.userId;
    const credits = session.metadata?.credits;

    if (!userId || !credits) {
      console.error("❌ Missing metadata in checkout session:", {
        sessionId: session.id,
        userId,
        credits,
        allMetadata: session.metadata
      });
      return NextResponse.json(
        { error: "Missing metadata" },
        { status: 400 }
      );
    }

    // Проверяем статус оплаты
    if (session.payment_status !== "paid") {
      console.warn("⚠️ Payment not completed yet:", {
        sessionId: session.id,
        paymentStatus: session.payment_status,
        userId
      });
      return NextResponse.json({
        received: true,
        note: "Payment not completed yet"
      });
    }

    try {
      console.log(`💎 Adding ${credits} credits to user ${userId}`);

      // Добавляем кредиты пользователю
      const creditsAmount = parseInt(credits, 10);
      const result = await addCredits(
        userId,
        creditsAmount,
        "purchase",
        `Purchase via Stripe (Session: ${session.id})`,
        {
          stripeSessionId: session.id,
          stripePaymentIntentId: session.payment_intent as string | undefined,
          amountPaid: session.amount_total ? session.amount_total / 100 : undefined, // Конвертируем из центов
          currency: session.currency,
        }
      );

      if (result) {
        console.log(`✅ Successfully added ${credits} credits to user ${userId}`);
        console.log(`📊 New balance: ${result.credits} credits`);
      } else {
        console.error(`❌ Failed to add credits - user not found: ${userId}`);
        return NextResponse.json(
          { error: "User not found" },
          { status: 404 }
        );
      }
    } catch (error) {
      console.error("❌ Error adding credits:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        userId,
        credits,
        sessionId: session.id
      });
      return NextResponse.json(
        { error: "Failed to add credits" },
        { status: 500 }
      );
    }
  }

  // Логируем другие типы событий для отладки
  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    console.log("💰 payment_intent.succeeded:", {
      id: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: paymentIntent.status
    });
  }

  if (event.type === "payment_intent.payment_failed") {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    console.error("❌ payment_intent.payment_failed:", {
      id: paymentIntent.id,
      amount: paymentIntent.amount,
      last_payment_error: paymentIntent.last_payment_error
    });
  }

  if (event.type === "charge.succeeded") {
    const charge = event.data.object as Stripe.Charge;
    console.log("💵 charge.succeeded:", {
      id: charge.id,
      amount: charge.amount,
      currency: charge.currency,
      paid: charge.paid
    });
  }

  console.log("✅ Webhook processed successfully");
  return NextResponse.json({ received: true });
}
