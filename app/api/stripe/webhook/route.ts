import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/stripe-client";
import { addCredits } from "@/lib/db/users";
import Stripe from "stripe";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("Missing STRIPE_WEBHOOK_SECRET");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json(
      { error: "Webhook signature verification failed" },
      { status: 400 }
    );
  }

  // Обработка события checkout.session.completed
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    const userId = session.metadata?.userId;
    const credits = session.metadata?.credits;

    if (!userId || !credits) {
      console.error("Missing metadata in checkout session:", session.id);
      return NextResponse.json(
        { error: "Missing metadata" },
        { status: 400 }
      );
    }

    try {
      // Добавляем кредиты пользователю
      await addCredits(userId, parseInt(credits, 10));
      console.log(`Added ${credits} credits to user ${userId}`);
    } catch (error) {
      console.error("Error adding credits:", error);
      return NextResponse.json(
        { error: "Failed to add credits" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ received: true });
}
