import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserTransactions } from "@/lib/db/transactions";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");
    const type = searchParams.get("type") as "deposit" | "withdrawal" | undefined;

    console.log("📊 Fetching transactions for user:", {
      userId: session.user.id,
      limit,
      offset,
      type
    });

    const transactions = await getUserTransactions(session.user.id, {
      limit,
      offset,
      type,
    });

    console.log(`✅ Found ${transactions.length} transactions`);

    return NextResponse.json({
      transactions,
      count: transactions.length,
    });
  } catch (error) {
    console.error("❌ Error fetching transactions:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}
