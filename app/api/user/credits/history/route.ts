import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserByGoogleId } from "@/lib/db/users";
import { getUserTransactions, getUserTransactionStats } from "@/lib/db/transactions";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Получаем пользователя по Google ID, чтобы получить MongoDB _id
    const user = await getUserByGoogleId(session.user.id);
    if (!user?._id) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") || "100", 10);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);
    const type = url.searchParams.get("type") as "deposit" | "withdrawal" | null;
    const reason = url.searchParams.get("reason") as string | null;

    const transactions = await getUserTransactions(user._id.toString(), {
      limit,
      offset,
      type: type || undefined,
      reason: reason as any || undefined,
    });

    const stats = await getUserTransactionStats(user._id.toString());

    // Сериализуем данные для JSON
    const serialized = transactions.map((transaction) => ({
      ...transaction,
      _id: transaction._id ? String(transaction._id) : undefined,
      userId: String(transaction.userId),
      createdAt: transaction.createdAt ? new Date(transaction.createdAt).toISOString() : undefined,
    }));

    return NextResponse.json({
      transactions: serialized,
      stats,
      pagination: {
        limit,
        offset,
        total: stats.transactionCount,
      },
    });
  } catch (error) {
    console.error("Error fetching transaction history:", error);
    return NextResponse.json(
      { error: "Failed to fetch transaction history" },
      { status: 500 }
    );
  }
}

