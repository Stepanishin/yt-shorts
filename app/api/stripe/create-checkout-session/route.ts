import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe/stripe-client";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { amount } = await req.json();

    // amount - это количество кредитов (1 кредит = 1 евро цент)
    if (!amount || amount < 100) {
      return NextResponse.json(
        { error: "Minimum amount is 100 credits (€1.00)" },
        { status: 400 }
      );
    }

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
      success_url: `${req.nextUrl.origin}/dashboard/settings?payment=success`,
      cancel_url: `${req.nextUrl.origin}/dashboard/settings?payment=cancelled`,
      metadata: {
        userId: session.user.id,
        credits: amount.toString(),
      },
    });

    return NextResponse.json({ sessionId: checkoutSession.id, url: checkoutSession.url });
  } catch (error) {
    console.error("Error creating checkout session:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
