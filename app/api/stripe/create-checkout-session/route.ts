import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe/stripe-client";

export async function POST(req: NextRequest) {
  try {
    console.log("🛒 Creating checkout session");

    const session = await auth();

    if (!session?.user?.id) {
      console.error("❌ Unauthorized checkout attempt");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("👤 User:", {
      userId: session.user.id,
      email: session.user.email
    });

    const { amount } = await req.json();

    console.log("💰 Requested amount:", amount);

    // amount - это количество кредитов (1 кредит = 1 евро цент)
    // Минимум пополнения: €5.00 (500 кредитов)
    if (!amount || amount < 500) {
      console.error("❌ Invalid amount:", amount);
      return NextResponse.json(
        { error: "Minimum amount is 500 credits (€5.00)" },
        { status: 400 }
      );
    }

    // Определяем базовый URL для редиректов
    const baseUrl = process.env.NEXTAUTH_URL || req.nextUrl.origin;

    console.log("🌐 Base URL for redirects:", baseUrl);

    // Создаем Stripe checkout session
    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: 'Credits',
              description: `${amount} credits for video generation`,
            },
            unit_amount: amount, // amount в центах евро
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${baseUrl}/dashboard/settings?payment=success`,
      cancel_url: `${baseUrl}/dashboard/settings?payment=cancelled`,
      metadata: {
        userId: session.user.id,
        credits: amount.toString(),
      },
    });

    console.log("✅ Checkout session created:", {
      sessionId: checkoutSession.id,
      amount: amount,
      userId: session.user.id,
      metadata: checkoutSession.metadata
    });

    return NextResponse.json({ sessionId: checkoutSession.id, url: checkoutSession.url });
  } catch (error) {
    console.error("❌ Error creating checkout session:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
